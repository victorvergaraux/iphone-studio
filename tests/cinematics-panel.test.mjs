import { run } from './helpers.mjs';

// Card «Cinemática»: sin carpeta Shots en el panel avanzado, Move/Hold como sliders (por toma y globales) y «Cerrar» como icono X.
await run('cinemática · panel sin Shots, sliders y X', async ({ page, ok, eq, boot }) => {
  await boot();
  await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  const wait = ms => page.waitForTimeout(ms);
  const ev = (body) => page.evaluate(`(async () => { const P = (await import('/js/core/params.js')).P; const cam = await import('/js/three/camera.js'); const H = await import('/js/core/history.js'); ${body} })()`);

  // ── Panel avanzado: ya no hay carpeta «Shots» (ni «List») ──
  await page.click('#railPanel'); await wait(900);
  const folders = await page.evaluate(() => [...document.querySelectorAll('.tp-fldv_t')].map(e => e.textContent.trim()));
  ok(!folders.some(t => /^Shots$|^List/.test(t)), `el panel avanzado no tiene Shots ni List (${folders.join(', ')})`);
  await page.click('#railPanel'); await wait(600);

  // ── «Cerrar» como icono X (cinemática y exportar) ──
  await page.click('#railShots'); await wait(1300);
  const closeInfo = await page.evaluate(() => { const b = document.querySelector('#seClose'); return [b.textContent.trim(), !!b.querySelector('svg'), b.getAttribute('aria-label')]; });
  eq(closeInfo, ['', true, 'Cerrar'], 'seClose = icono X sin texto y con aria-label');
  const expInfo = await page.evaluate(() => { const b = document.querySelector('#expClose'); return [b.textContent.trim(), !!b.querySelector('svg'), b.getAttribute('aria-label')]; });
  eq(expInfo, ['', true, 'Cerrar'], 'expClose = icono X sin texto y con aria-label');

  // ── Pestaña «Toma»: sliders Move/Hold ──
  await page.click('.se-row[data-i="1"] .se-main'); await wait(300);
  const types = await page.evaluate(() => ['#se-move', '#se-hold'].map(s => document.querySelector(s).type));
  eq(types, ['range', 'range'], 'Move y Hold por toma son sliders');
  const lim = await page.evaluate(() => ['#se-move', '#se-hold'].map(s => { const r = document.querySelector(s); return [+r.min, +r.max]; }));
  eq(lim, [[0, 8], [0, 6]], 'rangos Move 0–8 y Hold 0–6');
  await page.fill('#se-move', '1.5'); await wait(200);
  eq(await ev('return cam.shots[1].move'), 1.5, 'mover el slider de la toma fija el override Move');
  ok(await page.evaluate(() => !document.querySelector('#se-move').parentElement.classList.contains('glob')), 'con override el slider ya no está atenuado');
  const h1 = await page.evaluate(() => Math.round(document.querySelector('#shotEditor').getBoundingClientRect().height));

  // ── Pestaña «Global»: ritmo de toda la cinemática (antes en el panel) ──
  await page.click('.se-tabs button:nth-child(2)'); await wait(300);
  const h2 = await page.evaluate(() => Math.round(document.querySelector('#shotEditor').getBoundingClientRect().height));
  eq(h2, h1, 'la card no cambia de alto entre pestañas');
  await ev('H.reset()');
  await page.fill('#se-g-transition', '2.5'); await wait(250);
  await page.fill('#se-g-hold', '4'); await wait(250);
  eq(await ev('return [P.shots.transition, P.shots.hold]'), [2.5, 4], 'sliders globales escriben P.shots.transition y P.shots.hold');
  ok(await ev('return H.canUndo()'), 'el cambio global queda en el historial');
  await ev('H.undo()'); await wait(400);
  eq(await ev('return P.shots.hold'), 3, 'deshacer restaura Hold global (3)');
  await page.click('#se-g-loop'); await wait(150);
  eq(await ev('return P.shots.loop'), false, 'interruptor Loop (por defecto activo) → apagado');
  eq(await page.getAttribute('#se-g-loop', 'aria-checked'), 'false', 'aria-checked de Loop sincronizado');
  const cntDisabled = await page.evaluate(() => [...document.querySelectorAll('.se-count2 button')].every(b => b.disabled));
  ok(cntDisabled, 'Count deshabilitado mientras Random está apagado');
  await page.click('#se-g-random'); await wait(150);
  eq(await ev('return P.shots.randomHalf'), true, 'interruptor Random → activo');
  await page.click('.se-count2 button:nth-child(2)'); await wait(150);
  eq(await ev('return P.shots.halfCount'), 2, 'Count = 2');

  // ── Copiar JSON sigue disponible en la card ──
  ok(await page.evaluate(() => !!document.querySelector('#se-json')), 'botón Copiar JSON en la card');

  // ── Cerrar con la X ──
  await page.click('#seClose'); await wait(900);
  ok(await page.evaluate(() => document.querySelector('#shotEditor').hidden), 'la X cierra la card');
});
