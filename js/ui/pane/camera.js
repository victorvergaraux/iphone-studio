/* ── Carpeta «Camera» ── 2 pestañas:
   · Lens  — óptica y movimiento: FOV, zoom, easing de vuelo, duración (Fly), deriva (Drift/Rate).
   · Grade — post-proceso final (ShaderPass): brillo, contraste, viñeta y grano.
   (Las tomas/cinemática viven en la card «Cinemática», js/ui/shoteditor.js, no en el panel.) */
import { P } from '../../core/params.js';
import { camera, gradePass } from '../../three/renderer.js';
import { CAM_EASES, camTweening } from '../../three/camera.js';
import { tabs } from './shared.js';

export function setupCamera({ pane }){
  const fC = pane.addFolder({ title:'Camera' });
  const [tLens, tGrade] = tabs(fC, 'Lens', 'Grade');
  tLens.addBinding(P.cam, 'fov', { label:'FOV', min:8, max:60, step:0.5 }).on('change', e => { if (!camTweening) { camera.fov = e.value; camera.updateProjectionMatrix(); } });
  tLens.addBinding(P.cam, 'zoom', { label:'Zoom', min:0.5, max:4, step:0.01 }).on('change', e => { camera.zoom = e.value; camera.updateProjectionMatrix(); });
  tLens.addBinding(P.cam, 'ease', { label:'Ease', options:CAM_EASES });
  tLens.addBinding(P.cam, 'flyDur', { label:'Fly', min:0.3, max:6, step:0.05 });
  tLens.addBinding(P.cam, 'drift', { label:'Drift', min:0, max:4, step:0.01 });
  tLens.addBinding(P.cam, 'driftSpeed', { label:'Rate', min:0.05, max:4, step:0.01 });
  tGrade.addBinding(P.grade, 'brightness', { label:'Bright', min:-0.3, max:0.3, step:0.005 }).on('change', e => gradePass.uniforms.uBrightness.value = e.value);
  tGrade.addBinding(P.grade, 'contrast', { label:'Contrast', min:0.6, max:1.6, step:0.01 }).on('change', e => gradePass.uniforms.uContrast.value = e.value);
  tGrade.addBinding(P.grade, 'vignette', { label:'Vignette', min:0, max:0.8, step:0.01 }).on('change', e => gradePass.uniforms.uVignette.value = e.value);
  tGrade.addBinding(P.grade, 'grain', { label:'Grain', min:0, max:0.12, step:0.001 }).on('change', e => gradePass.uniforms.uGrain.value = e.value);
}
