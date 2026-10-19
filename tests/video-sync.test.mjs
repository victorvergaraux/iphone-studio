import { run } from './helpers.mjs';

// Sincronía de videos con el reloj virtual del export offline (js/export/videosync.js).
await run('videosync · export offline', async ({ page, url, ok, eq, boot }) => {
  // Video de prueba (franjas de color) grabado ANTES de arrancar la app, en una página ligera (con el WebGL de la app el MediaRecorder se queda sin rAF)
  await page.goto(url + 'package.json');
  const vb64 = await page.evaluate(async () => {
    const rec1 = () => new Promise(res => {
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 320; document.body.append(cv); const g = cv.getContext('2d'), ch = [];
      const rec = new MediaRecorder(cv.captureStream(30), { mimeType:'video/webm;codecs=vp8' });
      let k = 0, on = true; const loop = () => { g.fillStyle = `hsl(${k * 12},70%,50%)`; g.fillRect(0, 0, 160, 320); k++; if (on) requestAnimationFrame(loop); }; loop();
      rec.ondataavailable = e => ch.push(e.data); rec.onstop = () => { cv.remove(); res(new Blob(ch, { type:'video/webm' })); };
      rec.start(100); setTimeout(() => { on = false; rec.stop(); }, 1600);
    });
    for (let i = 0; i < 4; i++) { const b = await rec1(); if (b.size > 1000) { const u = new Uint8Array(await b.arrayBuffer()); let s = ''; u.forEach(x => s += String.fromCharCode(x)); return btoa(s); } }
    throw new Error('MediaRecorder sin datos');
  });

  await boot();
  await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  // Carga solo el video y arregla su duración (los webm de MediaRecorder reportan Infinity hasta que se busca el final)
  const dur = await page.evaluate(async vb64 => {
    const f = new File([new Blob([Uint8Array.from(atob(vb64), c => c.charCodeAt(0))], { type:'video/webm' })], 'd.webm', { type:'video/webm' });
    const { P } = await import('/js/core/params.js'); P.car.replaceAll = true;
    await (await import('/js/screens/load.js')).loadFiles([f]);
    const { items } = await import('/js/screens/carousel.js'); const v = items[0].src;
    if (!isFinite(v.duration)) { await new Promise(r => { v.addEventListener('durationchange', r, { once:true }); v.currentTime = 1e101; setTimeout(r, 3000); }); }
    await new Promise(r => { if (!v.seeking) return r(); v.addEventListener('seeked', r, { once:true }); });
    v.currentTime = 0; await v.play().catch(() => {});
    return v.duration;
  }, vb64);
  ok(isFinite(dur) && dur > 0.5, `video de prueba con duración finita (${dur?.toFixed?.(2)} s)`);

  // (a) unitario
  const u = await page.evaluate(async () => {
    const { items } = await import('/js/screens/carousel.js'); const v = items[0].src;
    const m = await import('/js/export/videosync.js');
    const before = { playing: !v.paused };
    m.beginVideoSync();
    const pausedDuring = v.paused;
    await m.syncVideosTo(2.5);
    const t1 = v.currentTime, want1 = 2.5 % v.duration;
    await m.syncVideosTo(0.4);
    const t2 = v.currentTime;
    m.endVideoSync();
    await new Promise(r => setTimeout(r, 300));
    return { before, pausedDuring, t1, want1, t2, afterPlaying: !v.paused, active: m.videoSyncActive(), d: v.duration };
  });
  ok(u.before.playing, 'video reproduciéndose antes');
  ok(u.pausedDuring, 'beginVideoSync pausa el video');
  ok(Math.abs(u.t1 - u.want1) <= 1 / 30 + 0.02, `syncVideosTo(2.5) → currentTime ${u.t1.toFixed(3)} ≈ ${u.want1.toFixed(3)} (2.5 mod ${u.d.toFixed(2)})`);
  ok(Math.abs(u.t2 - 0.4) <= 1 / 30 + 0.02, `syncVideosTo(0.4) → ${u.t2.toFixed(3)}`);
  ok(u.afterPlaying && !u.active, 'endVideoSync restaura la reproducción');

  // Sin videos: coste cero y sin errores
  const noVid = await page.evaluate(async () => {
    const m = await import('/js/export/videosync.js'); const { items } = await import('/js/screens/carousel.js');
    const bak = items[0].isVideo; items[0].isVideo = false;
    m.beginVideoSync(); const t = performance.now(); await m.syncVideosTo(1); m.endVideoSync(); items[0].isVideo = bak;
    return performance.now() - t;
  });
  ok(noVid < 50, `sin videos no hace nada (${noVid.toFixed(1)} ms)`);

  // (b) integración: render offline corto
  const r = await page.evaluate(async () => {
    const { P } = await import('/js/core/params.js'); Object.assign(P.exp, { length:1, fps:30, long:1280, container:'webm', mode:'offline', playShots:false });
    const { items } = await import('/js/screens/carousel.js'); const v = items[0].src; v.currentTime = 0; await v.play().catch(() => {});
    // espía: ¿el video está pausado y posicionado por el reloj virtual durante el render?
    let pausedSeen = 0, samples = 0, maxT = 0; const iv = setInterval(() => { if (document.body.classList.contains('recording')) { samples++; if (v.paused) pausedSeen++; maxT = Math.max(maxT, v.currentTime); } }, 20);
    const { startRecording } = await import('/js/export/offline.js');
    const t0 = performance.now(); await startRecording(); clearInterval(iv);
    const vid = document.querySelector('.modal video');
    return { ms: performance.now() - t0, hasModal: !!vid, samples, pausedSeen, maxT, playingAfter: !v.paused, recording: document.body.classList.contains('recording') };
  });
  ok(r.hasModal, `el render offline termina y ofrece un video (${(r.ms / 1000).toFixed(1)} s)`);
  ok(r.samples > 0 && r.pausedSeen === r.samples, `video pausado durante el render (${r.pausedSeen}/${r.samples})`);
  ok(r.maxT <= 1.0 + 1 / 30, `currentTime sigue el reloj virtual (máx ${r.maxT.toFixed(2)} s)`);
  ok(r.playingAfter && !r.recording, 'al terminar el video vuelve a reproducirse');
  const blobInfo = await page.evaluate(async () => { const v = document.querySelector('.modal video'); const b = await (await fetch(v.src)).blob(); return { type:b.type, size:b.size }; });
  ok(blobInfo.type === 'video/webm' && blobInfo.size > 1000, `Blob webm válido (${blobInfo.size} B)`);
}, { width:1280, height:800 });
