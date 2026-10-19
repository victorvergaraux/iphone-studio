import { $ } from '../core/utils.js';
import { presTL, shots } from '../three/camera.js';

/* ───────────────────────── Línea de tiempo de la cinemática ─────────────────────────
   Contenedor inferior de UNA sola línea (mismo lenguaje que el dock): cifra y nombre de la toma activa, una línea con un punto por toma y el tiempo
   (keypoint = toma). Cada tramo entre puntos mide lo que dura esa toma (movimiento + pausa) y se llena mientras corre.
   Es DOM puro con clase `ui`: no entra al canvas, así que ni el PNG ni el video exportado lo incluyen
   (además body.recording oculta todo lo `.ui`). Se alimenta del timeline activo (presTL.segs, ver camera.js); cada vuelta
   del loop crea un timeline nuevo (ritmos distintos con «Random»), así que se reconstruye cuando cambia. */
const root = $('#shotbar'), track = $('#sbTrack'), nEl = $('#sbN'), nameEl = $('#sbName'), timeEl = $('#sbTime'), dock = $('.dock');
const pad2 = n => String(n).padStart(2, '0'), fmt = s => `${pad2(s / 60 | 0)}:${pad2(Math.floor(s) % 60)}`;
let tl = null, segs = [], segEls = [], fills = [], idx = -2, lastSec = -1, total = 0;

function build(t){
  track.innerHTML = ''; segs = t.segs; segEls = []; fills = []; idx = -2; lastSec = -1; total = t.duration();
  segs.forEach((s, i) => {
    const seg = document.createElement('div'); seg.className = 'sb-seg'; seg.style.flexGrow = Math.max(0.05, s.end - s.start);
    const name = shots[i]?.name;
    seg.innerHTML = '<i class="sb-dot"></i><span class="sb-line"><b></b></span>';
    seg.title = `T${pad2(i + 1)}${name ? ' · ' + name : ''}`;
    track.append(seg); segEls.push(seg); fills.push(seg.querySelector('b'));
  });
  const end = document.createElement('i'); end.className = 'sb-dot end'; track.append(end); // cierre de la última toma
}
function frame(){
  if (presTL !== tl) { tl = presTL; if (tl?.segs) build(tl); else { track.innerHTML = ''; segs = []; segEls = []; fills = []; } }
  if (!tl || !segs.length) return;
  const t = tl.time();
  let cur = 0; segs.forEach((s, i) => { if (t >= s.start) cur = i; });
  if (cur !== idx) { idx = cur; nEl.textContent = pad2(cur + 1); nameEl.textContent = shots[cur]?.name || ''; segEls.forEach((el, i) => { el.classList.toggle('done', i < cur); el.classList.toggle('on', i === cur); }); }
  segs.forEach((s, i) => {
    const k = Math.min(1, Math.max(0, (t - s.start) / (s.end - s.start || 1)));
    if (fills[i]._k !== k) { fills[i]._k = k; fills[i].style.transform = `scaleX(${k})`; }
  });
  const sec = Math.floor(t); if (sec !== lastSec) { lastSec = sec; timeEl.textContent = `${fmt(t)} / ${fmt(total)}`; }
}
gsap.ticker.add(frame);

// El contenedor flota justo encima del dock cuando este es visible: se publica su alto como variable CSS
if (dock) new ResizeObserver(() => document.documentElement.style.setProperty('--dock-h', `${dock.offsetHeight}px`)).observe(dock);
