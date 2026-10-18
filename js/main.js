import './core/utils.js';
import './core/params.js';
import './core/persist.js';
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
import './three/format.js';
import './three/loop.js';
import './ui/pane.js';
import './ui/quality.js';
import './ui/strips.js';
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
import { addItem, scheduleCar } from './screens/carousel.js';
import { DF, MF } from './screens/examples.js';
import { curShot, defaultShots, setCurShot, setShots, shots } from './three/camera.js';
import { layout, setQuality } from './three/format.js';
import { tick } from './three/loop.js';
import { refreshEdit } from './ui/pane.js';
import { renderShots, renderStrip, setCarBtn } from './ui/strips.js';
import { EXAMPLES } from './data/examples-data.js';
import { showFirstTime } from './ui/onboarding.js';

/* ───────────────────────── Arranque ───────────────────────── */
(async () => {
  try { await Promise.all([document.fonts.load(`800 72px ${DF}`), document.fonts.load(`400 22px ${MF}`), document.fonts.load(`600 30px ${DF}`)]); } catch {}
  // Pantallas de ejemplo: 5 afiches "Bauhaus · Generative Grid" a su tamaño original de pantalla (1320×2868 → 880 px, sin recorte)
  for (const [src, n] of EXAMPLES) {
    const img = new Image(); img.src = src;
    try { await img.decode(); addItem(img, n, { thumb:src, example:true }); } catch {}
  }
  // tomas guardadas solo si alguna es tuya; si todas eran de ejemplo, se regeneran con el preset
  if (Array.isArray(saved?.shots) && saved.shots.length && !saved.shots.every(s => s.example)) setShots(saved.shots.filter(s => Array.isArray(s.p) && Array.isArray(s.t) && typeof s.fov === 'number'));
  if (!shots.length) defaultShots();
  blocksG.visible = P.scene.showBlocks; ground.visible = P.scene.showFloor; island.visible = P.phone.island;
  camera.fov = shots[0].fov; camera.updateProjectionMatrix();
  controls.target.fromArray(shots[0].t); camera.position.fromArray(shots[0].p); setCurShot(0);
  renderStrip(); renderShots(); refreshEdit(); setCarBtn(); icons(); setQuality(false); layout(); scheduleCar();
  showFirstTime();
  await loadEnv(P.env.preset);
  requestAnimationFrame(tick);
})();
