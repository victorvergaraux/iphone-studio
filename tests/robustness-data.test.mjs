import { run } from './helpers.mjs';

// Robustez II: datos guardados (IndexedDB y localStorage) y proyecto JSON (import inválido, revertir, límite de video).
// Espía de avisos: registra cada escritura en #toast / #notice (una escritura = una entrada), para contar repeticiones.
const SPY = () => {
  window.__msgs = [];
  new MutationObserver(recs => {
    for (const r of recs) { const el = r.target.nodeType === 1 ? r.target : r.target.parentElement; if ((el?.id === 'toast' || el?.id === 'notice') && (r.addedNodes.length || r.type === 'characterData') && el.textContent) window.__msgs.push(el.textContent); }
  }).observe(document, { subtree: true, childList: true, characterData: true });
};
const count = async (page, re) => (await page.evaluate(() => window.__msgs)).filter(m => new RegExp(re, 'i').test(m)).length;
const noLag = page => page.evaluate(() => gsap.ticker.lagSmoothing(0));
const items = page => page.evaluate(async () => (await import('/js/screens/carousel.js')).items.map(i => ({ n:i.name, ex:!!i.example, v:!!i.isVideo })));
const loadPngs = (page, n) => page.evaluate(async n => {
  const mk = c => new Promise(r => { const cv = document.createElement('canvas'); cv.width = 64; cv.height = 64; const g = cv.getContext('2d'); g.fillStyle = c; g.fillRect(0, 0, 64, 64); cv.toBlob(b => r(new File([b], `p${c.slice(1)}.png`, { type:'image/png' })), 'image/png'); });
  const cols = ['#c33', '#3c3', '#33c', '#cc3']; const files = []; for (let i = 0; i < n; i++) files.push(await mk(cols[i % 4]));
  (await import('/js/core/params.js')).P.car.replaceAll = false;   // las cargas se acumulan
  const { loadFiles } = await import('/js/screens/load.js'); return loadFiles(files);
}, n);

// ── 5a · IndexedDB no disponible (open lanza) ──
await run('datos · IndexedDB indisponible (open lanza)', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(SPY);
  await page.addInitScript(() => { indexedDB.open = () => { throw new DOMException('bloqueada', 'SecurityError'); }; });
  await boot(); await noLag(page);
  const it = await items(page);
  ok(it.length > 0 && it.every(i => i.ex), 'arranca con los ejemplos');
  eq(await count(page, 'Sin almacenamiento local'), 1, 'un solo aviso al arrancar');
  eq(await loadPngs(page, 2), 2, 'sigue cargando pantallas en memoria');
  await page.waitForTimeout(1200);
  await page.evaluate(() => dispatchEvent(new Event('pagehide')));
  await loadPngs(page, 1); await page.waitForTimeout(1200);
  eq(await count(page, 'Sin almacenamiento local'), 1, 'sin avisos repetidos tras más cargas y pagehide');
  eq((await items(page)).filter(i => !i.ex).length, 3, 'las 3 pantallas propias están en memoria');
});

// ── 5a' · IndexedDB dispara onerror ──
await run('datos · IndexedDB indisponible (onerror)', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(SPY);
  await page.addInitScript(() => { indexedDB.open = () => { const r = {}; setTimeout(() => { r.error = new DOMException('rota', 'UnknownError'); r.onerror?.(); }, 0); return r; }; });
  await boot(); await noLag(page);
  ok((await items(page)).every(i => i.ex), 'arranca con los ejemplos');
  eq(await count(page, 'Sin almacenamiento local'), 1, 'un solo aviso');
  await loadPngs(page, 1); await page.waitForTimeout(1000);
  eq(await count(page, 'Sin almacenamiento local'), 1, 'sigue en uno');
});

// ── 5b · Cuota excedida al escribir ──
await run('datos · cuota de IndexedDB excedida', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(SPY);
  await page.addInitScript(() => { const p = IDBObjectStore.prototype.put; IDBObjectStore.prototype.put = function(...a){ if (window.__quota) throw new DOMException('lleno', 'QuotaExceededError'); return p.apply(this, a); }; });
  await boot(); await noLag(page);
  await page.evaluate(() => { window.__quota = true; });
  await loadPngs(page, 2); await page.waitForTimeout(1500);
  eq(await count(page, 'Almacenamiento lleno'), 1, 'aviso de almacenamiento lleno una vez');
  await loadPngs(page, 1); await page.waitForTimeout(1500);
  eq(await count(page, 'Almacenamiento lleno'), 1, 'no se repite en el siguiente guardado');
  eq((await items(page)).filter(i => !i.ex).length, 3, 'la app sigue: las 3 pantallas están en memoria');
});

// ── 5c · Base corrupta / registros con campos inválidos ──
for (const [name, seed] of [
  ['lista no es arreglo', `{ list: 'basura', blobs: [] }`],
  ['registros inválidos', `{ list: [null, 5, 'x', { id: 7 }, { id: 'a' }, { id: 'b', name: 'b' }, { id: 'c', name: 'c', type: 'image/png', fit: {} }], blobs: [{ id: 'b', blob: 'no-es-blob' }, { id: 'c', blob: new Blob([new Uint8Array([1, 2, 3])], { type: 'image/png' }) }] }`],
]) await run(`datos · base corrupta (${name})`, async ({ page, url, ok, boot }) => {
  await page.goto(url + 'package.json');   // mismo origen que la app, sin cargarla
  await page.evaluate(`(async () => {
    const S = ${seed};
    const db = await new Promise((res, rej) => { const r = indexedDB.open('mockup-studio-screens', 1); r.onupgradeneeded = () => { r.result.createObjectStore('blobs', { keyPath:'id' }); r.result.createObjectStore('meta'); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const tx = db.transaction(['blobs', 'meta'], 'readwrite');
    tx.objectStore('meta').put(S.list, 'list');
    for (const b of S.blobs) { try { tx.objectStore('blobs').put(b); } catch {} }
    await new Promise(r => { tx.oncomplete = tx.onerror = tx.onabort = r; }); db.close();
  })()`);
  await page.addInitScript(SPY);
  await boot(); await noLag(page);
  const it = await items(page);
  ok(it.length > 0 && it.every(i => i.ex), `arranca con ejemplos sin excepciones (${it.length})`);
});

// ── 7a · localStorage corrupto o con tipos erróneos ──
for (const [name, raw] of [['JSON roto', '{bad'], ['P como string', '{"P":"hola","shots":5}'], ['P arreglo y tomas nulas', '{"P":[1],"shots":[null,3]}']])
  await run(`datos · localStorage ${name}`, async ({ page, ok, eq, boot }) => {
    await page.addInitScript(SPY);
    await page.addInitScript(raw => { if (!sessionStorage.getItem('__s')) { sessionStorage.setItem('__s', '1'); localStorage.setItem('mockup-studio:v2', raw); } }, raw);
    await boot(); await noLag(page);
    const unread = name === 'P arreglo y tomas nulas' ? 1 : 1;
    eq(await count(page, 'no se pudieron leer'), unread, 'un solo aviso de lectura');
    const r = await page.evaluate(async () => { const { P } = await import('/js/core/params.js'); return [typeof P.scene.bg, typeof P.phone.yaw]; });
    eq(r, ['string', 'number'], 'P conserva los defaults');
    ok((await page.evaluate(async () => (await import('/js/three/camera.js')).shots.length)) > 0, 'hay tomas por defecto');
    await page.evaluate(() => dispatchEvent(new Event('pagehide')));
    eq(await count(page, 'no se pudieron leer'), 1, 'no se repite al guardar');
  });

// ── 7b · setItem lanza (cuota o acceso bloqueado) ──
await run('datos · localStorage.setItem lanza', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(SPY);
  await page.addInitScript(() => { const s = Storage.prototype.setItem; Storage.prototype.setItem = function(k, v){ if (this === localStorage && window.__full) throw new DOMException('lleno', 'QuotaExceededError'); return s.call(this, k, v); }; });
  await boot(); await noLag(page);
  await page.evaluate(() => { window.__full = true; });
  for (let i = 0; i < 4; i++) {
    await page.evaluate(async () => { const { P } = await import('/js/core/params.js'); const { saveSoon } = await import('/js/core/persist.js'); P.phone.yaw += 1; saveSoon(); });
    await page.waitForTimeout(450);
  }
  await page.evaluate(() => { dispatchEvent(new Event('pagehide')); document.dispatchEvent(new Event('visibilitychange')); });
  eq(await count(page, 'No se pueden guardar los ajustes'), 1, 'aviso único pese a 5+ guardados fallidos');
  ok(await page.evaluate(() => !!document.querySelector('#rail')), 'la app sigue viva');
});

// ── 6a · Import de proyecto inválido: mensaje claro y no aplica nada ──
await run('proyecto · import inválido y revertir', async ({ page, ok, eq, boot }) => {
  await page.addInitScript(SPY);
  await boot(); await noLag(page);
  const snap = () => page.evaluate(async () => { const { P } = await import('/js/core/params.js'); const { shots } = await import('/js/three/camera.js'); const { items } = await import('/js/screens/carousel.js'); return JSON.stringify([P, shots, items.length]); });
  const before = await snap();
  const good = { app:'mockup-studio', version:3, P:{ phone:{ yaw: 77 } }, shots:[] };
  const cases = [['vacío', ''], ['malformado', '{"app": '], ['arreglo', '[]'], ['sin P', JSON.stringify({ app:'mockup-studio', version:3 })], ['versión futura', JSON.stringify({ ...good, version:9 })],
    ['versión texto', JSON.stringify({ ...good, version:'3' })], ['P string', JSON.stringify({ ...good, P:'x' })], ['grupos erróneos', JSON.stringify({ ...good, P:{ phone:5 } })],
    ['tomas objeto', JSON.stringify({ ...good, shots:{} })], ['media objeto', JSON.stringify({ ...good, media:{} })], ['otra app', JSON.stringify({ ...good, app:'otra' })]];
  for (const [n, txt] of cases) {
    const c0 = await count(page, 'No se pudo importar');
    await page.setInputFiles('#projFile', { name:'p.json', mimeType:'application/json', buffer:Buffer.from(txt) });
    await page.waitForTimeout(250);
    ok((await count(page, 'No se pudo importar')) === c0 + 1 && (await snap()) === before, `${n}: mensaje y estado intacto`);
  }
  // applyAll lanza a mitad: se revierte P y tomas
  await page.evaluate(async () => { window.__bg = (await import('/js/three/scene.js')).bgColor; window.__bgSet = window.__bg.set; });
  const c0 = await count(page, 'No se pudo importar: boom');
  await page.evaluate(() => { window.__bg.set = () => { throw new Error('boom'); }; });
  await page.setInputFiles('#projFile', { name:'p.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(good)) });
  await page.waitForTimeout(800);
  await page.evaluate(() => { window.__bg.set = window.__bgSet; });
  ok((await count(page, 'No se pudo importar: boom')) === c0 + 1, 'fallo al aplicar: avisa');
  ok((await snap()) === before, 'fallo al aplicar: P y tomas revertidos');
  // y uno válido sí se aplica
  await page.setInputFiles('#projFile', { name:'p.json', mimeType:'application/json', buffer:Buffer.from(JSON.stringify(good)) });
  await page.waitForTimeout(1500);
  eq(await page.evaluate(async () => (await import('/js/core/params.js')).P.phone.yaw), 77, 'un proyecto válido sí se aplica');
});

// ── 6b · Límite de video en el export ──
await run('proyecto · límite de video al exportar', async ({ page, url, ok, eq, boot }) => {
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
  await loadPngs(page, 2);
  await page.evaluate(async vb64 => { const { loadFiles } = await import('/js/screens/load.js'); await loadFiles([new File([Uint8Array.from(atob(vb64), c => c.charCodeAt(0))], 'v.webm', { type:'video/webm' })]); }, vb64);
  const own = (await items(page)).filter(i => !i.ex);
  eq(own.map(i => i.v), [false, false, true], 'cargadas 2 imágenes y 1 video');
  await page.evaluate(async () => { (await import('/js/export/project.js')).limits.maxVideo = 500; });   // tope de unos cientos de bytes
  await page.evaluate(async () => { (await import('/js/export/project.js')).exportProject(); });
  // sin la capacidad de descargas, offer() muestra el JSON en un modal con textarea
  await page.waitForSelector('.modal textarea', { timeout: 15000 });
  const txt = await page.$eval('.modal textarea', t => t.value); ok(txt.length > 0, 'se ofrece el JSON del proyecto');
  await page.waitForTimeout(500);
  ok((await count(page, '1 video\\(s\\) omitido')) >= 1, 'toast indica cuántos videos se omitieron');
  {
    const json = JSON.parse(txt);
    ok(json.version === 3 && Array.isArray(json.media), 'JSON válido v3');
    eq(json.media.map(m => m.type), ['image/png', 'image/png'], 'solo quedan las 2 imágenes');
    const c0 = await count(page, 'importado');
    await page.setInputFiles('#projFile', { name:'e.json', mimeType:'application/json', buffer:Buffer.from(txt) });
    await page.waitForTimeout(2500);
    ok((await count(page, 'importado')) > c0, 'el JSON se reimporta sin error');
    eq((await items(page)).filter(i => !i.ex).map(i => i.v), [false, false], 'tras reimportar: 2 imágenes, sin video');
  }
});
