import { $, icons, toast } from '../core/utils.js';
import { T } from '../core/strings.js';
import { P } from '../core/params.js';
import { canvas, composer, gradePass, gtao, scene } from '../three/renderer.js';
import { blocksG, catcher, ground } from '../three/scene.js';
import { anchor } from '../three/iphone.js';
import { prop } from '../three/smudge.js';
import { maxTex } from '../screens/carousel.js';
import { exportSize } from '../three/formats.js';
import { beginExport, endExport, fitCanvasCss } from '../three/frame.js';
import { accum } from '../three/accum.js';

/* ───────────────────────── Exportación ───────────────────────── */
let downloads = null;
window.claude?.use?.('downloads').then(d => downloads = d).catch(() => {});
// Código de 5 caracteres (A-Z sin I/O + 2-9 sin 0/1 → sin confusiones visuales), nuevo en cada descarga
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(n = 5){
  const r = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(r, v => CODE_CHARS[v % CODE_CHARS.length]).join('');
}
/* Devuelve cómo terminó: 'saved' (descarga directa, ya avisa «Archivo guardado»), 'declined' o 'modal' (vista previa con guardado manual). */
export async function offer(blob, filename){
  filename = filename.replace(/(\.[a-z0-9]+)$/i, `-${randomCode()}$1`); // mockup-...-1920.png → mockup-...-1920-K7Q2M.png
  if (downloads) {
    try { await downloads.save({ filename, data:blob }); toast(T.export.saved); return 'saved'; }
    catch (err) { if (err?.code === 'declined') { toast(T.export.declined); return 'declined'; } }
  }
  // Fallback: vista previa con guardado manual (el sandbox bloquea descargas directas)
  const url = URL.createObjectURL(blob), m = document.createElement('div'); m.className = 'modal';
  const isVid = blob.type.startsWith('video'), isJson = blob.type.includes('json');
  const body = isJson ? `<textarea readonly rows="10" style="width:100%;font:11px var(--f-mono);border:0;background:var(--paper)">${(await blob.text()).replace(/</g, '&lt;')}</textarea>`
    : isVid ? `<video src="${url}" controls autoplay loop muted playsinline></video>` : `<img src="${url}" alt="${T.export.modalAlt}" style="background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px">`;
  const how = isJson ? T.export.modalJsonHow : T.export.modalSaveHow(isVid);
  m.innerHTML = `<div class="card"><div class="rowhead"><span class="label"><b>${filename}</b> · ${(blob.size / 1048576).toFixed(2)} MB</span><button class="btn icon" aria-label="${T.common.close}"><i data-lucide="x"></i></button></div>
    ${body}<p>${how}</p></div>`;
  m.querySelector('button').onclick = () => { m.remove(); URL.revokeObjectURL(url); };
  document.body.append(m); icons(); return 'modal';
}
/* PNG transparente: sin fondo, piso ni bloques; solo el celular + la sombra en un shadow catcher a la altura
   donde se apoya. AO y grano apagados (sobre alfa parcial ensuciarían la sombra). Asíncrono: envuelve el bucle de muestras. */
async function withTransparent(fn){
  const st = { bg:scene.background, fog:scene.fog, blocks:blocksG.visible, ground:ground.visible, prop:prop.visible, ao:gtao.enabled, grain:gradePass.uniforms.uGrain.value };
  scene.background = null; scene.fog = null; blocksG.visible = ground.visible = prop.visible = false; gtao.enabled = false;
  catcher.position.y = anchor.position.y + 0.0005; catcher.visible = true;
  gradePass.uniforms.uAlpha.value = 1; gradePass.uniforms.uGrain.value = 0;
  try { return await fn(); } finally {
    scene.background = st.bg; scene.fog = st.fog; blocksG.visible = st.blocks; ground.visible = st.ground; prop.visible = st.prop; gtao.enabled = st.ao;
    catcher.visible = false; gradePass.uniforms.uAlpha.value = 0; gradePass.uniforms.uGrain.value = st.grain;
  }
}
/* Número de muestras del refinamiento progresivo del PNG, derivado del modo Quality y del tamaño de render:
   auto 8 · high 12 · max 16; por encima de ~12 Mpx (4K+) se reduce a la mitad para que el tiempo no se dispare. */
function snapshotSamples(w, h){
  const base = { auto:8, high:12, max:16 }[P.quality.mode] ?? 8;
  return w * h > 12e6 ? Math.max(4, base / 2) : base;
}
// Cede el control al navegador para que pinte el toast de progreso (rAF se estrangula en pestañas ocultas → respaldo con timeout)
const pause = () => new Promise(r => { const t = setTimeout(r, 40); requestAnimationFrame(() => { clearTimeout(t); r(); }); });
/* PNG con refinamiento progresivo: N cuadros con jitter sub-píxel promediados (ver js/three/accum.js). El grano se aplica
   una vez sobre el promedio. opts.samples fuerza N (1 = un solo cuadro, el comportamiento clásico). Devuelve el Blob. */
export async function snapshot(opts = {}){
  if (accum.busy) return null; // ya hay un PNG en curso
  const [w, h] = exportSize();
  // 2× no cabe en la textura máxima de la GPU → se baja pngScale a 1× (y se guarda) con aviso, en vez de fallar o ignorarlo en silencio
  if (P.exp.pngScale > 1 && Math.max(w, h) * 2 > maxTex) { P.exp.pngScale = 1; toast(T.export.png2xLimit(maxTex), 4000); }
  const k = P.exp.pngScale > 1 ? 2 : 1;
  const n = Math.max(1, Math.round(opts.samples ?? snapshotSamples(w * k, h * k)));
  const name = `mockup-${P.exp.format.replace(':', 'x')}-${w * k}${P.exp.transparent ? '-alpha' : ''}.png`;
  accum.busy = true; // el loop de rAF no dibuja mientras haya awaits
  let pBlob;
  try {
    beginExport(w, h, k); fitCanvasCss(w, h); // el canvas queda encuadrado mientras se refina
    const shoot = async () => {
      for (let i = 0; i < n; i++) {
        if (n > 1) { toast(T.export.refining(i + 1, n)); await pause(); }
        n > 1 ? accum.sample() : composer.render();
      }
      pBlob = new Promise(r => { try { canvas.toBlob(r, 'image/png'); } catch { r(null); } }); // toBlob copia el bitmap al llamarse: debe ir justo tras el último render
    };
    P.exp.transparent ? await withTransparent(shoot) : await shoot();
  } finally {
    accum.reset(); canvas.style.cssText = ''; endExport(); accum.busy = false;
  }
  const blob = await pBlob;
  if (blob) { if (await offer(blob, name) === 'modal') toast(T.export.ready); return blob; }
  // toBlob devolvió null (lienzo demasiado grande para el navegador o memoria agotada): se reintenta a 1× una sola vez
  if (k > 1 && !opts._retry) { P.exp.pngScale = 1; toast(T.export.png2xRetry, 4000); return snapshot({ ...opts, _retry:true }); }
  toast(T.export.pngFail, 4500);
  return null;
}
