import { run } from './helpers.mjs';

// Nivel Medium: perfil estable de ≈ 40 fps. Calibra UNA vez (modelo fps = K / (píxeles · pr²)), fija la resolución y no vuelve a cambiarla.
// Se simula el FPS con un reloj sintético llamando a qualityTick() como el loop (pantalla 2× simulada con devicePixelRatio = 2).
await run('calidad medium · calibra una vez y queda estable', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'devicePixelRatio', { get: () => 2 }); });
  await boot();

  // `pr40` = pixel ratio en el que este equipo (simulado) da justo 40 fps con la ventana actual
  const sim = (pr40, secs) => page.evaluate(async ({ pr40, secs }) => {
    const { P } = await import('/js/core/params.js'); const Q = await import('/js/three/quality.js'); const S = await import('/js/three/session.js');
    try { localStorage.removeItem('mockup-studio:medium-k'); } catch {}
    P.quality.mode = 'medium'; Q.applyMode();
    const px = innerWidth * innerHeight, Kc = 40 * px * pr40 * pr40;
    const changes = []; let now = performance.now() + 50, last = S.pr; const t0 = now; // mismo reloj que usa applyMode (performance.now)
    while (now - t0 < secs * 1000) {
      const fps = Kc / (px * S.pr * S.pr); now += 1000 / fps; Q.qualityTick(now, true);
      if (Math.abs(S.pr - last) > 1e-6) { changes.push([Math.round((now - t0) / 100) / 10, +last.toFixed(2), +S.pr.toFixed(2)]); last = S.pr; }
    }
    return { changes, final: S.pr, fpsAtFinal: Kc / (px * S.pr * S.pr), info: Q.mediumInfo() };
  }, { pr40, secs });

  // 1) Equipo que da 40 fps a 1.5× → calibra a 1.5× en pocos segundos y NO vuelve a cambiar en 10 min
  let r = await sim(1.5, 600);
  console.log('  · pr40=1.5 cambios:', JSON.stringify(r.changes), '→', r.final, '· estado', r.info.state);
  eq(r.final, 1.5, 'equipo medio: resolución calibrada 1.5× (≈ 40 fps)');
  ok(r.changes.length === 1 && r.changes[0][0] < 8, `un único cambio, en los primeros segundos (${JSON.stringify(r.changes)})`);
  ok(r.fpsAtFinal >= 40 * 0.92, `queda en ≈ 40 fps o más (${r.fpsAtFinal.toFixed(1)})`);
  eq(r.info.state, 'locked', 'calibración bloqueada (sin sondeos)');

  // 2) Equipo más lento (40 fps a 1.0×) y 3) más rápido (40 fps a 3× → tope = pixel ratio de la pantalla, 2×)
  r = await sim(1.0, 300); eq([r.final, r.changes.length], [1.0, 1], 'equipo lento: 1.0× con un solo cambio');
  r = await sim(3.0, 300); eq(r.final, 2, 'equipo rápido: tope en el pixel ratio de la pantalla (2×)');
  // 4) Equipo muy lento (40 fps a 0.5×): piso 0.75×, no baja más
  r = await sim(0.5, 300); eq(r.final, 0.75, 'equipo muy lento: piso de 0.75×');

  // 5) Sin sondeos ni oscilación: tras calibrar, 10 minutos más no producen ningún cambio (nada de parpadeo)
  r = await sim(1.5, 600);
  const late = r.changes.filter(c => c[0] > 10);
  eq(late, [], 'sin ningún cambio de resolución después de calibrar');

  // 6) Medium es más ligero: AO de 8 muestras, sin refinamiento progresivo en el preview
  const prof = await page.evaluate(async () => { const { gtao } = await import('/js/three/renderer.js'); const Q = await import('/js/three/quality.js');
    return { ao: gtao.gtaoMaterial.defines.SAMPLES, accum: Q.accumAllowed() }; });
  eq(prof, { ao: 8, accum: false }, 'Medium: AO 8 muestras y sin acumulación en el preview');
});

// K guardado: al recargar no vuelve a medir (queda bloqueado y aplica la misma resolución) y al cambiar el tamaño de la ventana se recalcula.
await run('calidad medium · recuerda la calibración y se adapta al tamaño', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'devicePixelRatio', { get: () => 2 });
    if (!sessionStorage.getItem('__seedM')) { sessionStorage.setItem('__seedM', '1'); localStorage.setItem('mockup-studio:v2', JSON.stringify({ P: { quality: { mode: 'medium' } }, shots: null }));
      localStorage.setItem('mockup-studio:medium-k', String(40 * 1280 * 800 * 1.5 * 1.5)); } }); // equipo que da 40 fps a 1.5× con 1280×800
  await boot();
  const state = () => page.evaluate(async () => { const Q = await import('/js/three/quality.js'); const S = await import('/js/three/session.js'); return { pr: S.pr, info: Q.mediumInfo() }; });
  let s = await state();
  eq(s.info.state, 'locked', 'con K guardado arranca bloqueado (no vuelve a medir)');
  // primer cuadro tras recargar: aplica la resolución derivada de K
  await page.evaluate(async () => { const Q = await import('/js/three/quality.js'); Q.qualityTick(performance.now(), true); });
  s = await state(); eq(s.pr, 1.5, 'aplica la resolución calibrada (1.5×) sin medir');
  // ventana más pequeña (menos píxeles) → más resolución con el mismo coste
  await page.setViewportSize({ width: 800, height: 500 }); await page.waitForTimeout(600);
  s = await state(); ok(s.pr > 1.5 && s.pr <= 2, `ventana pequeña: sube la resolución sin recalibrar (${s.pr}×)`);
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(600);
  s = await state(); eq(s.pr, 1.5, 'al volver al tamaño original vuelve a 1.5×');
  // el selector ofrece los cuatro niveles
  await page.click('#railPanel'); await page.waitForTimeout(900);
  const opts = await page.evaluate(() => { const row = [...document.querySelectorAll('.tp-lblv')].find(l => /Quality/.test(l.textContent)); return [...row.querySelectorAll('option')].map(o => o.textContent); });
  eq(opts, ['Auto', 'Medium', 'High', 'Max'], 'selector Quality: Auto · Medium · High · Max');
}, { storage: 'keep' });
