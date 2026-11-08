import * as THREE from 'three';
import { P } from '../core/params.js';
import { scene } from './renderer.js';
import { makeBrushed } from './metal.js';

/* ───────────────────────── iPhone / iPad procedural ───────────────────────── */
/* Unidades: 1 = 100 mm. Dos modelos con la misma construcción, solo cambian las medidas (`P.phone.device`):
   · phone  — cuerpo 70.6 × 146.6 × 8.25 mm (iPhone Pro 6.1"), vertical.
   · tablet — pantalla tipo MacBook Pro (16:10; relación de la pantalla Liquid Retina XDR ≈ 1.55) en horizontal, a escala ≈ 0.54, sin botones laterales; marco simétrico fino
     (cuerpo 1.92 × 1.27 → pantalla 1.852 × 1.202 = 1.541). El modelo se sigue llamando «tablet» (clave de P.phone.device) aunque ahora sea una pantalla de laptop.
   Bisel del teléfono al 50 %: 0.017 por lado → pantalla grande, bordes finos tipo 16 Pro.
   Radio de pantalla = radio del cuerpo − bisel → el marco negro mantiene grosor constante en las esquinas.
   B = bisel del extrude · INSET = margen del panel frontal dentro del cuerpo · rK = factor del radio editable (P.phone.radius) · camK = factor de distancia de las tomas preset (la tablet es mucho más ancha) · z = altura de las capas del frente sobre la cara del cuerpo
   [panel, pantalla, isla, vidrio] (ver más abajo). */
export const DEVICES = {
  phone:  { PW:0.706, PH:1.466, PD:0.0825, PR:0.18, BEZEL:0.017, B:0.022, INSET:0.015, rK:1, camK:1, z:[0.0002, 0.0004, 0.0006, 0.001] },
  tablet: { PW:1.92,  PH:1.27,  PD:0.045,  PR:0.08, BEZEL:0.034, B:0.014, INSET:0.012, rK:0.45, camK:1.75, z:[0.001, 0.002, 0.003, 0.004] },
};
// Medidas vigentes. Son bindings vivos (`export let`): setDims() los reasigna y todos los módulos que los importan ven el valor nuevo.
export let PW, PH, PD, PR, BEZEL, B, INSET, RK, CAM_K, SW, SH, SR, S_ASPECT, FPW, FPH, FPR, Z_FRONT, Z_SCREEN, Z_ISLAND, Z_GLASS;
export function setDims(name){
  const d = DEVICES[name] || DEVICES.phone;
  ({ PW, PH, PD, PR, BEZEL, B, INSET, rK: RK, camK: CAM_K } = d);
  [Z_FRONT, Z_SCREEN, Z_ISLAND, Z_GLASS] = d.z;
  SW = PW - 2 * BEZEL; SH = PH - 2 * BEZEL; SR = PR - BEZEL; S_ASPECT = SW / SH;
  FPW = PW - 2 * INSET; FPH = PH - 2 * INSET; FPR = PR - INSET; // panel frontal dentro del bisel
}
if (!DEVICES[P.phone.device]) P.phone.device = 'phone'; // guardado/proyecto con un valor desconocido
setDims(P.phone.device);

/* Contorno con esquinas de curvatura continua (superelipse, como el "squircle" de Apple).
   Se genera como lista de puntos SIN repetir el punto inicial al cerrar: el punto duplicado de la versión
   anterior (moveTo + último absarc terminando en el mismo vértice) creaba una arista de longitud 0 en el
   borde inferior y el bisel de ExtrudeGeometry calculaba normales inválidas → la malla se rompía ahí. */
// n = exponente: 5 = squircle (cuerpo/pantalla), 2 = círculo exacto (píldora de la isla)
export function rrShape(w, h, r, seg = 24, n = 5){
  const e = 2 / n, pts = [], cx = w / 2 - r, cy = h / 2 - r;
  const corners = [[cx, cy, 0], [-cx, cy, 1], [-cx, -cy, 2], [cx, -cy, 3]]; // CCW: sup-der → sup-izq → inf-izq → inf-der
  for (const [ox, oy, q] of corners) for (let i = 0; i <= seg; i++) {
    const t = (q + i / seg) * Math.PI / 2, c = Math.cos(t), s = Math.sin(t);
    // superelipse: |x|^n + |y|^n = r^n → x = r·sgn(cos)·|cos|^(2/n)
    pts.push(new THREE.Vector2(ox + r * Math.sign(c) * Math.abs(c) ** e, oy + r * Math.sign(s) * Math.abs(s) ** e));
  }
  // los extremos de esquinas vecinas no coinciden (hay un tramo recto entre ellas); solo filtramos casi-duplicados
  const clean = pts.filter((p, i) => p.distanceTo(pts[(i + 1) % pts.length]) > 1e-6);
  return new THREE.Shape(clean);
}
// ShapeGeometry entrega UV = coordenadas del plano; las normalizamos a 0..1 para el shader
export function rrPlane(w, h, r, n = 5){
  const g = new THREE.ShapeGeometry(rrShape(w, h, r, 24, n), 64), uv = g.attributes.uv, p = g.attributes.position;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i)/w + .5, p.getY(i)/h + .5);
  return g;
}

export const anchor = new THREE.Group();   // pose: posición + yaw en el mundo
export const animG = new THREE.Group();    // animación idle (flotar / balanceo / giro)
export const tilt = new THREE.Group();     // inclinación de la pose
export const phone = new THREE.Group();
anchor.add(animG); animG.add(tilt); tilt.add(phone); scene.add(anchor);

const bodyGeo = new THREE.ExtrudeGeometry(rrShape(PW - 2*B, PH - 2*B, PR - B), { depth: PD - 2*B, bevelEnabled:true, bevelThickness:B, bevelSize:B, bevelSegments:10, curveSegments:48 });
bodyGeo.translate(0, 0, -(PD - 2*B)/2);
// Titanio: metal puro, sin clearcoat. roughness/metalness actúan como multiplicadores de los mapas cepillados.
// anisotropy estira el reflejo en la dirección del cepillado (BRDF anisotrópica de MeshPhysicalMaterial).
export const mFrame = new THREE.MeshPhysicalMaterial({ color:P.phone.frame, metalness:P.metal.metal, roughness:P.metal.rough,
  anisotropy:P.metal.aniso, anisotropyRotation:THREE.MathUtils.degToRad(P.metal.angle) });
makeBrushed(mFrame);
export const body = new THREE.Mesh(bodyGeo, mFrame); body.castShadow = body.receiveShadow = true; phone.add(body);

const mBlack = new THREE.MeshPhysicalMaterial({ color:0x050505, roughness:0.18, metalness:0, clearcoat:1, envMapIntensity:0.6 });
export const front = new THREE.Mesh(rrPlane(FPW, FPH, FPR), mBlack);
/* Capas del frente (z sobre la cara del cuerpo), según el modelo (DEVICES[…].z):
   · phone  — panel +0.0002 · pantalla +0.0004 · isla +0.0006 · vidrio +0.001 (todo comprimido bajo el vidrio).
   · tablet — panel +0.001 · pantalla +0.002 · isla +0.003 · vidrio +0.004: un escalón de 0.001 por capa. La tablet es mucho más grande y la
     cámara se aleja más (camK), así que con gaps de 0.0002 el depth buffer mezclaba el borde del cuerpo con la imagen (z-fighting).
   Además de la separación se suma polygonOffset escalonado (sesgo de profundidad en GPU) para que cada capa gane siempre a la de abajo. */
export const depthBias = (m, n) => Object.assign(m, { polygonOffset:true, polygonOffsetFactor:-n, polygonOffsetUnits:-n * 4 });
front.position.z = PD/2 + Z_FRONT; phone.add(front);
export const back = new THREE.Mesh(rrPlane(FPW, FPH, FPR), new THREE.MeshPhysicalMaterial({ color:0x2b2b2d, roughness:0.55, metalness:0.1, envMapIntensity:0.6 }));
back.rotation.y = Math.PI; back.position.z = -PD/2 - Z_FRONT; phone.add(back);

// Botones laterales (acción + volumen a la izquierda, encendido a la derecha). Sin módulo de cámara trasero.
/* Normales suaves: ExtrudeGeometry no está indexada, así que cada triángulo trae su propia normal plana y se
   ven las facetas. Agrupamos los vértices por posición, promediamos las normales de todas las caras que los
   comparten y las reescribimos → sombreado continuo (equivalente a flatShading:false con malla soldada). */
export function smoothNormals(g){
  g.computeVertexNormals();
  const pos = g.attributes.position, nor = g.attributes.normal, acc = new Map();
  const key = i => `${Math.round(pos.getX(i) * 1e5)}|${Math.round(pos.getY(i) * 1e5)}|${Math.round(pos.getZ(i) * 1e5)}`;
  for (let i = 0; i < pos.count; i++) {
    const k = key(i), a = acc.get(k) || [0, 0, 0];
    a[0] += nor.getX(i); a[1] += nor.getY(i); a[2] += nor.getZ(i); acc.set(k, a);
  }
  for (let i = 0; i < pos.count; i++) {
    const [x, y, z] = acc.get(key(i)), l = Math.hypot(x, y, z) || 1;
    nor.setXYZ(i, x / l, y / l, z / l);
  }
  nor.needsUpdate = true; return g;
}

/* Botones laterales: mismo lenguaje de esquinas que el cuerpo → cápsulas (contorno con radio = media
   profundidad, círculo exacto n=2) extruidas con bisel suave. Se hunden 0.004 en el cuerpo y sobresalen
   P.phone.btnDepth: sutiles pero con borde que atrapa el reflejo. */
// [largo, posición, lado]: lado ±1 = canto derecho/izquierdo (posición = y) · lado 0 = canto superior (posición = x)
const buttonSpec = () => P.phone.device === 'tablet'
  ? []   // pantalla de laptop: sin botones laterales
  : [[0.06, 0.42, -1], [0.11, 0.27, -1], [0.11, 0.12, -1], [0.17, 0.26, 1]];
let btnMeshes = [];
export function makeButtons(){
  btnMeshes.forEach(m => { m.geometry.dispose(); phone.remove(m); }); btnMeshes = [];
  const W = Math.min(0.03, PD * 0.5), bt = 0.0015, embed = 0.004, T = embed + P.phone.btnDepth, depth = Math.max(0.0005, T - 2 * bt);
  for (const [h, pos, side] of buttonSpec()) {
    const g = new THREE.ExtrudeGeometry(rrShape(W - 2 * bt, h - 2 * bt, (W - 2 * bt) / 2 - 0.0001, 16, 2),
      { depth, bevelEnabled:true, bevelThickness:bt, bevelSegments:6, bevelSize:bt, curveSegments:16 });
    if (side === 0) {                                      // canto superior: el largo pasa a x y la extrusión (z) apunta a +y
      g.rotateZ(-Math.PI / 2); g.rotateX(-Math.PI / 2);
      g.translate(pos, PH / 2 - embed + bt, 0);
    } else {
      g.rotateY(side * Math.PI / 2);                       // la extrusión (z) pasa a apuntar hacia afuera (±x)
      g.translate(side * (PW / 2 - embed + bt), pos, 0);
    }
    smoothNormals(g);
    const m = new THREE.Mesh(g, mFrame); m.castShadow = true; phone.add(m); btnMeshes.push(m);
  }
}
makeButtons();
