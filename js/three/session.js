/* Estado de sesión del render: flags recording/exporting, pixel ratio del preview, tamaño de render y calidad.
   Los `let` exportados son enlaces vivos; como un importador no puede reasignarlos, se exponen setters.
   Depende solo de renderer/escena/acumulación (no importa frame.js → sin ciclos).
   Lo usan: frame.js (layout, begin/endExport), three/loop.js, three/quality.js, export/offline.js, export/project.js. */
import { P } from '../core/params.js';
import { camera, composer, gradePass, gtao, renderer, setAoScale } from './renderer.js';
import { sun } from './scene.js';
import { accum } from './accum.js';

// Pixel ratio del preview. Lo gobierna el selector Quality (js/three/quality.js): high/auto = min(dpr, 2), max = min(dpr, 3), medium = calibrado (≈40 fps).
export let pr = Math.min(devicePixelRatio, P.quality.mode === 'max' ? 3 : P.quality.mode === 'medium' ? 1.25 : 2), recording = false, exporting = false; // medium arranca conservador y se calibra (quality.js)
export const setPr = v => { pr = v; };
export const setRecording = v => { recording = v; };
// `exporting` solo lo cambian beginExport/endExport (frame.js) mediante este setter interno (no se reexporta en la fachada).
export const setExporting = v => { exporting = v; };

export function setRenderSize(w, h, ratio){
  accum.reset(); // el tamaño cambia → el promedio acumulado deja de ser válido
  renderer.setPixelRatio(ratio); renderer.setSize(w, h, false);
  // composer.setPixelRatio ya redimensiona internamente (con el tamaño viejo): si el ancho/alto no cambian, ese único paso basta
  // y evitamos realocar dos veces todos los targets (MSAA, GTAO, denoise). No se cachea el último tamaño: beginExport también
  // toca el composer por fuera y un caché quedaría desfasado al volver del export.
  composer.setPixelRatio(ratio);
  if (composer._width !== w || composer._height !== h) composer.setSize(w, h);
  gradePass.uniforms.uRes.value.set(w * ratio, h * ratio);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

// Calidad: preview ligero (AO 50 %, sombra 2K) / export alto (AO 100 %, sombra 4K, más muestras)
export function setQuality(high){
  accum.reset(); // AO/sombra cambian → reinicia la acumulación progresiva
  high = high || P.quality.mode === 'max'; // Max: el preview también usa AO 24 y sombra 4K (el export siempre pasa true)
  setAoScale(1);
  gtao.updateGtaoMaterial({ samples: high ? 24 : P.quality.mode === 'medium' ? 8 : 12 }); // Medium: AO más ligero en el preview
  const sz = high ? 4096 : 2048;
  if (sun.shadow.mapSize.x !== sz) { sun.shadow.mapSize.set(sz, sz); sun.shadow.map?.dispose(); sun.shadow.map = null; }
}
