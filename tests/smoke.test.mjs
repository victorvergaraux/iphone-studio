import { run } from './helpers.mjs';

// Humo: la app arranca sin errores, el rail existe y los controles arrancan colapsados.
await run('smoke · arranque', async ({ page, ok, eq, boot }) => {
  await boot();
  eq(await page.evaluate(() => [...document.querySelectorAll('#rail button')].map(b => b.id)), ['onbHelp', 'railExport', 'railDock', 'railPanel', 'railShots', 'railPlay'], 'botones del rail en orden');
  ok(await page.evaluate(() => document.body.classList.contains('panel-closed')), 'panel de controles colapsado por defecto');
  ok(await page.evaluate(() => !document.body.classList.contains('dock-hidden')), 'dock visible por defecto');
  ok(await page.evaluate(() => document.querySelectorAll('.thumb').length >= 1), 'hay pantallas de ejemplo cargadas');
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#grid3')).display !== 'none'), 'retícula visible por defecto');
});
