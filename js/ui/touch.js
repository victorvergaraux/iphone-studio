import { TOUCH } from 'three';
import { canvas, controls } from '../three/renderer.js';
import { flyTo, curShot, presTL } from '../three/camera.js';
import { hooks } from '../core/hooks.js';

/* ───────────────────────── Gestos táctiles / doble toque ─────────────────────────
   - OrbitControls: 1 dedo rota, 2 dedos zoom (pellizco) + pan. Se fija explícito por si cambian los valores por defecto.
   - Doble toque (o doble clic) sobre el canvas = reencuadrar a la toma activa con el vuelo normal
     (si no hay toma activa, a la toma 0). Se ignora mientras corre la presentación.
   El canvas es hermano de la UI (no su ancestro): los toques sobre paneles, dock o rail nunca llegan aquí. */
controls.touches = { ONE: TOUCH.ROTATE, TWO: TOUCH.DOLLY_PAN };

function reframe(){
  if (presTL) return;                                   // presentación corriendo: no se interrumpe
  const n = hooks.getShots?.().length || 0;
  if (n < 1) return;
  flyTo(curShot >= 0 && curShot < n ? curShot : 0);
}

// Doble toque propio (los navegadores táctiles no siempre emiten dblclick con touch-action:none)
const TAP_MS = 400, TAP_DIST = 30, MOVE_MAX = 10;
let down = null, lastTap = null;
canvas.addEventListener('pointerdown', e => {
  if (e.pointerType === 'mouse') return;                // el ratón usa dblclick
  down = e.isPrimary ? { x:e.clientX, y:e.clientY, t:performance.now(), multi:false } : (down && (down.multi = true, down));
});
canvas.addEventListener('pointerup', e => {
  if (e.pointerType === 'mouse' || !down || !e.isPrimary) return;
  const d = down; down = null; 
  const now = performance.now();
  // Un toque = corto y casi sin movimiento (si no, fue arrastre u orbitar)
  if (d.multi || now - d.t > 300 || Math.hypot(e.clientX - d.x, e.clientY - d.y) > MOVE_MAX) { lastTap = null; return; }
  if (lastTap && now - lastTap.t < TAP_MS && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < TAP_DIST) { lastTap = null; reframe(); }
  else lastTap = { x:e.clientX, y:e.clientY, t:now };
});
canvas.addEventListener('pointercancel', () => { down = null; lastTap = null; });
canvas.addEventListener('dblclick', e => { if (e.pointerType !== 'touch') reframe(); });
