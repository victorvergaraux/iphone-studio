import fs from 'node:fs';
import { run } from './helpers.mjs';

// Refactor del antiguo módulo de formato/layout (4a + 4b): los exports originales (fixture tests/fixtures/format-exports.json) deben seguir existiendo en
// formats.js / frame.js / session.js con el mismo tipo, los `let` deben seguir siendo enlaces vivos vistos desde otro módulo y la
// fachada antigua ya no debe existir. `INTERNAL` = exports que pasaron a ser privados de frame.js (solo los usaba ese módulo).
const fx = JSON.parse(fs.readFileSync(new URL('./fixtures/format-exports.json', import.meta.url), 'utf8'));
const INTERNAL = ['PANEL_W', 'wide'];

await run('refactor · format.js → formats/frame/session', async ({ page, ok, eq, boot }) => {
  await boot();
  const info = await page.evaluate(async () => {
    const [fo, fr, se] = await Promise.all(['formats', 'frame', 'session'].map(m => import(`/js/three/${m}.js`)));
    const types = {};
    for (const mod of [fo, fr, se]) for (const k of Object.keys(mod)) types[k] = typeof mod[k];
    const before = se.recording; se.setRecording(true); const during = se.recording; se.setRecording(false);
    const pr0 = se.pr; se.setPr(pr0 + 1); const pr1 = se.pr; se.setPr(pr0);
    // layout() reasigna guide/gridRect/lastSx: deben verse actualizados desde fuera
    fr.layout(); const gridAfter = fr.gridRect && typeof fr.gridRect.w;
    return { types, before, during, after: se.recording, pr0, pr1, prBack: se.pr, gridAfter, exporting: se.exporting };
  });
  for (const e of fx.exports) {
    if (INTERNAL.includes(e.name)) { ok(info.types[e.name] === undefined, `${e.name} ahora es privado de frame.js`); continue; }
    const t = info.types[e.name];
    ok(t !== undefined, `export ${e.name} existe`);
    // lastSx/lastSy/guide pueden ser null (object) o number según el momento: solo se exige tipo exacto en el resto
    if (!['lastSx', 'lastSy', 'guide'].includes(e.name)) eq(t, e.jstype, `typeof ${e.name}`);
  }
  for (const r of fx.removed) ok(info.types[r.name] === undefined, `eliminado ${r.name}`);
  eq([info.before, info.during, info.after], [false, true, false], 'recording es enlace vivo (setRecording)');
  eq([info.pr1, info.prBack], [info.pr0 + 1, info.pr0], 'pr es enlace vivo (setPr)');
  eq(info.gridAfter, 'number', 'gridRect se actualiza tras layout()');
  eq(info.exporting, false, 'exporting arranca en false');
  ok(!fs.existsSync(new URL('../js/three/format.js', import.meta.url)), 'la fachada js/three/format.js ya no existe en disco');
});
