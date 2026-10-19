import { run } from './helpers.mjs';

// Editor de cinemática: card del rail con exclusión mutua, operaciones (añadir/renombrar/duplicar/eliminar/reordenar con puntero y teclado),
// overrides por toma (move/hold/ease) reflejados en presTL.segs, persistencia (recarga + exportar/importar proyecto) y gancho onShotsChange.
await run('shot-editor · card, operaciones, overrides y persistencia', async ({ page, ok, eq, boot }) => {
  await boot(); await page.evaluate(() => gsap.ticker.lagSmoothing(0)); // sin esto GSAP corre lento con WebGL por software
  await page.waitForTimeout(1500);
  const wait = ms => page.waitForTimeout(ms);
  // Acceso a los módulos vivos de la app (mismas instancias que usa la página: se importan por URL)
  const ev = (fn, arg) => page.evaluate(async ([src, a]) => {
    const cam = await import('/js/three/camera.js'), { P } = await import('/js/core/params.js'), { hooks } = await import('/js/core/hooks.js');
    return await (new Function('cam', 'P', 'hooks', 'a', `return (async()=>{ ${src} })()`))(cam, P, hooks, a);
  }, [fn, arg]);
  const names = () => ev('return cam.shots.map(s => s.name || null)');
  const log = () => ev('return window.__log');
  const hidden = sel => page.evaluate(s => document.querySelector(s).hidden, sel);
  const css = (sel, p) => page.evaluate(([s, p]) => getComputedStyle(document.querySelector(s))[p], [sel, p]);
  await ev('window.__log = []; hooks.onShotsChange = r => window.__log.push(r);');

  // ── Rail: botón, orden y accesibilidad ──
  eq(await page.evaluate(() => [...document.querySelectorAll('#rail button')].map(b => b.id)), ['onbHelp', 'railExport', 'railDock', 'railPanel', 'railShots', 'railPlay'], 'botón Tomas antes de Play');
  eq(await page.evaluate(() => { const b = document.querySelector('#railShots'); return [b.dataset.tip, b.getAttribute('aria-expanded'), !!b.getAttribute('aria-label')]; }), ['Tomas', 'false', true], 'tooltip, aria-expanded y aria-label');

  // ── Abrir / cerrar y exclusión mutua ──
  await page.click('#railShots'); await wait(1300);
  ok(!(await hidden('#shotEditor')) && (await page.getAttribute('#railShots', 'aria-expanded')) === 'true', 'se abre con el rail');
  eq(await page.textContent('#seCount'), '04', 'cifra = nº de tomas (preset base: 4)');
  eq(await page.evaluate(() => document.querySelectorAll('.se-row').length), 4, '4 filas');
  await page.click('#onbHelp'); await wait(1300);
  ok((await hidden('#shotEditor')) && !(await hidden('#onb')), 'abrir onboarding cierra el editor');
  await page.click('#railShots'); await wait(1300);
  ok(!(await hidden('#shotEditor')) && (await hidden('#onb')), 'abrir el editor cierra el onboarding');
  await page.click('#railExport'); await wait(1300);
  ok((await hidden('#shotEditor')) && !(await hidden('#expCard')), 'abrir export cierra el editor');
  await page.click('#railShots'); await wait(1300);
  ok(!(await hidden('#shotEditor')) && (await hidden('#expCard')), 'abrir el editor cierra export');
  await page.keyboard.press('Escape'); await wait(1000);
  ok(await hidden('#shotEditor'), 'Escape cierra la card');
  await page.click('#railShots'); await wait(1300);

  // ── Operaciones ──
  await page.click('#se-save'); await wait(200);
  eq(await page.textContent('#seCount'), '05', 'Guardar cámara añade una toma');
  eq(await ev('return cam.curShot'), 4, 'la toma nueva queda seleccionada');
  await page.click('.se-row[data-i="0"] .se-main'); await wait(300);
  eq(await ev('return cam.curShot'), 0, 'clic en fila selecciona y vuela a la toma');
  await page.click('#se-ren'); await wait(100);
  await page.fill('.se-edit', 'Alpha'); await page.press('.se-edit', 'Enter'); await wait(150);
  eq((await names())[0], 'Alpha', 'renombrar (edición inline)');
  eq(await page.textContent('.se-row[data-i="0"] .se-nm'), 'Alpha', 'la fila muestra el nombre');
  await page.click('#se-dup'); await wait(150);
  eq((await names()).slice(0, 2), ['Alpha', 'Alpha 2'], 'duplicar inserta tras la original');
  eq(await ev('return [cam.shots.length, cam.curShot]'), [6, 1], 'duplicar: 6 tomas, la copia queda seleccionada');
  // Reordenar con teclado (asa: flecha abajo)
  await page.focus('.se-row[data-i="1"] .se-grip'); await page.keyboard.press('ArrowDown'); await wait(200);
  eq((await names())[2], 'Alpha 2', 'teclado: flecha abajo baja la toma');
  eq(await page.evaluate(() => document.activeElement?.closest('.se-row')?.dataset.i), '2', 'el foco sigue al asa de la toma movida');
  await page.keyboard.press('ArrowUp'); await wait(200);
  eq((await names())[1], 'Alpha 2', 'teclado: flecha arriba sube la toma');
  // Botones subir/bajar accesibles
  await page.click('#se-down'); await wait(150);
  eq((await names())[2], 'Alpha 2', 'botón Bajar');
  await page.click('#se-up'); await wait(150);
  eq((await names())[1], 'Alpha 2', 'botón Subir');
  // Reordenar con puntero: arrastra el asa de la fila 2 justo debajo de la fila 3
  await page.click('.se-row[data-i="1"] .se-main'); await wait(200);
  const g = await page.evaluate(() => { const r = document.querySelector('.se-row[data-i="1"] .se-grip').getBoundingClientRect(), t = document.querySelector('.se-row[data-i="3"]').getBoundingClientRect(); return { x:r.x + r.width / 2, y:r.y + r.height / 2, ty:t.bottom + 1 }; });
  await page.mouse.move(g.x, g.y); await page.mouse.down(); await page.mouse.move(g.x, (g.y + g.ty) / 2, { steps:4 }); await page.mouse.move(g.x, g.ty, { steps:4 }); await page.mouse.up(); await wait(250);
  eq((await names())[3], 'Alpha 2', 'puntero: la toma cae en la posición soltada');
  eq(await ev('return cam.curShot'), 3, 'la selección sigue a la toma arrastrada');

  // ── Overrides por toma ──
  await page.fill('#se-move', '0'); await page.press('#se-move', 'Enter'); await wait(150);
  eq(await ev('return cam.shots[cam.curShot].move'), 0, 'Move propio = 0 (corte seco)');
  await page.fill('#se-hold', '1.2'); await page.press('#se-hold', 'Enter'); await wait(150);
  eq(await ev('return cam.shots[cam.curShot].hold'), 1.2, 'Hold propio');
  await page.selectOption('#se-ease', 'sine.inOut'); await wait(150);
  eq(await ev('return cam.shots[cam.curShot].ease'), 'sine.inOut', 'Ease propio');
  ok(await ev('return cam.shots[cam.curShot].example === undefined'), 'editar retira la marca example');
  await page.click('.se-row:nth-child(1) .se-main'); await wait(100);
  eq(await ev('return [cam.shots[cam.curShot].move, cam.shots[cam.curShot].hold, cam.shots[cam.curShot].ease]'), [undefined, undefined, undefined], 'las otras tomas siguen en global');
  ok(await page.evaluate(() => document.querySelector('#se-move').parentElement.classList.contains('glob')), 'slider sin override = valor global (atenuado)');
  await page.click('.se-row[data-i="3"] .se-main'); await wait(100);
  await page.click('#seDBody .se-row2:nth-child(2) .se-g'); await wait(100);
  eq(await ev('return cam.shots[3].hold'), undefined, 'botón Global quita el override de Hold');
  await page.fill('#se-hold', '1.2'); await page.press('#se-hold', 'Enter'); await wait(100);

  // ── presTL.segs refleja las duraciones por toma ──
  const segs = await ev(`
    P.shots.transition = 2; P.shots.hold = 1.5; P.shots.randomHalf = false;
    const sh = cam.shots.slice(0, 5); const src = cam.shots;
    // reconstruye 5 tomas con casuística: global · corte seco con hold · move sin hold · corte sin hold (piso 50 ms) · move/hold propios
    const base = cam.shots[0];
    const mk = o => ({ p:base.p, t:base.t, fov:base.fov, ...o });
    cam.commitShots('add', [mk({}), mk({ move:0, hold:1 }), mk({ move:1, hold:0 }), mk({ move:0, hold:0 }), mk({ move:0.5, hold:0.25 })], -1);
    cam.playPresentation(false); const a = cam.presTL.segs.map(s => +(s.end - s.start).toFixed(3)); const dur = +cam.presTL.duration().toFixed(3);
    cam.stopPresentation();
    P.shots.randomHalf = true; P.shots.halfCount = 1;
    cam.playPresentation(false); const b = cam.presTL.segs.map(s => +(s.end - s.start).toFixed(3)); cam.stopPresentation();
    P.shots.randomHalf = false;
    return { a, dur, b, len:+cam.presentationLength().toFixed(3) };`);
  eq(segs.a, [3.5, 1, 1, 0.05, 0.75], 'segs: tr + hold por toma (global, corte seco, piso de 50 ms, propios)');
  eq(segs.dur, 6.3, 'duración total del timeline = suma de segs');
  eq(segs.len, 6.3, 'presentationLength coincide');
  const full = [3.5, 1, 1, 0.05, 0.75], sum = segs.b.reduce((x, y) => x + y, 0);
  ok(segs.b.every((v, i) => Math.abs(v - full[i]) < 1e-6 || Math.abs(v - full[i] / 2) < 1e-6) && sum <= 6.3 + 1e-6 && sum >= 6.3 - 1.75 - 1e-6, `randomHalf respeta los overrides (segs ${JSON.stringify(segs.b)})`);

  // ── Resto de operaciones y motivos de onShotsChange ──
  await page.click('.se-row[data-i="1"] .se-main'); await wait(150);
  await page.click('#se-upd'); await wait(100);
  await page.click('#se-del'); await wait(150);
  eq(await ev('return cam.shots.length'), 4, 'eliminar quita la toma');
  await page.selectOption('#se-presetSel', 'producto'); await page.click('#se-preset'); await wait(500);
  eq(await ev('return [cam.shots.length, cam.shots.every(s => s.example)]'), [3, true], 'cargar preset (Product: 3 tomas)');
  await ev("P.shots.preset = 'base'");
  const reasons = await log();
  for (const r of ['add', 'rename', 'duplicate', 'move', 'timing', 'update', 'delete', 'preset']) ok(reasons.includes(r), `onShotsChange recibió «${r}»`);

  // ── Persistencia: recarga ──
  await ev(`P.shots.preset = 'base'; cam.applyShotPreset();`); await wait(500);
  await page.click('.se-row[data-i="1"] .se-main'); await wait(200);
  await page.click('#se-ren'); await page.fill('.se-edit', 'Persist'); await page.press('.se-edit', 'Enter'); await wait(100);
  await page.fill('#se-move', '0.5'); await page.press('#se-move', 'Enter'); await wait(100);
  await page.fill('#se-hold', '2.5'); await page.press('#se-hold', 'Enter'); await wait(100);
  await page.selectOption('#se-ease', 'cine'); await wait(600);
  const before = await ev('return cam.shots.map(({ name, move, hold, ease }) => ({ name, move, hold, ease }))');
  await page.reload(); await page.waitForFunction(() => !!document.querySelector('#rail') && !!window.gsap, null, { timeout: 30000 }); await wait(2500); await page.evaluate(() => gsap.ticker.lagSmoothing(0)); await wait(1500);
  await page.evaluate(() => document.querySelector('#onbSkip')?.click()); await wait(500);
  eq(await ev('return cam.shots.map(({ name, move, hold, ease }) => ({ name, move, hold, ease }))'), before, 'name/move/hold/ease persisten tras recargar');
  // Compatibilidad hacia atrás: tomas viejas sin campos siguen válidas; campos con tipos inválidos se limpian
  // pagehide reescribe el guardado al recargar: la inyección se hace en el arranque de la página siguiente (antes de que corra la app)
  await page.addInitScript(() => {
    if (sessionStorage.getItem('__inj')) return; sessionStorage.setItem('__inj', '1');
    const s = JSON.parse(localStorage.getItem('mockup-studio:v2'));
    s.shots = [{ p:[1, 2, 3], t:[0, 0, 0], fov:10 }, { p:[1, 2, 4], t:[0, 0, 0], fov:12, name:'Viejo', move:'x', hold:-3, ease:'bogus' }, { p:[1], t:[0, 0, 0], fov:10 }];
    localStorage.setItem('mockup-studio:v2', JSON.stringify(s));
  });
  await page.reload(); await page.waitForFunction(() => !!document.querySelector('#rail') && !!window.gsap, null, { timeout: 30000 }); await wait(2500); await page.evaluate(() => gsap.ticker.lagSmoothing(0)); await wait(1500);
  await page.evaluate(() => document.querySelector('#onbSkip')?.click()); await wait(500);
  eq(await ev('return cam.shots.map(s => [s.name ?? null, s.move ?? null, s.hold ?? null, s.ease ?? null])'), [[null, null, null, null], ['Viejo', null, null, null]], 'tomas viejas válidas; campos inválidos limpiados; toma malformada descartada');

  // ── Exportar / importar proyecto: ida y vuelta ──
  await ev(`cam.commitShots('add', [{ p:[1, 2, 3], t:[0, 0, 0], fov:10, name:'A', move:0, hold:2, ease:'power4.inOut' }, { p:[2, 2, 3], t:[0, 0, 0], fov:11 }, { p:[3, 2, 3], t:[0, 0, 0], fov:12, move:1.5 }], 0);`);
  const orig = await ev('return cam.shots.map(({ p, t, fov, name, move, hold, ease }) => ({ p, t, fov, name, move, hold, ease }))');
  await ev(`const { exportProject } = await import('/js/export/project.js'); await exportProject();`); await wait(1500);
  const json = await page.evaluate(() => document.querySelector('.modal textarea')?.value);
  ok(!!json, 'exportProject genera el JSON');
  const data = JSON.parse(json);
  eq(data.shots.map(({ name, move, hold, ease }) => ({ name, move, hold, ease })), orig.map(({ name, move, hold, ease }) => ({ name, move, hold, ease })), 'el JSON exportado incluye los campos de cada toma');
  await page.evaluate(() => document.querySelector('.modal')?.remove());
  await ev(`cam.commitShots('delete', cam.shots.slice(0, 1), -1);`);
  await page.setInputFiles('#projFile', { name:'proyecto.json', mimeType:'application/json', buffer:Buffer.from(json) }); await wait(7000);
  eq(await ev('return cam.shots.map(({ p, t, fov, name, move, hold, ease }) => ({ p, t, fov, name, move, hold, ease }))'), JSON.parse(JSON.stringify(orig)), 'importar restaura las tomas con sus overrides');
}, { });
