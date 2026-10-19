import fs from 'node:fs';
import { run } from './helpers.mjs';

// Ejemplos como archivos JPEG externos: arranque no bloqueante, sin base64 pesado en js/data, y sin descargas si hay pantallas propias.
const dataDir = new URL('../js/data/', import.meta.url);
await run('ejemplos · JPEG externos', async ({ page, url, ok, eq, boot }) => {
  for (const f of fs.readdirSync(dataDir)) ok(fs.statSync(new URL(f, dataDir)).size < 20 * 1024, `js/data/${f} < 20 KB`);
  const hits = [];
  page.on('response', r => { if (/assets\/examples\/ex-0\d.jpg$/.test(r.url())) hits.push([r.url().split('/').pop(), r.status()]); });
  const t0 = Date.now();
  await page.goto(url);
  await page.waitForFunction(() => !!document.querySelector('#rail') && !!document.querySelector('.thumb'), null, { timeout: 30000 });
  console.log(`  · #rail + primer .thumb en ${Date.now() - t0} ms`);
  await page.waitForFunction(() => document.querySelectorAll('.thumb').length === 5, null, { timeout: 30000 });
  console.log(`  · 5 miniaturas en ${Date.now() - t0} ms`);
  eq(hits.map(h => h[0]).sort(), ['ex-01.jpg', 'ex-02.jpg', 'ex-03.jpg', 'ex-04.jpg', 'ex-05.jpg'], 'se piden los 5 JPEG');
  ok(hits.every(h => h[1] === 200), 'todas responden 200');
  eq(await page.evaluate(async () => (await import('/js/screens/carousel.js')).items.map(i => i.name)), ['Bauhaus 681', 'Bauhaus 040', 'Bauhaus 898', 'Bauhaus 400', 'Bauhaus 365'], 'orden estable');
  ok(await page.evaluate(() => [...document.querySelectorAll('.thumb')].every(t => /assets\/examples\//.test(t.outerHTML))), 'miniaturas con URL');
  await page.waitForTimeout(1500);
});

// Con pantallas propias guardadas NO se descargan los ejemplos.
await run('ejemplos · no se piden con pantallas propias', async ({ page, url, ok, eq, boot }) => {
  await boot();
  await page.evaluate(async () => {
    const c = document.createElement('canvas'); c.width = 300; c.height = 600; const g = c.getContext('2d'); g.fillStyle = '#c33'; g.fillRect(0, 0, 300, 600);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const { P } = await import('/js/core/params.js'); P.car.replaceAll = true;
    await (await import('/js/screens/load.js')).loadFiles([new File([blob], 'mine.png', { type: 'image/png' })]);
    (await import('/js/core/persist.js')).saveSoon();
  });
  await page.waitForTimeout(2500);
  const hits = []; page.on('response', r => { if (/assets\/examples\//.test(r.url())) hits.push(r.url()); });
  await page.reload(); await boot(); await page.waitForTimeout(1000);
  eq(await page.evaluate(async () => (await import('/js/screens/carousel.js')).items.map(i => i.name)), ['mine.png'], 'se restaura la propia');
  eq(hits, [], 'no se pide ningún JPEG de ejemplo');
});
