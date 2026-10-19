/* Encuadre: panel de controles, guía de exportación, retícula, desplazamiento de vista (viewShift) y ciclo de export
   (beginExport/endExport/fitCanvasCss), que necesitan la guía y `layout`. Aquí vive el listener de resize.
   Importa session.js en una sola dirección (session.js no importa este módulo → sin ciclos ni TDZ).
   Lo usan: three/loop.js (applyView, lastSx/lastSy, viewShift), export/*, ui/pane.js (setPanel/panelOpen), ui/exportcard.js, main.js. */
import { $, DUR, EASE, reduced } from '../core/utils.js';
import { P } from '../core/params.js';
import { camera, canvas, composer, gradePass, renderer } from './renderer.js';
import { accum } from './accum.js';
import { FORMATS } from './formats.js';
import { exporting, pr, recording, setExporting, setQuality, setRenderSize } from './session.js';

const PANEL_W = 312, wide = () => innerWidth > 820; export const panelOpen = () => !document.body.classList.contains('panel-closed'); // PANEL_W y wide: solo se usan aquí
document.body.classList.add('panel-closed'); // controles colapsados al inicio (el onboarding trae sus propias acciones)

// El canvas ocupa TODA la pantalla. Para que el modelo quede centrado en el área libre
// (sin panel, barra superior ni dock) desplazamos la imagen con camera.setViewOffset.
export const viewShift = { x:0, y:0 };
export let lastSx = null, lastSy = null, guide = null, gridRect = null;
function targetShift(){
  return { x: 0, y: 0 }; // canvas fullscreen fijo: abrir/cerrar paneles no mueve ni reencuadra la escena
}
// Rectángulo (px de pantalla) del área libre donde cabe el encuadre exportable
function computeGuide(){
  const r = FORMATS[P.exp.format]; if (!r) return null; // "Pantalla" = sin recorte
  const W = innerWidth, H = innerHeight;
  // guía FIJA: se calcula sobre el viewport completo (márgenes de 48 px), no depende de paneles abiertos/cerrados
  const x0 = 48, x1 = W - 48, y0 = 48, y1 = H - 48;
  let fw = x1 - x0, fh = y1 - y0; if (fw < 80 || fh < 80) return null;
  let w = fw, h = fw / r; if (h > fh) { h = fh; w = fh * r; }
  return { x: x0 + (fw - w) / 2, y: y0 + (fh - h) / 2, w, h };
}
export function applyView(){
  const W = innerWidth, H = innerHeight; camera.aspect = W / H;
  if (Math.abs(viewShift.x) > 0.01 || Math.abs(viewShift.y) > 0.01) camera.setViewOffset(W, H, -viewShift.x, -viewShift.y, W, H);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix(); lastSx = viewShift.x; lastSy = viewShift.y;
}

// Exportar = render del sub-rectángulo de la guía (lo que ves dentro de la guía es lo que sale)
export function beginExport(w, h, ratio){
  setExporting(true); setQuality(true); accum.reset(); // el export parte sin acumulación previa
  renderer.setPixelRatio(ratio); renderer.setSize(w, h, false);
  composer.setPixelRatio(ratio); composer.setSize(w, h);
  gradePass.uniforms.uRes.value.set(w * ratio, h * ratio);
  const W = innerWidth, H = innerHeight; camera.aspect = W / H;
  if (guide) { const s = targetShift(); camera.setViewOffset(W, H, guide.x - s.x, guide.y - s.y, guide.w, guide.h); }
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
export function endExport(){ setExporting(false); setQuality(false); accum.reset(); lastSx = null; layout(); } // reset: el pase de acumulación queda apagado
export function fitCanvasCss(w, h){
  const W = innerWidth, H = innerHeight, m = guide ? 24 : 0;
  let cw = W - 2 * m, ch = cw * h / w; if (ch > H - 2 * m) { ch = H - 2 * m; cw = ch * w / h; }
  Object.assign(canvas.style, { inset:'auto', left:`${(W - cw) / 2}px`, top:`${(H - ch) / 2}px`, width:`${cw}px`, height:`${ch}px` });
}
export function layout(){
  if (recording || exporting) return;
  setRenderSize(innerWidth, innerHeight, pr);
  guide = computeGuide();
  const g = $('#guide');
  // Rect de DIBUJO de la retícula (aparte de `guide`, que sigue siendo solo el rect de exportación):
  // con formato de ratio = marco de export; con "Pantalla" = viewport completo (sin marco oscuro ni etiqueta, clase .full).
  gridRect = guide || { x:0, y:0, w:innerWidth, h:innerHeight };
  g.hidden = false; g.classList.toggle('full', !guide);
  Object.assign(g.style, { left:`${gridRect.x}px`, top:`${gridRect.y}px`, width:`${gridRect.w}px`, height:`${gridRect.h}px` });
  // Retícula: hermana del guide (necesario para mix-blend-mode, ver CSS). Todo en píxeles ENTEROS: una línea de 1 px en posición
  // fraccionaria se reparte entre 2 píxeles y se ve gruesa y borrosa.
  const gr = $('#grid3'), gx = Math.round(gridRect.x), gy = Math.round(gridRect.y), gw = Math.round(gridRect.w), gh = Math.round(gridRect.h);
  gr.hidden = false; Object.assign(gr.style, { left:`${gx}px`, top:`${gy}px`, width:`${gw}px`, height:`${gh}px` });
  gr.style.setProperty('--x1', `${Math.round(gw / 3)}px`); gr.style.setProperty('--x2', `${Math.round(gw * 2 / 3)}px`);
  gr.style.setProperty('--y1', `${Math.round(gh / 3)}px`); gr.style.setProperty('--y2', `${Math.round(gh * 2 / 3)}px`);
  if (guide) $('#guideLbl').textContent = P.exp.format;
  const t = targetShift();
  if (Math.abs(t.x - viewShift.x) > 0.5 || Math.abs(t.y - viewShift.y) > 0.5) gsap.to(viewShift, { x:t.x, y:t.y, duration:reduced ? 0 : DUR, ease:EASE, overwrite:true });
  else { viewShift.x = t.x; viewShift.y = t.y; }
  lastSx = null;
}
addEventListener('resize', layout);
const ro = new ResizeObserver(layout); ro.observe(document.querySelector('.dock'));
export function setPanel(open){ document.body.classList.toggle('panel-closed', !open); layout(); }
