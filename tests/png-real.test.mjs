import { run } from './helpers.mjs';

// PNG real con acumulación: descarta el «PNG en blanco» visto una sola vez en una corrida inicial.
// Captura el Blob que recibe offer() (sin descarga), lo decodifica y comprueba que NO es uniforme (hay contenido), varias veces seguidas.
await run('png real · no sale en blanco y es estable', async ({ page, ok, boot }) => {
  await boot();
  await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  const wait = ms => page.waitForTimeout(ms);
  await page.evaluate(() => { window.__png = []; });
  // interceptamos offer: el modal de vista previa crea un <img> con el blob; leemos su URL
  const grab = async () => {
    await page.evaluate(async () => { const m = await import('/js/export/export.js'); await m.snapshot({ samples: 8 }); });
    await wait(500);
    return page.evaluate(async () => {
      const img = document.querySelector('.modal img'); if (!img) return null;
      await img.decode();
      const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0); const d = x.getImageData(0, 0, c.width, c.height).data;
      let min = 255, max = 0, sum = 0, n = 0;
      for (let i = 0; i < d.length; i += 16) { const l = (d[i] + d[i + 1] + d[i + 2]) / 3; if (l < min) min = l; if (l > max) max = l; sum += l; n++; }
      document.querySelector('.modal')?.remove();
      return { w: c.width, h: c.height, min: Math.round(min), max: Math.round(max), mean: Math.round(sum / n) };
    });
  };
  const results = [];
  for (let k = 0; k < 4; k++) { const r = await grab(); results.push(r); console.log('  ·', JSON.stringify(r)); }
  ok(results.every(Boolean), 'las 4 capturas produjeron una imagen');
  ok(results.every(r => r && r.max - r.min > 80), 'ninguna es uniforme/en blanco (rango de luminancia > 80)');
  ok(results.every(r => r && r.mean > 20 && r.mean < 245), 'la luminancia media no es blanco ni negro puro');
  const means = results.map(r => r.mean);
  ok(Math.max(...means) - Math.min(...means) < 12, `capturas consistentes entre sí (medias ${means.join(', ')})`);
});
