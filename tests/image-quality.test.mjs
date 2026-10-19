import { run } from './helpers.mjs';

// Refinamiento progresivo: PNG por acumulación de muestras jitter + preview que se refina al estar quieto.
await run('image-quality · acumulación progresiva', async ({ page, ok, boot, errors }) => {
  await boot();
  // Ruido ajeno: otro agente aún no ha creado shoteditor.{css,js} (404 en el HTML compartido); no es de este test
  page.on('response', r => { if (r.status() === 404 && /shoteditor/.test(r.url())) errors.splice(0, errors.length, ...errors.filter(e => !/404/.test(e))); });
  await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  await page.evaluate(async () => { window.__A = (await import('/js/three/accum.js')).accum; });
  // Escena fija y determinista: sin deriva, sin idle, sin grano, sin autoplay del carrusel, calidad High (sin compuerta de FPS)
  await page.evaluate(async () => {
    const { P } = await import('/js/core/params.js');
    const { clearCar } = await import('/js/screens/carousel.js');
    Object.assign(P.cam, { drift: 0 }); P.anim.type = 'none'; P.grade.grain = 0; P.quality.mode = 'high';
    Object.assign(P.exp, { format: '9:16', long: 640, pngScale: 1, transparent: false });
    clearCar();
  });

  // Utilidades en página: snapshot → Blob → píxeles
  await page.evaluate(() => {
    window.__shot = async (opts) => {
      const { snapshot } = await import('/js/export/export.js');
      const t0 = performance.now(); const blob = await snapshot(opts); const ms = performance.now() - t0;
      const bmp = await createImageBitmap(blob), c = document.createElement('canvas'); c.width = bmp.width; c.height = bmp.height;
      const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(bmp, 0, 0);
      const { data, width, height } = g.getImageData(0, 0, bmp.width, bmp.height);
      document.querySelectorAll('.modal').forEach(m => m.remove()); // el fallback de offer() abre un modal
      // Métrica de bordes: píxeles con salto abrupto de luma respecto al vecino derecho/inferior (menos = bordes más suaves)
      const L = i => 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      let abrupt = 0, soft = 0;
      for (let y = 0; y < height - 1; y++) for (let x = 0; x < width - 1; x++) {
        const i = (y * width + x) * 4, d = Math.abs(L(i) - L(i + 4)) + Math.abs(L(i) - L(i + width * 4));
        if (d > 90) abrupt++; else if (d > 12) soft++;
      }
      const px = (x, y) => Array.from(data.slice((y * width + x) * 4, (y * width + x) * 4 + 4));
      return { ms, width, height, abrupt, soft, corner: px(1, 1), center: px(width >> 1, height >> 1), size: blob.size };
    };
  });

  // (a) 1 muestra vs 16 muestras en la misma escena fija
  const one = await page.evaluate(() => window.__shot({ samples: 1 }));
  const many = await page.evaluate(() => window.__shot({ samples: 16 }));
  console.log(`  · 1 muestra: ${one.width}×${one.height} abruptos=${one.abrupt} suaves=${one.soft} ${one.ms.toFixed(0)} ms`);
  console.log(`  · centro 1=${one.center} 16=${many.center}`);
  console.log(`  · 16 muestras: abruptos=${many.abrupt} suaves=${many.soft} ${many.ms.toFixed(0)} ms`);
  ok(one.width === many.width && one.height === many.height, 'mismo tamaño de PNG con 1 y 16 muestras');
  ok(many.abrupt < one.abrupt * 0.95, `menos saltos abruptos con acumulación (${many.abrupt} < 0.95 × ${one.abrupt})`);
  ok(many.soft > one.soft, `más transiciones intermedias (bordes suavizados): ${many.soft} > ${one.soft}`);
  const st = await page.evaluate(async () => {
    const { accum } = await import('/js/three/accum.js'); const f = await import('/js/three/session.js');
    return { n: accum.n, en: accum.pass.enabled, busy: accum.busy, exporting: f.exporting, css: document.querySelector('#c').style.cssText };
  });
  ok(!st.busy && !st.exporting && st.css === '', 'tras el snapshot el estado queda limpio (sin busy/export, CSS del canvas limpio)');

  // (c) PNG transparente conserva el alfa al promediar
  await page.evaluate(async () => { (await import('/js/core/params.js')).P.exp.transparent = true; });
  const tr = await page.evaluate(() => window.__shot({ samples: 8 }));
  console.log(`  · transparente: esquina=${tr.corner} centro=${tr.center}`);
  ok(tr.corner[3] === 0, 'transparente: esquina con alfa 0');
  ok(tr.center[3] === 255, 'transparente: centro con alfa 255');
  await page.evaluate(async () => { (await import('/js/core/params.js')).P.exp.transparent = false; });

  // (b) preview: se refina al estar quieto y se reinicia al mover la cámara
  await page.waitForFunction(() => window.__A.n >= 3, null, { timeout: 90000, polling: 250 });
  const nBefore = await page.evaluate(async () => (await import('/js/three/accum.js')).accum.n);
  const minAfter = await page.evaluate(async () => {
    const accum = window.__A; const { camera } = await import('/js/three/renderer.js');
    camera.position.x += 0.4; // movimiento "manual"
    let min = 99; for (let i = 0; i < 4; i++) { await new Promise(r => requestAnimationFrame(r)); min = Math.min(min, accum.n); }
    return min;
  });
  console.log(`  · acumulador antes=${nBefore} mínimo tras mover=${minAfter}`);
  ok(nBefore >= 3, 'el preview acumula muestras cuando la escena está quieta');
  ok(minAfter < nBefore && minAfter <= 1, 'mover la cámara reinicia la acumulación');
  await page.waitForFunction(() => window.__A.n >= 3, null, { timeout: 90000, polling: 250 });
  ok(true, 'la acumulación se reanuda al quedar quieto de nuevo');

  // Con deriva activa (valor por defecto) nunca hay acumulación → sin costo extra en movimiento
  await page.evaluate(async () => { (await import('/js/core/params.js')).P.cam.drift = 0.35; });
  await page.waitForTimeout(1500);
  const drifting = await page.evaluate(async () => { const { accum } = await import('/js/three/accum.js'); return [accum.n, accum.pass.enabled]; });
  ok(drifting[0] === 0 && drifting[1] === false, 'con deriva de cámara no se acumula (pase apagado)');

  // Rendimiento en movimiento: renderFrame (ruta con deriva) vs composer.render() directo, 5 cuadros cada uno
  const perf = await page.evaluate(async () => {
    const { renderFrame, clock } = await import('/js/three/loop.js'); const { composer, renderer } = await import('/js/three/renderer.js');
    const gl = renderer.getContext(), sync = () => gl.finish();
    const time = fn => { sync(); const t = performance.now(); for (let i = 0; i < 5; i++) fn(); sync(); return (performance.now() - t) / 5; };
    renderFrame(clock.getElapsedTime()); composer.render(); // calentamiento
    return { frame: time(() => renderFrame(clock.getElapsedTime())), raw: time(() => composer.render()) };
  });
  console.log(`  · ms/cuadro en movimiento: renderFrame=${perf.frame.toFixed(1)} · composer.render directo=${perf.raw.toFixed(1)}`);
  ok(perf.frame < perf.raw * 1.25 + 5, 'renderFrame en movimiento no añade costo apreciable sobre composer.render');
});
