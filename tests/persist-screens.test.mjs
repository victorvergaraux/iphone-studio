import { run } from './helpers.mjs';

// Persistencia de pantallas (IndexedDB) + proyecto portable v3 / compat v2.
await run('persistencia de pantallas', async ({ page, ctx, url, ok, eq, boot }) => {
  const info = () => page.evaluate(async () => {
    const { items } = await import('/js/screens/carousel.js');
    return items.map(i => ({ n:i.name, ex:i.example, v:i.isVideo, fit:i.fit, zoom:+i.zoom.toFixed(2), offX:+i.offX.toFixed(2) }));
  });
  const reload = async () => { await page.reload(); await boot(); await page.waitForTimeout(1500); };

  // Video de prueba: se graba ANTES de arrancar la app, en una página ligera (con el WebGL por software de la app el MediaRecorder se queda sin rAF)
  await page.goto(url + 'package.json');
  const vb64 = await page.evaluate(async () => {
    const rec1 = () => new Promise(res => {
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 320; document.body.append(cv); const g = cv.getContext('2d'), ch = [];
      const rec = new MediaRecorder(cv.captureStream(30), { mimeType:'video/webm;codecs=vp8' });
      let k = 0, on = true; const loop = () => { g.fillStyle = `hsl(${k * 20},70%,50%)`; g.fillRect(0, 0, 160, 320); k++; if (on) requestAnimationFrame(loop); }; loop();
      rec.ondataavailable = e => ch.push(e.data); rec.onstop = () => { cv.remove(); res(new Blob(ch, { type:'video/webm' })); };
      rec.start(100); setTimeout(() => { on = false; rec.stop(); }, 1200);
    });
    for (let i = 0; i < 4; i++) { const b = await rec1(); if (b.size > 1000) { const u = new Uint8Array(await b.arrayBuffer()); let s = ''; u.forEach(x => s += String.fromCharCode(x)); return btoa(s); } }
    throw new Error('MediaRecorder sin datos');
  });

  await boot();
  ok((await info()).every(i => i.ex) && (await info()).length >= 1, 'arranque limpio: solo ejemplos');

  // Genera 3 imágenes (colores/tamaños distintos) y un video corto (canvas + MediaRecorder) dentro de la página y las carga con loadFiles
  await page.evaluate(async vb64 => {
    const mk = (w, h, c) => new Promise(r => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, w, h); g.fillStyle = '#fff'; g.fillRect(w / 4, h / 4, w / 2, h / 2); cv.toBlob(r, 'image/png'); });
    const vid = async () => new Blob([Uint8Array.from(atob(vb64), c => c.charCodeAt(0))], { type:'video/webm' });
    const files = [new File([await mk(300, 600, '#c33')], 'a.png', { type:'image/png' }), new File([await mk(400, 400, '#3c3')], 'b.png', { type:'image/png' }),
      new File([await mk(200, 900, '#33c')], 'c.png', { type:'image/png' }), new File([await vid()], 'd.webm', { type:'video/webm' })];
    const { P } = await import('/js/core/params.js'); P.car.replaceAll = true;
    const { loadFiles } = await import('/js/screens/load.js'); await loadFiles(files);
    // encuadre editado en la pantalla 2 + guardado como lo hace el panel (saveSoon → sync)
    const { items } = await import('/js/screens/carousel.js'); Object.assign(items[1], { fit:'contain', zoom:1.7, offX:0.2 });
    (await import('/js/core/persist.js')).saveSoon();
  }, vb64);
  eq((await info()).map(i => i.n), ['a.png', 'b.png', 'c.png', 'd.webm'], 'Replace all: solo las 4 propias');
  await page.waitForTimeout(2500);

  await reload();
  let it = await info();
  eq(it.map(i => i.n), ['a.png', 'b.png', 'c.png', 'd.webm'], 'recarga: se restauran en orden (sin ejemplos)');
  ok(it.every(i => !i.ex), 'ninguna es de ejemplo');
  ok(it[3].v, 'el video se restaura como video');
  eq([it[1].fit, it[1].zoom, it[1].offX], ['contain', 1.7, 0.2], 'encuadre editado restaurado');
  eq(await page.evaluate(() => document.querySelectorAll('.thumb').length), 4, 'tira con 4 miniaturas');

  // Mover (seleccionar a.png y →) y eliminar (c.png) persisten
  await page.click('.thumb >> nth=0'); await page.click('#scrRight'); await page.waitForTimeout(300);
  eq((await info()).map(i => i.n), ['b.png', 'a.png', 'c.png', 'd.webm'], 'mover en vivo');
  await page.click('.thumb >> nth=2'); await page.click('#scrDel'); await page.waitForTimeout(2000);
  await reload();
  eq((await info()).map(i => i.n), ['b.png', 'a.png', 'd.webm'], 'mover + eliminar persisten tras recargar');

  // Proyecto v3: exportar (el arnés no tiene `downloads` → modal con el JSON en un textarea)
  await page.evaluate(async () => { (await import('/js/export/project.js')).exportProject(); });
  await page.waitForSelector('.modal textarea', { timeout: 15000 });
  const json = await page.evaluate(() => document.querySelector('.modal textarea').value);
  const proj = JSON.parse(json);
  eq([proj.version, proj.media.length], [3, 3], 'proyecto v3 con 3 pantallas');
  eq(proj.media.map(m => m.name), ['b.png', 'a.png', 'd.webm'], 'media en orden');
  ok(proj.media[0].data.startsWith('data:image/png;base64,'), 'imagen como data URL original (png)');
  await page.evaluate(() => document.querySelector('.modal button')?.click());

  // Clear: borra IndexedDB y recarga con ejemplos
  await page.evaluate(async () => { (await import('/js/core/persist.js')).resetAll(); });
  await page.waitForTimeout(1500); await page.waitForFunction(() => !!document.querySelector('#rail') && !!window.gsap, null, { timeout: 30000 }); await page.waitForTimeout(3000);
  it = await info(); ok(it.length >= 1 && it.every(i => i.ex), 'Clear: vuelven los ejemplos');
  // tras recargar, la base se reabre vacía (el arranque la crea): no debe quedar ninguna pantalla
  eq(await page.evaluate(async () => (await import('/js/screens/store.js')).loadStored().then(l => l.length)), 0, 'Clear: IndexedDB sin pantallas');

  // Importar el proyecto v3 → reemplaza con las 3 propias, y persisten
  await page.evaluate(() => document.querySelector('#onbSkip')?.click());
  await page.setInputFiles('#projFile', { name:'p.json', mimeType:'application/json', buffer:Buffer.from(json) });
  await page.waitForTimeout(6000);
  eq((await info()).map(i => i.n), ['b.png', 'a.png', 'd.webm'], 'import v3: pantallas restauradas');
  await page.waitForTimeout(2000); await reload();
  eq((await info()).map(i => i.n), ['b.png', 'a.png', 'd.webm'], 'import v3: persisten tras recargar');

  // Import v2 (sin media): no rompe y conserva las pantallas actuales
  await page.setInputFiles('#projFile', { name:'v2.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify({ app:'mockup-studio', version:2, P:{}, shots:[] })) });
  await page.waitForTimeout(4000);
  eq((await info()).map(i => i.n), ['b.png', 'a.png', 'd.webm'], 'import v2: conserva las pantallas');
});
