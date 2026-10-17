import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P } from '../core/params.js';
import { scene } from './renderer.js';

/* ───────────────────────── Escena: sólidos con cast/receive shadow ───────────────────────── */
export const SLAB_TOP = 0.55;
const mat = (c, r=0.92) => new THREE.MeshStandardMaterial({ color:c, roughness:r, metalness:0 });
export const mBlocks = mat(P.scene.blocks), mFloor = mat(P.scene.floor, 1), mAccent = mat(P.scene.accent, 0.7);
export const bgColor = new THREE.Color(P.scene.bg);
export const fog = new THREE.Fog(P.scene.bg, 22, 55); // funde el piso con el fondo: horizonte infinito
scene.background = bgColor; scene.fog = fog;

// Grupo de bloques: un solo .visible oculta todos los sólidos (y deja de renderizarlos en sombra y AO)
export const blocksG = new THREE.Group(); scene.add(blocksG);
function solid(geo, m, x, y, z){ const o = new THREE.Mesh(geo, m); o.position.set(x,y,z); o.castShadow = o.receiveShadow = true; blocksG.add(o); return o; }
export const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), mFloor);
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);
// Shadow catcher: plano invisible que solo dibuja la sombra (ShadowMaterial). Se activa en el PNG transparente.
export const catcher = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), new THREE.ShadowMaterial({ opacity:P.exp.shadowOpacity }));
catcher.rotation.x = -Math.PI/2; catcher.receiveShadow = true; catcher.visible = false; scene.add(catcher);
solid(new RoundedBoxGeometry(4.4, 0.55, 2.8, 2, 0.012), mFloor, 0, SLAB_TOP/2, 0); // la losa comparte color con el piso: es la superficie dominante del encuadre (el 60 %)       // losa principal
const tower = solid(new RoundedBoxGeometry(1.3, 3.4, 1.3, 2, 0.012), mBlocks, 0, 0, 0);          // torre: sombra larga
const block = solid(new RoundedBoxGeometry(2.4, 0.28, 1.5, 2, 0.01), mBlocks, 0, 0, 0);           // escalón
const cyl = solid(new THREE.CylinderGeometry(0.34, 0.34, 1.25, 64), mAccent, 0, 0, 0);
const sphere = solid(new THREE.SphereGeometry(0.27, 48, 32), mAccent, 0, 0, 0);

// Posición editable de los 4 objetos del fondo (losa y apoyo del celular quedan fijos). Se lee de P.scene.<obj>X/Y/Z.
const BG_OBJS = { tower, block, cyl, sphere };
export function applyObjPos(){
  for (const k in BG_OBJS) BG_OBJS[k].position.set(P.scene[k + 'X'], P.scene[k + 'Y'], P.scene[k + 'Z']);
}
applyObjPos();

/* Luz clave derivada del HDRI: misma dirección y tono que la zona más energética del mapa.
   No hay más luces; esta existe para proyectar la sombra que el entorno no puede generar. */
export const sun = new THREE.DirectionalLight(0xffffff, P.shadow.strength);
sun.castShadow = P.shadow.on;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left:-6, right:6, top:6, bottom:-6, near:0.5, far:30 });
sun.shadow.bias = -0.0003; sun.shadow.normalBias = 0.015;
sun.shadow.radius = P.shadow.size;
sun.target.position.set(0, 0.5, 0);
scene.add(sun, sun.target);
export const keyDir = new THREE.Vector3(-0.6, 0.55, -0.55).normalize(), keyRaw = keyDir.clone();
export function placeKey(){
  // limitar la elevación evita sombras infinitas cuando el foco del HDRI está cerca del horizonte
  const d = keyRaw.clone(), minY = Math.sin(THREE.MathUtils.degToRad(P.shadow.minElev));
  if (d.y < minY) { const xz = Math.hypot(d.x, d.z) || 1, k = Math.sqrt(1 - minY * minY) / xz; d.set(d.x * k, minY, d.z * k); }
  keyDir.copy(d);
  sun.position.copy(keyDir).multiplyScalar(12).add(sun.target.position);
}
