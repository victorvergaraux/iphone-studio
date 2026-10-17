import { $, icons, toast } from '../core/utils.js';
import { P } from '../core/params.js';
import { canvas, composer, gradePass, gtao, scene } from '../three/renderer.js';
import { blocksG, catcher, ground } from '../three/scene.js';
import { anchor } from '../three/iphone.js';
import { prop } from '../three/smudge.js';
import { maxTex } from '../screens/carousel.js';
import { beginExport, endExport, exportSize } from '../three/format.js';

/* ───────────────────────── Exportación ───────────────────────── */
let downloads = null;
window.claude?.use?.('downloads').then(d => downloads = d).catch(() => {});
// Código de 5 caracteres (A-Z sin I/O + 2-9 sin 0/1 → sin confusiones visuales), nuevo en cada descarga
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function randomCode(n = 5){
  const r = crypto.getRandomValues(new Uint32Array(n));
  return Array.from(r, v => CODE_CHARS[v % CODE_CHARS.length]).join('');
}
export async function offer(blob, filename){
  filename = filename.replace(/(\.[a-z0-9]+)$/i, `-${randomCode()}$1`); // mockup-...-1920.png → mockup-...-1920-K7Q2M.png
  if (downloads) {
    try { await downloads.save({ filename, data:blob }); toast('Archivo guardado'); return; }
    catch (err) { if (err?.code === 'declined') return toast('Descarga cancelada'); }
  }
  // Fallback: vista previa con guardado manual (el sandbox bloquea descargas directas)
  const url = URL.createObjectURL(blob), m = document.createElement('div'); m.className = 'modal';
  const isVid = blob.type.startsWith('video'), isJson = blob.type.includes('json');
  const body = isJson ? `<textarea readonly rows="10" style="width:100%;font:11px var(--f-mono);border:0;background:var(--paper)">${(await blob.text()).replace(/</g, '&lt;')}</textarea>`
    : isVid ? `<video src="${url}" controls autoplay loop muted playsinline></video>` : `<img src="${url}" alt="Captura del mockup" style="background:repeating-conic-gradient(#ddd 0 25%,#fff 0 50%) 0 0/16px 16px">`;
  const how = isJson ? 'Copia el texto y guárdalo como archivo .json.' : `Para guardar: clic derecho o mantén presionado sobre ${isVid ? 'el video' : 'la imagen'} → Guardar.`;
  m.innerHTML = `<div class="card"><div class="rowhead"><span class="label"><b>${filename}</b> · ${(blob.size / 1048576).toFixed(2)} MB</span><button class="btn icon" aria-label="Cerrar"><i data-lucide="x"></i></button></div>
    ${body}<p>${how}</p></div>`;
  m.querySelector('button').onclick = () => { m.remove(); URL.revokeObjectURL(url); };
  document.body.append(m); icons();
}
/* PNG transparente: sin fondo, piso ni bloques; solo el celular + la sombra en un shadow catcher a la altura
   donde se apoya. AO y grano apagados (sobre alfa parcial ensuciarían la sombra). */
function withTransparent(fn){
  const st = { bg:scene.background, fog:scene.fog, blocks:blocksG.visible, ground:ground.visible, prop:prop.visible, ao:gtao.enabled, grain:gradePass.uniforms.uGrain.value };
  scene.background = null; scene.fog = null; blocksG.visible = ground.visible = prop.visible = false; gtao.enabled = false;
  catcher.position.y = anchor.position.y + 0.0005; catcher.visible = true;
  gradePass.uniforms.uAlpha.value = 1; gradePass.uniforms.uGrain.value = 0;
  try { fn(); } finally {
    scene.background = st.bg; scene.fog = st.fog; blocksG.visible = st.blocks; ground.visible = st.ground; prop.visible = st.prop; gtao.enabled = st.ao;
    catcher.visible = false; gradePass.uniforms.uAlpha.value = 0; gradePass.uniforms.uGrain.value = st.grain;
  }
}
export function snapshot(){
  const [w, h] = exportSize(), k = P.exp.pngScale > 1 && Math.max(w, h) * 2 <= maxTex ? 2 : 1;
  const name = `mockup-${P.exp.format.replace(':', 'x')}-${w * k}${P.exp.transparent ? '-alpha' : ''}.png`;
  beginExport(w, h, k);
  const shoot = () => { composer.render(); canvas.toBlob(b => b ? offer(b, name) : toast('No se pudo capturar'), 'image/png'); }; // toBlob copia el bitmap al llamarse
  P.exp.transparent ? withTransparent(shoot) : shoot();
  endExport();
}
