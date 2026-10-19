import { P } from '../core/params.js';
import { $ } from '../core/utils.js';
import { hideNotice, showNotice } from '../core/notice.js';
import { canvas, composer, renderer } from './renderer.js';
import { sun } from './scene.js';
import { loadEnv } from './hdri.js';
import { accum } from './accum.js';
import { stopPresentation } from './camera.js';
import { items } from '../screens/carousel.js';

/* ───────────────────────── Pérdida y restauración del contexto WebGL ─────────────────────────
   La GPU puede soltar el contexto (driver reiniciado, pestaña en segundo plano con poca memoria, GPU compartida).
   · Al perderlo: preventDefault (si no, el navegador no lo restaura), se pausa el render (composer/renderer ya no
     dibujan, así no hay bucles de errores GL en consola), se detienen presentación y grabación y se avisa.
   · Al restaurarse: three (WebGLRenderer) ya rehace programas, texturas y render targets bajo demanda; aquí solo se
     rehace lo que NO se regenera solo: la textura de entorno (PMREM, se renderizó una vez), el mapa de sombras,
     las texturas del carrusel y los acumuladores del refinamiento progresivo.
   · Si pasan ~5 s sin restaurarse, el aviso ofrece recargar la página. */
export let glLost = false;
let timer = 0;

// Mientras el contexto está perdido, los render son no-op (three ya lo hace en renderer.render; el composer no)
const _composerRender = composer.render.bind(composer), _render = renderer.render.bind(renderer);
composer.render = (...a) => { if (!glLost) _composerRender(...a); };
renderer.render = (...a) => { if (!glLost) _render(...a); };

function onLost(e){
  e.preventDefault(); glLost = true; clearTimeout(timer);
  try { stopPresentation(); } catch {}
  if (document.body.classList.contains('recording')) $('#recStop')?.click(); // cancela la grabación en curso: los cuadros ya no serían válidos
  showNotice('Se perdió la GPU, recuperando…');
  timer = setTimeout(() => { if (glLost) showNotice('No se recuperó la GPU.', { label:'Recargar', onClick:() => location.reload() }); }, 5000);
}
async function onRestored(){
  // three procesa su propio 'webglcontextrestored' antes (registrado primero): initGLContext ya dejó el estado limpio
  glLost = false; clearTimeout(timer);
  for (const it of items) if (it.tex) it.tex.needsUpdate = true;   // re-subir las texturas de pantalla
  accum.reset();                                                    // los acumuladores quedaron en blanco
  renderer.shadowMap.needsUpdate = true; sun.shadow.needsUpdate = true; // mapa de sombras
  hideNotice();
  try { await loadEnv(P.env.preset); } catch {}                     // reconstruye el PMREM (el HDRI está en caché)
}
canvas.addEventListener('webglcontextlost', onLost, false);
canvas.addEventListener('webglcontextrestored', onRestored, false);
