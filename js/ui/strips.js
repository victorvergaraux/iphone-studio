import { $, icons, toast } from '../core/utils.js';
import { saveSoon } from '../core/persist.js';
import { screenMat } from '../three/screen.js';
import { carPlaying, clearCar, cur, goTo, items, nextIdx, scheduleCar, sel, setCarPlaying, setCur, setNextIdx, setSel } from '../screens/carousel.js';
import { curShot, flyTo, playPresentation, presTL, setCurShot, shots, snap, stopPresentation } from '../three/camera.js';
import { btnPlay, fList, refreshEdit, setShotBtns, shotBtns } from './pane.js';
import { loadFiles } from '../screens/load.js';
import { hooks } from '../core/hooks.js';

/* ───────────────────────── UI: strips ───────────────────────── */
export function renderStrip(){
  const el = $('#strip'); el.innerHTML = '';
  items.forEach((it, i) => {
    const b = document.createElement('button');
    b.className = 'thumb' + (i === (nextIdx >= 0 ? nextIdx : cur) ? ' cur' : '') + (i === sel ? ' sel' : '');
    b.setAttribute('aria-label', `Pantalla ${i + 1}: ${it.name}`);
    if (it.thumb) { const im = document.createElement('img'); im.src = it.thumb; im.alt = ''; b.append(im); }
    else { const v = document.createElement('span'); v.className = 'vid'; v.textContent = 'VIDEO'; b.append(v); }
    b.onclick = () => { setSel(i); refreshEdit(); goTo(i); };
    el.append(b);
  });
  $('#scrCount').textContent = String(items.length).padStart(2, '0');
}
const pad2 = n => String(n).padStart(2, '0');
// Lista de tomas como botones de Tweakpane: se reconstruye al cambiar (dispose + add mantiene el orden)
export function renderShots(){
  shotBtns.forEach(b => b.dispose()); setShotBtns([]);
  fList.title = `List · ${pad2(shots.length)}`;
  shots.forEach((s, i) => shotBtns.push(
    fList.addButton({ label:`FOV ${s.fov.toFixed(0)}`, title:`${i === curShot ? '● ' : ''}T${pad2(i + 1)}${s.name ? ' · ' + s.name : ''}` }).on('click', () => flyTo(i))
  ));
  saveSoon();
}
export function addShot(){ shots.push(snap()); setCurShot(shots.length - 1); renderShots(); toast(`Toma T${pad2(shots.length)} guardada`); }
export function updateShot(){
  if (curShot < 0 || !shots[curShot]) return toast('Elige una toma de la lista primero');
  shots[curShot] = { ...snap(), name:shots[curShot].name }; renderShots(); toast(`Toma T${pad2(curShot + 1)} actualizada`);
}
export function deleteShot(){
  if (curShot < 0 || !shots[curShot]) return toast('Elige una toma de la lista primero');
  stopPresentation(); const n = curShot + 1; shots.splice(curShot, 1); setCurShot(-1); renderShots(); toast(`Toma T${pad2(n)} eliminada`);
}
export function togglePres(){ presTL ? stopPresentation() : playPresentation(); }
export function setPlayBtn(on){ btnPlay.title = on ? '■ Stop  [Space]' : '▶ Play  [Space]'; }
export function setCarBtn(){ $('#scrPlay').innerHTML = `<i data-lucide="${carPlaying ? 'pause' : 'play'}"></i>`; $('#scrPlay').setAttribute('aria-label', carPlaying ? 'Pausar carrusel' : 'Reanudar carrusel'); icons(); }

$('#scrPlay').onclick = () => { setCarPlaying(!carPlaying); setCarBtn(); scheduleCar(); };
$('#scrAdd').onclick = () => $('#file').click();
$('#file').onchange = e => { loadFiles(e.target.files); e.target.value = ''; };
$('#scrDel').onclick = () => {
  if (items.length <= 1) return toast('Debe quedar al menos una pantalla');
  const [it] = items.splice(sel, 1); it.tex.dispose(); if (it.isVideo) it.src.pause();
  clearCar(); setNextIdx(-1); screenMat.uniforms.uProgress.value = 0;
  setCur(Math.min(cur, items.length - 1)); setSel(Math.min(sel, items.length - 1));
  renderStrip(); refreshEdit(); scheduleCar();
};
function move(dir){
  const j = sel + dir; if (j < 0 || j >= items.length || nextIdx >= 0) return;
  [items[sel], items[j]] = [items[j], items[sel]];
  if (cur === sel) setCur(j); else if (cur === j) setCur(sel);
  setSel(j); renderStrip();
}
$('#scrLeft').onclick = () => move(-1); $('#scrRight').onclick = () => move(1);

hooks.renderStrip = renderStrip;
hooks.renderShots = renderShots;
hooks.setPlayBtn = setPlayBtn;
