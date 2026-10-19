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

  // ── La card nunca pisa el dock (con el botón nuevo es más alta: scroll interno si no cabe) ──
  const geo = await page.evaluate(() => ({ cardB: document.querySelector('#shotEditor').getBoundingClientRect().bottom, dockT: document.querySelector('.dock').getBoundingClientRect().top }));
  ok(geo.cardB <= geo.dockT + 1, `la card termina sobre el dock (${Math.round(geo.cardB)} ≤ ${Math.round(geo.dockT)})`);

  // ── Botón «Reproducir cinemática» dentro de la card (acento; ON = tinta con texto acento), sincronizado con el rail ──
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const pb = async () => { await page.mouse.move(900, 500); await wait(150); return page.evaluate(() => { const b = document.querySelector('#se-play'), c = getComputedStyle(b), r = document.querySelector('#railPlay');
    return { txt: b.textContent.trim(), on: b.classList.contains('on'), pressed: b.getAttribute('aria-pressed'), bg: c.backgroundColor, color: c.color, rail: r.getAttribute('aria-pressed'), icon: b.querySelector('svg')?.getAttribute('class') || '' }; }); }; // el ratón se aparta: no medir el color de hover
  let p0 = await pb();
  eq([p0.txt, p0.on], ['Reproducir cinemática', false], 'botón de reproducción con su etiqueta, en reposo');
  eq(p0.bg, 'rgb(214, 255, 61)', 'reposo: fondo accent (#d6ff3d)');
  await page.click('#se-play'); await wait(500);
  let p1 = await pb();
  eq([p1.txt, p1.on, p1.pressed, p1.rail], ['Detener cinemática', true, 'true', 'true'], 'al pulsar: «Detener cinemática», ON y el rail también');
  eq([p1.bg, p1.color], ['rgb(18, 18, 17)', 'rgb(214, 255, 61)'], 'reproduciendo: fondo tinta y texto accent');
  ok(/square/.test(p1.icon), 'icono de stop mientras reproduce');
  await page.click('#railPlay'); await wait(500); // detener desde el rail → la card se entera
  let p2 = await pb();
  eq([p2.txt, p2.on, p2.rail], ['Reproducir cinemática', false, 'false'], 'detener desde el rail sincroniza el botón de la card');
  await page.click('#se-play'); await wait(400); await page.click('#se-play'); await wait(400);
  eq((await pb()).on, false, 'play y stop desde la card vuelven al reposo');

  // ── Cerrar con la X ──
  await page.click('#seClose'); await wait(900);
  ok(await page.evaluate(() => document.querySelector('#shotEditor').hidden), 'la X cierra la card');
});
