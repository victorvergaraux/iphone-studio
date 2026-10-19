import { run, openDock } from './helpers.mjs';

// Etapa 1 · coherencia: textos «cinemática», toast/aviso con el estilo de las cards, motivo «Palette» y hover solo con puntero.
await run('etapa 1 · textos, toast, motivo de paleta y hover', async ({ page, ok, eq, boot }) => {
  await boot();
  await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  const wait = ms => page.waitForTimeout(ms);
  const ev = body => page.evaluate(`(async () => { const P = (await import('/js/core/params.js')).P; const cam = await import('/js/three/camera.js'); const H = await import('/js/core/history.js'); ${body} })()`);
  const toastText = () => page.evaluate(() => document.querySelector('#toast').textContent);

  // ── Textos: cinemática = el conjunto; toma = cada ángulo ──
  eq(await page.getAttribute('#railShots', 'data-tip'), 'Cinemática', 'tooltip del editor del rail = Cinemática');
  await ev('cam.setShots([]); cam.playPresentation();'); await wait(300);
  ok(/cinemática está vacía/.test(await toastText()), `play sin tomas avisa «cinemática vacía» («${await toastText()}»)`);
  await page.click('#railShots'); await wait(1300);
  ok(/Tu cinemática está vacía/.test(await page.evaluate(() => document.querySelector('.se-empty')?.textContent || '')), 'lista vacía del editor con el texto nuevo');
  await ev('cam.applyShotPreset();'); await wait(500);
  await page.click('#se-json'); await wait(300);
  ok(/Cinemática copiada como JSON \(\d+ tomas?\)/.test(await toastText()), `copiar JSON: «${await toastText()}»`);
  await page.click('#seClose'); await wait(900);

  // ── Toast: estilo de las cards (Inter, papel claro, arriba, sin movimiento en Y) ──
  await ev('const u = await import("/js/core/utils.js"); u.toast("Prueba de estilo");'); await wait(700);
  const ts = await page.evaluate(() => { const t = document.querySelector('#toast'), c = getComputedStyle(t), r = t.getBoundingClientRect();
    return { font: c.fontFamily.slice(0, 6), bg: c.backgroundColor, color: c.color, top: Math.round(r.top), opacity: +c.opacity, tf: c.transform, radius: c.borderTopLeftRadius, blur: c.backdropFilter }; });
  ok(/Inter/.test(ts.font), `toast en Inter (${ts.font})`);
  ok(!/rgb\(18, 18, 17\)/.test(ts.bg) && /color\(srgb 0\.96|rgba?\(24[0-9]/.test(ts.bg + ' ' + ts.bg), `toast con fondo claro de card, no tinta (${ts.bg})`);
  ok(ts.top < 30, `toast arriba, lejos del dock (top=${ts.top})`);
  ok(ts.opacity > .9, 'toast visible (opacidad)');
  ok(ts.tf === 'none' || /matrix\(1, 0, 0, 1, -?[\d.]+, 0\)/.test(ts.tf), `sin desplazamiento en Y (${ts.tf})`);
  ok(ts.radius === '12px' && /blur/.test(ts.blur), 'radio 12px y desenfoque como las cards');

  // ── Aviso persistente: mismo estilo y posición ──
  await ev('const n = await import("/js/core/notice.js"); n.showNotice("Aviso de prueba", { label:"Reintentar", onClick(){} });'); await wait(1300);
  const ns = await page.evaluate(() => { const t = document.querySelector('#notice'), c = getComputedStyle(t), r = t.getBoundingClientRect(), b = getComputedStyle(t.querySelector('button'));
    return { font: c.fontFamily.slice(0, 6), top: Math.round(r.top), op: +c.opacity, btnBorder: b.borderTopWidth }; });
  ok(/Inter/.test(ns.font) && ns.top < 30 && ns.op > .9, `aviso en Inter, arriba y visible (${JSON.stringify(ns)})`);
  eq(ns.btnBorder, '0px', 'botón del aviso sin borde');
  // con el aviso visible, un toast se apila DEBAJO (no se pisan)
  await ev('const u = await import("/js/core/utils.js"); u.toast("Toma T02 actualizada", 6000);'); await wait(1300);
  const stack = await page.evaluate(() => ({ n: document.querySelector('#notice').getBoundingClientRect().bottom, t: document.querySelector('#toast').getBoundingClientRect().top }));
  ok(stack.t >= stack.n - 1, `el toast queda debajo del aviso (aviso hasta ${Math.round(stack.n)}px, toast desde ${Math.round(stack.t)}px)`);
  await ev('const n = await import("/js/core/notice.js"); n.hideNotice();');

  // ── Motivo del historial al cambiar la paleta ──
  await page.click('#railPanel'); await wait(900);
  await ev('H.reset()');
  await page.selectOption('.tp-lblv:has(.tp-lblv_l:text-is("Palette")) select', { label:'Dark' }); // evento real de cambio, como lo haría el usuario
  await wait(900);
  eq(await ev('return H.canUndo()'), true, 'cambiar la paleta crea una entrada de historial');
  await ev('H.undo()'); await wait(300);
  ok(/Deshacer: ajuste Palette/.test(await toastText()), `motivo = «ajuste Palette» (${await toastText()})`);
  await page.click('#railPanel'); await wait(600);

  // ── Hover: ninguna regla :hover fuera de @media (hover:hover) ──
  const loose = await page.evaluate(() => {
    const bad = [];
    const walk = (rules, inHover) => { for (const r of rules) {
      if (r.type === 4 /* media */) walk(r.cssRules, inHover || /hover:\s*hover/.test(r.conditionText || r.media.mediaText));
      else if (r.cssRules && r.type !== 1) walk(r.cssRules, inHover);
      else if (r.selectorText && /:hover/.test(r.selectorText) && !inHover && !/\.tp-/.test(r.selectorText)) bad.push(r.selectorText.slice(0, 60)); } }; // .tp-* = estilos internos de Tweakpane (no son nuestros)
    for (const sh of document.styleSheets) { try { walk(sh.cssRules, false); } catch {} }
    return bad;
  });
  eq(loose, [], 'sin reglas :hover fuera de @media (hover:hover)');
});

// En un dispositivo táctil (sin hover) pasar/tocar un botón no lo deja teñido.
await run('etapa 1 · sin hover pegado en táctil', async ({ page, ok, boot }) => {
  await boot();
  await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  ok(await page.evaluate(() => !matchMedia('(hover:hover)').matches), 'el contexto táctil no reporta hover');
  await page.addStyleTag({ content:'*,*::before,*::after{transition:none!important;animation:none!important}' }); // con WebGL por software la página va a ~1 fps y las transiciones se leen desfasadas
  await openDock(page); // el dock arranca oculto
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const bg = sel => page.evaluate(s => getComputedStyle(document.querySelector(s)).backgroundColor, sel);
  const before = await bg('#scrPlay');
  await page.tap('#scrPlay'); await page.waitForTimeout(500);
  ok((await bg('#scrPlay')) === before, 'tras un toque el botón del dock mantiene su fondo (sin tinta pegada)');
  const railBefore = await bg('#railExport');
  await page.tap('#railExport'); await page.waitForTimeout(900); await page.tap('#expClose'); await page.waitForTimeout(1800);
  const railAfter = await bg('#railExport'); ok(railAfter === railBefore, `tras abrir y cerrar con toques, el botón del rail vuelve a su fondo (${railBefore} → ${railAfter}; expanded=${await page.getAttribute('#railExport', 'aria-expanded')})`);
}, { mobile: true, width: 390, height: 844 });

// Retoques visuales mínimos: trazo del encuadre del dimmer y miniaturas del dock sin elevación.
await run('visual · trazo del dimmer y miniaturas del dock', async ({ page, ok, eq, boot }) => {
  await boot();
  await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  await page.addStyleTag({ content: '*,*::before,*::after{transition:none!important;animation:none!important}' });
  const ev = body => page.evaluate(`(async () => { const P = (await import('/js/core/params.js')).P; const fr = await import('/js/three/frame.js'); ${body} })()`);
  const stroke = () => page.evaluate(() => { const s = document.querySelector('#gstroke'), c = getComputedStyle(s), r = s.getBoundingClientRect(), g = document.querySelector('#guide').getBoundingClientRect();
    return { blend: c.mixBlendMode, op: c.opacity, shadow: c.boxShadow, display: c.display, same: [r.x, r.y, r.width, r.height].map(Math.round).join() === [g.x, g.y, g.width, g.height].map(Math.round).join() }; });
  await ev("P.exp.format = '4:5'; fr.layout();");
  const a = await stroke();
  eq([a.blend, a.op], ['difference', '0.3'], 'trazo: mix-blend-mode difference y opacidad 0.3');
  ok(/255, 255, 255/.test(a.shadow) && /inset/.test(a.shadow) && /1px/.test(a.shadow), `trazo de 1 px blanco hacia dentro (${a.shadow})`);
  ok(a.same && a.display !== 'none', 'el trazo coincide con el encuadre (mismo rectángulo) y se ve con un formato con ratio');
  await ev("P.exp.format = 'Pantalla'; fr.layout();");
  eq((await stroke()).display, 'none', 'con «Pantalla» (sin marco) no hay trazo');
  await ev("P.exp.format = '9:16'; fr.layout();");
  await page.evaluate(() => document.body.classList.add('no-frame'));
  eq((await stroke()).display, 'none', 'el toggle Frame (no-frame) también oculta el trazo');
  await page.evaluate(() => document.body.classList.remove('no-frame'));

  // miniaturas: la actual no se eleva y el radio es parejo (también en la imagen)
  const th = await page.evaluate(() => { const all = [...document.querySelectorAll('.thumb')], cur = document.querySelector('.thumb.cur') || all[0];
    return { tf: getComputedStyle(cur).transform, tops: [...new Set(all.map(t => Math.round(t.getBoundingClientRect().top)))], radii: [...new Set(all.map(t => getComputedStyle(t).borderTopLeftRadius))], img: getComputedStyle(cur.querySelector('img')).borderTopLeftRadius }; });
  eq(th.tf, 'none', 'la miniatura actual no usa transform (sin elevación)');
  eq(th.tops.length, 1, 'todas las miniaturas alineadas en la misma línea');
  eq([th.radii, th.img], [['8px'], '8px'], 'radio 8px parejo en miniaturas e imagen');
});
