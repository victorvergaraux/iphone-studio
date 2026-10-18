import * as THREE from 'three';
import { P } from '../core/params.js';
import { camera, controls } from './renderer.js';
import { SLAB_TOP } from './scene.js';
import { phone } from './iphone.js';
import { toast } from '../core/utils.js';
import { hooks } from '../core/hooks.js';

/* ───────────────────────── Tomas de cámara ───────────────────────── */
export let shots = [];
export const snap = () => ({ p: camera.position.toArray(), t: controls.target.toArray(), fov: camera.fov });
/* ── Presets cinematográficos de cámara ──
   Cada toma se define RELATIVA al iPhone (espacio local: x = ancho, y = alto, z = normal de la pantalla),
   así funcionan con cualquier pose y giro. "frame" = alto visible en unidades de mundo → la distancia sale
   de la óptica: dist = frame / (2·tan(fov/2)). world:true = dirección en espacio de mundo (p. ej. cenital). */
export const SHOT_PRESETS = {
  producto: { label:'Product', shots:[
    { name:'Hero',       t:[0, 0.05, 0],      d:[0.55, -0.15, 1],  frame:1.9,  fov:10 },
    { name:'Top',        t:[0, 0, 0],         d:[0.15, 1, 0.25],   frame:2.4,  fov:12, world:true },
    { name:'Profile',    t:[0, 0, 0],         d:[1, 0.1, 0.35],    frame:1.8,  fov:10 },
  ]},
  detalle: { label:'Detail', shots:[
    { name:'Island',  t:[0, 0.55, 0],      d:[-0.35, 0.35, 1],  frame:0.75, fov:8 },
    { name:'Edge',t:[0.36, 0.25, 0],   d:[1, 0.15, 0.45],   frame:0.7,  fov:8 },
    { name:'Corner', t:[-0.25, -0.55, 0.02], d:[-0.5, -0.4, 1], frame:0.75, fov:8 },
  ]},
  editorial: { label:'Editorial', shots:[
    { name:'Wide',  t:[0.6, 0, 0],       d:[0.8, 0.55, 1],    frame:3.6,  fov:16, world:true }, // celular en el tercio izquierdo
    { name:'Diagonal',t:[0, 0, 0],         d:[-0.6, 1.4, 0.7],  frame:3.0,  fov:12, world:true },
    { name:'Low',   t:[0, -0.1, 0],      d:[0, -0.55, 1],     frame:2.0,  fov:11 },
  ]},
};
function buildPresetShots(key){
  const def = SHOT_PRESETS[key] || SHOT_PRESETS.producto;
  phone.updateWorldMatrix(true, false);
  const q = new THREE.Quaternion(); phone.getWorldQuaternion(q);
  const r3 = v => v.toArray().map(n => +n.toFixed(3));
  return def.shots.map(sh => {
    const t = phone.localToWorld(new THREE.Vector3(...sh.t));
    const d = new THREE.Vector3(...sh.d).normalize(); if (!sh.world) d.applyQuaternion(q);
    const dist = sh.frame / (2 * Math.tan(THREE.MathUtils.degToRad(sh.fov / 2)));
    const pos = t.clone().addScaledVector(d, dist);
    const minY = (P.scene.showBlocks ? SLAB_TOP : 0) + 0.12;  // nunca bajo la losa / el piso
    if (pos.y < minY) pos.y = minY;
    return { name:sh.name, p:r3(pos), t:r3(t), fov:sh.fov, example:true };
  });
}
export function defaultShots(){ shots = buildPresetShots(P.shots.preset); }
export function applyShotPreset(){
  stopPresentation();
  shots = buildPresetShots(P.shots.preset); curShot = -1; hooks.renderShots(); flyTo(0);
  toast(`Preset ${SHOT_PRESETS[P.shots.preset]?.label || ''} cargado`);
}
export let curShot = -1, presTL = null;
const camProxy = { px:0, py:0, pz:0, tx:0, ty:0, tz:0, fov:10 };
/* Easing de cámara seleccionable. Por defecto expo.inOut: el arranque y el frenado son los más lentos de la
   familia (casi inmóvil en el primer/último 20 %), lo que se lee como un movimiento de grúa/dolly sin tirones. */
export const CAM_EASES = { 'Expo':'expo.inOut', 'Quint':'power4.inOut', 'Quart':'power3.inOut', 'Sine':'sine.inOut', 'Cine':'cine' };
// "cine": curva tipo cubic-bezier(0.7, 0, 0.3, 1) → aceleración muy gradual y pico de velocidad contenido
const cineEase = t => { // bezier 1D sobre t con resolución por bisección (exacto y barato)
  const bx = (u) => 3*u*(1-u)*(1-u)*0.7 + 3*u*u*(1-u)*0.3 + u*u*u, by = (u) => 3*u*u*(1-u) + u*u*u;
  let lo = 0, hi = 1, u = t; for (let i = 0; i < 20; i++) { u = (lo + hi) / 2; bx(u) < t ? lo = u : hi = u; } return by(u);
};
const camEase = () => P.cam.ease === 'cine' ? cineEase : P.cam.ease;
function syncProxy(){ Object.assign(camProxy, { px:camera.position.x, py:camera.position.y, pz:camera.position.z, tx:controls.target.x, ty:controls.target.y, tz:controls.target.z, fov:camera.fov }); }
function applyProxy(){
  camera.position.set(camProxy.px, camProxy.py, camProxy.pz);
  controls.target.set(camProxy.tx, camProxy.ty, camProxy.tz);
  camera.fov = camProxy.fov; camera.updateProjectionMatrix(); camera.lookAt(controls.target);
}
const shotVars = s => ({ px:s.p[0], py:s.p[1], pz:s.p[2], tx:s.t[0], ty:s.t[1], tz:s.t[2], fov:s.fov });

/* Trayectoria en ARCO: en vez de interpolar la posición en línea recta (que corta por dentro de la escena y
   hace girar la mirada de golpe), interpolamos el offset cámara→objetivo en coordenadas esféricas:
   radio, ángulo polar y azimut (por el camino más corto). La cámara orbita alrededor del celular. */
const _sph = new THREE.Spherical(), _v = new THREE.Vector3();
function camTween(shot, dur, extra = {}){
  const st = { k:0 }, A = {}, Bt = new THREE.Vector3(...shot.t);
  return gsap.to(st, { k:1, duration:dur, ease:camEase(), ...extra,
    onStart(){
      A.t = controls.target.clone(); A.fov = camera.fov;
      A.s = new THREE.Spherical().setFromVector3(_v.copy(camera.position).sub(A.t));
      A.e = new THREE.Spherical().setFromVector3(_v.set(...shot.p).sub(Bt));
      let d = A.e.theta - A.s.theta; d = Math.atan2(Math.sin(d), Math.cos(d)); A.dTheta = d; // azimut por el lado corto
      extra.onStart?.();
    },
    onUpdate(){
      const k = st.k;
      const t = _v.copy(A.t).lerp(Bt, k);
      _sph.set(THREE.MathUtils.lerp(A.s.radius, A.e.radius, k), THREE.MathUtils.lerp(A.s.phi, A.e.phi, k), A.s.theta + A.dTheta * k);
      controls.target.copy(t);
      camera.position.setFromSpherical(_sph).add(t);
      camera.fov = THREE.MathUtils.lerp(A.fov, shot.fov, k); camera.updateProjectionMatrix(); camera.lookAt(t);
    }
  });
}
export let camTweening = false, flyTween = null;
// Move por debajo de este umbral = corte seco (evita que un 0.0 "casi cero" del slider dispare un tween de duración ínfima)
const CUT_BELOW = 0.01;
// Corte seco a una toma: posición, objetivo y FOV en el mismo cuadro, y se vacía la inercia de OrbitControls
function cutTo(s){
  Object.assign(camProxy, shotVars(s)); applyProxy();
  controls.update(); // re-sincroniza el estado interno (esférico + damping) con la nueva cámara
}
export function flyTo(i, dur = P.cam.flyDur){
  stopPresentation(); flyTween?.kill();
  curShot = i; hooks.renderShots();
  // movimiento 0 = cortes instantáneos también al elegir una toma de la lista
  if (P.shots.transition < CUT_BELOW) { camTweening = false; cutTo(shots[i]); P.cam.fov = camera.fov; hooks.refreshPane(); return; }
  camTweening = true;
  flyTween = camTween(shots[i], dur, { onComplete(){ camTweening = false; flyTween = null; P.cam.fov = camera.fov; hooks.refreshPane(); } });
}
// Ritmo variable: elige al azar 1 o 2 tomas que durarán la mitad (movimiento y pausa). Se vuelve a sortear
// cada vez que el loop reinicia, porque buildPresentation se llama de nuevo en cada vuelta.
function pickHalfShots(){
  if (!P.shots.randomHalf || shots.length < 2) return new Set();
  const n = Math.min(P.shots.halfCount, shots.length - 1), idx = shots.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; } // Fisher-Yates
  return new Set(idx.slice(0, n));
}
function buildPresentation(loop){
  const tl = gsap.timeline(), half = pickHalfShots();
  shots.forEach((s, i) => {
    const k = half.has(i) ? 0.5 : 1, tr = P.shots.transition < CUT_BELOW ? 0 : P.shots.transition * k, hold = P.shots.hold * k;
    const mark = () => { curShot = i; hooks.renderShots(); };
    if (tr > 0) { tl.call(mark); tl.add(camTween(s, tr, { paused:false })); }
    // Corte instantáneo, sin interpolar. La primera toma se aplica YA (no vía tl.call en t=0): GSAP no dispara llamadas en la
    // posición 0 del primer render, así que en el export cuadro a cuadro el cuadro 0 salía con la cámara anterior.
    else if (i === 0) { mark(); cutTo(s); }
    else { tl.call(mark); tl.call(() => cutTo(s)); }
    // piso de 50 ms: con movimiento 0 y pausa 0 el timeline duraría 0 s y el loop se re-crearía sin parar
    tl.to({}, { duration:Math.max(hold, tr > 0 ? 0 : 0.05) });
  });
  if (loop) tl.eventCallback('onComplete', () => { presTL = buildPresentation(true); });
  return tl;
}
export function playPresentation(loop = P.shots.loop){
  if (shots.length < 1) return toast('Guarda al menos una toma');
  stopPresentation(); flyTween?.kill(); flyTween = null; controls.enabled = false; camTweening = true;
  presTL = buildPresentation(loop); hooks.setPlayBtn(true);
}
export function stopPresentation(){
  if (!presTL) return;
  presTL.kill(); presTL = null; camTweening = false; controls.enabled = true; hooks.setPlayBtn(false);
}
export function presentationLength(){
  const n = P.shots.randomHalf && shots.length > 1 ? Math.min(P.shots.halfCount, shots.length - 1) : 0; // tomas a la mitad
  return (shots.length - n * 0.5) * ((P.shots.transition < CUT_BELOW ? 0 : P.shots.transition) + P.shots.hold);
}

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setShots = v => { shots = v; };

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setCurShot = v => { curShot = v; };

hooks.getShots = () => shots;
