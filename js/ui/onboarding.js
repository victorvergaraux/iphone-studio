import { $, icons, reduced } from '../core/utils.js';
import { T } from '../core/strings.js';
import { P } from '../core/params.js';
import { saveSoon } from '../core/persist.js';
import { exportSize } from '../three/formats.js';
import { layout } from '../three/frame.js';
import { closeExport, exportOpen } from './exportcard.js';
import { togglePres } from './strips.js';
import { closeShotEditor, shotEditorOpen } from './shoteditor.js';

/* ───────────────────────── Onboarding ─────────────────────────
   Tarjeta flotante de 3 pasos (Imágenes → Exportar → Cinemática), solo informativa: el selector de formato del paso 2 y el botón
   «Reproducir» del paso 3 son lo único accionable; el resto se hace con el rail. Manual (Atrás / Siguiente).
   El flag vive en su propia clave de localStorage (no en P): no se exporta con el proyecto JSON. */
const ONB_KEY = 'mockup-studio:onboarded';
const seen = () => { try { return !!localStorage.getItem(ONB_KEY); } catch { return false; } };
const mark = () => { try { localStorage.setItem(ONB_KEY, '1'); } catch {} };

const STEPS = [
  { ...T.onboarding.steps[0], acts:[] },
  { ...T.onboarding.steps[1], fmt:true, acts:[] },
  { ...T.onboarding.steps[2], acts:[[T.onboarding.play, togglePres]] },
];
let i = 0;

/* Selector de formato del paso «Exportar»: mismos valores que FORMATS / P.exp.format (la card de export lo relee al abrir).
   Debajo, la salida real en píxeles (exportSize) para que se vea qué se va a descargar. */
const ONB_FORMATS = ['9:16', '4:5', '1:1', '16:9', 'Pantalla'];
function fmtBlock(){
  const wrap = document.createElement('div'); wrap.className = 'onb-fmt'; wrap.id = 'onbFmt';
  const segEl = document.createElement('div'); segEl.className = 'exp-seg'; segEl.setAttribute('role', 'group'); segEl.setAttribute('aria-label', T.common.format);
  const out = document.createElement('span'); out.className = 'onb-fmt-out';
  const sync = () => {
    for (const b of segEl.children) b.setAttribute('aria-pressed', String(b.dataset.v === P.exp.format));
    const [w, h] = exportSize(); out.textContent = T.onboarding.output(w, h, P.exp.format === 'Pantalla');
  };
  for (const f of ONB_FORMATS) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = f; b.dataset.v = f;
    b.onclick = () => { P.exp.format = f; saveSoon(); layout(); sync(); };
    segEl.append(b);
  }
  wrap.append(segEl, out); sync(); return wrap;
}

const card = $('#onb'), body = $('#onbBody'), pad2 = n => String(n).padStart(2, '0');
function render(){
  const s = STEPS[i];
  $('#onbNum').textContent = pad2(i + 1);
  $('#onbTitle').textContent = s.title;
  const sub = $('#onbSub'); sub.textContent = s.sub || ''; sub.hidden = !s.sub; // subtítulo opcional por paso
  $('#onbText').textContent = s.text;
  $('#onbFmt')?.remove(); // el selector de formato solo vive en el paso que lo pide
  if (s.fmt) $('#onbActs').before(fmtBlock());
  const acts = $('#onbActs'); acts.innerHTML = '';
  for (const [label, fn, solid] of s.acts) {
    const b = document.createElement('button'); b.className = 'btn' + (solid ? ' solid' : ''); b.textContent = label; b.onclick = fn; acts.append(b);
  }
  document.querySelectorAll('.onb-bars i').forEach((el, k) => el.classList.toggle('on', k <= i));
  $('#onbBack').disabled = i === 0;
  $('#onbNext').textContent = i === STEPS.length - 1 ? T.onboarding.done : T.onboarding.next;
}

/* Solo opacidad (sin desplazamiento en Y): entra con power2.out (arranca rápido y se asienta), sale con power2.in.
   expo.inOut se queda casi en 0 y salta al final: sobre un fade se lee brusco, así que aquí no se usa. */
const fade = (el, to, dur, ease, done) => gsap.to(el, { opacity:to, duration:reduced ? 0 : dur, ease, overwrite:true, onComplete:done });
// Cambio de paso: el contenido se desvanece, se intercambia y reaparece (la tarjeta y su alto no se tocan)
function go(n){
  i = n;
  fade(body, 0, .18, 'power2.in', () => { render(); fade(body, 1, .5, 'power2.out'); });
}

export const onboardingOpen = () => !card.hidden;
function openOnboarding(){
  if (exportOpen()) closeExport(); // exclusión mutua con la card de exportación (ocupan el mismo sitio)
  if (shotEditorOpen()) closeShotEditor(); // ...y con el editor de cinemática
  i = 0; render(); gsap.set(body, { opacity:1 }); card.hidden = false; $('#onbHelp').setAttribute('aria-expanded', 'true'); // estado ON del botón del rail
  gsap.set(card, { opacity:0 }); fade(card, 1, .6, 'power2.out');
}
// mark:false = cierre por exclusión mutua (no cuenta como «visto»)
export function closeOnboarding({ mark:m = true } = {}){
  if (m) mark();
  $('#onbHelp').setAttribute('aria-expanded', 'false');
  fade(card, 0, .3, 'power2.in', () => { card.hidden = true; });
}
const close = () => closeOnboarding();

$('#onbNext').onclick = () => { if (i === STEPS.length - 1) close(); else go(i + 1); };
$('#onbBack').onclick = () => { if (i > 0) go(i - 1); };
$('#onbSkip').onclick = close;
$('#onbHelp').onclick = () => card.hidden ? openOnboarding() : close();
addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden) close(); });
icons();

export const showFirstTime = () => { if (!seen()) openOnboarding(); };
