import * as THREE from 'three';
import { P } from '../core/params.js';
import { camera, composer, controls, gradePass } from './renderer.js';
import { animG } from './iphone.js';
import { screenMat } from './screen.js';
import { cur, items, nextIdx, xform } from '../screens/carousel.js';
import { camTweening } from './camera.js';
import { applyView, exporting, lastSx, lastSy, recording, viewShift } from './format.js';

/* ───────────────────────── Render loop ───────────────────────── */
export const clock = new THREE.Clock();
const tmpV = new THREE.Vector3(), driftOff = new THREE.Vector3();
export let offline = false; // render cuadro a cuadro: el loop de rAF deja de dibujar y el export maneja el reloj
export function tick(){ if (!offline) renderFrame(clock.getElapsedTime()); requestAnimationFrame(tick); }
export function renderFrame(t){
  // Animación idle del iPhone en el grupo intermedio (no pisa la pose)
  const a = P.anim.amp, s = P.anim.speed;
  animG.position.y = P.phone.y; animG.rotation.set(0, 0, 0); // offset Y del usuario + animación encima
  if (P.anim.type === 'float') { animG.position.y += a * 0.05 * (1 + Math.sin(t * s * 1.1)) / 2; animG.rotation.x = a * 0.025 * Math.sin(t * s * 0.8); animG.rotation.z = a * 0.02 * Math.sin(t * s * 0.6 + 1); }
  else if (P.anim.type === 'sway') animG.rotation.y = a * 0.22 * Math.sin(t * s * 0.5);
  else if (P.anim.type === 'spin') animG.rotation.y = t * s * 0.35;
  else if (P.anim.type === 'breathe') { animG.position.y += a * 0.03 * (1 + Math.sin(t * s)) / 2; animG.rotation.y = a * 0.06 * Math.sin(t * s * 0.5); }

  // Uniforms del carrusel
  const A = items[cur], Bn = nextIdx >= 0 ? items[nextIdx] : A, u = screenMat.uniforms;
  if (A) { u.uTexA.value = A.tex; xform(A, u.uXfA.value); }
  if (Bn) { u.uTexB.value = Bn.tex; xform(Bn, u.uXfB.value); }
  gradePass.uniforms.uTime.value = t;

  if (!recording && !exporting && (lastSx !== viewShift.x || lastSy !== viewShift.y)) applyView();
  if (!camTweening) controls.update();
  // Deriva de cámara "handheld": suma de senos desfasados, se aplica solo durante el render y se restaura
  const d = P.cam.drift, ds = P.cam.driftSpeed;
  driftOff.set(Math.sin(t * ds * 0.9) * 0.6 + Math.sin(t * ds * 2.1) * 0.15, Math.sin(t * ds * 0.7 + 2) * 0.4, Math.cos(t * ds * 0.8) * 0.5).multiplyScalar(d * 0.12);
  tmpV.copy(camera.position); camera.position.add(driftOff); camera.lookAt(controls.target);
  composer.render();
  camera.position.copy(tmpV); camera.lookAt(controls.target);
}

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setOffline = v => { offline = v; };
