/* ── Carpeta «Screens» ── 2 pestañas:
   · Flow — carrusel: modo de transición, duraciones (Slide/Fade/Hold/Delay), parallax, exposición y relleno.
   · Edit — encuadre de la pantalla seleccionada (Fit, Zoom, Offset Point2D, Scroll, Auto, Reset).
   Aquí viven también `EDIT` (copia editable de la pantalla seleccionada), `refreshEdit` y `refreshScroll`,
   que otros módulos usan (vía pane.js / hooks) para sincronizar el panel con la selección y el scroll en vivo. */
import { P } from '../../core/params.js';
import { saveSoon } from '../../core/persist.js';
import { S_ASPECT } from '../../three/iphone.js';
import { applyTransitionMode, screenMat } from '../../three/screen.js';
import { cur, goTo, items, nextIdx, scheduleCar, scrollTween, sel } from '../../screens/carousel.js';
import { OFF, tabs, isSyncing, setSyncing, quietRefresh } from './shared.js';

const EDIT = { fit:'cover', zoom:1, offX:0, offY:0, scroll:.5, autoScroll:false };
let bScroll = null; // binding del slider Scroll (lo crea setupScreens)

export function refreshEdit(){ const it = items[sel]; if (!it) return; Object.assign(EDIT, { fit:it.fit, zoom:it.zoom, offX:it.offX, offY:it.offY, scroll:it.scroll, autoScroll:it.autoScroll }); OFF.xy.x = it.offX; OFF.xy.y = it.offY; quietRefresh(); }
export function refreshScroll(){ const it = items[cur]; if (!it || cur !== sel || !bScroll) return; EDIT.scroll = it.scroll; setSyncing(true); bScroll.refresh(); setSyncing(false); }

export function setupScreens({ pane }){
  /* ── Screens: Flow (carrusel) · Edit (pantalla seleccionada) ── */
  const fK = pane.addFolder({ title:'Screens' });
  const [tFlow, tEdit] = tabs(fK, 'Flow', 'Edit');
  tFlow.addBinding(P.car, 'mode', { label:'Mode', options:{ '↑':'up', '↓':'down', '→':'ltr', '←':'rtl', 'Fade':'fade' } }).on('change', applyTransitionMode);
  tFlow.addBinding(P.car, 'transition', { label:'Slide', min:0.3, max:3, step:0.05 });
  tFlow.addBinding(P.car, 'fadeDur', { label:'Fade', min:0.1, max:4, step:0.05 });
  tFlow.addBinding(P.car, 'hold', { label:'Hold', min:0.5, max:12, step:0.1 }).on('change', () => scheduleCar());
  tFlow.addBinding(P.car, 'scrollDelay', { label:'Delay', min:0, max:6, step:0.05 }).on('change', () => scheduleCar());
  tFlow.addBlade({ view:'separator' });
  tFlow.addBinding(P.car, 'parallax', { label:'Parallax', min:0, max:1, step:0.01 }).on('change', e => screenMat.uniforms.uParallax.value = e.value);
  tFlow.addBinding(P.car, 'exposure', { label:'Exposure', min:0.3, max:1.6, step:0.01 }).on('change', e => screenMat.uniforms.uExposure.value = e.value);
  tFlow.addBinding(P.car, 'screenBg', { label:'Fill' }).on('change', e => screenMat.uniforms.uBg.value.set(e.value));

  const pushEdit = () => { if (isSyncing()) return; const it = items[sel]; if (!it) return; Object.assign(it, EDIT); if (sel !== cur && nextIdx !== sel) goTo(sel); };
  tEdit.addBinding(EDIT, 'fit', { label:'Fit', options:{ 'Cover':'cover', 'Contain':'contain', 'Width':'width' } }).on('change', e => { if (isSyncing()) return; if (e.value === 'width') { EDIT.scroll = 0; EDIT.autoScroll = true; } else { EDIT.scroll = .5; } pushEdit(); quietRefresh(); scheduleCar(); });
  tEdit.addBinding(EDIT, 'zoom', { label:'Zoom', min:0.5, max:3, step:0.01 }).on('change', pushEdit);
  // Point2D: offset X/Y en una fila (+ pad 2D). y invertida → arrastrar arriba sube la imagen
  tEdit.addBinding(OFF, 'xy', { label:'Offset', x:{ min:-0.5, max:0.5, step:0.001 }, y:{ min:-0.5, max:0.5, step:0.001, inverted:true } })
    .on('change', e => { EDIT.offX = e.value.x; EDIT.offY = e.value.y; pushEdit(); });
  bScroll = tEdit.addBinding(EDIT, 'scroll', { label:'Scroll', min:0, max:1, step:0.001 }).on('change', () => { if (isSyncing()) return; scrollTween?.kill(); pushEdit(); });
  tEdit.addBinding(EDIT, 'autoScroll', { label:'Auto' }).on('change', () => { if (isSyncing()) return; pushEdit(); scheduleCar(); });
  tEdit.addButton({ title:'Reset' }).on('click', () => { const it = items[sel]; if (!it) return; const tall = it.aspect < S_ASPECT * .82; Object.assign(it, { fit: tall ? 'width' : 'cover', zoom:1, offX:0, offY:0, scroll: tall ? 0 : .5, autoScroll: tall }); refreshEdit(); scheduleCar(); saveSoon(); });
}
