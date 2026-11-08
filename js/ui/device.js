import { $, icons, toast } from '../core/utils.js';
import { T } from '../core/strings.js';
import { P } from '../core/params.js';
import { saveSoon } from '../core/persist.js';
import { record } from '../core/history.js';
import { DEVICES, S_ASPECT } from '../three/iphone.js';
import { applyDevice } from '../three/smudge.js';
import { defaultShots, flyTo, presTL, shots } from '../three/camera.js';
import { hooks } from '../core/hooks.js';
import { reframeDefaults, scheduleCar } from '../screens/carousel.js';
import { refreshEdit } from './pane.js';
import { renderStrip } from './strips.js';

/* ───────────────────────── Modelo de pantalla: celular / tablet ─────────────────────────
   Dos opciones a la derecha del dock (#devSw). Funcionalmente son lo mismo (el carrusel, el encuadre y la exportación no cambian):
   solo cambian las medidas del aparato (js/three/iphone.js → DEVICES). El estado vive en P.phone.device (se guarda y se importa solo).
   Sugerencia: al cargar pantallas cuya orientación contradice al modelo activo (más horizontal que vertical ⇒ tablet; al revés ⇒ celular)
   se muestra un tooltip encima de las dos opciones y se marca la sugerida. */
const root = $('#devSw'), tip = $('#devTip');
const opts = { phone: $('#devPhone'), tablet: $('#devTablet') };
let hintT = 0;

function paint(){
  const dev = P.phone.device;
  for (const k in opts) opts[k].setAttribute('aria-pressed', String(k === dev));
  document.body.classList.toggle('dev-tablet', dev === 'tablet'); // miniaturas del dock con la proporción del modelo
}

export function hideHint(){
  clearTimeout(hintT); hintT = 0;
  root.removeAttribute('data-hint'); tip.textContent = '';
  for (const k in opts) opts[k].removeAttribute('data-suggest');
}
function showHint(want){
  hideHint();
  tip.textContent = T.device.hint[want]; root.dataset.hint = want; opts[want].dataset.suggest = '';
  // Con el dock oculto el tooltip no se ve: se avisa con un toast
  if (document.body.classList.contains('dock-hidden')) toast(T.device.hintHidden, 4500);
  hintT = setTimeout(hideHint, 10000);
}

/* Aplica P.phone.device a la escena y a lo que depende del aspecto de la pantalla. Lo usan el clic del usuario,
   deshacer/rehacer y la importación de proyectos (applyAll). */
let applied = P.phone.device; // modelo que la escena tiene montado ahora (iphone.js lo lee de P al arrancar)
/* cam: si las tomas siguen siendo las de ejemplo (preset), se regeneran para el modelo nuevo (CAM_K) y la cámara vuela a la primera.
   applyAll lo pasa en false al deshacer/rehacer: ahí las tomas ya vienen restauradas del historial y la cámara no se mueve. */
export function syncDevice({ cam = true } = {}){
  if (!DEVICES[P.phone.device]) P.phone.device = 'phone'; // proyecto importado con un modelo desconocido
  if (applied !== P.phone.device) {
    const prev = S_ASPECT;
    applied = P.phone.device; applyDevice();
    if (S_ASPECT !== prev) { reframeDefaults(prev); renderStrip(); refreshEdit(); scheduleCar(); }
    if (cam && shots.length && shots.every(s => s.example)) { defaultShots(); hooks.renderShots?.(); if (!presTL) flyTo(0); }
  }
  paint();
}

export function chooseDevice(name){
  if (name === P.phone.device || !opts[name]) return;
  P.phone.device = name;
  hideHint(); syncDevice(); saveSoon();
  record(T.device.history, { key: 'phone/device' });
}

/* Llamado tras cargar pantallas nuevas (screens/load.js): decide por mayoría si encajan con el modelo activo.
   Más ancha que alta (aspect > 1) = horizontal. Empate o encaje correcto → sin sugerencia. */
export function suggestFor(newItems){
  const land = newItems.filter(it => it.aspect > 1).length, port = newItems.length - land;
  const want = land > port ? 'tablet' : port > land ? 'phone' : null;
  if (!want || want === P.phone.device) return hideHint();
  showHint(want);
}

for (const k in opts) opts[k].onclick = () => chooseDevice(k);
paint();
icons();
