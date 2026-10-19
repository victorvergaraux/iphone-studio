import { run } from './helpers.mjs';

// Calidad Auto: no debe oscilar (bajar/subir resolución cada pocos segundos = parpadeo visible).
// Se simula el FPS con un modelo determinista (el coste del cuadro escala con los píxeles: fps = K / pr²) y un reloj sintético,
// llamando a qualityTick() como lo hace el loop. Pantalla 2× simulada con devicePixelRatio = 2.
await run('calidad auto · sin oscilación de resolución', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(() => { Object.defineProperty(window, 'devicePixelRatio', { get: () => 2 }); });
  await boot();
  const sim = (K1, K2, secs) => page.evaluate(async ({ K1, K2, secs }) => {
    const { P } = await import('/js/core/params.js'); const Q = await import('/js/three/quality.js'); const S = await import('/js/three/session.js');
    P.quality.mode = 'auto'; Q.applyMode();
    const changes = []; let now = 10000, last = S.pr; const t0 = now;
    // K1: «constante de coste» durante la 1.ª mitad; K2 durante la 2.ª (p. ej. el equipo se libera de carga)
    while (now - t0 < secs * 1000) {
      const K = now - t0 < secs * 500 ? K1 : K2;
      const fps = K / (S.pr * S.pr);
      now += 1000 / fps;
      Q.qualityTick(now, true);
      if (Math.abs(S.pr - last) > 1e-6) { changes.push([Math.round((now - t0) / 1000), +last.toFixed(2), +S.pr.toFixed(2)]); last = S.pr; }
    }
    return { changes, final: S.pr };
  }, { K1, K2, secs });

  // A) Equipo justo: a 2× da ~30 fps (<45) y a 1.5× ~53 fps (≥45) → debe bajar a 1.5 y QUEDARSE ahí (sin sondear hacia arriba y volver).
  const a = await sim(120, 120, 600);
  console.log('  · A) cambios (t s, de, a):', JSON.stringify(a.changes));
  eq(a.final, 1.5, 'se estabiliza en 1.5× (el nivel mínimo que sostiene ≥ 45 fps)');
  const ups = a.changes.filter(c => c[2] > c[1]).length, downs = a.changes.filter(c => c[2] < c[1]).length;
  ok(downs <= 2 && ups === 0, `sin ciclos de subir/bajar en 10 min (bajadas ${downs}, subidas ${ups})`);

  // B) El equipo se libera (el coste cae a la mitad): sí debe recuperar resolución, pero sin oscilar
  const b = await sim(120, 480, 900);
  console.log('  · B) cambios (t s, de, a):', JSON.stringify(b.changes));
  ok(b.final >= 1.75, `si sobra rendimiento recupera resolución (final ${b.final}×)`);
  const flips = b.changes.reduce((n, c, i, arr) => n + (i > 0 && (c[2] > c[1]) !== (arr[i - 1][2] > arr[i - 1][1]) ? 1 : 0), 0);
  ok(flips <= 1, `como mucho un cambio de sentido en 15 min (${flips})`);
});
