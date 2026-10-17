import { P } from './params.js';
import { hooks } from './hooks.js';

/* ── Persistencia: ajustes + tomas en localStorage (por navegador). Solo se copian claves que ya existen
   en P y con el mismo tipo, así un guardado viejo o corrupto nunca rompe la escena. ── */
export const STORE_KEY = 'mockup-studio:v2';
export let saved = null, legacy = false;
try {
  saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
  if (!saved) { saved = JSON.parse(localStorage.getItem('mockup-studio:v1') || 'null'); legacy = !!saved; }
} catch {}
// Migración v1 → v2: se conservan tus ajustes, salvo los defaults que cambiaron en esta versión
const CHANGED_DEFAULTS = ['anim.type', 'cam.fov', 'car.mode', 'shots.transition', 'shots.hold'];
if (saved?.P) for (const g in P) for (const k in P[g]) {
  if (legacy && CHANGED_DEFAULTS.includes(`${g}.${k}`)) continue;
  const v = saved.P[g]?.[k]; if (v !== undefined && typeof v === typeof P[g][k]) P[g][k] = v;
}
if (legacy && saved?.shots?.every(s => s.example)) saved.shots = null; // tomas de ejemplo viejas (FOV 14) → las nuevas
export let saveT = 0;
function saveNow(){
  clearTimeout(saveT); saveT = 0;
  try { localStorage.setItem(STORE_KEY, JSON.stringify({ P, shots: hooks.getShots().map(({ p, t, fov, example, name }) => ({ p, t, fov, example, name })) })); } catch {}
}
/* Throttle (no debounce): el bug era que el auto-scroll del carrusel refresca el panel en cada cuadro y cada
   refresh reiniciaba el temporizador → el guardado nunca llegaba a ejecutarse. Ahora, si ya hay un guardado
   pendiente, no se reinicia: se guarda como máximo cada 300 ms aunque lleguen cambios continuos. */
export function saveSoon(){ if (!saveT) saveT = setTimeout(saveNow, 300); }
addEventListener('pagehide', saveNow);                                            // al recargar/cerrar
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
