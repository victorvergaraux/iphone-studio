import { $, icons, reduced, toast } from '../core/utils.js';
import { T } from '../core/strings.js';
import { P } from '../core/params.js';
import { saveSoon } from '../core/persist.js';
import { hooks } from '../core/hooks.js';
import { CAM_EASES, SHOT_PRESETS, addShot, applyShotPreset, curShot, deleteShot, duplicateShot, flyTo, moveShot, playPresentation, presTL, renameShot, setShotTiming, shots, stopPresentation, updateShot } from '../three/camera.js';
import { closeOnboarding, onboardingOpen } from './onboarding.js';
import { closeExport, exportOpen } from './exportcard.js';
import { canRedo, canUndo, record, redo, subscribe, undo } from '../core/history.js';

/* ───────────────────────── Editor de cinemática ─────────────────────────
   Card flotante a la derecha del rail (mismo sitio, estilo y exclusión mutua que el onboarding y la card de exportación).
   Lista de tomas (asa de arrastre · orden · nombre · resumen), detalle de la toma seleccionada con Move / Hold / Ease propios
   (vacío = valor global) y acciones. Toda mutación pasa por las funciones centrales de camera.js (commitShots → hooks.onShotsChange);
   aquí solo se pinta y se reenvían eventos. La card se repinta desde hooks.shotEditorRefresh (lo llama strips.renderShots). */
const card = $('#shotEditor'), btn = $('#railShots'), list = $('#seList'), detail = $('#seDetail'), acts = $('#seActs');
const pad2 = n => String(n).padStart(2, '0');
const fade = (el, to, dur, ease, done) => gsap.to(el, { opacity:to, duration:reduced ? 0 : dur, ease, overwrite:true, onComplete:done });
const mk = (tag, cls, txt) => { const e = document.createElement(tag); if (cls) e.className = cls; if (txt !== undefined) e.textContent = txt; return e; };
const secs = v => `${(+v).toFixed(1)}s`;

let editing = -1;            // índice de la toma en edición de nombre (-1 = ninguna)
let sig = '';                // firma del contenido de la lista: solo se reconstruye el DOM cuando cambia (no al cambiar de selección)
let lastSel = -2;

/* ── Detalle (alto fijo): pestañas «Toma» (overrides de la toma seleccionada) y «Global» (ritmo de toda la cinemática) ──
   Move y Hold son sliders (mismos rangos que tenía el panel: Move 0–8 s con 0 = corte seco, Hold 0–6 s). En «Toma» un slider sin
   override muestra el valor global (atenuado); al moverlo se fija el override y «Global» lo quita. El cambio se confirma al soltar. */
let tab = 'shot';
const fmtMove = v => (+v < 0.01 ? T.editor.corte : secs(v));
const fields = {}, gfields = {};
const tabsEl = mk('div', 'exp-seg se-tabs'); tabsEl.setAttribute('role', 'group'); tabsEl.setAttribute('aria-label', T.editor.tabsAria);
const tabBtns = {};
for (const [k, l] of [['shot', T.common.shot], ['global', T.common.global]]) { const b = mk('button', '', l); b.type = 'button'; b.onclick = () => { tab = k; syncDetail(); }; tabsEl.append(b); tabBtns[k] = b; }
function sliderCtl(id, label, min, max, step, fmt, onInput, onChange){
  const wrap = mk('div', 'exp-sl'), rng = mk('input', 'exp-rng'), val = mk('output', 'se-val');
  rng.type = 'range'; rng.min = min; rng.max = max; rng.step = step; rng.id = id; rng.setAttribute('aria-label', label);
  rng.oninput = () => { val.textContent = fmt(rng.value); onInput?.(+rng.value); };
  rng.onchange = () => onChange(+rng.value);
  wrap.append(rng, val); return { wrap, rng, val };
}
function row2(label, ctl, extra){
  const r = mk('div', 'se-row2' + (extra ? '' : ' nog')), l = mk('span', 'exp-lbl', label);
  r.append(l, ctl); if (extra) r.append(extra); return r;
}
const globBtn = (label, key) => { const g = mk('button', 'se-b se-g', T.common.global); g.type = 'button'; g.setAttribute('aria-label', T.editor.globalAria(label)); g.onclick = () => { if (curShot >= 0) setShotTiming(curShot, { [key]:null }); }; return g; };
const switchCtl = (id, label, get, set) => {
  const b = mk('button', 'se-tgl'); b.type = 'button'; b.id = id; b.setAttribute('role', 'switch'); b.setAttribute('aria-label', label);
  b.innerHTML = '<span class="se-track"><i></i></span>';
  b.onclick = () => { set(!get()); saveSoon(); record(T.history.adjust(label), { key:`shots/${label}`, last:true }); refresh(); };
  return b;
};
{
  // Toma: Move · Hold · Ease propios
  const body = mk('div', 'se-dbody'); body.id = 'seDBody';
  for (const [key, label, max, step] of [['move', 'Move', 8, 0.05], ['hold', 'Hold', 6, 0.1]]) {
    const c = sliderCtl(`se-${key}`, label, 0, max, step, key === 'move' ? fmtMove : secs, null, v => { if (curShot >= 0) setShotTiming(curShot, { [key]:v }); });
    const g = globBtn(label, key); fields[key] = { ...c, g }; body.append(row2(label, c.wrap, g));
  }
  const easeSel = mk('select', 'se-sel'); easeSel.id = 'se-ease'; easeSel.setAttribute('aria-label', 'Ease');
  easeSel.onchange = () => { if (curShot >= 0) setShotTiming(curShot, { ease:easeSel.value || null }); };
  const eg = globBtn('Ease', 'ease'); fields.ease = { inp:easeSel, g:eg }; body.append(row2('Ease', easeSel, eg));
  // Global: ritmo de toda la cinemática (antes vivía en la carpeta Shots del panel avanzado)
  const gbody = mk('div', 'se-dbody'); gbody.id = 'seGBody';
  for (const [key, label, max, step] of [['transition', 'Move', 8, 0.05], ['hold', 'Hold', 6, 0.1]]) {
    const c = sliderCtl(`se-g-${key}`, T.editor.sliderGlobalAria(label), 0, max, step, key === 'transition' ? fmtMove : secs, v => { P.shots[key] = v; },
      v => { P.shots[key] = v; saveSoon(); record(T.history.adjust(label), { key:`shots/${key}`, last:true }); refresh(); });
    gfields[key] = c; gbody.append(row2(label, c.wrap));
  }
  gfields.loop = switchCtl('se-g-loop', 'Loop', () => P.shots.loop, v => { P.shots.loop = v; });
  gfields.random = switchCtl('se-g-random', 'Random', () => P.shots.randomHalf, v => { P.shots.randomHalf = v; });
  gbody.append(row2('Loop', gfields.loop));
  const cnt = mk('div', 'exp-seg se-count2'); cnt.setAttribute('role', 'group'); cnt.setAttribute('aria-label', T.editor.halfAria);
  gfields.count = [1, 2].map(n => { const b = mk('button', '', String(n)); b.type = 'button'; b.onclick = () => { P.shots.halfCount = n; saveSoon(); record(T.history.adjust('Count'), { key:'shots/halfCount', last:true }); refresh(); }; cnt.append(b); return [b, n]; });
  const rr = mk('div', 'se-row2 nog'), rl = mk('span', 'exp-lbl', 'Random'), rc = mk('div', 'se-rand'); rc.append(gfields.random, cnt); rr.append(rl, rc);
  gbody.append(rr);
  const head = mk('div', 'se-dhead'); head.id = 'seDHead';
  const wrap = mk('div', 'se-dwrap'); wrap.append(body, gbody);
  detail.append(tabsEl, head, wrap);
}
const easeSel = fields.ease.inp;
const globalEaseKey = () => Object.keys(CAM_EASES).find(k => CAM_EASES[k] === P.cam.ease) || P.cam.ease;
function syncDetail(){
  const s = shots[curShot], on = !!s, isShot = tab === 'shot';
  for (const [k, b] of Object.entries(tabBtns)) b.setAttribute('aria-pressed', String(k === tab));
  const dh = $('#seDHead'), db = $('#seDBody'), gb = $('#seGBody');
  dh.textContent = isShot ? (on ? T.shot.tagName(curShot + 1, s.name) : T.editor.headPick) : T.editor.headAll;
  db.hidden = !isShot; gb.hidden = isShot;
  db.toggleAttribute('inert', !on); db.classList.toggle('dis', !on);
  // opciones del ease: «Global (X)» + las claves de CAM_EASES
  const opts = [['', T.editor.easeGlobal(globalEaseKey())], ...Object.entries(CAM_EASES).map(([k, v]) => [v, k])]; // [valor, texto]
  if (easeSel.options.length !== opts.length || opts[0][1] !== easeSel.options[0].textContent) {
    easeSel.innerHTML = ''; for (const [v, t] of opts) { const o = mk('option', '', t); o.value = v; easeSel.append(o); }
  }
  const glob = { move:P.shots.transition, hold:P.shots.hold };
  for (const k of ['move', 'hold']) {
    const f = fields[k], own = on && s[k] !== undefined, v = own ? s[k] : glob[k];
    f.rng.value = v; f.val.textContent = (k === 'move' ? fmtMove : secs)(v); f.wrap.classList.toggle('glob', !own); f.g.disabled = !own;
  }
  easeSel.value = on && s.ease ? s.ease : ''; fields.ease.g.disabled = !(on && s.ease);
  // global
  for (const key of ['transition', 'hold']) { const c = gfields[key]; c.rng.value = P.shots[key]; c.val.textContent = (key === 'transition' ? fmtMove : secs)(P.shots[key]); }
  gfields.loop.setAttribute('aria-checked', String(!!P.shots.loop)); gfields.random.setAttribute('aria-checked', String(!!P.shots.randomHalf));
  for (const [b, n] of gfields.count) { b.setAttribute('aria-pressed', String(P.shots.halfCount === n)); b.disabled = !P.shots.randomHalf; }
  if (lastSel !== curShot) { lastSel = curShot; if (on && isShot) { gsap.set(db, { opacity:.25 }); fade(db, 1, .5, 'power2.out'); } }
}

/* ── Acciones ── */
const A = {};
// Copiar JSON: lista de tomas (mismo formato que el proyecto: p, t, fov, name y overrides move/hold/ease) al portapapeles
async function copyJson(){
  const json = JSON.stringify(shots.map(({ p, t, fov, name, move, hold, ease }) => ({ p, t, fov, name, move, hold, ease })), null, 2); // JSON.stringify omite los undefined
  try { await navigator.clipboard.writeText(json); }
  catch { const ta = Object.assign(document.createElement('textarea'), { value:json }); document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove(); }
  toast(T.shot.jsonCopied(shots.length));
}
function act(id, label, fn, cls = ''){ const b = mk('button', 'se-b ' + cls, label); b.type = 'button'; b.id = `se-${id}`; b.onclick = fn; A[id] = b; return b; }
acts.append(
  act('play', '', () => { presTL ? stopPresentation() : playPresentation(); }, 'se-wide se-play'),
  act('save', T.editor.saveCam, () => addShot(), 'solid se-wide'),
  act('upd', T.editor.update, () => updateShot()),
  act('dup', T.editor.duplicate, () => duplicateShot()),
  act('ren', T.editor.rename, () => curShot >= 0 && startEdit(curShot)),
  act('del', T.editor.remove, () => deleteShot()),
  act('up', T.editor.up, () => moveShot(curShot, curShot - 1)),
  act('down', T.editor.down, () => moveShot(curShot, curShot + 1)),
  act('json', T.editor.copyJson, copyJson, 'se-wide2'),
);
{ // Preset: selector (el mismo P.shots.preset del panel) + cargar
  const r = mk('div', 'se-preset'), sel = mk('select', 'se-sel'); sel.id = 'se-presetSel'; sel.setAttribute('aria-label', 'Preset');
  for (const [k, v] of Object.entries(SHOT_PRESETS)) { const o = mk('option', '', v.label); o.value = k; sel.append(o); }
  sel.onchange = () => { P.shots.preset = sel.value; saveSoon(); hooks.refreshPane?.(); };
  A.presetSel = sel;
  r.append(sel, act('preset', T.common.load, () => { sel.value = P.shots.preset; applyShotPreset(); })); acts.append(r);
}
// Play / stop de la cinemática dentro de la card: mismo estado que el botón del rail (strips.setPlayBtn avisa por hooks.shotEditorPlay)
function syncPlay(on){
  const b = A.play; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on));
  b.innerHTML = `<i data-lucide="${on ? 'square' : 'clapperboard'}"></i><span></span>`; b.querySelector('span').textContent = on ? T.rail.stopAria : T.rail.playAria; icons();
}
hooks.shotEditorPlay = syncPlay; syncPlay(!!presTL);
function syncActs(){
  const on = !!shots[curShot];
  for (const k of ['upd', 'dup', 'ren', 'del']) A[k].disabled = !on;
  A.up.disabled = !on || curShot <= 0; A.down.disabled = !on || curShot >= shots.length - 1;
  if (A.presetSel.value !== P.shots.preset) A.presetSel.value = P.shots.preset;
}

/* ── Lista ── */
function startEdit(i){ editing = i; sig = ''; refresh(); const inp = list.querySelector('.se-edit'); inp?.focus(); inp?.select(); }
function summary(s){
  const mv = s.move, hd = s.hold;
  return `FOV ${s.fov.toFixed(0)} · Move ${secs(mv ?? P.shots.transition)}${mv !== undefined ? '*' : ''} · Hold ${secs(hd ?? P.shots.hold)}${hd !== undefined ? '*' : ''}${s.ease ? ' · ' + (Object.keys(CAM_EASES).find(k => CAM_EASES[k] === s.ease) || '') : ''}`;
}
function rowEl(s, i){
  const r = mk('div', 'se-row'); r.setAttribute('role', 'listitem'); r.dataset.i = i;
  const grip = mk('button', 'se-grip'); grip.type = 'button'; grip.innerHTML = '<i data-lucide="grip-vertical"></i>';
  grip.setAttribute('aria-label', T.editor.gripAria(i + 1));
  grip.onpointerdown = e => dragStart(e, i, r);
  grip.onkeydown = e => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); const n = i + (e.key === 'ArrowUp' ? -1 : 1); if (moveShot(i, n)) list.querySelector(`.se-row[data-i="${n}"] .se-grip`)?.focus(); /* tras reconstruir la lista el foco vuelve al asa de la toma movida */ }
  };
  const ord = mk('span', 'se-ord', pad2(i + 1));
  let main;
  if (editing === i) {
    main = mk('input', 'se-edit'); main.value = s.name || ''; main.placeholder = `T${pad2(i + 1)}`; main.maxLength = 40; main.setAttribute('aria-label', T.editor.nameAria(i + 1));
    let done = false;
    const end = commit => { if (done) return; done = true; editing = -1; if (commit) renameShot(i, main.value); sig = ''; refresh(); };
    main.onkeydown = e => { e.stopPropagation(); if (e.key === 'Enter') end(true); else if (e.key === 'Escape') end(false); };
    main.onblur = () => end(true);
  } else {
    main = mk('button', 'se-main'); main.type = 'button';
    main.append(mk('span', 'se-nm', s.name || T.shot.defaultName(i + 1)), mk('span', 'se-sum', summary(s)));
    main.onclick = () => flyTo(i);
    main.ondblclick = () => startEdit(i);
  }
  r.append(grip, ord, main); return r;
}
/* Arrastrar con puntero desde el asa: la fila se atenúa y una marca indica dónde caerá; al soltar se llama a moveShot */
let drag = null;
function dragStart(e, from, row){
  if (e.button !== 0) return; e.preventDefault();
  drag = { from, to:from, row }; row.classList.add('drag');
  const mv = ev => {
    const rows = [...list.querySelectorAll('.se-row')];
    const t = rows.filter(r => { const b = r.getBoundingClientRect(); return b.top + b.height / 2 < ev.clientY; }).length; // posición de inserción 0..n
    drag.to = t > from ? t - 1 : t;
    rows.forEach((r, k) => { r.classList.toggle('ins-b', k === t); r.classList.toggle('ins-a', t === rows.length && k === rows.length - 1); });
  };
  const up = ev => {
    removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up);
    const d = drag; drag = null; d.row.classList.remove('drag'); list.querySelectorAll('.ins-a,.ins-b').forEach(r => r.classList.remove('ins-a', 'ins-b'));
    if (ev.type === 'pointerup' && d.to !== d.from) moveShot(d.from, d.to);
  };
  addEventListener('pointermove', mv); addEventListener('pointerup', up); addEventListener('pointercancel', up);
}

function refresh(){
  $('#seCount').textContent = pad2(shots.length);
  const s = JSON.stringify([editing, shots.map(x => [x.name, x.fov, x.move, x.hold, x.ease, P.shots.transition, P.shots.hold])]);
  if (s !== sig) {
    sig = s; list.innerHTML = '';
    if (!shots.length) list.append(mk('p', 'se-empty', T.editor.empty));
    shots.forEach((x, i) => list.append(rowEl(x, i)));
    icons();
  }
  list.querySelectorAll('.se-row').forEach((r, i) => { const on = i === curShot; r.classList.toggle('on', on); if (on) r.setAttribute('aria-current', 'true'); else r.removeAttribute('aria-current'); });
  syncDetail(); syncActs();
}
hooks.shotEditorRefresh = () => { if (!card.hidden) refresh(); };

/* ── Abrir / cerrar (misma mecánica que la card de exportación) ── */
export const shotEditorOpen = () => !card.hidden;
function openShotEditor(){
  if (onboardingOpen()) closeOnboarding({ mark:false }); // exclusión mutua: el onboarding no se marca como visto
  if (exportOpen()) closeExport();
  if (!card.hidden) return;
  sig = ''; lastSel = -2; editing = -1; refresh();
  card.hidden = false; btn.setAttribute('aria-expanded', 'true');
  gsap.set(card, { opacity:0 }); fade(card, 1, .6, 'power2.out');
}
export function closeShotEditor(){
  if (card.hidden) return;
  btn.setAttribute('aria-expanded', 'false');
  fade(card, 0, .3, 'power2.in', () => { card.hidden = true; });
}
btn.onclick = () => btn.getAttribute('aria-expanded') === 'true' ? closeShotEditor() : openShotEditor();
$('#seClose').onclick = closeShotEditor;
addEventListener('keydown', e => { if (e.key === 'Escape' && !card.hidden && editing < 0) closeShotEditor(); });
// Los atajos globales (S = guardar toma, Espacio = presentación…) no deben dispararse al teclear en un select de la card
card.addEventListener('keydown', e => { if (e.target.closest('select') && e.key !== 'Escape') e.stopPropagation(); });

/* ── Deshacer / rehacer: dos botones icono junto a «Cerrar»; se habilitan según la pila (core/history.js). Solo cambia la opacidad ── */
{
  const mkIco = (id, icon, label, tip, fn) => {
    const b = mk('button', 'se-ico'); b.type = 'button'; b.id = id; b.dataset.tip = tip; b.setAttribute('aria-label', label);
    b.innerHTML = `<i data-lucide="${icon}"></i>`; b.onclick = fn; return b;
  };
  const bu = mkIco('seUndo', 'undo-2', T.common.undo, T.editor.undoTip, () => undo()), br = mkIco('seRedo', 'redo-2', T.common.redo, T.editor.redoTip, () => redo());
  $('#seClose').before(bu, br); icons();
  const sync = () => { bu.disabled = !canUndo(); br.disabled = !canRedo(); };
  subscribe(sync); sync();
}
