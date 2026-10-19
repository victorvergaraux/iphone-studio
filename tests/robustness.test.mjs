import { run } from './helpers.mjs';

// Robustez I: pérdida de contexto WebGL, soporte de video/PNG y límites de carga de medios.
// Espía de avisos: registra todo lo que pasa por #toast y #notice (el toast se pisa rápido; así no se pierde ninguno).
const SPY = () => {
  window.__msgs = [];
  new MutationObserver(() => {
    for (const id of ['toast', 'notice']) { const t = document.getElementById(id)?.textContent; if (t && window.__msgs.at(-1) !== t) window.__msgs.push(t); }
  }).observe(document, { subtree: true, childList: true, characterData: true });
};
const msgs = page => page.evaluate(() => window.__msgs);
const hasMsg = async (page, re) => (await msgs(page)).some(m => new RegExp(re, 'i').test(m));
const noLag = page => page.evaluate(() => gsap.ticker.lagSmoothing(0));

// ── 1 · Pérdida / restauración del contexto WebGL ──
await run('robustez · contexto WebGL', async ({ page, ok, boot }) => {
  await page.addInitScript(SPY); await boot(); await noLag(page);
  const frame = () => page.evaluate(async () => (await import('/js/three/renderer.js')).renderer.info.render.frame);
  const lost = () => page.evaluate(async () => (await import('/js/three/glcontext.js')).glLost);
  const advances = async () => { const f0 = await frame(); for (let i = 0; i < 40; i++) { await page.waitForTimeout(250); if (await frame() > f0) return true; } return false; }; // robusto con CPU justa
  // Con grano > 0 el loop dibuja en cada cuadro (si no, el refinamiento progresivo se detiene al completarse y el contador no crece)
  await page.evaluate(async () => { (await import('/js/core/params.js')).P.grade.grain = 0.05; window.__lose = (await import('/js/three/renderer.js')).renderer.getContext().getExtension('WEBGL_lose_context'); });
  const ctx = a => page.evaluate(a => window.__lose[a](), a);
  const noticeOn = () => page.evaluate(() => document.getElementById('notice')?.classList.contains('on') ? document.getElementById('notice').textContent : '');
  let f;
  ok(await advances(), 'render activo antes de perder el contexto');

  await ctx('loseContext'); await page.waitForTimeout(400);
  ok(await lost(), 'glLost = true tras webglcontextlost');
  ok(/Se perdió la GPU, recuperando/.test(await noticeOn()), 'aviso persistente «Se perdió la GPU, recuperando…»');
  f = await frame(); await page.waitForTimeout(700); ok(await frame() === f, 'el render se detiene mientras no hay contexto');

  await ctx('restoreContext'); await page.waitForTimeout(3500);
  ok(!(await lost()), 'glLost = false tras restaurar');
  ok(await advances(), 'la escena vuelve a renderizar tras restaurar');
  ok((await noticeOn()) === '', 'el aviso se oculta al restaurar');
  ok(await page.evaluate(async () => !!(await import('/js/three/renderer.js')).scene.environment), 'el entorno (PMREM) existe tras reconstruirlo');

  // Sin restauración en ~5 s → botón «Recargar»
  await ctx('loseContext'); await page.waitForTimeout(5600);
  ok(/Recargar/.test(await page.evaluate(() => document.querySelector('#notice button')?.textContent || '')), 'sin restaurar en 5 s: botón «Recargar»');
  await ctx('restoreContext'); await page.waitForTimeout(3000);
  ok(await advances(), 'segunda restauración también reanuda');
});

// ── 2 · Soporte de video (sin VideoEncoder / sin MediaRecorder) y PNG ──
await run('robustez · soporte de video y PNG', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(SPY);
  await page.addInitScript(() => { delete window.VideoEncoder; });
  await boot(); await noLag(page);
  await page.evaluate(async () => { const { P } = await import('/js/core/params.js'); Object.assign(P.exp, { mode:'offline', long:640, pngScale:1, length:8 }); });

  // 2a · sin VideoEncoder: se explica y se usa tiempo real
  await page.evaluate(async () => { (await import('/js/export/offline.js')).startRecording(); });
  await page.waitForTimeout(500);
  ok(await hasMsg(page, 'VideoEncoder.*tiempo real'), 'mensaje: falta VideoEncoder → tiempo real');
  ok(await page.evaluate(() => !document.getElementById('rec').hidden), 'la grabación en tiempo real arrancó');
  await page.waitForTimeout(1500); // que el MediaRecorder entregue al menos un trozo
  await page.click('#recStop'); await page.waitForSelector('.modal', { timeout: 15000 });
  await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.remove()));

  // 2b · sin MediaRecorder tampoco: aviso claro con alternativa PNG (nada críptico)
  await page.evaluate(() => { delete window.MediaRecorder; });
  await page.evaluate(async () => { (await import('/js/export/offline.js')).startRecording(); });
  await page.waitForTimeout(400);
  ok(await hasMsg(page, 'tampoco hay grabación.*PNG'), 'mensaje: sin MediaRecorder ni VideoEncoder → ofrece PNG');
  ok(await page.waitForFunction(() => document.getElementById('notice').classList.contains('on') && !!document.querySelector('#notice button'), null, { timeout: 4000 }).then(() => true, () => false), 'aviso visible con botón');
  await page.evaluate(async () => { (await import('/js/export/project.js')).startRecordingRealtime(); });
  ok(await hasMsg(page, 'MediaRecorder'), 'modo tiempo real directo: explica que falta MediaRecorder');

  // 2c · «Exportar PNG» desde el aviso → snapshot → sin descarga directa cae al modal → toast «Archivo listo»
  await page.evaluate(() => document.querySelector('#notice button').click());
  await page.waitForSelector('.modal img', { timeout: 60000 });
  ok(await hasMsg(page, 'Archivo listo'), 'PNG por modal: toast «Archivo listo»');
  await page.evaluate(() => document.querySelectorAll('.modal').forEach(m => m.remove()));

  // 2d · toBlob falla a 2×: baja pngScale a 1 con aviso y entrega el PNG igual
  await page.evaluate(async () => {
    const { P } = await import('/js/core/params.js'); P.exp.pngScale = 2;
    const orig = HTMLCanvasElement.prototype.toBlob; window.__origBlob = orig;
    HTMLCanvasElement.prototype.toBlob = function(cb, ...a){ return this.width > 500 ? cb(null) : orig.call(this, cb, ...a); };
  });
  const blob2 = await page.evaluate(async () => !!(await (await import('/js/export/export.js')).snapshot({ samples:1 })));
  ok(blob2, 'toBlob nulo a 2×: reintenta a 1× y entrega el PNG');
  eq(await page.evaluate(async () => (await import('/js/core/params.js')).P.exp.pngScale), 1, 'pngScale bajó a 1 automáticamente');
  ok(await hasMsg(page, 'reintento a 1'), 'aviso de la reducción automática');
  // y si falla también a 1×: mensaje explicativo, sin excepción
  const r = await page.evaluate(async () => { HTMLCanvasElement.prototype.toBlob = cb => cb(null); return await (await import('/js/export/export.js')).snapshot({ samples:1 }); });
  ok(r === null && await hasMsg(page, 'No se pudo generar el PNG'), 'toBlob nulo también a 1×: aviso claro');
  await page.evaluate(() => { HTMLCanvasElement.prototype.toBlob = window.__origBlob; document.querySelectorAll('.modal').forEach(m => m.remove()); });

  // 2e · 2× no cabe en maxTex: baja a 1× con aviso (lado largo de render ≈ maxTex/2 + 64)
  const info = await page.evaluate(async () => {
    const { P } = await import('/js/core/params.js'), { maxTex } = await import('/js/screens/carousel.js');
    P.exp.long = Math.min(Math.floor(maxTex / 2) + 64, 2400); P.exp.pngScale = 2;
    return { maxTex, long:P.exp.long };
  });
  if (info.long * 2 > info.maxTex) {
    await page.evaluate(async () => (await import('/js/export/export.js')).snapshot({ samples:1 }));
    eq(await page.evaluate(async () => (await import('/js/core/params.js')).P.exp.pngScale), 1, 'excede maxTex: pngScale → 1');
    ok(await hasMsg(page, 'no admite PNG 2'), 'aviso de maxTex');
  } else console.log(`  · maxTex=${info.maxTex}: no se puede simular sin un render enorme, se omite 2e`);
});

// ── 3 · Límites de carga de medios ──
await run('robustez · carga de medios', async ({ page, url, ok, eq, boot }) => {
  // Video válido de prueba: se graba ANTES de arrancar la app, en una página ligera
  await page.goto(url + 'package.json');
  const vb64 = await page.evaluate(async () => {
    const rec1 = () => new Promise(res => {
      const cv = document.createElement('canvas'); cv.width = 160; cv.height = 320; document.body.append(cv); const g = cv.getContext('2d'), ch = [];
      const rec = new MediaRecorder(cv.captureStream(30), { mimeType:'video/webm;codecs=vp8' });
      let k = 0, on = true; const loop = () => { g.fillStyle = `hsl(${k * 20},70%,50%)`; g.fillRect(0, 0, 160, 320); k++; if (on) requestAnimationFrame(loop); }; loop();
      rec.ondataavailable = e => ch.push(e.data); rec.onstop = () => { cv.remove(); res(new Blob(ch, { type:'video/webm' })); };
      rec.start(100); setTimeout(() => { on = false; rec.stop(); }, 1200);
    });
    for (let i = 0; i < 4; i++) { const b = await rec1(); if (b.size > 1000) { const u = new Uint8Array(await b.arrayBuffer()); let s = ''; u.forEach(x => s += String.fromCharCode(x)); return btoa(s); } }
    throw new Error('MediaRecorder sin datos');
  });
  await page.addInitScript(SPY);
  await boot(); await noLag(page);
  await page.evaluate(vb64 => {
    window.__png = (w = 64, h = 64, c = '#c33') => new Promise(r => { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, w, h); cv.toBlob(b => r(new File([b], `ok-${c.slice(1)}.png`, { type:'image/png' })), 'image/png'); });
    window.__vid = () => new File([Uint8Array.from(atob(vb64), c => c.charCodeAt(0))], 'v.webm', { type:'video/webm' });
    window.__load = async files => { const { loadFiles } = await import('/js/screens/load.js'); return loadFiles(await files); };
    window.__count = async () => (await import('/js/screens/carousel.js')).items.length;
  }, vb64);
  const last = async () => (await msgs(page)).at(-1) || '';
  // (eval solo en pruebas locales, con cadenas fijas de este archivo)
  // mk = expresión JS (en la página) que devuelve el arreglo de archivos
  const attempt = async mk => {
    const n0 = await page.evaluate(() => window.__count());
    const n = await page.evaluate(mk => window.__load(eval(mk)), mk);
    return { n, d:(await page.evaluate(() => window.__count())) - n0 };
  };

  let r = await attempt(`[new File(['x'], 'doc.pdf', { type:'application/pdf' })]`);
  ok(r.n === 0 && /tipo no soportado/.test(await last()), `tipo no soportado: ${await last()}`);
  r = await attempt(`window.__png().then(f => { Object.defineProperty(f, 'size', { value:300e6 }); return [f]; })`);
  ok(r.n === 0 && /200 MB/.test(await last()), `> 200 MB rechazado: ${await last()}`);
  r = await attempt(`[new File([new Uint8Array([1,2,3,4])], 'rota.png', { type:'image/png' })]`);
  ok(r.n === 0 && /dañada/.test(await last()), `imagen que no decodifica: ${await last()}`);
  r = await attempt(`[new File([new Uint8Array([1,2,3,4,5,6,7,8])], 'rota.webm', { type:'video/webm' })]`);
  ok(r.n === 0 && /códec|no se pudo leer/.test(await last()), `video con códec no soportado: ${await last()}`);

  // Lote mixto: un fallo no aborta el resto y el toast resume
  r = await attempt(`Promise.all([window.__png(64, 64, '#3c3'), window.__png(80, 64, '#33c')]).then(([a, b]) => [a, new File([new Uint8Array([9,9,9])], 'mala.png', { type:'image/png' }), new File(['x'], 'doc.pdf', { type:'application/pdf' }), b])`);
  eq(r.n, 2, 'lote mixto: cargan las 2 buenas (el resto se omite sin abortar)');
  ok(/2 cargadas/.test(await last()) && /2 omitidas/.test(await last()), `resumen: ${await last()}`);

  // Video normal (sin aviso de pesado) y video «largo» (>60 s simulado)
  r = await attempt(`[window.__vid()]`);
  ok(r.n === 1 && !/pesado/.test(await last()), `video corto: sin aviso de peso (${await last()})`);
  await page.evaluate(() => Object.defineProperty(HTMLVideoElement.prototype, 'duration', { get(){ return 75; }, configurable:true }));
  r = await attempt(`[window.__vid()]`);
  ok(r.n === 1 && /pesado para el navegador/.test(await last()), `video >60 s: avisa (${await last()})`);
  await page.evaluate(() => { delete HTMLVideoElement.prototype.duration; });
});
