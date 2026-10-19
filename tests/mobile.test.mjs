import { run } from './helpers.mjs';

// Mobile (390×844, táctil): sin scroll horizontal, sin solapes rail/dock/cards, objetivos ≥ 40 px, doble toque reencuadra.
const rects = sel => `[...document.querySelectorAll('${sel}')].map(e => { const r = e.getBoundingClientRect(); return { id:e.id, x:r.x, y:r.y, w:r.width, h:r.height, r:r.right, b:r.bottom }; })`;
const overlap = (a, b) => a.x < b.r - 0.5 && b.x < a.r - 0.5 && a.y < b.b - 0.5 && b.y < a.b - 0.5;

await run('mobile · layout y gestos', async ({ page, ok, boot, errors }) => {
  await boot();
  const W = 390, H = 844;
  ok(await page.evaluate(() => !!document.querySelector('meta[name=viewport][content*="width=device-width"]')), 'meta viewport presente');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth && document.body.scrollWidth <= innerWidth), 'sin scroll horizontal');

  const get = sel => page.evaluate(rects(sel));

  // Botones del rail y del dock ≥ 40 px y dentro del viewport
  const rail = await get('#rail'), railBtns = await get('#rail button'), dockBtns = await get('.dock .tools button');
  ok(railBtns.length === 6 && railBtns.every(b => b.w >= 40 && b.h >= 40), `rail: ${railBtns.length} botones ≥ 40×40`);
  ok(dockBtns.length >= 6 && dockBtns.every(b => b.w >= 40 && b.h >= 40), `dock: ${dockBtns.length} botones ≥ 40×40 (${dockBtns.map(b => Math.round(b.w) + 'x' + Math.round(b.h)).join(' ')})`);
  ok(dockBtns.every(b => b.x >= 0 && b.r <= W), 'botones del dock dentro del ancho');
  const rowTops = new Set(dockBtns.map(b => Math.round(b.y)));
  ok(rowTops.size === 1, 'acciones del dock en una sola fila');

  const dock = (await get('.dock'))[0], rl = rail[0];
  ok(!overlap(dock, rl), 'rail y dock sin solapamiento');
  ok(dock.x >= 0 && dock.r <= W && dock.b <= H, 'dock dentro del viewport');

  // Cards abiertas: onboarding y export
  for (const [btn, card, name] of [['#onbHelp', '#onb', 'onboarding'], ['#railExport', '#expCard', 'export']]) {
    await page.evaluate(() => { document.querySelector('#onbSkip')?.click(); document.querySelector('#expClose')?.click(); });
    await page.waitForTimeout(800);
    await page.tap(btn); await page.waitForTimeout(1200);
    const c = (await get(card))[0];
    ok(c && c.w > 0, `${name}: abierta`);
    ok(c.x >= 0 && c.y >= 0 && c.r <= W && c.b <= H, `${name}: dentro del viewport (${Math.round(c.x)},${Math.round(c.y)} ${Math.round(c.w)}x${Math.round(c.h)})`);
    ok(!overlap(c, rl), `${name}: no tapa el rail`);
    ok(!overlap(c, dock), `${name}: no tapa el dock`);
    ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name}: sin scroll horizontal`);
  }
  await page.evaluate(() => { document.querySelector('#onbSkip')?.click(); document.querySelector('#expClose')?.click(); });
  await page.waitForTimeout(800);

  // Panel Controls = hoja inferior que no cubre el rail
  await page.tap('#railPanel'); await page.waitForTimeout(900);
  const side = (await get('#side'))[0];
  ok(side.x >= 0 && side.r <= W && side.b <= H && side.h <= H * 0.6 + 1, `panel: hoja inferior (${Math.round(side.w)}x${Math.round(side.h)})`);
  ok(!overlap(side, rl), 'panel: no cubre el rail');
  await page.tap('#railPanel'); await page.waitForTimeout(600);

  // Doble toque sobre el canvas → reencuadra a la toma activa
  const res = await page.evaluate(async () => {
    const { camera, controls } = await import('/js/three/renderer.js');
    const cam = await import('/js/three/camera.js');
    const { hooks } = await import('/js/core/hooks.js');
    const sh = hooks.getShots()[0];
    cam.flyTo(0, 0.01); await new Promise(r => setTimeout(r, 400));
    // aleja la cámara (simula orbitar) y mide la distancia a la toma
    camera.position.set(sh.p[0] + 3, sh.p[1] + 2, sh.p[2] + 3); controls.update();
    const d = () => Math.hypot(camera.position.x - sh.p[0], camera.position.y - sh.p[1], camera.position.z - sh.p[2]);
    window.__d = d; return { d0: d(), touches: controls.touches, shots: hooks.getShots().length };
  });
  ok(res.touches.ONE === 0 && res.touches.TWO === 2, 'OrbitControls.touches: 1 dedo rota, 2 dedos zoom+pan');
  await page.evaluate(() => gsap.ticker.lagSmoothing(0)); // WebGL por software: tiempos reales
  // Playwright tarda segundos entre toques con WebGL por software: se disparan dos toques sintéticos seguidos (pointer events táctiles)
  await page.evaluate(() => { const c = document.querySelector('#c'); c.setPointerCapture = c.releasePointerCapture = () => {}; // los ids sintéticos no existen para el navegador
    const ev = (t, id) => c.dispatchEvent(new PointerEvent(t, { pointerType:'touch', isPrimary:true, pointerId:id, clientX:195, clientY:300, bubbles:true }));
    ev('pointerdown', 7); ev('pointerup', 7); setTimeout(() => { ev('pointerdown', 8); ev('pointerup', 8); }, 120); });
  await page.waitForTimeout(5000);
  const d1 = await page.evaluate(() => window.__d());
  ok(d1 < res.d0 * 0.5, `doble toque reencuadra (distancia ${res.d0.toFixed(2)} → ${d1.toFixed(2)})`);
}, { mobile:true, width:390, height:844 });
