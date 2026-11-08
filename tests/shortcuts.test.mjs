import { run } from './helpers.mjs';

// Atajos: H oculta/muestra toda la interfaz · G guías (retícula + marco) · P panel de pantallas (antes D) · Espacio reproduce/detiene la cinemática.
await run('atajos · H, G, P y Espacio', async ({ page, ok, eq, boot }) => {
  await boot(); await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  const wait = ms => page.waitForTimeout(ms);
  const cls = c => page.evaluate(c => document.body.classList.contains(c), c);
  const vis = sel => page.evaluate(s => { const e = document.querySelector(s), c = getComputedStyle(e); return [c.visibility, +c.opacity]; }, sel);

  // P: panel de pantallas (el antiguo D ya no hace nada)
  ok(await cls('dock-hidden'), 'dock oculto por defecto');
  await page.keyboard.press('d'); await wait(300);
  ok(await cls('dock-hidden'), 'la tecla D ya no abre el panel de pantallas');
  await page.keyboard.press('p'); await wait(1500);
  ok(!(await cls('dock-hidden')), 'P muestra el panel de pantallas');
  eq(await page.evaluate(() => document.querySelector('#railDock').dataset.tip), 'Pantallas · P', 'tooltip del rail = Pantallas · P');

  // G: guías (retícula + marco) y sincronía con los interruptores del panel
  ok(!(await cls('no-grid')) && !(await cls('no-frame')), 'guías visibles por defecto');
  await page.keyboard.press('g'); await wait(200);
  ok((await cls('no-grid')) && (await cls('no-frame')), 'G oculta retícula y marco');
  await page.keyboard.press('g'); await wait(200);
  ok(!(await cls('no-grid')) && !(await cls('no-frame')), 'G las vuelve a mostrar');

  // H: toda la UI se oculta con fundido y vuelve
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.querySelector('#rail') && +getComputedStyle(document.querySelector('#rail')).opacity === 0, null, { timeout: 15000 });
  ok(await cls('ui-hidden'), 'H oculta la interfaz');
  for (const s of ['#rail', '.dock', '#devSw', '#side']) { const [v, o] = await vis(s); ok(v === 'hidden' || o === 0, `${s} oculto (${v}, ${o})`); }
  ok(await page.evaluate(() => getComputedStyle(document.querySelector('#rail')).pointerEvents === 'none'), 'la UI oculta no recibe clics');
  await page.keyboard.press('h');
  await page.waitForFunction(() => document.querySelector('#rail') && +getComputedStyle(document.querySelector('#rail')).opacity > 0.99, null, { timeout: 15000 });
  ok(!(await cls('ui-hidden')), 'H la vuelve a mostrar');
  await wait(600); ok(!(await cls('ui-showing')), 'el estado transitorio de entrada se retira');
  eq((await vis('.dock'))[0], 'visible', 'el panel de pantallas sigue como estaba (visible)');

  // Espacio: reproducir / detener la cinemática
  await page.evaluate(() => document.activeElement?.blur());
  await page.keyboard.press('Space'); await wait(800);
  ok(await page.evaluate(async () => !!(await import('/js/three/camera.js')).presTL), 'Espacio reproduce la cinemática');
  await page.keyboard.press('Space'); await wait(800);
  ok(await page.evaluate(async () => !(await import('/js/three/camera.js')).presTL), 'Espacio la detiene');
});
