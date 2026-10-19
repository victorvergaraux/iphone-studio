import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { DUR, EASE } from '../core/utils.js';
import { P } from '../core/params.js';
import { gtao, renderer } from './renderer.js';
import { SLAB_TOP, mBlocks } from './scene.js';
import { B, BEZEL, FPH, FPR, FPW, PD, PH, PW, SH, SW, Z_GLASS, anchor, back, body, depthBias, front, phone, rrPlane, rrShape, smoothNormals, tilt } from './iphone.js';
import { island, mGlass, screen } from './screen.js';
import { SMUDGE_MAP } from '../data/smudge-map.js';

/* ── Imperfecciones del vidrio (huellas / grasa) ──
   Mapa en escala de grises preprocesado desde la imagen de referencia: fondo → 0, huellas → 1 (niveles +
   gamma 0.85). JPEG externo en assets/smudge-map.jpg (ruta relativa: respeta el basePath).
   Three multiplica roughnessMap × roughness, y así una superficie limpia quedaría en 0. Por eso parcheamos
   el shader para que sea ADITIVO: rugosidad = base + intensidad × huella (y lo mismo para metalness y para la
   capa clearcoat). Resultado: vidrio espejado limpio, y el reflejo se difumina solo donde hay grasa. */

const smudgeTex = new THREE.TextureLoader().load(SMUDGE_MAP);
smudgeTex.colorSpace = THREE.NoColorSpace; smudgeTex.wrapS = smudgeTex.wrapT = THREE.RepeatWrapping;
smudgeTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
export const smudgeU = { uSmudgeR:{ value:P.phone.smudgeR }, uSmudgeM:{ value:P.phone.smudgeM }, uSmudgeH:{ value:P.phone.smudgeH } };
export function applySmudgeScale(){ const k = P.phone.smudgeScale; smudgeTex.repeat.set(k, k * FPH / FPW); } // repetición isotrópica (no estira la huella)
applySmudgeScale();
mGlass.roughnessMap = smudgeTex; mGlass.metalnessMap = smudgeTex;
mGlass.onBeforeCompile = sh => {
  Object.assign(sh.uniforms, smudgeU);
  sh.fragmentShader = 'uniform float uSmudgeR, uSmudgeM, uSmudgeH;\n' + sh.fragmentShader
    .replace('#include <roughnessmap_fragment>', `
      float smudgeV = 0.0;
      #ifdef USE_ROUGHNESSMAP
        smudgeV = texture2D( roughnessMap, vRoughnessMapUv ).g;   // 0 limpio · 1 huella
      #endif
      float roughnessFactor = clamp( roughness + uSmudgeR * smudgeV, 0.0, 1.0 );`)
    .replace('#include <metalnessmap_fragment>', `
      float metalnessFactor = clamp( metalness + uSmudgeM * smudgeV, 0.0, 1.0 ); // grasa: atenúa el especular`)
    .replace('#include <lights_physical_fragment>', `#include <lights_physical_fragment>
      #ifdef USE_CLEARCOAT
        material.clearcoatRoughness = clamp( material.clearcoatRoughness + uSmudgeR * smudgeV, 0.0525, 1.0 );
      #endif`)
    // velo: la grasa dispersa luz y deja una película lechosa visible sobre la pantalla (suma, el vidrio es aditivo)
    .replace('#include <opaque_fragment>', `#include <opaque_fragment>
      gl_FragColor.rgb += uSmudgeH * smudgeV * 0.08;`);
};
mGlass.customProgramCacheKey = () => 'glass-smudge';
const glass = new THREE.Mesh(rrPlane(FPW, FPH, FPR), mGlass);
glass.position.z = PD/2 + Z_GLASS; phone.add(glass); depthBias(mGlass, 3);
glass.renderOrder = 2; // transparente aditivo sin depthWrite: se dibuja al final y nunca tapa la isla ni la pantalla

/* Radio editable: se regeneran las geometrías (extrude + planos) con el mismo contorno, todas derivadas
   de un único radio para que bisel, vidrio y pantalla queden concéntricos. Coste: ~1 ms por cambio. */
export function rebuildShape(){
  const r = THREE.MathUtils.clamp(P.phone.radius, 0.04, PW / 2 - 0.02);
  const swap = (m, g) => { m.geometry.dispose(); m.geometry = g; };
  const bg = new THREE.ExtrudeGeometry(rrShape(PW - 2*B, PH - 2*B, r - B), { depth: PD - 2*B, bevelEnabled:true, bevelThickness:B, bevelSize:B, bevelSegments:10, curveSegments:48 });
  bg.translate(0, 0, -(PD - 2*B)/2); smoothNormals(bg); swap(body, bg);
  const fr = r - 0.015;
  swap(front, rrPlane(FPW, FPH, fr)); swap(back, rrPlane(FPW, FPH, fr)); swap(glass, rrPlane(FPW, FPH, fr));
  swap(screen, rrPlane(SW, SH, Math.max(0.01, r - BEZEL)));            // radio pantalla = cuerpo − bisel
  const iw = P.phone.islandW, ih = 0.054;                               // isla: radio = fracción de medio alto
  swap(island, rrPlane(iw, ih, Math.max(0.002, ih / 2 * P.phone.islandR), 2));
}
rebuildShape();

/* Pose "lean": bloque de apoyo calculado para que el dorso del iPhone descanse en su arista */
export const prop = new THREE.Mesh(new RoundedBoxGeometry(0.62, 1, 0.42, 2, 0.01), mBlocks);
prop.castShadow = prop.receiveShadow = true; anchor.add(prop);

const POSES = {
  lean:  { tiltX: -Math.PI/2 + 0.52, lift: null, x: -0.1, z: 0.25 },
  flat:  { tiltX: -Math.PI/2,        lift: PD/2 + 0.002, x: 0, z: 0 },
  float: { tiltX: -0.22,             lift: 1.05, x: 0, z: 0 },
};
function leanLift(a){ return (PH/2) * Math.sin(a) + (PD/2) * Math.cos(a) + 0.002; }
function placeProp(){
  const a = POSES.lean.tiltX + Math.PI/2;
  const top = new THREE.Vector3(0, Math.sin(a), -Math.cos(a)), n = new THREE.Vector3(0, Math.cos(a), Math.sin(a));
  const c = new THREE.Vector3(0, leanLift(a), 0);
  const P0 = c.clone().addScaledVector(top, PH/2 - 0.22).addScaledVector(n, -PD/2);
  prop.scale.y = P0.y; prop.position.set(0, P0.y/2, P0.z - 0.21);
}
placeProp();
POSES.lean.lift = leanLift(POSES.lean.tiltX + Math.PI/2);

export function setPose(name, instant){
  const p = POSES[name], d = instant ? 0 : DUR;
  prop.visible = name === 'lean' && P.scene.showBlocks; // el apoyo de la pose cuenta como bloque
  gsap.to(tilt.rotation, { x:p.tiltX, duration:d, ease:EASE });
  gsap.to(tilt.position, { y:p.lift, duration:d, ease:EASE });
  gsap.to(anchor.position, { x:p.x, y:SLAB_TOP, z:p.z, duration:d, ease:EASE });
}
anchor.rotation.y = THREE.MathUtils.degToRad(P.phone.yaw);
setPose(P.phone.pose, true);

/* AO sin recortes. La máscara 2D anterior no tenía profundidad y, a media resolución, recortaba la AO de lo
   que había detrás del celular (bloques, losa) con un contorno escalonado. Solución consistente en 3D:
   las capas planas del frente (vidrio, isla, pantalla, panel negro) y el panel trasero se excluyen del
   G-buffer; la AO "ve" solo la cara plana del cuerpo → sobre el frente da ~0 de forma natural, sin máscara. */
const _gtaoHide = gtao.overrideVisibility.bind(gtao);
gtao.overrideVisibility = () => { _gtaoHide(); glass.visible = island.visible = screen.visible = front.visible = back.visible = false; };
