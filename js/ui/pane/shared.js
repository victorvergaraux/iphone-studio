/* ── Panel · estado y helpers compartidos ──
   No construye ninguna carpeta. Reúne lo que usan varios módulos de js/ui/pane/*.js:
   · `tabs` / `row`: atajos de Tweakpane (pestañas y fila de botones 'buttongrid').
   · `syncing`: bandera «refrescando el panel» (evita que un refresco dispare los handlers de cambio / historial).
   · `applyingPreset`: bandera «aplicando el preset de paleta» (el handler de historial ignora los cambios internos de BG/Floor/…).
   · `quietRefresh`: pane.refresh() con `syncing` activo.
   · `OFF`: offset X/Y fusionado en un solo control Point2D (pestaña Screens › Edit). */

let _pane = null; // se inyecta una sola vez desde js/ui/pane.js (evita importar pane.js desde aquí → ciclo)
export const initShared = pane => { _pane = pane; };

export const OFF = { xy:{ x:0, y:0 } };

let syncing = false;
export const isSyncing = () => syncing;
export const setSyncing = v => { syncing = v; };

let applyingPreset = false;
export const isApplyingPreset = () => applyingPreset;
export const setApplyingPreset = v => { applyingPreset = v; };

export const quietRefresh = () => { syncing = true; _pane.refresh(); syncing = false; };

export const tabs = (folder, ...titles) => folder.addTab({ pages: titles.map(title => ({ title })) }).pages;
export const row = (parent, titles, fns, label) => parent.addBlade({ view:'buttongrid', size:[titles.length, 1], cells:x => ({ title:titles[x] }), ...(label ? { label } : {}) })
  .on('click', ev => fns[ev.index[0]]());
