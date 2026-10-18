import { $, toast } from '../core/utils.js';
import { P } from '../core/params.js';
import { canvas } from '../three/renderer.js';
import { resetCarousel, scheduleCar } from '../screens/carousel.js';
import { playPresentation, presentationLength, shots, stopPresentation } from '../three/camera.js';
import { beginExport, endExport, exportSize, fitCanvasCss, recording, setRecording } from '../three/format.js';
import { clock, offline, renderFrame, setOffline } from '../three/loop.js';
import { offer } from './export.js';
import { startRecordingRealtime } from './project.js';

/* ── Video cuadro a cuadro (WebCodecs + mp4-muxer) ──
   Reloj virtual: GSAP deja de leer el reloj real (ticker.remove(updateRoot)) y avanzamos exactamente 1/fps por
   cuadro; renderFrame(t) recibe el mismo tiempo. Cada cuadro se dibuja, se codifica y se descarta: no importa si
   la GPU tarda 1 s por cuadro, el video sale fluido y sin cuadros perdidos. */
export let cancelOffline = false;
const fmtT = s => `${String(s / 60 | 0).padStart(2, '0')}:${String(s % 60 | 0).padStart(2, '0')}`;
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* Candidatos de codificación, del más compatible al más robusto:
   · MP4/H.264: lo abre todo (QuickTime, Premiere, After Effects, redes, iOS). El nivel H.264 se elige según
     resolución×fps: pedir 5.2 para 1080p (como antes) hace fallar a varios encoders por hardware.
   · WebM/VP9: codificador por software muy estable en Chrome/Firefox/Edge; ideal como respaldo y para web.
   Si un intento falla (al configurar o a mitad del render), se reintenta solo con el siguiente. */
function videoCandidates(w, h, fps){
  const fs = Math.ceil(w / 16) * Math.ceil(h / 16), mbs = fs * fps;
  // level_idc va en HEX de 2 dígitos = nivel×10: 4.2 → 0x2a, 5.1 → 0x33, 5.2 → 0x34. Antes se usaba '28' (= nivel 4.0, de solo
  // 245 760 MB/s) para todo lo que cabe en 4.2: 1080p a 60 fps (489 600 MB/s) excedía el nivel declarado y los encoders
  // por hardware lo rechazaban al configurar o a mitad del render.
  const avcLevel = fs <= 8704 && mbs <= 522240 ? '2a' : fs <= 36864 && mbs <= 983040 ? '33' : '34';   // 4.2 · 5.1 · 5.2
  const vp9Level = fs <= 8704 ? (fps > 30 ? '41' : '40') : (fps > 30 ? '51' : '50');
  const mp4 = [
    { ext:'mp4', label:'MP4 · H.264', codec:`avc1.6400${avcLevel}`, mux:'avc', hw:'no-preference' },
    { ext:'mp4', label:'MP4 · H.264 (software)', codec:`avc1.4200${avcLevel}`, mux:'avc', hw:'prefer-software' },
  ];
  const webm = [
    { ext:'webm', label:'WebM · VP9', codec:`vp09.00.${vp9Level}.08`, mux:'V_VP9', hw:'no-preference' },
    { ext:'webm', label:'WebM · VP8', codec:'vp8', mux:'V_VP8', hw:'no-preference' },
  ];
  // auto: MP4 y, si falla, WebM. Formato forzado: solo candidatos de ese contenedor
  return P.exp.container === 'webm' ? webm : P.exp.container === 'mp4' ? mp4 : [...mp4, ...webm];
}

export async function startRecording(){
  if (recording) return;
  if (P.exp.mode === 'realtime') return startRecordingRealtime();
  if (!('VideoEncoder' in window) || !window.Mp4Muxer || !window.WebMMuxer) { toast('Tu navegador no soporta render cuadro a cuadro: uso tiempo real'); return startRecordingRealtime(); }
  const usePres = P.exp.playShots && shots.length > 0;
  const len = P.exp.length || (usePres ? presentationLength() : 15);
  const fps = P.exp.fps, [w, h] = exportSize();
  const errors = [];
  for (const cand of videoCandidates(w, h, fps)) {
    const cfg = { codec:cand.codec, width:w, height:h, bitrate:P.exp.mbps * 1e6, framerate:fps, hardwareAcceleration:cand.hw,
                  ...(cand.mux === 'avc' ? { avc:{ format:'avc' } } : {}) };
    try { if (!(await VideoEncoder.isConfigSupported(cfg)).supported) { errors.push(`${cand.label}: no soportado (${cand.codec} ${w}x${h}@${fps})`); continue; } }
    catch (e) { errors.push(`${cand.label}: ${e.message}`); continue; }
    const res = await renderVideo(cand, cfg, { w, h, fps, len, usePres });
    if (res.cancelled) return toast('Render cancelado');
    if (res.blob) {
      if (errors.length) console.warn('Export de video, intentos fallidos:', errors);
      return offer(res.blob, `mockup-${P.exp.format.replace(':', 'x')}-${w}x${h}-${len.toFixed(0)}s-${fps}fps.${cand.ext}`);
    }
    errors.push(`${cand.label}: ${res.error}`); console.warn('Video:', cand.label, res.error);
    toast(`${cand.label} falló, reintentando con otro códec…`);
  }
  console.error('Export de video falló:', errors);
  toast(`No se pudo exportar el video. ${errors.at(-1) || ''}`);
}

/* Un intento completo de render cuadro a cuadro con un códec. Reloj virtual: GSAP deja de leer el reloj real
   (ticker.remove(updateRoot)) y avanzamos exactamente 1/fps por cuadro; renderFrame(t) recibe el mismo tiempo.
   Cada cuadro se dibuja, se codifica y se descarta: el video sale fluido sin importar la velocidad de la GPU. */
async function renderVideo(cand, cfg, { w, h, fps, len, usePres }){
  const total = Math.max(1, Math.round(len * fps));
  let muxer, target, encErr = null, encoder;
  try {
    if (cand.ext === 'mp4') { target = new Mp4Muxer.ArrayBufferTarget(); muxer = new Mp4Muxer.Muxer({ target, video:{ codec:cand.mux, width:w, height:h, frameRate:fps }, fastStart:'in-memory', firstTimestampBehavior:'offset' }); }
    else { target = new WebMMuxer.ArrayBufferTarget(); muxer = new WebMMuxer.Muxer({ target, video:{ codec:cand.mux, width:w, height:h, frameRate:fps }, firstTimestampBehavior:'offset' }); }
    encoder = new VideoEncoder({ output:(chunk, meta) => { try { muxer.addVideoChunk(chunk, meta); } catch (e) { encErr = e; } }, error:e => { encErr = e; } });
    encoder.configure(cfg);
  } catch (e) { return { error:e.message || String(e) }; }

  setRecording(true); setOffline(true); cancelOffline = false;
  document.body.classList.add('recording'); beginExport(w, h, 1); fitCanvasCss(w, h);
  gsap.ticker.remove(gsap.updateRoot);
  const g0 = gsap.ticker.time, t0 = clock.getElapsedTime();
  stopPresentation(); resetCarousel(); // el video siempre arranca en la pantalla 1
  if (usePres) playPresentation(P.exp.length > 0);
  $('#rec').hidden = false; $('#prog').style.transform = 'scaleX(0)'; $('#prog').classList.add('on');
  try {
    for (let i = 0; i < total && !cancelOffline && !encErr; i++) {
      const vt = i / fps;
      gsap.updateRoot(g0 + vt);
      renderFrame(t0 + vt);
      // alpha:'discard' → el canvas tiene alfa (para PNG transparente); H.264/VP9 no aceptan alfa y fallaban al codificar
      const frame = new VideoFrame(canvas, { timestamp:Math.round(i * 1e6 / fps), duration:Math.round(1e6 / fps), alpha:'discard' });
      encoder.encode(frame, { keyFrame: i % (fps * 2) === 0 });
      frame.close();
      $('#recTime').textContent = `${cand.ext.toUpperCase()} · ${fmtT(vt)} / ${fmtT(len)} · ${i + 1}/${total}`;
      $('#prog').style.transform = `scaleX(${(i + 1) / total})`;
      while (encoder.encodeQueueSize > 6 && !encErr) await sleep(4);
      await sleep(0);
    }
    if (!encErr && !cancelOffline) await encoder.flush();
  } catch (e) { encErr = encErr || e; }
  finally {
    try { encoder.state !== 'closed' && encoder.close(); } catch {}
    gsap.updateRoot(gsap.ticker.time); gsap.ticker.add(gsap.updateRoot); // re-sincroniza el reloj virtual con el real antes de devolver el control
    setOffline(false); setRecording(false);
    $('#rec').hidden = true; $('#prog').classList.remove('on'); stopPresentation();
    document.body.classList.remove('recording'); canvas.style.cssText = ''; endExport(); scheduleCar();
  }
  if (cancelOffline) return { cancelled:true };
  if (encErr) return { error:encErr.message || String(encErr) };
  try { muxer.finalize(); } catch (e) { return { error:`muxer: ${e.message}` }; }
  return { blob:new Blob([target.buffer], { type: cand.ext === 'mp4' ? 'video/mp4' : 'video/webm' }) };
}

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setCancelOffline = v => { cancelOffline = v; };
