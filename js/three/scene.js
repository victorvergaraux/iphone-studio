import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { P } from '../core/params.js';
import { scene } from './renderer.js';

/* ───────────────────────── Escena: sólidos con cast/receive shadow ───────────────────────── */
export const SLAB_TOP = 0.55;
const mat = (c, r=0.92) => new THREE.MeshPhysicalMaterial({ color:c, roughness:r, metalness:0 });
/* Realismo de superficie: manchas/huellas (ref/) en roughnessMap y metalnessMap del piso y la losa.
   Una sola textura (VAR1: blanco con manchas grises) alimenta ambos mapas:
   - roughnessMap: las manchas quedan más brillantes (grasa), el resto conserva su rugosidad.
   - metalnessMap: la misma textura invertida → las manchas añaden un leve brillo especular.
   Escala PROCEDURAL: en vez de repetir la textura por UV (se nota la rejilla simétrica), el shader la proyecta triplanar en
   espacio del objeto (sin estirar en esfera/cilindro) y rompe la repetición: cada celda toma un giro y un desplazamiento
   aleatorios y las celdas vecinas se funden con pesos gaussianos (variante de "texture repetition" de I. Quílez).
   Las intensidades y la escala son uniforms compartidos: mover los sliders no recompila los materiales. */
const loadMap = f => {
  const t = new THREE.TextureLoader().load(new URL('../../ref/' + f, import.meta.url).href);
  t.colorSpace = THREE.NoColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; return t;
};
const texSmudge = loadMap('SmudgesLarge001_OVERLAY_VAR1_1K.jpg');
const uTexRough = { value:P.scene.texRough }, uTexMetal = { value:P.scene.texMetal }, uTexScale = { value:P.scene.texScale };
const SURFACE_VERT_PARS = /* glsl */`varying vec3 vSmPos; varying vec3 vSmNor;`;
const SURFACE_FRAG_PARS = /* glsl */`
  uniform float uTexRough, uTexMetal, uTexScale;
  varying vec3 vSmPos; varying vec3 vSmNor;
  // Hash 2D → 4 números pseudoaleatorios en [0,1): jitter del centro de celda, ángulo y desplazamiento
  vec4 smHash(vec2 p){
    vec4 q = vec4(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)), dot(p, vec2(419.2, 371.9)), dot(p, vec2(113.5, 271.9)));
    return fract(sin(q) * 43758.5453);
  }
  // Muestrea la textura en un plano sin repetición visible. Devuelve el canal g (blanco = limpio, gris = mancha).
  float smPlane(sampler2D t, vec2 uv){
    vec2 ddx = dFdx(uv), ddy = dFdy(uv);             // derivadas del uv ORIGINAL → el mip correcto aunque cada celda gire/desplace
    vec2 p = floor(uv - 0.5), f = uv - 0.5 - p;      // rejilla de celdas 2×2 alrededor del punto
    float acc = 0.0, wt = 0.0;
    for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
      vec2 g = vec2(float(i), float(j));
      vec4 h = smHash(p + g);
      vec2 r = g + (h.xy - 0.5) * 0.5 - f;           // vector del punto al centro (con jitter) de esa celda
      float w = exp(-6.0 * dot(r, r));               // peso gaussiano: las celdas se funden sin costura
      float a = h.z * 6.2831853, c = cos(a), s = sin(a);
      mat2 R = mat2(c, -s, s, c);                    // giro aleatorio por celda → rompe la simetría de la rejilla
      vec2 suv = R * uv + h.w * 37.0;
      vec2 sx = R * ddx, sy = R * ddy;
      acc += w * textureGrad(t, suv, sx, sy).g;
      wt += w;
    }
    return acc / wt;
  }
  // Triplanar: un plano por eje, mezclados por la normal del objeto
  float smudgeTri(sampler2D t){
    vec3 n = pow(abs(normalize(vSmNor)), vec3(4.0)); n /= n.x + n.y + n.z;
    vec3 q = vSmPos * uTexScale;                     // escala = repeticiones por metro (más alto → manchas más pequeñas)
    return n.x * smPlane(t, q.yz) + n.y * smPlane(t, q.xz) + n.z * smPlane(t, q.xy);
  }`;
function addSurfaceTex(m){
  m.roughnessMap = m.metalnessMap = texSmudge;   // activan los slots (y sus samplers); el muestreo lo hace el shader
  m.onBeforeCompile = sh => {
    Object.assign(sh.uniforms, { uTexRough, uTexMetal, uTexScale });
    // Los #include aún no están expandidos aquí: se sustituye cada include por una versión procedural.
    sh.vertexShader = SURFACE_VERT_PARS + '\n' + sh.vertexShader.replace('#include <project_vertex>',
      `#include <project_vertex>
       vSmPos = transformed; vSmNor = objectNormal;`);  // espacio del objeto: la textura se mueve con él
    sh.fragmentShader = SURFACE_FRAG_PARS + '\n' + sh.fragmentShader
      .replace('#include <roughnessmap_fragment>', `
        float smudge = smudgeTri(roughnessMap);
        float roughnessFactor = roughness * mix(1.0, pow(smudge, 3.0), uTexRough);`) // pow: más contraste en las manchas
      .replace('#include <metalnessmap_fragment>',
        `float metalnessFactor = clamp(metalness + (1.0 - smudge) * uTexMetal, 0.0, 1.0);`);   // aditivo: la base es dieléctrica (0)
  };
  m.customProgramCacheKey = () => 'surfaceTexProc';
  return m;
}
// Solo piso y losa (mFloor) llevan la textura de manchas y el material físico; bloques y props son Standard (mate, sin mapas).
export const mFloor = addSurfaceTex(mat(P.scene.floor, 1));
// Piso/losa en modo Flat: mismo Standard que los objetos. Comparte el objeto Color con mFloor → los selectores de color no cambian.
export const mFloorFlat = new THREE.MeshStandardMaterial({ roughness:1, metalness:0 }); mFloorFlat.color = mFloor.color;
export const mBlocks = new THREE.MeshStandardMaterial({ color:P.scene.blocks, roughness:0.92, metalness:0 }), mAccent = new THREE.MeshStandardMaterial({ color:P.scene.accent, roughness:0.7, metalness:0 });
// Base roughness/metalness (P.scene.rough/metal) del piso y la losa, sobre la que actúan las manchas.
export function applySurfaceTex(){
  uTexRough.value = P.scene.texRough; uTexMetal.value = P.scene.texMetal; uTexScale.value = P.scene.texScale;
  mFloor.roughness = P.scene.rough; mFloor.metalness = P.scene.metal;
}
applySurfaceTex();
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
const slab = solid(new RoundedBoxGeometry(4.4, 0.55, 2.8, 2, 0.012), mFloor, 0, SLAB_TOP/2, 0); // la losa comparte color con el piso: es la superficie dominante del encuadre (el 60 %)       // losa principal
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

// Real = material físico con manchas (rugosidad/metalness) · Flat = Standard mate, igual que los objetos
export function applyFloorMode(){
  const m = P.scene.floorReal ? mFloor : mFloorFlat;
  ground.material = slab.material = m;
}
applyFloorMode();

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
