import { run } from './helpers.mjs';

// Exportación predecible: formato por defecto 9:16, selector sincronizado onboarding ↔ card, exp.kind persistente,
// lectura de píxeles, estimación de video y alto estable al cambiar PNG ↔ Video.
await run('export-card · formato, tipo y estimaciones', async ({ page, ok, eq, boot }) => {
  await boot(); await page.evaluate(() => gsap.ticker.lagSmoothing(0)); // sin esto GSAP corre lento con WebGL por software
  await page.waitForTimeout(1500);
  const wait = ms => page.waitForTimeout(ms);
  const pressed = sel => page.evaluate(s => [...document.querySelectorAll(s + ' button')].filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.textContent), sel);
  const clickIn = (sel, label) => page.evaluate(([s, l]) => [...document.querySelectorAll(s + ' button')].find(b => b.textContent === l).click(), [sel, label]);
  const txt = sel => page.evaluate(s => document.querySelector(s).textContent, sel);
  const h = sel => page.evaluate(s => Math.round(document.querySelector(s).getBoundingClientRect().height), sel);
  const vis = sel => page.evaluate(s => getComputedStyle(document.querySelector(s)).visibility, sel);

  // ── Card: defaults de primera visita ──
  await page.click('#railExport'); await wait(900);
  eq(await pressed('#expMain .exp-row.wide'), ['9:16'], 'formato por defecto 9:16');
  eq(await txt('#expSize'), '1080×1920', 'lectura de salida 9:16 FHD');
  eq(await pressed('#expMain .exp-row:nth-child(3)'), ['PNG'], 'tipo por defecto PNG');
  const note = i => page.evaluate(n => { const e = document.querySelectorAll('.exp-note')[n]; return [e.textContent, getComputedStyle(e).visibility]; }, i);

  // ── PNG ↔ Video: estimación y alto estable ──
  const hPng = await h('#expCard');
  await clickIn('#expMain', 'Video'); await wait(900);
  const hVid = await h('#expCard');
  eq(hVid, hPng, 'altura de la card igual en PNG y Video');
  eq(await note(0), ['≈ 30 MB · 450 cuadros', 'visible'], 'estimación: 16 Mbps × 15 s = 30 MB, 450 cuadros');
  eq((await note(1))[1], 'hidden', 'sin aviso «depende de tu ventana» con 9:16');
  await clickIn('#expMain', '30 s'); await wait(100);
  eq((await note(0))[0], '≈ 60 MB · 900 cuadros', 'estimación con 30 s');
  await clickIn('#expMain', '15 s');
  await clickIn('#expMain', 'Pantalla'); await wait(200);
  eq((await note(1)), ['Pantalla: depende de tu ventana', 'visible'], 'aviso con formato Pantalla');
  eq(await h('#expCard'), hPng, 'altura estable con el aviso de Pantalla');
  await clickIn('#expMain', '9:16');

  // ── Onboarding: selector sincronizado con la card ──
  await page.click('#expClose'); await wait(600);
  await page.click('#onbHelp'); await wait(900);
  const hs = [];
  const chk = async (n) => { hs.push(await h('#onb')); ok(await page.evaluate(() => { const b = document.querySelector('#onbBody'); return b.scrollHeight <= b.clientHeight + 1; }), `paso ${n} del onboarding sin desbordar`); };
  await chk(1);
  await page.click('#onbNext'); await wait(900); await chk(2);
  eq(await pressed('#onbFmt'), ['9:16'], 'onboarding muestra 9:16');
  ok((await txt('.onb-fmt-out')).includes('1080×1920'), 'onboarding: lectura 1080×1920');
  await clickIn('#onbFmt', '4:5'); await wait(100);
  ok((await txt('.onb-fmt-out')).includes('1536×1920'), 'onboarding: lectura 4:5 = 1536×1920');
  await page.click('#onbNext'); await wait(900); await chk(3);
  eq(new Set(hs).size, 1, `altura del onboarding igual en los 3 pasos (${hs})`);
  await page.click('#onbBack'); await wait(900);
  await page.click('#railExport'); await wait(1200); // el rail abre la card (y cierra el onboarding sin marcarlo)
  eq(await pressed('#expMain .exp-row.wide'), ['4:5'], 'la card refleja el formato elegido en el onboarding');
  eq(await txt('#expSize'), '1536×1920', 'lectura de la card sincronizada');
  // card → onboarding
  await clickIn('#expMain', '1:1'); await wait(100);
  await page.click('#onbHelp'); await wait(900);
  await page.click('#onbNext'); await wait(900);
  eq(await pressed('#onbFmt'), ['1:1'], 'el onboarding refleja el formato elegido en la card');

  // ── Persistencia de exp.kind y formato tras recargar ──
  await page.click('#onbSkip'); await wait(500);
  await page.click('#railExport'); await wait(900);
  await page.reload(); await page.waitForFunction(() => !!document.querySelector('#rail') && !!window.gsap, null, { timeout: 30000 }); await wait(2500); await page.evaluate(() => gsap.ticker.lagSmoothing(0)); await wait(1500);
  await page.evaluate(() => document.querySelector('#onbSkip')?.click()); await wait(500);
  await page.click('#railExport'); await wait(900);
  eq(await pressed('#expMain .exp-row:nth-child(3)'), ['Video'], 'exp.kind (Video) persiste tras recargar');
  eq(await pressed('#expMain .exp-row.wide'), ['1:1'], 'formato guardado se conserva tras recargar');
  eq(await txt('#expGo'), 'Renderizar video', 'botón principal acorde al tipo guardado');
});
