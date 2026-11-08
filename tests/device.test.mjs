import { run, openDock } from './helpers.mjs';

// Modelo de pantalla (celular / tablet): bloque a la derecha del dock, cambio de medidas y de isla, sugerencia por orientación,
// deshacer y persistencia. S_ASPECT se lee del mismo módulo que usa la app (bindings vivos).
await run('modelo · celular ⇄ tablet', async ({ page, ok, eq, boot }) => {
  await boot();
  await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  const wait = ms => page.waitForTimeout(ms);
  const rect = sel => page.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { l: r.left, r: r.right, t: r.top, b: r.bottom, w: r.width, h: r.height }; }, sel);
  const state = () => page.evaluate(async () => {
    const { P } = await import('/js/core/params.js'), m = await import('/js/three/iphone.js'), s = await import('/js/three/screen.js');
    return { dev: P.phone.device, aspect: m.S_ASPECT, pw: m.PW, island: s.island.visible, tablet: document.body.classList.contains('dev-tablet') };
  });
  const loadImg = (w, h, name) => page.evaluate(async ([w, h, name]) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#336'; x.fillRect(0, 0, w, h);
    const blob = await new Promise(r => c.toBlob(r, 'image/png'));
    const { loadFiles } = await import('/js/screens/load.js'); await loadFiles([new File([blob], name, { type: 'image/png' })]);
  }, [w, h, name]);
  const hint = async () => { await page.waitForFunction(() => !document.querySelector('#devSw').dataset.hint || +getComputedStyle(document.querySelector('#devTip')).opacity > 0.9, null, { timeout: 15000 }).catch(() => {}); return hintNow(); }; // espera el fundido (en software va lento)
  const hintNow = () => page.evaluate(() => ({ attr: document.querySelector('#devSw').dataset.hint || null, text: document.querySelector('#devTip').textContent, op: getComputedStyle(document.querySelector('#devTip')).opacity,
    suggest: [...document.querySelectorAll('.dev-opt[data-suggest]')].map(b => b.id) }));

  // Layout: oculto con el dock; al abrirlo queda a la derecha del dock, misma altura y mismo borde inferior
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('#devSw')).visibility), 'hidden', 'oculto junto con el dock');
  await openDock(page);
  await page.waitForFunction(() => document.querySelector('#devSw').getBoundingClientRect().bottom <= innerHeight, null, { timeout: 15000 }); // fin del deslizamiento
  const d = await rect('.dock'), v = await rect('#devSw');
  ok(v.l >= d.r, `a la derecha del dock (${d.r.toFixed(0)} ≤ ${v.l.toFixed(0)})`);
  ok(Math.abs(v.b - d.b) < 1 && Math.abs(v.h - d.h) < 2, `misma altura y borde inferior que el dock (${v.h.toFixed(0)} vs ${d.h.toFixed(0)})`);
  eq(await page.evaluate(() => [...document.querySelectorAll('.dev-opt')].map(b => b.id)), ['devPhone', 'devTablet'], 'dos opciones: celular y tablet');

  // Por defecto: celular vertical con isla
  let s = await state();
  ok(s.dev === 'phone' && s.aspect < 0.6 && s.island && !s.tablet, `por defecto celular (aspect ${s.aspect.toFixed(3)}, isla visible)`);
  eq(await page.evaluate(() => document.querySelector('#devPhone').getAttribute('aria-pressed')), 'true', 'Celular marcado');

  // Cambiar a tablet: más ancha que alta, mayor, sin isla
  await page.click('#devTablet'); await wait(600);
  s = await state();
  ok(s.dev === 'tablet' && s.aspect > 1.2 && s.pw > 1.2 && !s.island && s.tablet, `tablet (aspect ${s.aspect.toFixed(3)}, ancho ${s.pw}, sin isla)`);
  eq(await page.evaluate(() => document.querySelector('#devTablet').getAttribute('aria-pressed')), 'true', 'Tablet marcada');
  const thumb = await rect('.thumb');
  ok(thumb.w > thumb.h, `miniaturas horizontales en tablet (${thumb.w.toFixed(0)}×${thumb.h.toFixed(0)})`);

  // Las pantallas con encuadre por defecto se recalculan: una captura vertical larga pasa a «ancho + scroll» y una apaisada a cover
  const fits = await page.evaluate(async () => (await import('/js/screens/carousel.js')).items.map(i => [i.fit, i.autoScroll]));
  ok(fits.length > 0 && fits.every(([f, a]) => f === 'width' && a === true), `ejemplos verticales pasan a «ancho + scroll» en tablet (${JSON.stringify(fits)})`);

  // Sugerencia: imagen vertical sobre tablet → sugiere celular, tooltip visible encima y opción marcada
  await loadImg(900, 1800, 'vertical.png'); await wait(600);
  let h = await hint();
  ok(h.attr === 'phone' && /vertical/.test(h.text) && Number(h.op) > 0.9 && h.suggest.join() === 'devPhone', `vertical sobre tablet → sugiere Celular (${JSON.stringify(h)})`);
  const tip = await rect('#devTip');
  ok(tip.b <= v.t + 1, `el tooltip queda arriba del bloque (${tip.b.toFixed(0)} ≤ ${v.t.toFixed(0)})`);
  await page.click('#devPhone'); await wait(600);
  h = await hint(); ok(h.attr === null && h.suggest.length === 0, 'al cambiar de modelo la sugerencia desaparece');
  s = await state(); ok(s.dev === 'phone' && s.island, 'de vuelta a celular con isla');

  // Imagen horizontal sobre celular → sugiere tablet
  await loadImg(1920, 1080, 'desktop.png'); await wait(600);
  h = await hint();
  ok(h.attr === 'tablet' && /horizontal/.test(h.text) && Number(h.op) > 0.9 && h.suggest.join() === 'devTablet', `horizontal sobre celular → sugiere Tablet (${JSON.stringify(h)})`);
  // Imagen que encaja con el modelo → sin sugerencia
  await loadImg(900, 1800, 'vertical2.png'); await wait(600);
  h = await hint(); ok(h.attr === null, 'una pantalla que encaja con el modelo no sugiere nada');

  // Deshacer / rehacer el cambio de modelo
  await page.click('#devTablet'); await wait(600);
  await page.keyboard.press('Control+z'); await wait(1800);
  s = await state(); ok(s.dev === 'phone' && s.aspect < 0.6 && s.island, 'Ctrl+Z vuelve a celular');
  await page.keyboard.press('Control+Shift+z'); await wait(1800);
  s = await state(); ok(s.dev === 'tablet' && s.aspect > 1.2, 'Ctrl+Shift+Z rehace tablet');

  // Persistencia: el modelo sobrevive a una recarga
  await page.evaluate(() => dispatchEvent(new Event('pagehide'))); await wait(200);
  await page.reload(); await page.waitForFunction(() => !!document.querySelector('#rail') && !!window.gsap, null, { timeout: 30000 }); await wait(2500);
  s = await state(); ok(s.dev === 'tablet' && s.aspect > 1.2 && !s.island && s.tablet, 'tras recargar sigue en tablet');
});
