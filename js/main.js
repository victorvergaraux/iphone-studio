import './core/utils.js';
import './core/params.js';
import './core/persist.js';
import './core/pwa.js';
import './three/renderer.js';
import './three/scene.js';
import './three/hdri.js';
import './three/metal.js';
import './three/iphone.js';
import './three/screen.js';
import './three/smudge.js';
import './screens/carousel.js';
import './screens/examples.js';
import './three/camera.js';
import './three/frame.js';
import './three/loop.js';
import './three/glcontext.js'; // pérdida/restauración del contexto WebGL
import './ui/pane.js';
import './ui/quality.js';
import './ui/strips.js';
import './ui/shotbar.js';
import './ui/touch.js';
import './ui/dockToggle.js';
import './ui/onboarding.js';
import './ui/exportcard.js';
import './screens/load.js';
import './export/export.js';
import './export/offline.js';
import './export/project.js';
import { icons } from './core/utils.js';
import { P } from './core/params.js';
import { saved } from './core/persist.js';
import { camera, controls } from './three/renderer.js';
import { blocksG, ground } from './three/scene.js';
import { loadEnv } from './three/hdri.js';
import { island } from './three/screen.js';
import { addItem, items, scheduleCar } from './screens/carousel.js';
import { loadBlobs } from './screens/load.js';
import { loadStored } from './screens/store.js';
import { DF, MF } from './screens/examples.js';
import { sanitizeShot, defaultShots, setCurShot, setShots, shots } from './three/camera.js';
import { layout } from './three/frame.js';
import { setQuality } from './three/session.js';
import { tick } from './three/loop.js';
import { refreshEdit } from './ui/pane.js';
import { renderShots, renderStrip, setCarBtn } from './ui/strips.js';
import { EXAMPLES } from './data/examples-data.js';
import { showFirstTime } from './ui/onboarding.js';
import './ui/shoteditor.js'; // editor de cinemática (card)
import './core/history.js'; // deshacer / rehacer (tomas + ajustes)

/* ───────────────────────── Arranque ───────────────────────── */
(async () => {
  try { await Promise.all([document.fonts.load(`800 72px ${DF}`), document.fonts.load(`400 22px ${MF}`), document.fonts.load(`600 30px ${DF}`)]); } catch {}
  // Pantallas de ejemplo: 5 afiches "Bauhaus · Generative Grid" a su tamaño original de pantalla (1320×2868 → 880 px, sin recorte)
  // Si hay pantallas propias guardadas (IndexedDB) se restauran EN LUGAR de los ejemplos; si no (o falla), ejemplos como siempre
  const stored = await loadStored();
  if (stored.length) await loadBlobs(stored.map(s => s.blob), stored, { replace:false, silent:true });
  // Ejemplos: descarga + decodificación EN PARALELO (todas las peticiones salen a la vez); se agregan en orden estricto.
  // Solo se espera la primera (arranque rápido); el resto se agrega en segundo plano en cuanto está lista, sin reordenar.
  if (!items.length) {
    const loads = EXAMPLES.map(([src, n]) => { const img = new Image(); img.src = src; return img.decode().then(() => [img, n, src], () => null); });
    const add = r => { if (r) addItem(r[0], r[1], { thumb:r[2], example:true }); };
    if (loads.length) add(await loads[0]);
    (async () => {
      for (const l of loads.slice(1)) add(await l); // orden = orden del manifiesto aunque lleguen desordenadas
      // Con una sola pantalla scheduleCar() no programa el avance (necesita ≥ 2): hay que reprogramarlo cuando llegan las demás, si no el carrusel nunca arranca
      if (loads.length > 1) { renderStrip(); refreshEdit(); scheduleCar(); }
    })();
  }
  // tomas guardadas solo si alguna es tuya; si todas eran de ejemplo, se regeneran con el preset
  if (Array.isArray(saved?.shots) && saved.shots.length && !saved.shots.every(s => s.example)) setShots(saved.shots.map(sanitizeShot).filter(Boolean));
  if (!shots.length) defaultShots();
  blocksG.visible = P.scene.showBlocks; ground.visible = P.scene.showFloor; island.visible = P.phone.island;
  camera.fov = shots[0].fov; camera.updateProjectionMatrix();
  controls.target.fromArray(shots[0].t); camera.position.fromArray(shots[0].p); setCurShot(0);
  renderStrip(); renderShots(); refreshEdit(); setCarBtn(); icons(); setQuality(false); layout(); scheduleCar();
  showFirstTime();
  await loadEnv(P.env.preset);
  requestAnimationFrame(tick);
})();
