import { P } from '../core/params.js';
import { saveSoon } from '../core/persist.js';
import { hooks } from '../core/hooks.js';
import { layout } from '../three/format.js';
import { applyMode } from '../three/quality.js';
import { pane } from './pane.js';

/* ───────────────────────── UI · Quality ─────────────────────────
   Selector de calidad en la raíz del panel, justo debajo del medidor FPS. Cambia el modo en vivo. */
const at = pane.children.indexOf(hooks.fps) + 1; // 0 si el medidor no está → queda arriba
pane.addBinding(P.quality, 'mode', { label:'Quality', options:{ Auto:'auto', High:'high', Max:'max' }, index: at })
  .on('change', () => { applyMode(); layout(); saveSoon(); });
