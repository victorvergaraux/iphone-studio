// Vista previa al compartir la URL (Open Graph / X): etiquetas presentes, imagen absoluta, la misma del README y con tamaño adecuado.
// Test estático (Node puro, sin navegador): no comprueba la red, solo el marcado y el archivo local equivalente.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
let fails = 0;
const ok = (c, m) => { if (!c) { fails++; console.log(`  ✗ ${m}`); } else console.log(`  ✓ ${m}`); };
const meta = (attr, name) => (html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]*)"`)) || [])[1]; // etiquetas escritas con un espacio entre atributos

console.log('▶ social · vista previa al compartir');
const desc = meta('name', 'description');
ok(desc && desc.length >= 50 && desc.length <= 200, `meta description breve (${desc?.length} caracteres)`);
for (const k of ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:image', 'og:image:alt']) ok(!!meta('property', k), `${k} presente`);
for (const k of ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image']) ok(!!meta('name', k), `${k} presente`);
ok(meta('name', 'twitter:card') === 'summary_large_image', 'twitter:card = summary_large_image');
ok(meta('property', 'og:description') === desc && meta('name', 'twitter:description') === desc, 'misma descripción en description, og y twitter');

const img = meta('property', 'og:image');
ok(/^https:\/\//.test(img || ''), `og:image es una URL absoluta https (${img})`);
ok(img === meta('name', 'twitter:image'), 'og:image y twitter:image coinciden');

// misma imagen que la cabecera del README (archivo local equivalente)
const local = decodeURIComponent((img || '').split('/main/')[1] || '');
const readmeImg = (readme.match(/<img src="([^"]+)"/) || [])[1];
ok(local && local === readmeImg, `es la imagen de la cabecera del README (${local} = ${readmeImg})`);
const file = path.join(root, local);
ok(fs.existsSync(file), 'el archivo existe en el repo');
if (fs.existsSync(file)) {
  const b = fs.readFileSync(file); const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  ok(b.subarray(1, 4).toString() === 'PNG', 'es un PNG válido');
  ok(w >= 1200 && Math.abs(w / h - 1.91) < 0.1, `proporción ≈ 1.91:1 y ancho ≥ 1200 (${w}×${h})`);
  ok(+meta('property', 'og:image:width') === w && +meta('property', 'og:image:height') === h, 'og:image:width/height coinciden con la imagen real');
  ok(b.length < 5 * 1024 * 1024, `pesa menos de 5 MB (${Math.round(b.length / 1024)} KB)`);
}
console.log(fails ? `✖ social: ${fails} fallo(s)` : '✔ social');
process.exitCode = fails ? 1 : 0;
