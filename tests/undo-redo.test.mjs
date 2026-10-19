import { run } from './helpers.mjs';

// Deshacer / rehacer: tomas (cada operación), ajustes del panel (P + escena), fusión de cambios continuos, atajos, tope, reset tras import y botones.
await run('undo-redo · tomas, ajustes, atajos, tope y botones', async ({ page, ok, eq, boot }) => {
  await boot(); await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  await page.waitForTimeout(1500);
  const wait = ms => page.waitForTimeout(ms);
  // Acceso a los módulos vivos (mismas instancias que la página)
  const ev = (fn, arg) => page.evaluate(async ([src, a]) => {
    const cam = await import('/js/three/camera.js'), { P } = await import('/js/core/params.js'), H = await import('/js/core/history.js'), { pane } = await import('/js/ui/pane.js'), sc = await import('/js/three/scene.js'), rd = await import('/js/three/renderer.js');
    const bind = (key, label) => { const walk = n => { for (const c of [...(n.children || []), ...((n.pages || []).flatMap(p => p.children))]) { if (c.key === key && (!label || c.label === label)) return c; const r = walk(c) || (c.pages && walk(c)); if (r) return r; } return null; };
      const f = n => { for (const c of [...(n.children || []), ...((n.pages || []).flatMap(p => [p, ...p.children]))]) { if (c.key === key && (!label || c.label === label) && c.controller?.value) return c; const r = f(c); if (r) return r; } return null; }; return f(pane); };
    const setV = (b, v, last = true) => b.controller.value.setRawValue(v, { forceEmit:false, last });
    return await (new Function('cam', 'P', 'H', 'pane', 'sc', 'rd', 'bind', 'setV', 'a', `return (async()=>{ ${src} })()`))(cam, P, H, pane, sc, rd, bind, setV, a);
  }, [fn, arg]);
  const deep = () => ev('return JSON.parse(JSON.stringify(cam.shots))');
  const hinfo = () => ev('const i = H.info(); return { len:i.length, idx:i.index, u:H.canUndo(), r:H.canRedo() }');
  const press = k => page.keyboard.press(k);
  const toastTxt = () => page.textContent('#toast');

  await wait(600);
  await ev('H.reset()');
  eq(await hinfo(), { len:1, idx:0, u:false, r:false }, 'historial limpio tras reset');
  await page.click('#railShots'); await wait(1300);
  eq(await page.evaluate(() => [document.querySelector('#seUndo').disabled, document.querySelector('#seRedo').disabled, document.querySelector('#seUndo').getAttribute('aria-label'), document.querySelector('#seRedo').getAttribute('aria-label')]), [true, true, 'Deshacer', 'Rehacer'], 'botones deshabilitados y con aria-label');

  // ── Tomas: añadir ──
  const s0 = await deep();
  await page.click('#se-save'); await wait(150);
  const s1 = await deep();
  eq(s1.length, s0.length + 1, 'añadir toma');
  eq(await page.evaluate(() => [document.querySelector('#seUndo').disabled, document.querySelector('#seRedo').disabled]), [false, true], 'botón Deshacer habilitado tras añadir');
  await page.click('#seUndo'); await wait(200);
  eq(await deep(), s0, 'deshacer añadir restaura el array exacto');
  eq(await toastTxt(), 'Deshacer: añadir toma', 'toast «Deshacer: añadir toma»');
  eq(await page.evaluate(() => [document.querySelector('#seUndo').disabled, document.querySelector('#seRedo').disabled]), [true, false], 'botones: sin pasado, con futuro');
  eq(await page.textContent('#seCount'), '04', 'la lista de la card se repinta');
  await page.click('#seRedo'); await wait(200);
  eq(await deep(), s1, 'rehacer añadir');
  eq(await toastTxt(), 'Rehacer: añadir toma', 'toast «Rehacer: añadir toma»');

  // ── mover / renombrar / eliminar (ctrl+z, ctrl+shift+z, ctrl+y) ──
  await ev('cam.flyTo(0)'); await wait(2500);
  const a = await deep();
  await ev('cam.moveShot(0, 2)'); const b = await deep();
  ok(JSON.stringify(a) !== JSON.stringify(b), 'mover cambia el orden');
  await press('Control+z'); await wait(200); eq(await deep(), a, 'Ctrl+Z deshace mover');
  eq(await toastTxt(), 'Deshacer: mover toma', 'toast mover');
  await press('Control+Shift+z'); await wait(200); eq(await deep(), b, 'Ctrl+Shift+Z rehace mover');
  await press('Control+z'); await wait(200); await press('Control+y'); await wait(200); eq(await deep(), b, 'Ctrl+Y rehace mover');

  await ev('cam.renameShot(1, "Zeta")'); const c = await deep();
  eq(c[1].name, 'Zeta', 'renombrar');
  await press('Control+z'); await wait(200); eq(await deep(), b, 'deshacer renombrar');
  await press('Control+Shift+z'); await wait(200); eq(await deep(), c, 'rehacer renombrar');
  await ev('cam.deleteShot(1)'); const d = await deep();
  eq(d.length, c.length - 1, 'eliminar');
  await press('Control+z'); await wait(200); eq(await deep(), c, 'deshacer eliminar');
  await press('Control+Shift+z'); await wait(200); eq(await deep(), d, 'rehacer eliminar');
  await ev('cam.setShotTiming(0, { move: 1.5, hold: 2 })'); const e1 = await deep();
  await press('Control+z'); await wait(200); eq(await deep(), d, 'deshacer tiempos (move/hold)');
  await press('Control+Shift+z'); await wait(200); eq(await deep(), e1, 'rehacer tiempos');
  await ev('cam.duplicateShot(0)'); const f = await deep();
  await press('Control+z'); await wait(200); eq(await deep(), e1, 'deshacer duplicar');
  await press('Control+Shift+z'); await wait(200); eq(await deep(), f, 'rehacer duplicar');
  const preBefore = await deep();
  await ev("P.shots.preset = 'producto'; cam.applyShotPreset();"); await wait(300);
  eq(await ev('return cam.shots.length'), 3, 'preset Product: 3 tomas');
  await press('Control+z'); await wait(300); eq(await deep(), preBefore, 'deshacer cargar preset');
  await ev("P.shots.preset = 'base'");
  // La presentación se detiene al restaurar tomas
  await ev('cam.playPresentation(false)'); await wait(200);
  ok(await ev('return !!cam.presTL'), 'presentación en marcha');
  await press('Control+Shift+z'); await wait(300);
  ok(await ev('return !cam.presTL'), 'restaurar tomas detiene la presentación');
  await ev('cam.stopPresentation()'); await wait(2500); // deja terminar los vuelos de cámara (si no, el FOV no se aplica a la cámara)
  await ev('H.reset()');

  // ── Ajustes: un slider arrastrado = una sola entrada ──
  const n0 = (await hinfo()).len;
  const fov0 = await ev('return P.cam.fov');
  await ev(`const b = bind('fov', 'FOV'); setV(b, 20, false); setV(b, 25, false); setV(b, 30, false); setV(b, 35, true);`); await wait(100);
  eq(await ev('return [P.cam.fov, rd.camera.fov]'), [35, 35], 'el slider aplica FOV (P y cámara)');
  eq((await hinfo()).len, n0 + 1, 'varios cambios del mismo slider = 1 entrada');
  await press('Control+z'); await wait(800);
  eq(await ev('return [P.cam.fov, rd.camera.fov]'), [fov0, fov0], 'deshacer FOV restaura P y la cámara');
  ok((await toastTxt()).startsWith('Deshacer: ajuste'), 'toast de ajuste');
  await press('Control+Shift+z'); await wait(800);
  eq(await ev('return P.cam.fov'), 35, 'rehacer FOV');
  // dos cambios separados (>400 ms) = dos entradas
  await ev(`setV(bind('fov', 'FOV'), 40, true)`); await wait(600);
  await ev(`setV(bind('fov', 'FOV'), 45, true)`); await wait(200);
  eq((await hinfo()).len, n0 + 3, 'cambios separados = entradas separadas');

  // ── Preset de color (cambia P.scene.* y la escena) ──
  await ev('H.reset()');
  const bg0 = await ev('return [P.scene.bg, "#" + sc.bgColor.getHexString()]');
  await ev(`setV(bind('preset', 'Palette'), 'dark', true)`); await wait(1500);
  const bg1 = await ev('return [P.scene.bg, "#" + sc.bgColor.getHexString()]');
  ok(bg1[0] !== bg0[0] && bg1[1] === bg1[0], `preset dark aplica el fondo a P y a la escena (${bg1})`);
  await press('Control+z'); await wait(1500);
  const bg2 = await ev('return [P.scene.bg, "#" + sc.bgColor.getHexString()]');
  eq(bg2[0], bg0[0], 'deshacer: P.scene.bg restaurado');
  ok(bg2[1].toLowerCase() === bg0[0].toLowerCase(), 'deshacer: scene.bgColor restaurado en la escena (' + bg2[1] + ')');
  await press('Control+Shift+z'); await wait(1500);
  eq(await ev('return [P.scene.bg, "#" + sc.bgColor.getHexString()]'), bg1, 'rehacer: fondo oscuro de nuevo en P y escena');

  // ── Un cambio en P.exp NO crea entrada ──
  await ev('H.reset()');
  await ev(`const b = bind('fps'); if (b) setV(b, 60, true);`); await wait(100);
  eq((await hinfo()).len, 1, 'ajustes de exportación no se registran');

  // ── Atajos con foco en input/select: ignorados ──
  await ev('H.reset()'); await ev('cam.flyTo(1)'); await wait(2500);
  await page.click('.se-row[data-i="1"] .se-main'); await wait(2500);
  await ev('cam.renameShot(1, "Foco")'); const g = await deep();
  await page.focus('#se-move'); await press('Control+z'); await wait(200);
  eq(await deep(), g, 'Ctrl+Z con foco en input no deshace');
  await page.focus('#se-ease'); await press('Control+z'); await wait(200);
  eq(await deep(), g, 'Ctrl+Z con foco en select no deshace');
  await page.evaluate(() => document.activeElement?.blur());
  // evento no cancelado cuando no hay nada que deshacer
  await ev('H.reset()');
  const prevented = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key:'z', ctrlKey:true, cancelable:true, bubbles:true }); document.body.dispatchEvent(e); return e.defaultPrevented; });
  eq(prevented, false, 'sin historial no se llama preventDefault');
  await ev('cam.renameShot(1, "Otro")');
  const prevented2 = await page.evaluate(() => { const e = new KeyboardEvent('keydown', { key:'z', ctrlKey:true, cancelable:true, bubbles:true }); document.body.dispatchEvent(e); return e.defaultPrevented; });
  eq(prevented2, true, 'con historial sí se cancela el atajo');
  await wait(200);

  // ── Tope de historial ──
  await ev('H.reset()');
  await ev(`for (let k = 0; k < 130; k++) cam.renameShot(0, 'n' + k);`);
  const cap = await hinfo();
  eq([cap.len, cap.idx], [100, 99], 'tope de 100 entradas (descarta lo más viejo)');
  // ── Un nuevo cambio tras deshacer descarta el futuro ──
  await press('Control+z'); await wait(150);
  await ev(`cam.renameShot(0, 'rama')`);
  eq((await hinfo()).r, false, 'cambio nuevo descarta el futuro');

  // ── Reset tras importar proyecto ──
  await ev('H.reset()'); await ev(`cam.renameShot(0, 'previo')`);
  eq((await hinfo()).u, true, 'hay historial antes de importar');
  const json = await ev(`return JSON.stringify({ app:'mockup-studio', version:2, P, shots: cam.shots.map(({ p, t, fov, name }) => ({ p, t, fov, name })) })`);
  await page.setInputFiles('#projFile', { name:'proyecto.json', mimeType:'application/json', buffer:Buffer.from(json) }); await wait(7000);
  eq(await hinfo(), { len:1, idx:0, u:false, r:false }, 'importar proyecto reinicia el historial');
  eq(await page.evaluate(() => document.querySelector('#seUndo').disabled), true, 'botón Deshacer deshabilitado tras importar');
}, { });
