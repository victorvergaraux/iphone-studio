// Vendoriza las dependencias de la app en vendor/ (reproducible, solo Node >= 18, sin dependencias).
// Uso:  node tools/vendor.mjs            → descarga/actualiza vendor/ (three, gsap, tweakpane, lucide, muxers, licencias, HDRI por defecto, fuentes)
//       node tools/vendor.mjs --only=three,fonts   → solo esas secciones (three, libs, licenses, hdri, fonts)
// Las versiones están fijadas aquí; subir una versión = cambiar la constante, regenerar y subir CACHE en sw.js.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const V = path.join(ROOT, 'vendor');
const JSD = 'https://cdn.jsdelivr.net/npm/';
const only = (process.argv.find(a => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean);
const want = k => !only.length || only.includes(k);

const VER = { three:'0.165.0', gsap:'3.12.5', tweakpane:'4.0.4', essentials:'0.2.1', lucide:'0.460.0', mp4:'5.1.3', webm:'5.0.3', pmndrs:'1.7.0' };
const DEFAULT_HDRI = 'hall'; // debe coincidir con P.env.preset en js/core/params.js

const get = async (url, bin = false) => {
  for (let i = 0; i < 3; i++) {
    try { const r = await fetch(url, { headers:{ 'user-agent':'Mozilla/5.0 (vendor.mjs)' } }); if (!r.ok) throw new Error(r.status + ' ' + url); return bin ? Buffer.from(await r.arrayBuffer()) : await r.text(); }
    catch (e) { if (i === 2) throw e; }
  }
};
const put = async (rel, data) => { const f = path.join(V, rel); await fs.mkdir(path.dirname(f), { recursive:true }); await fs.writeFile(f, data); console.log('  +', rel); };

// ── three: build + árbol mínimo de examples/jsm (se siguen los imports relativos de los addons usados) ──
async function three() {
  const base = `${JSD}three@${VER.three}/`;
  await put(`three/build/three.module.js`, await get(base + 'build/three.module.js'));
  const roots = ['OrbitControls','RoomEnvironment','RoundedBoxGeometry','EXRLoader','EffectComposer','GTAOPass','OutputPass','Pass','RenderPass','ShaderPass'];
  const start = { OrbitControls:'controls', RoomEnvironment:'environments', RoundedBoxGeometry:'geometries', EXRLoader:'loaders' };
  const queue = roots.map(n => `examples/jsm/${start[n] || 'postprocessing'}/${n}.js`), seen = new Set();
  while (queue.length) {
    const rel = queue.shift(); if (seen.has(rel)) continue; seen.add(rel);
    const src = await get(base + rel); await put(`three/${rel}`, src);
    // imports relativos (estáticos): from './x.js' / from '../x.js'; 'three' lo resuelve el importmap
    for (const m of src.matchAll(/(?:from|import)\s*['"](\.{1,2}\/[^'"]+)['"]/g)) queue.push(path.posix.normalize(path.posix.join(path.posix.dirname(rel), m[1])));
  }
}
// ── librerías sueltas ──
async function libs() {
  const f = [
    ['gsap/gsap.min.js',                  `gsap@${VER.gsap}/dist/gsap.min.js`],
    ['lucide/lucide.min.js',              `lucide@${VER.lucide}/dist/umd/lucide.min.js`],
    ['mp4-muxer/mp4-muxer.js',            `mp4-muxer@${VER.mp4}/build/mp4-muxer.js`],
    ['webm-muxer/webm-muxer.js',          `webm-muxer@${VER.webm}/build/webm-muxer.js`],
    ['tweakpane/tweakpane.min.js',        `tweakpane@${VER.tweakpane}/dist/tweakpane.min.js`],
    ['tweakpane/tweakpane-plugin-essentials.min.js', `@tweakpane/plugin-essentials@${VER.essentials}/dist/tweakpane-plugin-essentials.min.js`],
  ];
  for (const [out, p] of f) await put(out, await get(JSD + p));
}
// Paquetes que no publican archivo LICENSE en npm: aviso equivalente a la cabecera de su propio bundle
const NOTICE = {
  gsap: 'GSAP 3.12.5 (c) 2024 GreenSock. Licencia estandar "no charge": https://gsap.com/standard-license\n',
  tweakpane: 'Tweakpane 4.0.4 (c) 2016 cocopon. Licencia MIT: https://github.com/cocopon/tweakpane/blob/main/LICENSE.txt\n',
  'tweakpane-plugin-essentials': '@tweakpane/plugin-essentials 0.2.1 (c) 2016 cocopon. Licencia MIT: https://github.com/tweakpane/plugin-essentials/blob/main/LICENSE.txt\n',
};
async function licenses() {
  const pk = { three:`three@${VER.three}`, gsap:`gsap@${VER.gsap}`, tweakpane:`tweakpane@${VER.tweakpane}`, 'tweakpane-plugin-essentials':`@tweakpane/plugin-essentials@${VER.essentials}`, lucide:`lucide@${VER.lucide}`, 'mp4-muxer':`mp4-muxer@${VER.mp4}`, 'webm-muxer':`webm-muxer@${VER.webm}`, 'pmndrs-assets':`@pmndrs/assets@${VER.pmndrs}` };
  for (const [n, p] of Object.entries(pk)) {
    try { await put(`licenses/${n}.LICENSE.txt`, await get(`${JSD}${p}/LICENSE`)); }
    catch { try { await put(`licenses/${n}.LICENSE.txt`, await get(`${JSD}${p}/LICENSE.md`)); } catch { await put(`licenses/${n}.LICENSE.txt`, NOTICE[n] || `Ver ${p} en npm.
`); } }
  }
}
// ── HDRI por defecto: @pmndrs/assets publica el EXR como módulo JS con un data URI; se guarda tal cual (hdri.js lo importa) ──
async function hdri() { await put(`hdri/${DEFAULT_HDRI}.exr.js`, await get(`${JSD}@pmndrs/assets@${VER.pmndrs}/hdri/${DEFAULT_HDRI}.exr.js`)); }
// ── Fuentes: se lee el CSS de Google Fonts (UA moderno → woff2), se quedan solo los subconjuntos latin y latin-ext y se genera css/fonts.css ──
async function fonts() {
  const q = 'family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Inter:wght@400..600&family=JetBrains+Mono:wght@400..700&display=swap';
  const css = await (await fetch('https://fonts.googleapis.com/css2?' + q, { headers:{ 'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36' } })).text();
  let out = '/* Generado por tools/vendor.mjs — fuentes locales (woff2, subconjuntos latin y latin-ext). No editar a mano. */\n';
  for (const m of css.matchAll(/\/\*\s*([\w-]+)\s*\*\/\s*(@font-face\s*\{[^}]*\})/g)) {
    const [, subset, block] = m; if (!/^latin(-ext)?$/.test(subset)) continue;
    const fam = block.match(/font-family:\s*'([^']+)'/)[1], url = block.match(/url\((https:[^)]+)\)/)[1];
    const file = `${fam.toLowerCase().replace(/\s+/g, '-')}-${subset}.woff2`;
    await put(`fonts/${file}`, await get(url, true));
    out += `/* ${fam} · ${subset} */\n` + block.replace(/url\(https:[^)]+\)/, `url("../vendor/fonts/${file}")`).replace(/\n\s*/g, ' ').replace(/\{ /, '{ ') + '\n';
  }
  await fs.writeFile(path.join(ROOT, 'css/fonts.css'), out); console.log('  + css/fonts.css');
}

if (want('three')) { console.log('three'); await three(); }
if (want('libs')) { console.log('libs'); await libs(); }
if (want('licenses')) { console.log('licenses'); await licenses(); }
if (want('hdri')) { console.log('hdri'); await hdri(); }
if (want('fonts')) { console.log('fonts'); await fonts(); }
console.log('listo');
