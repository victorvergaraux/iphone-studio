import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { P } from '../core/params.js';
import { pmrem, scene } from './renderer.js';
import { bgColor, fog, keyRaw, placeKey, sun } from './scene.js';
import { toast } from '../core/utils.js';

/* ── Carga de HDRI: @pmndrs/assets publica cada EXR como módulo JS (data URI) → el CSP lo admite como script ── */
export const HDRI = ['studio','warehouse','lobby','apartment','hall','lab','workshop','city','sunset','dawn','sunrise','night','park','forest','venice','bridge','esplanade','sky'];
const exr = new EXRLoader().setDataType(THREE.FloatType);
const hdriCache = {};
let envSrc = null, envTex = null, envRT = null, envToken = 0, envNorm = 1;
async function fetchHdri(name){
  if (hdriCache[name]) return hdriCache[name];
  const mod = await import(`https://cdn.jsdelivr.net/npm/@pmndrs/assets@1.7.0/hdri/${name}.exr.js`);
  const bin = atob(mod.default.slice(mod.default.indexOf(',') + 1)), u8 = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
  return hdriCache[name] = exr.parse(u8.buffer); // { width, height, data: Float32Array RGBA, fila 0 = abajo }
}
export async function loadEnv(name){
  const tok = ++envToken;
  try { const src = await fetchHdri(name); if (tok !== envToken) return; envSrc = src; buildEnv(); }
  catch (err) {
    console.warn('HDRI', err);
    if (!envRT) { envRT = pmrem.fromScene(new RoomEnvironment(), 0.04); scene.environment = envRT.texture; placeKey(); }
    toast('No se pudo cargar el HDRI; uso un estudio de respaldo');
  }
}
/* Rotar un equirectangular en Y = desplazar columnas. Lo hacemos en CPU para que la luz derivada y el
   mapa usen exactamente la misma convención (u = atan(z,x)/2π + .5, v = asin(y)/π + .5). */
function buildEnv(){
  if (!envSrc) return;
  const { width:w, height:h, data:src } = envSrc, sh = Math.round(P.env.rotation / 360 * w);
  const f = new Float32Array(src.length), half = new Uint16Array(src.length);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const si = (y * w + (((x - sh) % w) + w) % w) * 4, di = (y * w + x) * 4;
    f[di] = src[si]; f[di + 1] = src[si + 1]; f[di + 2] = src[si + 2]; f[di + 3] = 1;
  }
  // HalfFloat: filtrado lineal soportado en todas las GPUs (Float32 lineal falla en muchos móviles)
  for (let i = 0; i < f.length; i++) half[i] = THREE.DataUtils.toHalfFloat(Math.min(f[i], 65000));
  const tex = new THREE.DataTexture(half, w, h, THREE.RGBAFormat, THREE.HalfFloatType);
  Object.assign(tex, { mapping:THREE.EquirectangularReflectionMapping, colorSpace:THREE.LinearSRGBColorSpace, magFilter:THREE.LinearFilter, minFilter:THREE.LinearFilter, generateMipmaps:false });
  tex.needsUpdate = true;
  const rt = pmrem.fromEquirectangular(tex);
  envRT?.dispose(); envTex?.dispose(); envRT = rt; envTex = tex;
  scene.environment = rt.texture;
  applyBackground();
  keyFromHdri(f, w, h);
}
// Normalización: cada HDRI tiene una exposición distinta (studio ≈ 2.2, night ≈ 0.08 de luminancia media).
// Escalamos para que todos iluminen parecido; "intensidad" queda como ajuste relativo.
export function applyEnvIntensity(){ scene.environmentIntensity = P.env.intensity * (P.env.normalize ? envNorm : 1); }
// Dirección y color dominantes: centroide del 0.4% de píxeles más energéticos del hemisferio superior
function keyFromHdri(f, w, h){
  const n = w * h, e = new Float32Array(n);
  let mean = 0, mw = 0;
  for (let y = 0; y < h; y++) { const cl = Math.cos(((y + 0.5) / h - 0.5) * Math.PI); for (let x = 0; x < w; x++) { const j = (y * w + x) * 4; mean += (0.2126 * f[j] + 0.7152 * f[j + 1] + 0.0722 * f[j + 2]) * cl; mw += cl; } }
  envNorm = THREE.MathUtils.clamp(0.55 / (mean / mw), 0.1, 4); applyEnvIntensity();
  for (let y = 0; y < h; y++) {
    const lat = ((y + 0.5) / h - 0.5) * Math.PI, cl = Math.cos(lat);
    for (let x = 0; x < w; x++) { const i = y * w + x, j = i * 4; e[i] = lat > 0 ? (0.2126 * f[j] + 0.7152 * f[j + 1] + 0.0722 * f[j + 2]) * cl : 0; }
  }
  const thr = Float32Array.from(e).sort()[Math.floor(n * 0.996)];
  const v = new THREE.Vector3(), col = new THREE.Vector3();
  for (let y = 0; y < h; y++) {
    const lat = ((y + 0.5) / h - 0.5) * Math.PI;
    for (let x = 0; x < w; x++) {
      const i = y * w + x; if (e[i] < thr || e[i] <= 0) continue;
      const lon = ((x + 0.5) / w - 0.5) * Math.PI * 2, wgt = e[i];
      v.x += Math.cos(lat) * Math.cos(lon) * wgt; v.y += Math.sin(lat) * wgt; v.z += Math.cos(lat) * Math.sin(lon) * wgt;
      col.x += f[i * 4] * wgt; col.y += f[i * 4 + 1] * wgt; col.z += f[i * 4 + 2] * wgt;
    }
  }
  if (v.lengthSq() > 0) keyRaw.copy(v.normalize());
  const m = Math.max(col.x, col.y, col.z) || 1;
  sun.color.setRGB(col.x / m, col.y / m, col.z / m, THREE.LinearSRGBColorSpace);
  placeKey();
}
export function applyBackground(){
  if (P.env.background === 'hdri' && envTex) {
    scene.background = envTex; scene.backgroundBlurriness = P.env.blur; scene.backgroundIntensity = P.env.bgIntensity; scene.fog = null;
  } else {
    scene.background = bgColor; scene.fog = fog; fog.color.copy(bgColor);
  }
}
let envRebuild = 0;
export const scheduleEnv = () => { cancelAnimationFrame(envRebuild); envRebuild = requestAnimationFrame(buildEnv); };
