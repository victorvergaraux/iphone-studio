import { P } from './params.js';
import { hooks } from './hooks.js';
import { toastOnce } from './utils.js';

/* ── Persistencia: ajustes + tomas en localStorage (por navegador). Solo se copian claves que ya existen
   en P y con el mismo tipo, así un guardado viejo o corrupto nunca rompe la escena. ── */
export const STORE_KEY = 'mockup-studio:v2';
export let saved = null, legacy = false;
try {
  saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (!saved) { saved = JSON.parse(localStorage.getItem('mockup-studio:v1') || 'null'); legacy = !!saved; }
} catch { // JSON corrupto o almacenamiento bloqueado: se arranca con los valores por defecto y se avisa una sola vez
  saved = null; toastOnce('persist-read', 'Tus ajustes guardados no se pudieron leer: uso los valores por defecto');
}
// JSON válido pero que no es un objeto (p. ej. un número): también se descarta
if (saved && (typeof saved !== 'object' || Array.isArray(saved))) { saved = null; legacy = false; toastOnce('persist-read', 'Tus ajustes guardados no se pudieron leer: uso los valores por defecto'); }
// Migración v1 → v2: se conservan tus ajustes, salvo los defaults que cambiaron en esta versión
const CHANGED_DEFAULTS = ['anim.type', 'cam.fov', 'car.mode', 'shots.transition', 'shots.hold'];
if (saved?.P) for (const g in P) for (const k in P[g]) {
  if (legacy && CHANGED_DEFAULTS.includes(`${g}.${k}`)) continue;
  const v = saved.P[g]?.[k]; if (v !== undefined && typeof v === typeof P[g][k]) P[g][k] = v;
}
// Tipos erróneos dentro del guardado (P no es objeto, tomas que no son lista o con elementos nulos): se ignoran y se avisa una vez
if (saved && saved.P !== undefined && (!saved.P || typeof saved.P !== 'object' || Array.isArray(saved.P))) { saved.P = null; toastOnce('persist-read', 'Tus ajustes guardados no se pudieron leer: uso los valores por defecto'); }
if (saved && saved.shots != null) { if (Array.isArray(saved.shots)) saved.shots = saved.shots.filter(s => s && typeof s === 'object'); else { saved.shots = null; toastOnce('persist-read', 'Tus tomas guardadas no se pudieron leer: uso las de ejemplo'); } }
if (legacy && Array.isArray(saved?.shots) && saved.shots.every(s => s.example)) saved.shots = null; // tomas de ejemplo viejas (FOV 14) → las nuevas
export let saveT = 0, wiped = false;
function saveNow(){
  clearTimeout(saveT); saveT = 0;
  if (wiped) return; // tras un reset no se vuelve a escribir: el pagehide del reload restauraba el estado viejo
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ P, shots: hooks.getShots().map(({ p, t, fov, example, name, move, hold, ease }) => ({ p, t, fov, example, name, move, hold, ease })) })); }
  catch { toastOnce('persist-write', 'No se pueden guardar los ajustes (almacenamiento lleno o bloqueado): se perderán al cerrar'); }
  hooks.syncScreens?.();   // encuadre editado de las pantallas (IndexedDB, con su propio debounce)
}
/* Throttle (no debounce): el bug era que el auto-scroll del carrusel refresca el panel en cada cuadro y cada
   refresh reiniciaba el temporizador → el guardado nunca llegaba a ejecutarse. Ahora, si ya hay un guardado
   pendiente, no se reinicia: se guarda como máximo cada 300 ms aunque lleguen cambios continuos. */
export function saveSoon(){ if (!saveT) saveT = setTimeout(saveNow, 300); }
addEventListener('pagehide', saveNow);                                            // al recargar/cerrar
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });

/* Reset total (kill cache): borra TODOS los ajustes y tomas guardados (v1 y v2) y recarga con los defaults de P.
   Hay que bloquear saveNow antes de recargar: pagehide/visibilitychange lo llaman y volvería a escribir el estado actual. */
export function resetAll(){
  wiped = true; clearTimeout(saveT); saveT = 0;
  try { localStorage.removeItem(STORE_KEY); localStorage.removeItem('mockup-studio:v1'); localStorage.removeItem('mockup-studio:onboarded'); } catch {}
  // también se borran las pantallas guardadas (IndexedDB); se espera a que termine antes de recargar
  Promise.resolve(hooks.wipeScreens?.()).catch(() => {}).finally(() => location.reload());
}
