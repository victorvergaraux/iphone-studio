import { $, icons, toast } from '../core/utils.js';
import { T } from '../core/strings.js';
import { P } from '../core/params.js';
import { saveSoon } from '../core/persist.js';
import { screenMat } from '../three/screen.js';
import { carPlaying, clearCar, cur, goTo, items, nextIdx, scheduleCar, sel, setCarPlaying, setCur, setNextIdx, setSel } from '../screens/carousel.js';
import { playPresentation, presTL, stopPresentation } from '../three/camera.js';
import { refreshEdit } from './pane.js';
import { loadFiles } from '../screens/load.js';
import { hooks } from '../core/hooks.js';
import { syncScreens } from '../screens/store.js';

/* ───────────────────────── UI: strips ───────────────────────── */
export function renderStrip(){
  const el = $('#strip'); el.innerHTML = '';
  items.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'thumb' + (i === (nextIdx >= 0 ? nextIdx : cur) ? ' cur' : '') + (i === sel ? ' sel' : '');
    b.setAttribute('aria-label', T.rail.screenAria(i + 1, it.name));
    if (it.thumb) { const im = document.createElement('img'); im.src = it.thumb; im.alt = ''; b.append(im); }
    else { const v = document.createElement('span'); v.className = 'vid'; v.textContent = T.rail.videoBadge; b.append(v); }
    b.onclick = () => { setSel(i); refreshEdit(); goTo(i); };
    el.append(b);
  });
  $('#scrCount').textContent = String(items.length).padStart(2, '0');
}
// Las tomas ya no se listan en el panel avanzado: solo se guarda y se avisa a la card «Cinemática» para que se repinte
export function renderShots(){
  saveSoon(); hooks.shotEditorRefresh?.();
}
// Operaciones de tomas: viven en camera.js (todas pasan por commitShots y avisan a hooks.onShotsChange); se reexportan aquí para el panel, el onboarding y los atajos
export { addShot } from '../three/camera.js';
export function togglePres(){ presTL ? stopPresentation() : playPresentation(); }
function setPlayBtn(on){
  // Botón de cinemática del rail (claqueta, para no confundirlo con el play del carrusel): mismo estado (ON = tintado + icono de stop), sincronizado desde aquí
  const r = $('#railPlay'); if (!r) return;
  r.setAttribute('aria-pressed', String(!!on)); r.dataset.tip = on ? T.rail.stopTip : T.rail.playTip; r.setAttribute('aria-label', on ? T.rail.stopAria : T.rail.playAria);
  r.innerHTML = `<i data-lucide="${on ? 'square' : 'clapperboard'}"></i>`; icons();
  hooks.shotEditorPlay?.(!!on); // botón «Reproducir cinemática» de la card
}
$('#railPlay')?.addEventListener('click', togglePres);
export function setCarBtn(){ $('#scrPlay').innerHTML = `<i data-lucide="${carPlaying ? 'pause' : 'play'}"></i>`; $('#scrPlay').setAttribute('aria-label', carPlaying ? T.rail.pauseCar : T.rail.resumeCar); icons(); }

$('#scrPlay').onclick = () => { setCarPlaying(!carPlaying); setCarBtn(); scheduleCar(); };
$('#scrAdd').onclick = () => $('#file').click();
// Toggle persistente (P.car.replaceAll): Cargar reemplaza todas las pantallas en vez de agregar
export function syncReplace(){ const b = $('#scrReplace'); b.classList.toggle('on', P.car.replaceAll); b.setAttribute('aria-checked', String(P.car.replaceAll)); }
$('#scrReplace').onclick = () => { P.car.replaceAll = !P.car.replaceAll; syncReplace(); saveSoon(); };
syncReplace();
$('#file').onchange = e => { loadFiles(e.target.files); e.target.value = ''; };
$('#scrDel').onclick = () => {
  if (items.length <= 1) return toast(T.rail.keepOne);
  const [it] = items.splice(sel, 1); it.tex.dispose(); if (it.isVideo) it.src.pause();
  clearCar(); setNextIdx(-1); screenMat.uniforms.uProgress.value = 0;
  setCur(Math.min(cur, items.length - 1)); setSel(Math.min(sel, items.length - 1));
  renderStrip(); refreshEdit(); scheduleCar(); syncScreens();
};
function move(dir){
  const j = sel + dir; if (j < 0 || j >= items.length || nextIdx >= 0) return;
  [items[sel], items[j]] = [items[j], items[sel]];
  if (cur === sel) setCur(j); else if (cur === j) setCur(sel);
  setSel(j); renderStrip(); syncScreens();
}
$('#scrLeft').onclick = () => move(-1); $('#scrRight').onclick = () => move(1);

hooks.renderStrip = renderStrip;
hooks.renderShots = renderShots;
hooks.setPlayBtn = setPlayBtn;
