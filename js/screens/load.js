import { $, toast } from '../core/utils.js';
import { T } from '../core/strings.js';
import { P } from '../core/params.js';
import { screenMat } from '../three/screen.js';
import { addItem, clearCar, cur, goTo, items, maxTex, setCur, setNextIdx, setSel } from './carousel.js';
import { refreshEdit } from '../ui/pane.js';
import { addShot, renderStrip, togglePres } from '../ui/strips.js';
import { applyEdit, syncScreens } from './store.js';
import { toggleDock } from '../ui/dockToggle.js';

/* ───────────────────────── Carga: input, drag & drop, pegar ───────────────────────── */
function fitToMax(img){
  const w = img.naturalWidth, h = img.naturalHeight, lim = Math.min(maxTex, 8192);
  if (w <= lim && h <= lim) return img;
  const k = lim / Math.max(w, h), c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
}
export const loadFiles = list => loadBlobs(list);
/* Límites de carga (exportados para poder bajarlos en tests). Más allá de esto el navegador se arrastra o falla. */
const LOAD_LIMITS = { maxBytes: 200 * 1024 * 1024, heavyPixels: 3840 * 2160, heavySeconds: 60, videoTimeout: 20000 };
const mb = b => (b / 1048576) | 0;
// Lee un video: devuelve { v } listo o { error }. Un códec no soportado dispara onerror o deja videoWidth/Height en 0.
function readVideo(url){
  return new Promise(res => {
    const v = document.createElement('video'); Object.assign(v, { src:url, muted:true, loop:true, playsInline:true, crossOrigin:'anonymous' });
    const t = setTimeout(() => res({ error:T.load.videoTimeout }), LOAD_LIMITS.videoTimeout);
    v.onloadeddata = () => { clearTimeout(t); res(v.videoWidth && v.videoHeight ? { v } : { error:T.load.videoNoSize }); };
    v.onerror = () => { clearTimeout(t); res({ error:T.load.videoCodec }); };
  });
}
/* Carga Blobs/Files como pantallas. states[i] (opcional) = { id, stored, name, fit, zoom, offX, offY, scroll, autoScroll } para restaurar
   desde IndexedDB o un proyecto. opts: { replace } fuerza reemplazar (o no) en vez de P.car.replaceAll; { silent } sin toasts. Devuelve cuántas cargó.
   Un archivo que falla NO aborta el resto: se omite con su motivo y el aviso final resume («3 cargadas, 1 omitida: …»). */
export async function loadBlobs(list, states = [], opts = {}){
  const all = [...list].map((f, i) => ({ f, st:states[i] || null }));
  const skipped = [], heavy = [];   // [{ name, why }] · nombres de videos pesados
  const entries = [];
  for (const e of all) {
    const name = e.f.name || e.st?.name || T.common.screen;
    if (!/^(image|video)\//.test(e.f.type)) skipped.push({ name, why:T.load.badType });
    // lo ya guardado en IndexedDB (st.stored) se restaura siempre, sin tope de tamaño
    else if (e.f.size > LOAD_LIMITS.maxBytes && !e.st?.stored) skipped.push({ name, why:T.load.tooBig(mb(e.f.size), mb(LOAD_LIMITS.maxBytes)) });
    else entries.push(e);
  }
  const replace = opts.replace ?? P.car.replaceAll;
  let firstNew = items.length;
  for (const { f, st } of entries) {
    const url = URL.createObjectURL(f), name = f.name || st?.name || T.common.screenName, ex = { blob:f, id:st?.id, stored:!!st?.stored };
    let it = null;
    try {
      if (f.type.startsWith('video/')) {
        const { v, error } = await readVideo(url);
        if (error) skipped.push({ name, why:error });
        else {
          v.play().catch(() => {});
          if (v.videoWidth * v.videoHeight > LOAD_LIMITS.heavyPixels || (isFinite(v.duration) && v.duration > LOAD_LIMITS.heavySeconds)) heavy.push(name);
          it = addItem(v, name, ex);
        }
      } else {
        const img = new Image(); img.src = url;
        try { await img.decode(); it = addItem(fitToMax(img), name, { ...ex, thumb:url }); }
        catch { skipped.push({ name, why:T.load.badImage }); }
      }
    } catch (err) { skipped.push({ name, why:err?.message || T.load.failed }); }
    if (it && st) applyEdit(it, st);   // encuadre guardado
    if (!it) URL.revokeObjectURL(url);
  }
  if (items.length > firstNew && replace) {   // Replace all: se descartan las anteriores solo si algo nuevo cargó bien
    for (const it of items.splice(0, firstNew)) { it.tex.dispose(); if (it.isVideo) it.src.pause(); }
    clearCar(); setNextIdx(-1); screenMat.uniforms.uProgress.value = 0; setCur(0); firstNew = 0;
  }
  const n = items.length - firstNew;
  if (n > 0) { setSel(firstNew); renderStrip(); refreshEdit(); goTo(firstNew); syncScreens(); }
  if (!opts.silent) {
    const parts = [];
    if (n > 0) parts.push(T.load.loaded(n));
    if (skipped.length) parts.push(T.load.skipped(skipped));
    if (heavy.length) parts.push(T.load.heavy(heavy));
    if (parts.length) toast(T.load.join(parts), skipped.length || heavy.length ? 6000 : 2200);
  }
  return n;
}
let dragN = 0;
addEventListener('dragenter', e => { e.preventDefault(); dragN++; $('#drop').classList.add('on'); });
addEventListener('dragleave', () => { if (--dragN <= 0) { dragN = 0; $('#drop').classList.remove('on'); } });
addEventListener('dragover', e => e.preventDefault());
addEventListener('drop', e => { e.preventDefault(); dragN = 0; $('#drop').classList.remove('on'); loadFiles(e.dataTransfer.files); });
addEventListener('paste', e => { const f = [...(e.clipboardData?.files || [])]; if (f.length) loadFiles(f); });

/* Atajos: Espacio = presentación, S = guardar toma, ←/→ = pantallas */
addEventListener('keydown', e => {
  if (e.target.closest('input, textarea, .tp-dfwv')) return;
  if (e.ctrlKey || e.metaKey || e.altKey) return; // Ctrl/Cmd/Alt+tecla = atajos del navegador (p. ej. Ctrl+S), no los nuestros
  if (e.code === 'Space') {
    if (e.target.closest('button')) return; // en un botón, Espacio ya hace su click: no disparar además la presentación
    e.preventDefault(); togglePres();
  }
  else if (e.key === 'd' || e.key === 'D') toggleDock();
  else if (e.key === 's' || e.key === 'S') addShot();
  else if (e.key === 'ArrowRight') goTo(cur + 1);
  else if (e.key === 'ArrowLeft') goTo(cur - 1);
});
