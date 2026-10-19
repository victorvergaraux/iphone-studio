// Arnés de pruebas E2E: servidor estático propio (puerto libre, sin dependencias) + Chrome headless con WebGL por software.
// Uso: import { run } from './helpers.mjs'; await run('nombre', async ({ page, url, ok, eq, errors }) => { ... });
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIME = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json', '.png':'image/png', '.jpg':'image/jpeg', '.webp':'image/webp', '.svg':'image/svg+xml', '.webm':'video/webm', '.mp4':'video/mp4', '.woff2':'font/woff2' };

export function serve(){
  const srv = http.createServer((req, res) => {
    const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (u === '/favicon.ico') { res.writeHead(204); return res.end(); } // la app no define favicon: evita el 404 en consola
    let f = path.join(ROOT, u === '/' ? 'index.html' : u);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('404'); }
    res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ srv, url:`http://127.0.0.1:${srv.address().port}/` })));
}

export async function launch({ width = 1280, height = 800, mobile = false, storage = 'clean' } = {}){
  const { srv, url } = await serve();
  const browser = await chromium.launch({ channel:'chrome', headless:true, args:['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport:{ width, height }, ...(mobile ? { isMobile:true, hasTouch:true, deviceScaleFactor:2 } : {}) });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon/.test(m.text())) errors.push(m.text()); });
  // 'clean' = arranque como primera visita (sin estado guardado). 'keep' conserva lo que haya.
  if (storage === 'clean') await page.addInitScript(() => { if (!sessionStorage.getItem('__t')) { try { localStorage.clear(); } catch {} sessionStorage.setItem('__t', '1'); } });
  const close = async () => { await browser.close(); srv.close(); };
  return { page, url, errors, browser, ctx, close };
}

export async function boot(page, url){
  await page.goto(url); await page.waitForFunction(() => !!document.querySelector('#rail') && !!window.gsap, null, { timeout: 30000 });
  await page.waitForTimeout(2500); // fuentes, ejemplos y HDRI
  await page.evaluate(() => document.querySelector('#onbSkip')?.click()); await page.waitForTimeout(500);
}

export async function run(name, fn, opts){
  const t = await launch(opts); let fails = 0;
  const ok = (cond, msg) => { if (!cond) { fails++; console.log(`  ✗ ${msg}`); } else console.log(`  ✓ ${msg}`); };
  const eq = (a, b, msg) => ok(JSON.stringify(a) === JSON.stringify(b), `${msg} (${JSON.stringify(a)}${JSON.stringify(a) === JSON.stringify(b) ? '' : ' ≠ ' + JSON.stringify(b)})`);
  console.log(`▶ ${name}`);
  try { await fn({ ...t, ok, eq, boot: () => boot(t.page, t.url) }); }
  catch (e) { fails++; console.log(`  ✗ excepción: ${e.stack || e}`); }
  if (t.errors.length) { fails++; console.log(`  ✗ errores de consola/página:\n    ${t.errors.slice(0, 5).join('\n    ')}`); }
  await t.close();
  console.log(fails ? `✖ ${name}: ${fails} fallo(s)` : `✔ ${name}`);
  process.exitCode = fails ? 1 : process.exitCode;
  return !fails;
}
