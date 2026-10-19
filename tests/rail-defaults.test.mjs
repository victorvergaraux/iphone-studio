import { run, openDock } from './helpers.mjs';

// Rail y valores iniciales: título «Controles avanzados», dock oculto por defecto (sin animación al cargar), orden Cinemática → Controles avanzados
// y sin botón Play en el rail (el Play/Stop vive en la card de Cinemática y en la tecla Espacio).
await run('rail · orden, título, dock oculto y sin Play', async ({ page, ok, eq, boot }) => {
  await boot();
  await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  const wait = ms => page.waitForTimeout(ms);

  eq(await page.evaluate(() => [...document.querySelectorAll('#rail button')].map(b => b.id)), ['onbHelp', 'railExport', 'railDock', 'railShots', 'railPanel'], 'orden: … Pantallas · Cinemática · Controles avanzados');
  ok(await page.evaluate(() => !document.querySelector('#railPlay')), 'no hay botón Play en el rail');
  eq(await page.evaluate(() => document.querySelector('#railPanel').dataset.tip), 'Controles avanzados', 'tooltip del botón = Controles avanzados');

  await page.click('#railPanel'); await wait(900);
  eq(await page.evaluate(() => document.querySelector('.tp-rotv_t')?.textContent.trim()), 'Controles avanzados', 'el panel se llama «Controles avanzados»');
  await page.click('#railPanel'); await wait(600);

  // Dock: oculto por defecto desde el primer pintado (el <body> ya trae la clase) y sin animación al cargar
  ok(await page.evaluate(() => document.body.classList.contains('dock-hidden')), 'dock oculto por defecto');
  eq(await page.evaluate(() => document.querySelector('#railDock').getAttribute('aria-pressed')), 'false', 'el botón del dock refleja que está oculto');
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('.dock')).visibility), 'hidden', 'el dock oculto no es visible ni enfocable');
  ok(await page.evaluate(() => document.body.classList.contains('ui-ready')), 'las transiciones se activan tras la carga (ui-ready)');
  eq(await page.evaluate(async () => (await import('/js/core/params.js')).P.ui.dock), false, 'P.ui.dock = false por defecto');

  // Mostrarlo con el botón y con la tecla D
  await openDock(page);
  eq(await page.evaluate(() => getComputedStyle(document.querySelector('.dock')).visibility), 'visible', 'el botón del rail muestra el dock');
  await page.keyboard.press('d'); await wait(1500);
  ok(await page.evaluate(() => document.body.classList.contains('dock-hidden')), 'la tecla D lo vuelve a ocultar');
});

// El estado guardado manda: si el usuario lo dejó visible, aparece directamente al cargar (sin deslizarse).
await run('rail · dock visible si el usuario lo dejó así', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(() => { if (!sessionStorage.getItem('__seed')) { sessionStorage.setItem('__seed', '1'); localStorage.setItem('mockup-studio:v2', JSON.stringify({ P: { ui: { dock: true } }, shots: null })); } });
  await boot();
  ok(await page.evaluate(() => !document.body.classList.contains('dock-hidden')), 'con ui.dock guardado en true el dock se muestra');
  eq(await page.evaluate(() => document.querySelector('#railDock').getAttribute('aria-pressed')), 'true', 'el botón lo refleja');
}, { storage: 'keep' });
