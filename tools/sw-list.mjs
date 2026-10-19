// Regenera la lista PRECACHE de sw.js a partir de los archivos reales (index, manifest, css/, js/, vendor/, assets/).
// Uso: node tools/sw-list.mjs   (ejecutar tras añadir/quitar archivos; `--check` solo verifica y sale con 1 si está desactualizada)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export function list() {
  const out = ['./', 'index.html', 'manifest.webmanifest'];
  const walk = d => { for (const n of fs.readdirSync(path.join(ROOT, d)).sort()) { const r = d + '/' + n; fs.statSync(path.join(ROOT, r)).isDirectory() ? walk(r) : out.push(r); } };
  for (const d of ['css', 'js', 'vendor', 'assets']) walk(d);
  return out.filter(f => !/\.DS_Store$/.test(f));
}
export const render = files => '// >>> PRECACHE (generado por tools/sw-list.mjs)\nconst PRECACHE = [\n' + files.map(f => `  '${f}',`).join('\n') + '\n];\n// <<< PRECACHE';

// Solo actúa al ejecutarse como script (los tests importan list() sin efectos secundarios)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const swPath = path.join(ROOT, 'sw.js'), sw = fs.readFileSync(swPath, 'utf8');
  const next = sw.replace(/\/\/ >>> PRECACHE[\s\S]*?\/\/ <<< PRECACHE/, () => render(list()));
  if (process.argv.includes('--check')) { if (next !== sw) { console.error('sw.js: PRECACHE desactualizado → node tools/sw-list.mjs'); process.exit(1); } }
  else if (next !== sw) { fs.writeFileSync(swPath, next); console.log('sw.js actualizado'); }
  else console.log('sw.js ya estaba al día');
}
