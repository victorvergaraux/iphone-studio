import { P } from '../core/params.js';
import { exporting, pr, recording, setPr, setQuality, setRenderSize } from './session.js';

/* ───────────────────────── Calidad (Auto / High / Max) ─────────────────────────
   high → pixel ratio = min(devicePixelRatio, 2), preview estándar (comportamiento histórico).
   max  → pixel ratio nativo (tope 3) + AO 24 muestras + sombra 4096 también en preview (ver setQuality en session.js).
   auto → igual que High, pero SOLO baja el pixel ratio (AO, sombras y MSAA no se tocan) si el FPS medio cae bajo
          BAD_FPS mientras hay movimiento. Sube de nuevo al quedar quieto o al "sondear" tras un tiempo.
          Estabilidad: cada cambio de resolución se nota como un parpadeo (toda la imagen cambia de nitidez), así que nunca se
          sondea hacia arriba «a ciegas»: el coste del cuadro escala con los píxeles (fps ∝ 1/pr²), por lo que se PREDICE el FPS
          a la resolución superior y solo se sube si seguiría holgado (≥ BAD_FPS × HEADROOM). Sin eso el equipo oscilaba
          bajar → sondear → bajar cada 10–60 s.
   medium → perfil ESTABLE de ≈ 40 fps: calibra UNA vez cuánto cuesta un cuadro en este equipo (K = fps · píxeles · pr²) midiendo
          ~3 s en movimiento, fija la resolución que da ≈ MED_TARGET fps y ya no la toca (sin sondeos ni subir/bajar: nada de
          parpadeos). K se guarda: al recargar o cambiar el tamaño de la ventana se recalcula sin volver a medir. Además usa AO de
          8 muestras (session.js), sin refinamiento progresivo en el preview y 8 muestras en el PNG.
   El export (PNG/video) no pasa por aquí: usa su propia ruta beginExport/setQuality(true). */
const BAD_FPS = 45;      // FPS medio (ventana de WINDOW) bajo el cual auto reduce resolución
const WINDOW = 1000;     // ms de la ventana de promedio
const STILL_MS = 600;    // ms sin movimiento antes de restaurar calidad completa
const STEP = 0.25;       // salto del pixel ratio por paso
const FLOOR = 1;         // piso del pixel ratio en auto
const COOLDOWN = 1500;   // ms mínimos entre dos bajadas (histéresis: hay que medir una ventana fresca)
const PROBE_MIN = 30000, PROBE_MAX = 180000; // sondeo para subir un paso si la escena nunca queda quieta (animación idle)
const MED_TARGET = 40;   // fps objetivo del modo Medium
const MED_FLOOR = 0.75;   // piso del pixel ratio en Medium (por debajo la imagen se ve demasiado blanda)
const MED_KEY = 'mockup-studio:medium-k';
const HEADROOM = 1.3;    // histéresis: solo se sube un paso si el FPS PREDICHO a la resolución mayor sigue ≥ BAD_FPS × HEADROOM

const fullPr = () => Math.min(devicePixelRatio || 1, P.quality.mode === 'max' ? 3 : 2);

// Último FPS medio visto EN MOVIMIENTO (Infinity = aún sin medir). Lo usa la acumulación del preview (ver accumAllowed).
let lastFps = Infinity;
// ¿Puede el preview refinarse por acumulación cuando la escena está quieta? High/Max: siempre. Auto: solo si el FPS medio
// sostiene ≥ BAD_FPS y el pixel ratio ya está al máximo (si no, primero se restaura resolución y luego se refina).
export function accumAllowed(){
  if (P.quality.mode === 'medium') return false; // Medium: sin refinamiento progresivo (menos GPU, perfil estable)
  if (P.quality.mode !== 'auto') return true;
  return lastFps >= BAD_FPS && pr >= fullPr() - 1e-3;
}

let winStart = 0, frames = 0, lastT = 0, lastMove = 0, cooldownUntil = 0, probeAt = 0, probeGap = PROBE_MIN, probing = false;
const resetWindow = now => { winStart = now; frames = 0; lastT = now; };

function setLevel(v, now){
  if (Math.abs(v - pr) < 1e-3) return;
  setPr(v); setRenderSize(innerWidth, innerHeight, v); // liviano: no recalcula guía ni exportSize como layout()
  resetWindow(now);
}

/* ── Medium: calibración única ──
   Modelo de coste: fps = K / (píxeles · pr²). K se estima midiendo ventanas de 1 s en movimiento (2 para estimar + 1 para verificar,
   con a lo sumo una corrección en cualquier sentido) y se guarda. El pixel ratio sale de K y del tamaño actual de la ventana,
   redondeado al paso de 0.25 más cercano y limitado a [MED_FLOOR, fullPr]. Calibrado → bloqueado: no se vuelve a cambiar salvo al
   redimensionar la ventana (recalculando desde K, sin medir) o al volver a elegir Medium en el selector (recalibra). */
let medK = null, medState = 'calibrating', medEst = [], medCorrected = false, medApplied = false;
const loadK = () => { try { const v = +localStorage.getItem(MED_KEY); return v > 0 && isFinite(v) ? v : null; } catch { return null; } };
const saveK = () => { try { localStorage.setItem(MED_KEY, String(medK)); } catch {} };
const pixels = () => Math.max(1, innerWidth * innerHeight);
const quantNear = v => Math.round(v / STEP) * STEP; // al escalón MÁS CERCANO: K se estima con ruido y redondear hacia abajo perdería un escalón entero
const mediumPr = () => Math.max(MED_FLOOR, Math.min(fullPr(), quantNear(Math.sqrt(medK / (MED_TARGET * pixels())))));
function medInit(fresh){ medK = fresh ? null : loadK(); medState = medK ? 'locked' : 'calibrating'; medEst = []; medCorrected = false; medApplied = false; }
medInit(false);
function mediumTick(now, moving){
  if (medState === 'locked') { if (!medApplied) { medApplied = true; setLevel(mediumPr(), now); } return; } // calibrado: se aplica K guardado una vez y ya no cambia
  if (!moving) { resetWindow(now); return; }    // solo se mide FPS durante movimiento
  if (!lastT || now - lastT > 500) resetWindow(now);
  lastT = now; frames++;
  if (now - winStart < WINDOW) return;
  const fps = frames * 1000 / (now - winStart); resetWindow(now);
  const K = fps * pixels() * pr * pr;
  if (medState === 'calibrating') {
    medEst.push(K);
    if (medEst.length >= 2) { medK = medEst.reduce((a, b) => a + b, 0) / medEst.length; setLevel(mediumPr(), now); medState = 'verify'; }
  } else if (medState === 'verify') {
    // una sola corrección: si quedó corto de fps (< 92 % del objetivo) baja; si sobra mucho (> 135 %) y hay margen, sube
    if (!medCorrected && ((fps < MED_TARGET * 0.92 && pr > MED_FLOOR + 1e-3) || (fps > MED_TARGET * 1.35 && pr < fullPr() - 1e-3))) {
      medK = K; medCorrected = true; const t = mediumPr(); if (Math.abs(t - pr) > 1e-3) { setLevel(t, now); return; }
    }
    medK = K; medState = 'locked'; medApplied = true; saveK();
  }
}
// Al cambiar el tamaño de la ventana (más/menos píxeles) Medium recalcula su resolución desde K, sin volver a medir
addEventListener('resize', () => { if (P.quality.mode === 'medium' && medState === 'locked' && medK && !recording && !exporting) setLevel(mediumPr(), performance.now()); });

// Cambio de modo en vivo (lo llama la UI, que después invoca layout() para reaplicar el tamaño)
export function applyMode(){
  if (P.quality.mode === 'medium') { medInit(true); setPr(Math.min(fullPr(), 1.25)); setRenderSize(innerWidth, innerHeight, pr); } // recalibra al elegir Medium (parte conservador)
  else setPr(fullPr());
  setQuality(false); // setQuality respeta 'max' (AO 24 + sombra 4K en preview)
  probing = false; probeGap = PROBE_MIN; cooldownUntil = 0; probeAt = 0; lastMove = 0; lastFps = Infinity; resetWindow(performance.now());
}

// Se llama una vez por cuadro desde el loop. moving = hay algo animándose (cámara, toma, carrusel, deriva, idle…)
export function qualityTick(now, moving){
  if (P.quality.mode === 'medium') { if (recording || exporting || document.hidden) { lastT = 0; return; } return mediumTick(now, moving); }
  if (P.quality.mode !== 'auto' || recording || exporting || document.hidden) { lastT = 0; return; }
  const full = fullPr(); if (full <= FLOOR) return; // pantalla 1× (o menor): no hay margen que recortar
  if (moving) lastMove = now;
  // Quieto → calidad completa de inmediato (un solo cambio; en reposo no hay oscilación)
  if (pr < full - 1e-3 && now - lastMove > STILL_MS) { setLevel(full, now); probing = false; return; }
  if (!moving) { resetWindow(now); return; } // solo se mide FPS durante movimiento
  if (!lastT || now - lastT > 500) resetWindow(now); // hueco largo (pestaña oculta, resize, setSize): ventana inválida
  lastT = now; frames++;
  if (now - winStart < WINDOW) return;
  const fps = frames * 1000 / (now - winStart); lastFps = fps; resetWindow(now);
  if (fps < BAD_FPS && now >= cooldownUntil && pr > FLOOR + 1e-3) {
    setLevel(Math.max(FLOOR, pr - STEP), now); cooldownUntil = now + COOLDOWN;
    if (probing) probeGap = Math.min(PROBE_MAX, probeGap * 2); // el sondeo falló → espera más antes de reintentar
    probing = false; probeAt = now + probeGap;
  } else if (fps >= BAD_FPS) {
    if (probing) { probing = false; probeGap = PROBE_MIN; } // el paso extra aguantó → vuelve a la cadencia corta
    // Sondeo: si seguimos reducidos y nunca hay quietud, intenta subir un paso; si no aguanta, la regla de arriba lo baja
    if (pr < full - 1e-3 && now >= probeAt) {
      const next = Math.min(full, pr + STEP), predicted = fps * (pr / next) ** 2; // fps ∝ 1/píxeles
      if (predicted >= BAD_FPS * HEADROOM) { setLevel(next, now); probing = true; }
      probeAt = now + probeGap; // si no hay holgura, se vuelve a evaluar más adelante (sin cambiar nada)
    }
  }
}

// Solo para pruebas: estado de la calibración de Medium
export const mediumInfo = () => ({ K: medK, state: medState, target: medK ? mediumPr() : null });
