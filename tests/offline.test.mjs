import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './helpers.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXTERNO = /cdn\.jsdelivr\.net|fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs|unpkg\.com/;
// el loop puede dormir cuando la escena está quieta (acumulación): se mueve la cámara con un arrastre para forzar frames
const renders = async page => { const f1 = await frames(page); await page.mouse.move(640, 400); await page.mouse.down(); await page.mouse.move(700, 420, { steps: 5 }); await page.mouse.up(); await page.waitForTimeout(800); return (await frames(page)) > f1; };
const frames = page => page.evaluate(async () => (await import('/js/three/renderer.js')).renderer.info.render.frame);

// (a)(c)(d)(e) arranque sin red externa, sin SW en localhost, fuentes locales y consola limpia
await run('offline · arranque sin dominios externos', async ({ page, ctx, ok, eq, boot }) => {
  const externos = [];
  await ctx.route(url => !/^http:\/\/127\.0\.0\.1/.test(url.href) && !/^(data|blob):/.test(url.href), r => { externos.push(r.request().url()); r.abort(); });
  await boot();
  eq(externos, [], 'ninguna petición a dominios externos (CDN, Google Fonts)');
  ok(await page.evaluate(() => !!window.gsap && !!window.lucide && !!window.Mp4Muxer && !!window.WebMMuxer), 'gsap, lucide y muxers cargan desde vendor/');
  ok(await page.evaluate(() => document.querySelectorAll('.thumb').length >= 1), 'la app arrancó (pantallas de ejemplo)');
  ok(await renders(page), 'el render loop avanza (el HDRI por defecto es local)');
  eq(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length)), 0, 'sin ?sw=1 en localhost no hay service worker registrado');
  for (const [fam, w] of [['Bricolage Grotesque', 800], ['Inter', 500], ['JetBrains Mono', 400]])
    ok(await page.evaluate(async ([f, w]) => { await document.fonts.load(`${w} 16px "${f}"`, 'Ñandú ¿¡áéíóú?'); return document.fonts.check(`${w} 16px "${f}"`, 'Ñandú ¿¡áéíóú?'); }, [fam, w]), `fuente local «${fam}»`);
  ok(await page.evaluate(() => [...document.fonts].some(f => f.family.includes('Bricolage') && f.status === 'loaded')), 'Bricolage cargada desde css/fonts.css (FontFace loaded)');
});

// (b) SW: se instala, precachea la shell y la app arranca offline; (c) en localhost sin ?sw=1 un SW previo se desregistra
await run('offline · service worker', async ({ page, ctx, url, errors, ok, eq }) => {
  await page.goto(url + '?sw=1'); await page.waitForFunction(() => !!document.querySelector('#rail') && !!window.gsap, null, { timeout: 30000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 15000 });
  ok(true, 'SW instalado, activo y controlando la página');
  const precache = [...fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').matchAll(/^ {2}'([^']+)',$/gm)].map(m => m[1]);
  const cached = await page.evaluate(async () => { const k = (await caches.keys()).find(n => /^mockup-studio-v\d+$/.test(n)); return { k, urls: k ? (await (await caches.open(k)).keys()).map(r => new URL(r.url).pathname) : [] }; });
  ok(!!cached.k, `caché versionada creada (${cached.k})`);
  const falta = precache.filter(f => f !== './' && !cached.urls.includes('/' + f));
  eq(falta, [], `la shell completa está en caché (${precache.length} entradas)`);
  // la lista PRECACHE de sw.js debe coincidir con los archivos reales (si falla: node tools/sw-list.mjs)
  const { list } = await import('../tools/sw-list.mjs?x=' + Date.now()).catch(() => ({}));
  if (list) ok(JSON.stringify(list()) === JSON.stringify(precache), 'PRECACHE de sw.js al día con los archivos del repo');
  await page.waitForTimeout(1500); // el HDRI por defecto ya está en caché por ser local

  await ctx.setOffline(true);
  await page.goto(url + '?sw=1'); await page.waitForFunction(() => !!document.querySelector('#rail') && !!window.gsap, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
  ok(await page.evaluate(() => document.querySelectorAll('.thumb').length >= 1), 'offline: la app arranca y muestra las pantallas de ejemplo');
  ok(await renders(page), 'offline: el render loop avanza');

  // HDRI remoto sin red: se conserva el actual y se avisa con un toast
  await page.evaluate(async () => { const { P } = await import('/js/core/params.js'); const h = await import('/js/three/hdri.js'); await h.loadEnv('sunset'); });
  ok(/conservo el HDRI actual/.test(await page.evaluate(() => document.querySelector('#toast').textContent)), 'offline: HDRI no cacheado → toast y se conserva el actual');
  errors.splice(0, errors.length, ...errors.filter(e => !/ERR_INTERNET_DISCONNECTED|ERR_FAILED/.test(e))); // esperados: el HDRI remoto falla sin red
  await ctx.setOffline(false);

  // localhost sin ?sw=1: se desregistra el SW previo
  await page.goto(url); await page.waitForFunction(() => !!document.querySelector('#rail'), null, { timeout: 30000 });
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && !(await caches.keys()).some(n => n.startsWith('mockup-studio-')), null, { timeout: 8000 }).catch(() => {});
  eq(await page.evaluate(() => navigator.serviceWorker.getRegistrations().then(r => r.length)), 0, 'localhost sin ?sw=1 desregistra el SW previo');
  eq(await page.evaluate(() => caches.keys().then(k => k.filter(n => n.startsWith('mockup-studio-')).length)), 0, 'y vacía sus cachés');
});
