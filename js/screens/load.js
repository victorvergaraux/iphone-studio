import { $, toast } from '../core/utils.js';
import { addItem, cur, goTo, items, maxTex, sel, setSel } from './carousel.js';
import { refreshEdit } from '../ui/pane.js';
import { addShot, renderStrip, togglePres } from '../ui/strips.js';

/* ───────────────────────── Carga: input, drag & drop, pegar ───────────────────────── */
function fitToMax(img){
  const w = img.naturalWidth, h = img.naturalHeight, lim = Math.min(maxTex, 8192);
  if (w <= lim && h <= lim) return img;
  const k = lim / Math.max(w, h), c = document.createElement('canvas');
  c.width = Math.round(w * k); c.height = Math.round(h * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c;
}
export async function loadFiles(list){
  const files = [...list].filter(f => /^(image|video)\//.test(f.type)); if (!files.length) return toast('Formato no soportado: usa imagen o video');
  const firstNew = items.length;
  for (const f of files) {
    const url = URL.createObjectURL(f);
    if (f.type.startsWith('video/')) {
      const v = document.createElement('video'); Object.assign(v, { src:url, muted:true, loop:true, playsInline:true, crossOrigin:'anonymous' });
      await new Promise(r => { v.onloadeddata = r; v.onerror = r; }); v.play().catch(() => {});
      if (v.videoWidth) addItem(v, f.name);
    } else {
      const img = new Image(); img.src = url;
      try { await img.decode(); addItem(fitToMax(img), f.name, { thumb:url }); } catch { toast(`No se pudo leer ${f.name}`); }
    }
  }
  if (items.length > firstNew) { setSel(firstNew); renderStrip(); refreshEdit(); goTo(firstNew); toast(`${items.length - firstNew} pantalla(s) agregada(s)`); }
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
  if (e.code === 'Space') { e.preventDefault(); togglePres(); }
  else if (e.key === 's' || e.key === 'S') addShot();
  else if (e.key === 'ArrowRight') goTo(cur + 1);
  else if (e.key === 'ArrowLeft') goTo(cur - 1);
});
