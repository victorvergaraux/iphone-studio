import { run } from './helpers.mjs';

// Scroll automático de diseños verticales: baja hasta el final y VUELVE A SUBIR dentro del tiempo de la pantalla (hold),
// de modo que al pasar al siguiente diseño ya está arriba.
await run('carrusel · el scroll baja y vuelve a subir', async ({ page, ok, boot }) => {
  await boot(); await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  await page.evaluate(async () => {
    const { P } = await import('/js/core/params.js'), c = await import('/js/screens/carousel.js');
    P.car.autoplay = false; c.setCarPlaying(false); c.clearCar();
    Object.assign(c.items[c.cur], { fit: 'width', zoom: 1, offX: 0, offY: 0, scroll: 0, autoScroll: true });
    window.__samples = []; c.scheduleCar();
    const t0 = performance.now(), it = c.items[c.cur];
    window.__iv = setInterval(() => window.__samples.push([Math.round(performance.now() - t0), +it.scroll.toFixed(3)]), 100);
  });
  await page.waitForTimeout(4500);
  const s = await page.evaluate(() => { clearInterval(window.__iv); return window.__samples; });
  const max = Math.max(...s.map(x => x[1])), iMax = s.findIndex(x => x[1] === max), after = s.slice(iMax);
  ok(max > 0.95, `baja hasta el final (máx ${max})`);
  ok(after[after.length - 1][1] < 0.02, `y vuelve arriba (final ${after[after.length - 1][1]})`);
  ok(s.slice(0, 3).every(x => x[1] < 0.2), 'espera arriba antes de empezar a bajar (Delay)');
});
