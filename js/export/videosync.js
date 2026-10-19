import { items, cur, nextIdx } from '../screens/carousel.js';

/* ── Sincronía de videos con el reloj virtual del export offline ──
   El render cuadro a cuadro avanza 1/fps por cuadro sin importar cuánto tarde la GPU, pero los <video> fuente
   seguirían reproduciéndose en tiempo real y se desfasarían. Durante el render los pausamos y, en cada cuadro,
   los posicionamos con currentTime = (tiempo virtual − tiempo virtual de activación) mod duración.
   Reloj de referencia: gsap.globalTimeline.time() (el mismo que mueve gsap.updateRoot); goTo/resetCarousel
   guardan it.t0 con él. El tiempo virtual vt = 0 corresponde al valor de globalTimeline.time() en beginVideoSync. */
let saved = null, gt0 = 0;                 // saved: Map<video, estado previo> mientras dura el render; null = inactivo
const SEEK_TIMEOUT = 2000, PRESENT_TIMEOUT = 300;
const sleep = ms => new Promise(r => setTimeout(r, ms));

export const videoSyncActive = () => !!saved;

/* Pausa todos los videos y recuerda su estado para restaurarlo después. Coste cero si no hay videos. */
export function beginVideoSync(){
  saved = new Map(); gt0 = gsap.globalTimeline.time();
  for (const it of items) {
    if (!it.isVideo) continue;
    saved.set(it.src, { playing: !it.src.paused && !it.src.ended, time: it.src.currentTime, last: null });
    it.src.pause();
  }
}

/* Espera a que el cuadro tras un seek esté decodificado y presentado (con tiempo máximo para no colgar el render). */
async function settle(v, target){
  const t = performance.now();
  if (Math.abs(v.currentTime - target) > 1e-3 || v.seeking) {
    await new Promise(res => {
      const done = () => { v.removeEventListener('seeked', done); clearTimeout(to); res(); };
      const to = setTimeout(done, SEEK_TIMEOUT);
      v.addEventListener('seeked', done);
    });
  }
  // seeked ya indica cuadro decodificado; rVFC confirma que se presentó (si el navegador lo soporta). Plazo corto: un video
  // pausado y fuera de pantalla puede no emitirlo.
  if (v.requestVideoFrameCallback && performance.now() - t < SEEK_TIMEOUT) {
    await new Promise(res => { const to = setTimeout(res, PRESENT_TIMEOUT); v.requestVideoFrameCallback(() => { clearTimeout(to); res(); }); });
  }
}

/* Posiciona los videos visibles (actual + entrante) en el instante virtual vt (segundos desde el inicio del render). */
export async function syncVideosTo(vt){
  if (!saved) return;
  const idx = [cur, nextIdx].filter((k, n, a) => k >= 0 && a.indexOf(k) === n);
  const jobs = [];
  for (const k of idx) {
    const it = items[k]; if (!it?.isVideo) continue;
    const v = it.src, act = (it.t0 ?? gt0) - gt0;               // tiempo virtual en que el item se activó
    let t = Math.max(0, vt - act);
    const d = v.duration;
    if (d > 0 && isFinite(d)) t %= d;                              // los videos hacen loop
    const rec = saved.get(v); if (rec) rec.last = t;
    if (Math.abs(v.currentTime - t) < 1e-3 && !v.seeking) { it.tex.needsUpdate = true; continue; }
    try { v.currentTime = t; } catch { continue; }
    jobs.push(settle(v, t).then(() => { it.tex.needsUpdate = true; }));
  }
  if (jobs.length) await Promise.all(jobs);
}

/* Restaura el estado previo: tiempo coherente con el último cuadro renderizado y reproducción si estaba activa. */
export function endVideoSync(){
  if (!saved) return;
  const s = saved; saved = null;
  for (const [v, st] of s) {
    try { v.currentTime = st.last ?? st.time; } catch {}
    if (st.playing) v.play().catch(() => {});
  }
}
