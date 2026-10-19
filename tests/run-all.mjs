// Corre todos los tests/*.test.mjs en secuencia (cada uno abre su propio navegador y servidor). Uso: npm test [filtro]
import { readdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url)), filter = process.argv[2] || '';
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs') && f.includes(filter)).sort();
let bad = 0;
for (const f of files) { const r = spawnSync(process.execPath, [path.join(dir, f)], { stdio:'inherit' }); if (r.status) bad++; }
console.log(`\n${files.length - bad}/${files.length} archivos OK`);
process.exit(bad ? 1 : 0);
