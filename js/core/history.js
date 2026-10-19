import { P } from './params.js';
import { hooks } from './hooks.js';
import { toast } from './utils.js';
import { saveSoon } from './persist.js';
import { camera } from '../three/renderer.js';
import { curShot, setCurShot, setShots, shots, stopPresentation } from '../three/camera.js';

/* ───────────────────────── Deshacer / rehacer ─────────────────────────
   Pila lineal de SNAPSHOTS JSON inmutables (strings) de { P (grupos deshacibles), shots }. states[i] es el estado actual;
   labels[k]/keys[k] describen el cambio que produjo states[k] (states[0] = línea base, sin motivo).
   Deshacer = volver a states[i-1] (se muestra labels[i]); rehacer = ir a states[i+1] (labels[i+1]). Un cambio nuevo tras deshacer descarta el «futuro».
   Tope MAX entradas: al superarlo se descarta la más vieja.

   SE DESHACE: tomas (añadir/actualizar/renombrar/tiempos/duplicar/eliminar/mover/preset) y ajustes del panel de los grupos
   scene · env · shadow · phone · metal · anim · cam · car · grade · shots.
   NO SE DESHACE: cargar/eliminar/reordenar pantallas (medios), exportaciones, y el estado de interfaz (P.exp, P.ui, P.quality,
   valores UI temporales, edición de encuadre por pantalla). Importar un proyecto o «Clear» reinician el historial (reset).
   Cambios continuos (arrastrar slider/color): se fusionan en UNA entrada si son del mismo control y llegan con <400 ms de
   diferencia (o hasta que Tweakpane marca e.last). Los refrescos internos (syncing) nunca llegan aquí. */
export const MAX = 100, MERGE_MS = 400;
const GROUPS = ['scene', 'env', 'shadow', 'phone', 'metal', 'anim', 'cam', 'car', 'grade', 'shots'];
const REASONS = { add:'añadir toma', update:'actualizar toma', rename:'renombrar toma', timing:'tiempos de toma', duplicate:'duplicar toma', delete:'eliminar toma', move:'mover toma', preset:'cargar preset' };

let states = [], labels = [], keys = [], i = -1;
let lastKey = null, lastT = 0, restoring = 0, queue = Promise.resolve();
const subs = new Set();
const notify = () => { subs.forEach(f => { try { f(); } catch {} }); };
export const subscribe = f => { subs.add(f); return () => subs.delete(f); };

const pickP = () => Object.fromEntries(GROUPS.map(g => [g, P[g]]));
const snap = () => JSON.stringify({ P:pickP(), shots });
const pOf = s => JSON.stringify(JSON.parse(s).P);

export const canUndo = () => i > 0;
export const canRedo = () => i >= 0 && i < states.length - 1;
export const info = () => ({ length:states.length, index:i, labels:labels.slice(), undo:canUndo() ? labels[i] : null, redo:canRedo() ? labels[i + 1] : null });

/* Reinicia el historial con el estado actual como línea base (importar proyecto, Clear) */
export function reset(){ states = [snap()]; labels = ['inicio']; keys = [null]; i = 0; lastKey = null; lastT = 0; notify(); }

/* Registra el estado ACTUAL como nueva entrada. key identifica el control (para fusionar cambios continuos); last=false = Tweakpane sigue arrastrando */
export function record(reason, { key = null, last = true } = {}){
  if (restoring) return;
  if (!states.length) return reset(); // aún sin línea base: lo actual pasa a ser la base
  const s = snap(); if (s === states[i]) return;
  const now = performance.now();
  if (key && key === lastKey && now - lastT < MERGE_MS && i === states.length - 1 && i > 0) {
    states[i] = s; if (s === states[i - 1]) { states.pop(); labels.pop(); keys.pop(); i--; } // el control volvió a su valor inicial: sin entrada
  } else {
    states.length = labels.length = keys.length = i + 1; // descarta el «futuro»
    states.push(s); labels.push(reason); keys.push(key); i++;
    if (states.length > MAX) { states.shift(); labels.shift(); keys.shift(); i--; }
  }
  lastKey = last ? null : key; lastT = now;
  notify();
}

/* Va al estado `to` aplicando lo que cambió. k = índice de la entrada cuyo motivo se muestra */
function go(to, k, verb){
  const label = labels[k], key = keys[k] || '';
  const cur = JSON.parse(states[i]), tgt = JSON.parse(states[to]);
  i = to; lastKey = null; restoring++;
  const pChanged = JSON.stringify(cur.P) !== JSON.stringify(tgt.P), sChanged = JSON.stringify(cur.shots) !== JSON.stringify(tgt.shots);
  const fovEntry = /\/fov$/.test(key);
  // El FOV real lo mueven los vuelos de cámara: solo se restaura si el cambio deshecho/rehecho ES un ajuste de FOV
  if (!fovEntry) tgt.P.cam.fov = P.cam.fov;
  if (sChanged) {
    stopPresentation(); setShots(tgt.shots); setCurShot(curShot < tgt.shots.length ? curShot : -1);
    hooks.renderShots?.();
  }
  if (pChanged) for (const g of GROUPS) Object.assign(P[g], tgt.P[g]);
  if (fovEntry) { camera.fov = P.cam.fov; camera.updateProjectionMatrix(); }
  toast(`${verb}: ${label}`);
  notify();
  // Aplicación pesada (escena + refresco del panel) en serie; mientras tanto no se registran cambios
  queue = queue.then(async () => { try { if (pChanged) await hooks.applySettings?.(); } catch (e) { console.warn(e); } finally { restoring--; saveSoon(); hooks.refreshPane?.(); notify(); } });
  return queue;
}
export function undo(){ return canUndo() ? go(i - 1, i, 'Deshacer') : Promise.resolve(); }
export function redo(){ return canRedo() ? go(i + 1, i + 1, 'Rehacer') : Promise.resolve(); }

/* Tomas: engancha (sin pisar) hooks.onShotsChange */
{ const prev = hooks.onShotsChange; hooks.onShotsChange = r => { prev?.(r); record(REASONS[r] || r); }; }

/* Línea base: en cuanto el arranque deja las tomas listas (main.js llama setCurShot(0)); sondeo corto y barato */
{ const t = setInterval(() => { if (states.length) return clearInterval(t); if (shots.length && curShot >= 0) { reset(); clearInterval(t); } }, 150); }

/* Atajos: Ctrl/Cmd+Z deshacer · Ctrl/Cmd+Shift+Z y Ctrl+Y rehacer. Ignorados al escribir (input/textarea/select/Tweakpane/nombre) */
addEventListener('keydown', e => {
  if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
  const k = String(e.key).toLowerCase();
  const act = k === 'z' ? (e.shiftKey ? 'redo' : 'undo') : k === 'y' && !e.shiftKey ? 'redo' : null;
  if (!act) return;
  if (e.target?.closest?.('input, textarea, select, [contenteditable], .tp-dfwv') || document.body.classList.contains('recording')) return;
  if (act === 'undo' ? !canUndo() : !canRedo()) return;
  e.preventDefault(); act === 'undo' ? undo() : redo();
});
