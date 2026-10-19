// Refactor de js/ui/pane.js → js/ui/pane/*.js: la huella estructural del panel debe ser idéntica a la capturada antes del refactor
// (tests/fixtures/pane-structure.json) + comportamiento del historial (slider, preset de paleta, Clear, Reset del encuadre).
// Uso: node tests/refactor-pane.test.mjs            → compara con el fixture
//      node tests/refactor-pane.test.mjs --update   → (re)captura el fixture
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { run } from './helpers.mjs';

const FIX = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'fixtures/pane-structure.json');
const UPDATE = process.argv.includes('--update');

// Extrae (dentro de la página) la estructura del panel recorriendo el árbol de blades en orden.
const extract = async () => {
  const { pane } = await import('/js/ui/pane.js');
  const typeOf = el => {
    const q = s => !!el.querySelector(s);
    if (q('.tp-sldtxtv')) return 'slider';
    if (q('.tp-ckbv')) return 'checkbox';
    if (q('.tp-colv, .tp-colswv')) return 'color';
    if (q('.tp-lstv')) return 'select';
    if (q('.tp-p2dv')) return 'point2d';
    if (q('.tp-p3dv')) return 'point3d';
    if (q('.tp-btngridv')) return 'buttongrid';
    if (q('.tp-fpsv')) return 'fpsgraph';
    if (q('.tp-btnv')) return 'button';
    if (q('.tp-txtv')) return 'text';
    if (q('.tp-sprv') || el.classList.contains('tp-sprv')) return 'separator';
    return 'other:' + el.className;
  };
  const walk = node => {
    const out = [];
    for (const c of node.children || []) {
      const el = c.controller.view.element;
      if (c.pages) { // pestañas
        out.push({ tabs: c.pages.map(p => ({ title: p.title, items: walk(p) })) });
      } else if (c.children) { // carpeta
        out.push({ folder: c.title, expanded: c.expanded, items: walk(c) });
      } else {
        const it = { type: typeOf(el), label: el.querySelector('.tp-lblv_l')?.textContent ?? null, btn: [...el.querySelectorAll('.tp-btnv_t')].map(b => b.textContent) };
        const vc = c.controller.valueController;
        if (it.type === 'slider' && vc?.sliderC_) {
          const p = vc.sliderC_.props, t = vc.textC_.props;
          it.min = p.get('min'); it.max = p.get('max'); it.step = t.get('keyScale');
        }
        out.push(it);
      }
    }
    return out;
  };
  return { rootExpanded: pane.expanded, items: walk(pane) };
};

await run('refactor-pane · huella estructural + historial', async ({ page, ok, eq, boot }) => {
  await boot(); await page.evaluate(() => gsap.ticker.lagSmoothing(0));
  await page.waitForTimeout(1500);
  await page.evaluate(async () => { (await import('/js/ui/pane.js')).pane.expanded = true; });
  await page.waitForTimeout(300);
  const got = await page.evaluate(`(${extract.toString()})()`);
  if (UPDATE) { fs.writeFileSync(FIX, JSON.stringify(got, null, 1) + '\n'); console.log('  fixture escrito: ' + FIX); }
  const want = JSON.parse(fs.readFileSync(FIX, 'utf8'));
  eq(got, want, 'huella del panel idéntica al fixture');
  ok(JSON.stringify(got).length > 3000, 'huella no vacía');

  // ── historial ──
  const ev = (src) => page.evaluate(async src => {
    const { P } = await import('/js/core/params.js'), H = await import('/js/core/history.js'), { pane } = await import('/js/ui/pane.js');
    const find = key => { const f = n => { for (const c of [...(n.children || []), ...((n.pages || []).flatMap(p => [p, ...p.children]))]) { if (c.key === key && c.controller?.value) return c; const r = f(c); if (r) return r; } return null; }; return f(pane); };
    return await (new Function('P', 'H', 'pane', 'find', `return (async()=>{ ${src} })()`))(P, H, pane, find);
  }, src);
  const len = async () => (await ev('return H.info().length'));
  await ev('H.reset()');
  const n0 = await len();
  // 1) varios cambios del mismo slider = 1 entrada
  await ev(`const b = find('fov'); const s=(v,l)=>b.controller.value.setRawValue(v,{forceEmit:false,last:l}); s(20,false); s(25,false); s(30,false); s(35,true);`);
  await page.waitForTimeout(150);
  eq(await len(), n0 + 1, 'slider arrastrado = 1 entrada de historial');
  // 2) preset de paleta: una sola entrada con motivo «ajuste Palette»
  await ev('H.reset()');
  await ev(`const f=(n)=>{for(const c of [...(n.children||[]),...((n.pages||[]).flatMap(p=>p.children))]){ if(c.label==='Palette') return c; const r=f(c); if(r) return r;} return null;}; const b=f(pane); b.controller.value.setRawValue('dark',{forceEmit:false,last:true});`);
  await page.waitForTimeout(600);
  eq(await len(), 2, 'preset de paleta = 1 entrada (los colores BG/Floor/… no cuentan)');
  const lab = await ev('return JSON.stringify(H.info())');
  ok(/ajuste Palette/.test(lab), 'motivo «ajuste Palette» (' + lab.slice(0, 120) + ')');
  ok(await ev('return P.scene.bg === "#111111"'), 'preset dark aplica el fondo');
  // 3) Clear: confirm → resetHistory + resetAll (se acepta el diálogo; resetAll recarga la página)
  let confirmed = 0;
  page.on('dialog', d => { confirmed++; d.accept(); });
  const nav = page.waitForEvent('load', { timeout: 20000 }).catch(() => null);
  await page.evaluate(() => { const b = [...document.querySelectorAll('.tp-btnv_b')].find(x => x.textContent === 'Clear'); b.click(); });
  await nav; await page.waitForTimeout(500);
  ok(confirmed === 1, 'Clear pide confirmación');
  // 4) Reset del encuadre (pestaña Edit): restaura fit/zoom/offset de la pantalla seleccionada
  await page.waitForFunction(() => !!window.gsap, null, { timeout: 30000 }); await page.waitForTimeout(3000);
  await page.evaluate(() => document.querySelector('#onbSkip')?.click());
  const r = await page.evaluate(async () => {
    const car = await import('/js/screens/carousel.js'); const it = car.items[car.sel]; if (!it) return null;
    Object.assign(it, { zoom: 2.2, offX: .3, offY: -.2 });
    const b = [...document.querySelectorAll('.tp-btnv_b')].find(x => x.textContent === 'Reset'); b.click();
    return { zoom: it.zoom, offX: it.offX, offY: it.offY };
  });
  eq(r, { zoom: 1, offX: 0, offY: 0 }, 'botón Reset del encuadre restaura zoom/offset');
}, {});
