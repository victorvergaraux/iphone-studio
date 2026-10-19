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
  // Base (por defecto, primero de la lista): 4 tomas en la línea de Vic (tele fov 8, coordenadas de mundo) pero desde el lado opuesto: derecha baja → frontal cercana → cenital diagonal → pull-back.
  base: { label:'Base', absolute:[
      { name:'Right',  p:[3.5, 1.8, 6.2],   t:[-0.05, 1.0, 0.1],  fov:8 },
      { name:'Close',  p:[1.4, 3.0, 3.6],    t:[-0.06, 1.15, 0.06], fov:8 },
      { name:'Aerial', p:[3.0, 8.5, 5.0],    t:[-0.05, 0.85, 0.15], fov:8 },
      { name:'Pull',   p:[-0.6, 1.15, 9.5],  t:[-0.1, 0.95, 0.12],  fov:8 },
  ]},
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
  // Vic: tomas guardadas a mano (posición p, objetivo t y fov en coordenadas de mundo). No se adaptan a la pose del celular.
  vic: { label:'Vic', absolute:[
      { p:[-9.224, 1.408, 2.163], t:[-0.035, 1.112, 0.076], fov:8 },
      { p:[0.05, 1.987, 2.677], t:[-0.054, 1.174, 0.049], fov:8 },
      { p:[-1.732, 2.575, 1.583], t:[-0.312, 0.487, 0.485], fov:8 },
      { p:[-2.336, 8.351, 5.311], t:[-0.071, 0.787, 0.158], fov:8 },
      { p:[0.015, 2.687, 6.459], t:[-0.114, 0.887, 0.127], fov:8 },
      { p:[-1.678, 4.895, 1.706], t:[-0.048, 0.877, 0.176], fov:8 },
  ]},
};
function buildPresetShots(key){
  const def = SHOT_PRESETS[key] || SHOT_PRESETS.producto;
  if (def.absolute) return def.absolute.map(sh => ({ ...sh, example:true })); // tomas en coordenadas de mundo, sin cálculo relativo al celular
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
  commitShots('preset', buildPresetShots(P.shots.preset), -1, { stop:true }); flyTo(0);
  toast(`Preset ${SHOT_PRESETS[P.shots.preset]?.label || ''} cargado`);
}
export let curShot = -1, presTL = null;

/* ── Edición de tomas ──
   TODA mutación de `shots` pasa por commitShots: reemplaza el array COMPLETO (copy-on-write, nunca se muta una toma ni el array
   en sitio), así cada operación es atómica y se puede revertir guardando la referencia/snapshot anterior. Al terminar repinta la lista
   (renderShots → guarda en localStorage) y avisa con hooks.onShotsChange?.(reason) (deshacer/rehacer se engancha ahí).
   reason: add · update · rename · timing · duplicate · delete · move · preset */
export function commitShots(reason, next, cur = curShot, { stop = false } = {}){
  if (stop) stopPresentation();
  // Cualquier edición del usuario retira la marca «example» (si no, un guardado solo de ejemplos se regeneraría al recargar y se perdería)
  shots = next.map(s => reason === 'preset' || !s.example ? s : (({ example, ...r }) => r)(s));
  curShot = cur >= 0 && cur < shots.length ? cur : -1;
  hooks.renderShots?.(); hooks.onShotsChange?.(reason);
}
const pad2 = n => String(n).padStart(2, '0');
const META = ['name', 'move', 'hold', 'ease']; // campos de la toma que no son cámara
const pickMeta = s => Object.fromEntries(META.filter(k => s[k] !== undefined).map(k => [k, s[k]]));
const okIdx = i => Number.isInteger(i) && i >= 0 && i < shots.length;
const need = () => { toast('Elige una toma de la lista primero'); return false; };

// Guarda la cámara actual como toma nueva al final y la deja seleccionada
export function addShot(){ commitShots('add', [...shots, snap()], shots.length); toast(`Toma T${pad2(shots.length)} guardada`); return true; }
// Reemplaza la cámara de la toma i con la actual (conserva nombre, move, hold y ease)
export function updateShot(i = curShot){
  if (!okIdx(i)) return need();
  const next = shots.slice(); next[i] = { ...snap(), ...pickMeta(shots[i]) };
  commitShots('update', next, i); toast(`Toma T${pad2(i + 1)} actualizada`); return true;
}
export function deleteShot(i = curShot){
  if (!okIdx(i)) return need();
  commitShots('delete', shots.filter((_, k) => k !== i), -1, { stop:true }); toast(`Toma T${pad2(i + 1)} eliminada`); return true;
}
export function duplicateShot(i = curShot){
  if (!okIdx(i)) return need();
  const src = shots[i], copy = { ...src, p:[...src.p], t:[...src.t] }; if (src.name) copy.name = `${src.name} 2`;
  const next = shots.slice(); next.splice(i + 1, 0, copy);
  commitShots('duplicate', next, i + 1, { stop:true }); toast(`Toma T${pad2(i + 1)} duplicada`); return true;
}
// Mueve la toma `from` a la posición `to` (la selección sigue a la toma que se mueve o se desplaza con ella)
export function moveShot(from, to){
  if (!okIdx(from)) return false; to = Math.max(0, Math.min(shots.length - 1, to));
  if (to === from) return false;
  const next = shots.slice(), [it] = next.splice(from, 1); next.splice(to, 0, it);
  const cur = curShot === from ? to : curShot < 0 ? -1 : next.indexOf(shots[curShot]);
  commitShots('move', next, cur, { stop:true }); return true;
}
export function renameShot(i, name){
  if (!okIdx(i)) return false;
  const v = String(name ?? '').trim().slice(0, 40);
  if ((shots[i].name || '') === v) return false;
  const next = shots.slice(), { name:_, ...rest } = shots[i]; next[i] = v ? { ...rest, name:v } : rest;
  commitShots('rename', next, curShot); return true;
}
/* Sobrescribe Move/Hold (segundos) y Ease SOLO en la toma i. patch = { move?, hold?, ease? }; null/undefined/'' = quitar el override (vuelve al global). */
export function setShotTiming(i, patch){
  if (!okIdx(i)) return false;
  const o = { ...shots[i] }; let dirty = false;
  for (const k of ['move', 'hold', 'ease']) {
    if (!(k in patch)) continue;
    let v = patch[k];
    if (k === 'ease') v = validEase(v); else v = v === null || v === undefined || v === '' || !Number.isFinite(+v) ? undefined : Math.min(k === 'move' ? 30 : 60, Math.max(0, +v));
    if (o[k] === v) continue;
    dirty = true; if (v === undefined) delete o[k]; else o[k] = v;
  }
  if (!dirty) return false;
  const next = shots.slice(); next[i] = o; commitShots('timing', next, curShot); return true;
}

/* Limpia una toma venida de disco (localStorage / proyecto JSON): campos de cámara obligatorios y meta opcional con tipos válidos.
   Las tomas antiguas (sin name/move/hold/ease) siguen siendo válidas. Devuelve null si no es utilizable. */
export function sanitizeShot(s){
  const vec = a => Array.isArray(a) && a.length === 3 && a.every(Number.isFinite);
  if (!s || !vec(s.p) || !vec(s.t) || !Number.isFinite(s.fov)) return null;
  const o = { p:s.p.slice(), t:s.t.slice(), fov:s.fov };
  if (typeof s.name === 'string' && s.name.trim()) o.name = s.name.trim().slice(0, 40);
  if (s.example === true) o.example = true;
  if (Number.isFinite(s.move) && s.move >= 0) o.move = Math.min(30, s.move);
  if (Number.isFinite(s.hold) && s.hold >= 0) o.hold = Math.min(60, s.hold);
  const e = validEase(s.ease); if (e) o.ease = e;
  return o;
}

const camProxy = { px:0, py:0, pz:0, tx:0, ty:0, tz:0, fov:10 };
/* Easing de cámara seleccionable. Por defecto expo.inOut: el arranque y el frenado son los más lentos de la
   familia (casi inmóvil en el primer/último 20 %), lo que se lee como un movimiento de grúa/dolly sin tirones. */
export const CAM_EASES = { 'Expo':'expo.inOut', 'Quint':'power4.inOut', 'Quart':'power3.inOut', 'Sine':'sine.inOut', 'Cine':'cine' };
// "cine": curva tipo cubic-bezier(0.7, 0, 0.3, 1) → aceleración muy gradual y pico de velocidad contenido
const cineEase = t => { // bezier 1D sobre t con resolución por bisección (exacto y barato)
  const bx = (u) => 3*u*(1-u)*(1-u)*0.7 + 3*u*u*(1-u)*0.3 + u*u*u, by = (u) => 3*u*u*(1-u) + u*u*u;
  let lo = 0, hi = 1, u = t; for (let i = 0; i < 20; i++) { u = (lo + hi) / 2; bx(u) < t ? lo = u : hi = u; } return by(u);
};
// key = valor de CAM_EASES (p. ej. 'expo.inOut' o 'cine'); cada toma puede traer el suyo (shot.ease), si no, el global P.cam.ease
const camEase = (key = P.cam.ease) => key === 'cine' ? cineEase : key;
// Acepta la CLAVE ('Expo') o el VALOR ('expo.inOut') de CAM_EASES y devuelve siempre el valor; undefined si no existe
export function validEase(x){
  if (typeof x !== 'string') return undefined;
  if (Object.prototype.hasOwnProperty.call(CAM_EASES, x)) return CAM_EASES[x];
  return Object.values(CAM_EASES).includes(x) ? x : undefined;
}
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
  return gsap.to(st, { k:1, duration:dur, ease:camEase(validEase(shot.ease) ?? P.cam.ease), ...extra,
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
  if (!shots[i]) return;
  stopPresentation(); flyTween?.kill();
  curShot = i; hooks.renderShots();
  // movimiento 0 (global, o el Move propio de la toma) = cortes instantáneos también al elegir una toma de la lista
  if ((shots[i].move ?? P.shots.transition) < CUT_BELOW) { camTweening = false; cutTo(shots[i]); P.cam.fov = camera.fov; hooks.refreshPane(); return; }
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
/* Tiempos efectivos de una toma: Move/Hold propios (shot.move / shot.hold) o los globales; k = 0.5 en las tomas «a la mitad»
   (Random). Move < CUT_BELOW = corte seco (tr 0). Piso de 50 ms si no hay movimiento ni pausa (evita un timeline de 0 s). */
function shotTiming(s, k = 1){
  const mv = s.move ?? P.shots.transition, tr = mv < CUT_BELOW ? 0 : mv * k, hold = (s.hold ?? P.shots.hold) * k;
  return { tr, hold, len: tr + Math.max(hold, tr > 0 ? 0 : 0.05) };
}
function buildPresentation(loop){
  const tl = gsap.timeline(), half = pickHalfShots(), segs = []; let at = 0; // segs: ventana [start, end] de cada toma en el timeline (la usa la barra de progreso)
  shots.forEach((s, i) => {
    const { tr, hold, len } = shotTiming(s, half.has(i) ? 0.5 : 1); segs.push({ start:at, end:at + len }); at += len;
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
  // Sin loop: al terminar se libera todo (botón, controles, retícula). Solo si este timeline sigue siendo el activo.
  else tl.eventCallback('onComplete', () => { if (presTL === tl) stopPresentation(); });
  tl.segs = segs;
  return tl;
}
export function playPresentation(loop = P.shots.loop){
  if (shots.length < 1) return toast('Guarda al menos una toma');
  stopPresentation(); flyTween?.kill(); flyTween = null; controls.enabled = false; camTweening = true;
  presTL = buildPresentation(loop); hooks.setPlayBtn(true);
  document.body.classList.add('pres-playing'); // oculta la retícula mientras corre la presentación
}
export function stopPresentation(){
  document.body.classList.remove('pres-playing'); // siempre se limpia, aunque no hubiera presTL (sin estados colgados)
  if (!presTL) return;
  presTL.kill(); presTL = null; camTweening = false; controls.enabled = true; hooks.setPlayBtn(false);
}
export function presentationLength(){
  if (!shots.length) return 0;
  const n = P.shots.randomHalf && shots.length > 1 ? Math.min(P.shots.halfCount, shots.length - 1) : 0; // tomas a la mitad
  const total = shots.reduce((a, s) => a + shotTiming(s).len, 0);
  return total - n * 0.5 * (total / shots.length); // las tomas a la mitad se sortean: se usa la duración media
}

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setShots = v => { shots = v; };

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setCurShot = v => { curShot = v; };

hooks.getShots = () => shots;
