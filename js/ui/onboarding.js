import { $, icons, reduced } from '../core/utils.js';
import { applyShotPreset } from '../three/camera.js';
import { pane } from './pane.js';
import { closeExport, exportOpen, openExport } from './exportcard.js';
import { addShot, togglePres } from './strips.js';

/* ───────────────────────── Onboarding ─────────────────────────
   Tarjeta flotante de 3 pasos (Imágenes → Tomas → Exportar). Los controles arrancan colapsados, así que
   cada paso trae sus propias acciones: no hace falta abrir el panel hasta «Avanzado». Manual (Atrás / Siguiente).
   El flag vive en su propia clave de localStorage (no en P): no se exporta con el proyecto JSON. */
export const ONB_KEY = 'mockup-studio:onboarded';
const seen = () => { try { return !!localStorage.getItem(ONB_KEY); } catch { return false; } };
const mark = () => { try { localStorage.setItem(ONB_KEY, '1'); } catch {} };

const STEPS = [
  { title:'Imágenes', text:'Arrastra imágenes o video sobre la escena. También puedes pegarlos con Ctrl+V.',
    acts:[['Cargar', () => $('#file').click(), true]] },
  { title:'Tomas', text:'Mueve la cámara con el mouse y guarda cada ángulo. O parte de un preset.',
    acts:[['Guardar · S', addShot, true], ['Preset', applyShotPreset], ['Play · Space', togglePres]] },
  { title:'Exportar', text:'Elige formato y tamaño, y descarga un PNG o un video con la composición actual.',
    acts:[['Abrir exportar', () => { mark(); openExport(); }, true], ['Avanzado', () => { closeOnboarding(); pane.expanded = true; }]] },
];
let i = 0;

const card = $('#onb'), body = $('#onbBody'), pad2 = n => String(n).padStart(2, '0');
function render(){
  const s = STEPS[i];
  $('#onbNum').textContent = pad2(i + 1);
  $('#onbTitle').textContent = s.title;
  $('#onbText').textContent = s.text;
  const acts = $('#onbActs'); acts.innerHTML = '';
  for (const [label, fn, solid] of s.acts) {
    const b = document.createElement('button'); b.className = 'btn' + (solid ? ' solid' : ''); b.textContent = label; b.onclick = fn; acts.append(b);
  }
  document.querySelectorAll('.onb-bars i').forEach((el, k) => el.classList.toggle('on', k <= i));
  $('#onbBack').disabled = i === 0;
  $('#onbNext').textContent = i === STEPS.length - 1 ? 'Listo' : 'Siguiente';
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
export function openOnboarding(){
  if (exportOpen()) closeExport(); // exclusión mutua con la card de exportación (ocupan el mismo sitio)
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
