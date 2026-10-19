import { $, DUR, EASE, reduced } from '../core/utils.js';
import { T } from '../core/strings.js';
import { P } from '../core/params.js';
import { saveSoon } from '../core/persist.js';
import { catcher } from '../three/scene.js';
import { FORMATS, exportSize } from '../three/formats.js';
import { layout } from '../three/frame.js';
import { presentationLength, shots } from '../three/camera.js';
import { snapshot } from '../export/export.js';
import { startRecording } from '../export/offline.js';
import { closeOnboarding, onboardingOpen } from './onboarding.js';
import { closeShotEditor, shotEditorOpen } from './shoteditor.js';

/* ───────────────────────── Card de exportación ─────────────────────────
   Flota a la derecha del rail (mismo sitio y estilo que el onboarding). Esencial siempre visible:
   formato · tamaño · lectura de salida · PNG | Video · duración · botón principal.
   «Más ajustes» (colapsable) guarda lo fino. Todo se escribe en P.exp (se guarda y exporta con el proyecto);
   el tipo PNG | Video también (P.exp.kind). Alto fijo entre PNG y Video: los dos paneles de «Más» comparten celda. */
const card = $('#expCard'), btn = $('#railExport'), go = $('#expGo');
let shown = 'png'; // tipo mostrado ahora (solo para animar el cambio); la fuente de verdad es P.exp.kind ('png' | 'video')
const syncs = []; // funciones que releen P.exp y repintan sus controles

// Solo opacidad (sin movimiento en Y), igual que el onboarding: entra power2.out, sale power2.in
const fade = (el, to, dur, ease, done) => gsap.to(el, { opacity:to, duration:reduced ? 0 : dur, ease, overwrite:true, onComplete:done });

/* ── Constructores de controles ── */
// Grupo de segmentos: botones reales con aria-pressed; set() recibe el valor de la opción
function seg(opts, get, set){
  const el = document.createElement('div'); el.className = 'exp-seg'; el.setAttribute('role', 'group');
  const bs = opts.map(([label, value]) => {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = label;
    b.onclick = () => { set(value); sync(); }; el.append(b); return [b, value];
  });
  const sync = () => { const v = get(); for (const [b, val] of bs) b.setAttribute('aria-pressed', String(val === v)); };
  syncs.push(sync); sync();
  return el;
}
function row(parent, label, control, cls = ''){
  const r = document.createElement('div'); r.className = 'exp-row ' + cls;
  const l = document.createElement('span'); l.className = 'exp-lbl'; l.textContent = label;
  r.append(l, control); parent.append(r); return r;
}
// Cambia un valor de P.exp, lo persiste y ejecuta efectos extra
const setP = (key, after) => v => { P.exp[key] = v; saveSoon(); after?.(); info(); };
const seg1 = (key, opts, after) => seg(opts, () => P.exp[key], setP(key, after));
const YN = [[T.exportCard.no, false], [T.exportCard.yes, true]];

/* ── Lectura de salida ── */
const size = $('#expSize');
const readout = () => { const [w, h] = exportSize(); size.textContent = `${w}×${h}`; };
const onGeom = () => { layout(); readout(); };
addEventListener('resize', readout); // «Pantalla» depende de la ventana

/* Info bajo la lectura: 2 líneas con alto reservado (solo cambia visibility) para que PNG ↔ Video no mueva la card.
   · Video: tamaño estimado (mbps × duración / 8) y número de cuadros (duración × fps).
   · Formato «Pantalla»: aviso de que el ratio depende de la ventana. */
const outBox = size.parentElement;
const mkNote = () => { const s = document.createElement('span'); s.className = 'exp-note'; outBox.append(s); return s; };
const noteVid = mkNote(), noteFmt = mkNote();
// Duración efectiva del video: igual que startRecording (0 = «Shots» → largo de la presentación, o 15 s sin tomas)
const videoLen = () => P.exp.length || (P.exp.playShots && shots.length > 0 ? presentationLength() : 15);
function info(){
  const len = videoLen(), mb = P.exp.mbps * len / 8, frames = Math.round(len * P.exp.fps);
  noteVid.textContent = T.exportCard.videoNote(mb < 10 ? mb.toFixed(1) : Math.round(mb), frames);
  noteVid.style.visibility = P.exp.kind === 'video' ? 'visible' : 'hidden';
  noteFmt.textContent = T.exportCard.screenNote;
  noteFmt.style.visibility = P.exp.format === 'Pantalla' ? 'visible' : 'hidden';
}

/* ── Esencial ── */
const main = $('#expMain');
row(main, T.common.format, seg1('format', Object.keys(FORMATS).map(k => [k, k]), onGeom), 'wide');
row(main, T.exportCard.size, seg1('long', [['HD', 1280], ['FHD', 1920], ['QHD', 2560], ['4K', 3840]], onGeom));
row(main, T.exportCard.kind, seg([['PNG', 'png'], ['Video', 'video']], () => P.exp.kind, v => setKind(v)));
const durRow = row(main, T.exportCard.duration, seg1('length', [['15 s', 15], ['30 s', 30], ['Shots', 0]]));

/* ── Más ajustes ── */
const vid = $('#expVid'), png = $('#expPng');
row(vid, 'FPS', seg1('fps', [['30', 30], ['60', 60]]));
row(vid, 'Mbps', seg1('mbps', [['6', 6], ['16', 16], ['40', 40]]));
row(vid, 'Codec', seg1('container', [['Auto', 'auto'], ['MP4', 'mp4'], ['WebM', 'webm']]));
row(vid, T.exportCard.mode, seg1('mode', [['Offline', 'offline'], ['Realtime', 'realtime']]));
row(vid, 'Shots', seg1('playShots', YN));
row(png, T.exportCard.scale, seg1('pngScale', [['1×', 1], ['2×', 2]]));
row(png, 'Alpha', seg1('transparent', YN, () => syncShadow()));
// Sombra: slider 0–1; actualiza el catcher en vivo como hacía el panel
const rng = document.createElement('input'); rng.type = 'range'; rng.min = 0; rng.max = 1; rng.step = .01; rng.className = 'exp-rng'; rng.setAttribute('aria-label', T.common.shadow);
const rv = document.createElement('output'); rv.className = 'exp-val';
const shade = () => { rng.value = P.exp.shadowOpacity; rv.textContent = Math.round(P.exp.shadowOpacity * 100) + '%'; };
rng.oninput = () => { P.exp.shadowOpacity = +rng.value; catcher.material.opacity = P.exp.shadowOpacity; shade(); saveSoon(); };
const sw = document.createElement('div'); sw.className = 'exp-sl'; sw.append(rng, rv);
const shRow = row(png, T.common.shadow, sw);
// La sombra solo se usa en el PNG transparente (plano que recibe sombra): sin Alpha el control queda deshabilitado
function syncShadow(){ const on = !!P.exp.transparent; shRow.classList.toggle('dis', !on); rng.disabled = !on; shRow.title = on ? '' : T.exportCard.shadowNeedsAlpha; }
syncs.push(shade, syncShadow); shade(); syncShadow();

/* ── Tipo PNG | Video: cambia botón, fila de duración y panel de «Más» sin mover la card ── */
const panes = { video:vid, png };
function setKind(k, instant){
  if (k !== 'png' && k !== 'video') k = 'png';
  const prev = shown; shown = k;
  if (P.exp.kind !== k) { P.exp.kind = k; saveSoon(); } // persiste el tipo
  syncs.forEach(f => f()); info();
  go.textContent = k === 'png' ? T.exportCard.capturePng : T.exportCard.renderVideo;
  durRow.classList.toggle('off', k === 'png'); // reserva su alto: solo se oculta
  durRow.toggleAttribute('inert', k === 'png');
  for (const [name, el] of Object.entries(panes)) {
    const on = name === k;
    if (instant || prev === k) { gsap.set(el, { opacity:on ? 1 : 0 }); el.classList.toggle('off', !on); el.toggleAttribute('inert', !on); continue; }
    if (on) { el.classList.remove('off'); el.removeAttribute('inert'); fade(el, 1, .5, 'power2.out'); }
    else { el.setAttribute('inert', ''); fade(el, 0, .18, 'power2.in', () => el.classList.add('off')); }
  }
}
go.onclick = () => P.exp.kind === 'png' ? snapshot() : startRecording();

/* ── Colapsable «Más ajustes»: anima alto + opacidad con el EASE/DUR del proyecto ── */
const moreT = $('#expMoreT'), moreB = $('#expMoreBody');
gsap.set(moreB, { height:0, opacity:0 });
moreT.onclick = () => {
  const open = moreT.getAttribute('aria-expanded') !== 'true';
  moreT.setAttribute('aria-expanded', String(open)); $('#expMoreI').textContent = open ? '−' : '+';
  moreB.toggleAttribute('inert', !open);
  const d = reduced ? 0 : DUR / 1000;
  gsap.to(moreB, { height:open ? moreB.scrollHeight : 0, opacity:open ? 1 : 0, duration:d, ease:EASE, overwrite:true,
    onComplete:() => { if (open) moreB.style.height = 'auto'; } });
};
moreB.setAttribute('inert', '');

/* ── Abrir / cerrar ── */
export const exportOpen = () => !card.hidden;
export function openExport(){
  if (onboardingOpen()) closeOnboarding({ mark:false }); // exclusión mutua: el onboarding no se marca como visto
  if (shotEditorOpen()) closeShotEditor(); // ...y el editor de cinemática
  if (!card.hidden) return;
  syncs.forEach(f => f()); readout(); info(); // relee P: el onboarding pudo cambiar el formato
  card.hidden = false; btn.setAttribute('aria-expanded', 'true');
  gsap.set(card, { opacity:0 }); fade(card, 1, .6, 'power2.out');
}
export function closeExport(){
  if (card.hidden) return;
  btn.setAttribute('aria-expanded', 'false');
  fade(card, 0, .3, 'power2.in', () => { card.hidden = true; });
}
btn.onclick = () => btn.getAttribute('aria-expanded') === 'true' ? closeExport() : openExport();
$('#expClose').onclick = closeExport;
addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden) closeExport(); });

setKind(P.exp.kind, true); readout();
