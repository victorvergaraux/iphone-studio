import * as THREE from 'three';
import { P } from '../core/params.js';
import { renderer } from './renderer.js';

/* ── Metal cepillado procedural: líneas finas en U con variación por fila.
   Canal G = roughnessMap, canal B = metalnessMap (convención de three). ── */
function brushedCanvas(streak){
  const S = 1024, c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d'), img = ctx.createImageData(S, S), d = img.data;
  const row = new Float32Array(S), soft = new Float32Array(S), ph = new Float32Array(S);
  for (let y = 0; y < S; y++) { row[y] = Math.random(); ph[y] = Math.random() * 6.283; }
  for (let y = 0; y < S; y++) { let a = 0; for (let k = -6; k <= 6; k++) a += row[(y + k + S) % S]; soft[y] = a / 13; } // bandas anchas
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const along = 0.5 + 0.5 * Math.sin(x / S * 6.283 * 3 + ph[y]);           // las líneas se interrumpen a lo largo
    let v = 0.55 * row[y] + 0.3 * soft[y] + 0.15 * along + (Math.random() - 0.5) * 0.08;
    v = Math.min(1, Math.max(0, v));
    const r = 1 - streak * v * 0.85, mt = 1 - streak * v * 0.12, i = (y * S + x) * 4;
    d[i] = 255; d[i + 1] = r * 255; d[i + 2] = mt * 255; d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0); return c;
}
export let brushedTex = null;
// El material del marco se registra en la primera llamada (iphone.js) para no importar iphone.js y evitar un ciclo.
let frameMat = null;
export function makeBrushed(mat = frameMat){
  frameMat = mat;
  const t = new THREE.CanvasTexture(brushedCanvas(P.metal.streak));
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  t.center.set(0.5, 0.5); t.repeat.set(P.metal.scale, P.metal.scale); t.rotation = THREE.MathUtils.degToRad(P.metal.angle);
  brushedTex?.dispose(); brushedTex = t;
  if (frameMat) { frameMat.roughnessMap = frameMat.metalnessMap = t; frameMat.needsUpdate = true; }
  return t;
}
