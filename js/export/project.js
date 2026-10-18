import * as THREE from 'three';
import { $, DUR, EASE, toast } from '../core/utils.js';
import { P } from '../core/params.js';
import { camera, canvas, gradePass, gtao, renderer } from '../three/renderer.js';
import { bgColor, blocksG, catcher, ground, mAccent, mBlocks, mFloor, applyObjPos, placeKey, sun } from '../three/scene.js';
import { applyBackground, applyEnvIntensity, loadEnv } from '../three/hdri.js';
import { makeBrushed } from '../three/metal.js';
import { anchor, mFrame, makeButtons } from '../three/iphone.js';
import { applyTransitionMode, island, mGlass, screenMat } from '../three/screen.js';
import { applySmudgeScale, prop, rebuildShape, setPose, smudgeU } from '../three/smudge.js';
import { resetCarousel, scheduleCar } from '../screens/carousel.js';
import { curShot, flyTo, playPresentation, presentationLength, setCurShot, setShots, shots, stopPresentation } from '../three/camera.js';
import { beginExport, endExport, exportSize, fitCanvasCss, layout, recording, setRecording } from '../three/format.js';
import { offline } from '../three/loop.js';
import { pane } from '../ui/pane.js';
import { renderShots, syncReplace } from '../ui/strips.js';
import { offer } from './export.js';
import { cancelOffline, setCancelOffline } from './offline.js';

/* ── Proyecto JSON: ajustes + tomas. Al importar se aplican en vivo (las imágenes cargadas se conservan). ── */
export function exportProject(){
  const data = { app:'mockup-studio', version:2, P, shots: shots.map(({ p, t, fov, name }) => ({ p, t, fov, name })) };
  offer(new Blob([JSON.stringify(data, null, 2)], { type:'application/json' }), `mockup-proyecto-${new Date().toISOString().slice(0, 10)}.json`);
}
$('#projFile').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const data = JSON.parse(await f.text());
    if (!data?.P) throw new Error('sin ajustes');
    for (const g in P) for (const k in P[g]) { const v = data.P[g]?.[k]; if (v !== undefined && typeof v === typeof P[g][k]) P[g][k] = v; }
    if (Array.isArray(data.shots) && data.shots.length) setShots(data.shots.filter(s => Array.isArray(s.p) && Array.isArray(s.t) && typeof s.fov === 'number'));
    await applyAll(); toast(`Proyecto ${f.name} importado`);
  } catch (err) { toast(`No se pudo importar: ${err.message}`); }
};
// Re-aplica TODO el estado de P a la escena (lo que normalmente hacen los handlers del panel)
async function applyAll(){
  bgColor.set(P.scene.bg); mFloor.color.set(P.scene.floor); mBlocks.color.set(P.scene.blocks); mAccent.color.set(P.scene.accent);
  blocksG.visible = P.scene.showBlocks; ground.visible = P.scene.showFloor; applyObjPos(); syncReplace();
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
  setCurShot(-1); renderShots(); if (shots.length) flyTo(0);
}

function pickMime(){
  return ['video/mp4;codecs=avc1.640028', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(m => window.MediaRecorder?.isTypeSupported?.(m));
}
let recorder = null, recTimer = null;
export function startRecordingRealtime(){
  if (recording) return;
  const mime = pickMime(); if (!mime || !canvas.captureStream) return toast('Este navegador no permite grabar el canvas');
  const usePres = P.exp.playShots && shots.length > 0;
  const len = P.exp.length || (usePres ? presentationLength() : 15);
  const [w, h] = exportSize();
  setRecording(true); document.body.classList.add('recording'); beginExport(w, h, 1); fitCanvasCss(w, h);
  const stream = canvas.captureStream(P.exp.fps), chunks = [];
  recorder = new MediaRecorder(stream, { mimeType:mime, videoBitsPerSecond:P.exp.mbps * 1e6 });
  recorder.ondataavailable = e => e.data.size && chunks.push(e.data);
  recorder.onstop = () => {
    setRecording(false); clearInterval(recTimer); $('#rec').hidden = true; $('#prog').classList.remove('on'); stopPresentation(); document.body.classList.remove('recording'); canvas.style.cssText = ''; endExport();
    stream.getTracks().forEach(t => t.stop());
    const ext = mime.includes('mp4') ? 'mp4' : 'webm', blob = new Blob(chunks, { type:mime.split(';')[0] });
    if (recorder.cancelled) return toast('Grabación cancelada');
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
