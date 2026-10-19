/* ── Panel avanzado (Tweakpane) · ENTRADA ──
   Panel compacto: 7 carpetas (antes 13). Los grupos relacionados viven en pestañas (addTab, nativo de
   Tweakpane 4) → solo se ve una página a la vez y el alto total cae ~60 %. Etiquetas: una palabra en inglés
   o sigla. Las filas de botones usan 'buttongrid' (@tweakpane/plugin-essentials): 3 acciones en 1 fila.
   Este módulo crea el `Pane`, el medidor de FPS, el pliegue del panel raíz (+ botón del rail), delega la
   construcción de cada carpeta en js/ui/pane/*.js (scene, phone, screens, camera, ui) y cablea el historial
   y los hooks. API pública: `pane`, `refreshEdit`, `refreshScroll`.
   (Quality se inserta después desde js/ui/quality.js justo debajo del FPS; Shots vive en la card «Cinemática».) */
import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { $ } from '../core/utils.js';
import { T } from '../core/strings.js';
import { saveSoon } from '../core/persist.js';
import { panelOpen, setPanel } from '../three/frame.js';
import { applyAll } from '../export/project.js';
import { record } from '../core/history.js';
import { hooks } from '../core/hooks.js';
import { initShared, isSyncing, setSyncing, isApplyingPreset, quietRefresh } from './pane/shared.js';
import { setupScene } from './pane/scene.js';
import { setupPhone } from './pane/phone.js';
import { setupScreens, refreshEdit, refreshScroll } from './pane/screens.js';
import { setupCamera } from './pane/camera.js';
import { setupUI } from './pane/ui.js';

export { refreshEdit };

// Panel raíz con título: Tweakpane dibuja su propia barra plegable → minimiza TODO el panel
export const pane = new Pane({ container: $('#pane'), title:'Controls', expanded: panelOpen() });
pane.registerPlugin(EssentialsPlugin);
initShared(pane);
// Medidor de FPS: vive dentro del panel raíz → solo se ve con el panel desplegado. loop.js lo alimenta vía hooks (begin/end por cuadro)
hooks.fps = pane.addBlade({ view:'fpsgraph', label:'FPS', rows:2 });
// Botón del rail (#railPanel): pliega/despliega los controles avanzados; aria-pressed sigue al estado real (también al plegar con la barra de título)
const railPanel = $('#railPanel'), syncRailPanel = () => railPanel?.setAttribute('aria-pressed', String(pane.expanded));
pane.on('fold', e => { if (e.target === pane) { setPanel(e.expanded); syncRailPanel(); } }); // solo el panel raíz
railPanel?.addEventListener('click', () => { pane.expanded = !pane.expanded; });
syncRailPanel();

// Carpetas, en orden de aparición: Scene · Phone · Screens · Camera · UI
const ctx = { pane };
const fS = setupScene(ctx);
setupPhone(ctx);
setupScreens(ctx);
setupCamera(ctx);
setupUI(ctx);

// Arranque limpio: todo colapsado salvo Scene (lo que más se usa al componer)
pane.children.forEach(c => { if ('expanded' in c && c !== fS) c.expanded = false; });
pane.on('change', e => { // cambios del usuario → guardado + historial (los refrescos internos no cuentan)
  if (isSyncing()) return; saveSoon();
  if (isApplyingPreset()) return; // refresco interno del preset de paleta (BG/Floor/…): solo cuenta el evento de «Palette»
  const t = e.target, label = t?.label || t?.key || '';
  queueMicrotask(() => record(T.history.adjust(label).trim(), { key:`${label}/${t?.key ?? ''}`, last:e.last !== false })); // microtarea: los handlers del control ya aplicaron P
});
// Deshacer/rehacer de ajustes: re-aplica P a la escena y refresca el panel sin disparar entradas de historial
hooks.applySettings = async () => { setSyncing(true); try { await applyAll({ cam:false }); } finally { setSyncing(false); } };

hooks.refreshEdit = refreshEdit;
hooks.refreshScroll = refreshScroll;
hooks.refreshPane = () => { quietRefresh(); saveSoon(); }; // refresco silencioso: Tweakpane emite 'change' al refrescar y eso llenaría el historial de entradas falsas
