import * as THREE from 'three';
import { $, DUR, EASE, toast } from '../core/utils.js';
import { T } from '../core/strings.js';
import { P } from '../core/params.js';
import { camera, canvas, gradePass, gtao, renderer } from '../three/renderer.js';
import { bgColor, blocksG, catcher, ground, mAccent, mBlocks, mFloor, applyFloorMode, applyObjPos, applySurfaceTex, placeKey, sun } from '../three/scene.js';
import { applyBackground, applyEnvIntensity, loadEnv } from '../three/hdri.js';
import { makeBrushed } from '../three/metal.js';
import { anchor, mFrame, makeButtons } from '../three/iphone.js';
import { applyTransitionMode, island, mGlass, screenMat } from '../three/screen.js';
import { applySmudgeScale, prop, rebuildShape, setPose, smudgeU } from '../three/smudge.js';
import { resetCarousel, scheduleCar } from '../screens/carousel.js';
import { sanitizeShot, flyTo, playPresentation, presentationLength, setCurShot, setShots, shots, stopPresentation } from '../three/camera.js';
import { exportSize } from '../three/formats.js';
import { beginExport, endExport, fitCanvasCss, layout } from '../three/frame.js';
import { recording, setRecording } from '../three/session.js';
import { offline } from '../three/loop.js';
import { pane } from '../ui/pane.js';
import { renderShots, syncReplace } from '../ui/strips.js';
import { items } from '../screens/carousel.js';
import { loadBlobs } from '../screens/load.js';
import { pickEdit } from '../screens/store.js';
import { offer, snapshot } from './export.js';
import { hideNotice, showNotice } from '../core/notice.js';
import { reset as resetHistory } from '../core/history.js';
import { setCancelOffline } from './offline.js';

/* ── Proyecto JSON. Formato:
   v2: { app, version:2, P, shots }                       (sin medios: al importar se conservan las pantallas actuales)
   v3: { app, version:3, P, shots, media:[{ name, type, data, edit }] }
       · media = pantallas PROPIAS en orden (las de ejemplo no se incluyen); data = data URL del archivo ORIGINAL (sin recodificar)
       · edit = { fit, zoom, offX, offY, scroll, autoScroll }
       · videos solo si pesan ≤ 25 MB (el resto se omite y se avisa con toast)
   Al importar se aplican los ajustes en vivo; si v3 trae media, REEMPLAZA las pantallas actuales. ── */
const PROJECT_VERSION = 3;
// Tope de video del proyecto. Es un objeto exportado para que los tests lo bajen sin generar 25 MB reales.
export const limits = { maxVideo: 25 * 1024 * 1024 };
const toDataURL = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
export async function exportProject(){
  const media = []; let skipped = 0;
  for (const it of items) {
    if (it.example || !it.blob) continue;
    if (it.isVideo && it.blob.size > limits.maxVideo) { skipped++; continue; }
    try { media.push({ name:it.name, type:it.blob.type, data:await toDataURL(it.blob), edit:pickEdit(it) }); } catch { skipped++; }
  }
  const data = { app:'mockup-studio', version:3, P, shots: shots.map(({ p, t, fov, name, move, hold, ease }) => ({ p, t, fov, name, move, hold, ease })), media };
  offer(new Blob([JSON.stringify(data, null, 2)], { type:'application/json' }), `mockup-proyecto-${new Date().toISOString().slice(0, 10)}.json`);
  if (skipped) toast(T.project.skippedVideos(skipped));
}
/* Valida la ESTRUCTURA del proyecto antes de tocar nada. Devuelve un mensaje de error o null si es aplicable. */
const isObj = v => !!v && typeof v === 'object' && !Array.isArray(v);
function validateProject(data){
  if (!isObj(data)) return T.project.notProject;
  if (data.app !== undefined && data.app !== 'mockup-studio') return T.project.notOurs;
  if (!Number.isInteger(data.version) || data.version < 1) return T.project.noVersion;
  if (data.version > PROJECT_VERSION) return T.project.newer(data.version);
  if (!isObj(data.P) || !Object.values(data.P).every(isObj)) return T.project.badSettings;
  if (data.shots !== undefined && !Array.isArray(data.shots)) return T.project.badCinematic;
  if (data.media !== undefined && !Array.isArray(data.media)) return T.project.badScreens;
  return null;
}
$('#projFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const fail = msg => toast(T.project.importFail(msg), 4500);
  let data;
  try { data = JSON.parse(await f.text()); } catch { return fail(T.project.badJson); }
  const bad = validateProject(data); if (bad) return fail(bad);
  // 1) Preparar todo SIN tocar el estado: pantallas decodificadas y tomas saneadas
  const blobs = [], states = []; let badMedia = 0;
  for (const m of data.media || []) {
    if (typeof m?.data !== 'string' || typeof m.type !== 'string' || !/^(image|video)\//.test(m.type)) { badMedia++; continue; }
    try { const b = await (await fetch(m.data)).blob(); blobs.push(new File([b], m.name || T.common.screenName, { type:m.type })); states.push(isObj(m.edit) ? m.edit : null); } catch { badMedia++; }
  }
  const newShots = Array.isArray(data.shots) ? data.shots.map(sanitizeShot).filter(Boolean) : [];
  // 2) Copia del estado para revertir si applyAll lanza a mitad de camino
  const snapP = structuredClone(P), snapShots = shots.slice();
  try {
    for (const g in P) for (const k in P[g]) { const v = data.P[g]?.[k]; if (v !== undefined && typeof v === typeof P[g][k]) P[g][k] = v; }
    if (newShots.length) setShots(newShots);
    await applyAll();
  } catch (err) {
    for (const g in snapP) Object.assign(P[g], snapP[g]); setShots(snapShots);
    try { await applyAll(); } catch {}
    return fail(err?.message || T.project.applyError);
  }
  // 3) Las pantallas van al final: reemplazan las actuales solo si al menos una cargó bien (loadBlobs lo garantiza)
  if (blobs.length) await loadBlobs(blobs, states, { replace:true, silent:true });
  resetHistory();
  toast(T.project.imported(f.name, badMedia), badMedia ? 4000 : 2200);
};
// Re-aplica TODO el estado de P a la escena (lo que normalmente hacen los handlers del panel)
export async function applyAll({ cam = true } = {}){
  bgColor.set(P.scene.bg); mFloor.color.set(P.scene.floor); mBlocks.color.set(P.scene.blocks); mAccent.color.set(P.scene.accent);
  blocksG.visible = P.scene.showBlocks; ground.visible = P.scene.showFloor; applyObjPos(); applySurfaceTex(); applyFloorMode(); syncReplace();
  renderer.toneMappingExposure = P.env.exposure;
  renderer.toneMapping = { neutral:THREE.NeutralToneMapping, agx:THREE.AgXToneMapping, aces:THREE.ACESFilmicToneMapping }[P.env.tone] ?? THREE.NeutralToneMapping;
  sun.castShadow = P.shadow.on; sun.intensity = P.shadow.strength; sun.shadow.radius = P.shadow.size;
  gtao.blendIntensity = P.shadow.ao; gtao.updateGtaoMaterial({ radius:P.shadow.aoRadius });
  setPose(P.phone.pose); prop.visible = P.phone.pose === 'lean' && P.scene.showBlocks;
  gsap.to(anchor.rotation, { y:THREE.MathUtils.degToRad(P.phone.yaw), duration:DUR, ease:EASE, overwrite:true });
  mGlass.envMapIntensity = P.phone.glass * 1.6; mGlass.roughness = P.phone.glassRough; island.visible = P.phone.island;
  smudgeU.uSmudgeR.value = P.phone.smudgeR; smudgeU.uSmudgeM.value = P.phone.smudgeM; smudgeU.uSmudgeH.value = P.phone.smudgeH; applySmudgeScale();
  mFrame.color.set(P.phone.frame); mFrame.roughness = P.metal.rough; mFrame.metalness = P.metal.metal;
  mFrame.anisotropy = P.metal.aniso; mFrame.anisotropyRotation = THREE.MathUtils.degToRad(P.metal.angle);
  rebuildShape(); makeButtons(); makeBrushed();
  camera.zoom = P.cam.zoom; camera.updateProjectionMatrix();
  const u = screenMat.uniforms; u.uParallax.value = P.car.parallax; u.uExposure.value = P.car.exposure; u.uBg.value.set(P.car.screenBg); applyTransitionMode();
  const g = gradePass.uniforms; g.uBrightness.value = P.grade.brightness; g.uContrast.value = P.grade.contrast; g.uVignette.value = P.grade.vignette; g.uGrain.value = P.grade.grain;
  catcher.material.opacity = P.exp.shadowOpacity;
  await loadEnv(P.env.preset); applyEnvIntensity(); applyBackground(); placeKey();
  pane.refresh(); layout(); scheduleCar();
  if (cam) { setCurShot(-1); renderShots(); if (shots.length) flyTo(0); } // cam:false = restaurar ajustes (deshacer) sin mover la cámara
}

function pickMime(){
  return ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => window.MediaRecorder?.isTypeSupported?.(m));
}
let recorder = null, recTimer = null;
/* ¿Se puede grabar en tiempo real? Devuelve el mime elegido o null (sin MediaRecorder, sin captureStream o sin formato de video soportado). */
export const realtimeMime = () => (window.MediaRecorder && canvas.captureStream && pickMime()) || null;
/* Sin forma de grabar video: en vez de un toast críptico, aviso claro con la alternativa (PNG). Se oculta solo a los 12 s. */
export function noRecordingNotice(why){
  showNotice(T.video.noticeTail(why), { label:T.video.exportPng, onClick:() => { hideNotice(); snapshot(); } }, 12000);
}
export function startRecordingRealtime(){
  if (recording) return;
  const mime = realtimeMime();
  if (!mime) return noRecordingNotice(window.MediaRecorder ? T.video.noRecorderFormat : T.video.noMediaRecorder);
  const usePres = P.exp.playShots && shots.length > 0;
  const len = P.exp.length || (usePres ? presentationLength() : 15);
  const [w, h] = exportSize();
  const stream = canvas.captureStream(P.exp.fps), chunks = [];
  try { recorder = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond:P.exp.mbps * 1e6 }); }
  catch (err) { stream.getTracks().forEach(t => t.stop()); return noRecordingNotice(T.video.rejected(err?.name || T.video.rejectedDefault)); }
  setRecording(true); document.body.classList.add('recording'); beginExport(w, h, 1); fitCanvasCss(w, h);
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    setRecording(false); clearInterval(recTimer); $('#rec').hidden = true; $('#prog').classList.remove('on'); stopPresentation(); document.body.classList.remove('recording'); canvas.style.cssText = ''; endExport();
    stream.getTracks().forEach(t => t.stop());
    const ext = mime.includes('mp4') ? 'mp4' : 'webm', blob = new Blob(chunks, { type:mime.split(';')[0] });
    if (recorder.cancelled) return toast(T.video.recCancelled);
    offer(blob, `mockup-${P.exp.format.replace(':', 'x')}-${len.toFixed(0)}s.${ext}`);
  };
  if (usePres) playPresentation(P.exp.length > 0);
  resetCarousel(); // el video siempre arranca en la pantalla 1, sin transición previa
  recorder.start(250);
  const t0 = performance.now(), fmt = s => `${String(s / 60 | 0).padStart(2, '0')}:${String(s % 60 | 0).padStart(2, '0')}`;
  $('#rec').hidden = false;
  $('#prog').style.transform = 'scaleX(0)'; $('#prog').classList.add('on');
  recTimer = setInterval(() => {
    const el = (performance.now() - t0) / 1000; $('#recTime').textContent = `${fmt(el)} / ${fmt(len)}`;
    $('#prog').style.transform = `scaleX(${Math.min(1, el / len)})`;
    if (el >= len && recorder.state === 'recording') recorder.stop();
  }, 100);
}
$('#recStop').onclick = () => { if (offline) setCancelOffline(true); else if (recorder?.state === 'recording') recorder.stop(); };
