/* ── Carpeta «Phone» ── 4 pestañas:
   · Body   — pose, yaw, altura, radio, botones laterales, isla (visibilidad/ancho/redondeo).
   · Glass  — reflejo/rugosidad del cristal + huellas (Smear, Sheen, Haze, Scale).
   · Metal  — acabado (Finish → color del marco), rugosidad/metalness y cepillado anisotrópico.
   · Motion — animación de reposo del teléfono (tipo, amplitud, velocidad). */
import * as THREE from 'three';
import { DUR, EASE } from '../../core/utils.js';
import { P } from '../../core/params.js';
import { brushedTex, makeBrushed } from '../../three/metal.js';
import { anchor, mFrame, makeButtons } from '../../three/iphone.js';
import { island, mGlass } from '../../three/screen.js';
import { applySmudgeScale, rebuildShape, setPose, smudgeU } from '../../three/smudge.js';
import { tabs, isSyncing } from './shared.js';

const FINISHES = { 'Graphite':'graphite', 'Natural':'natural', 'Black':'black', 'White':'white', 'Desert':'desert', 'Blue':'blue' };
const FINISH_COLORS = { graphite:'#4a4a4c', natural:'#b4afa6', black:'#2c2c2e', white:'#e2e1dc', desert:'#bfa58b', blue:'#3d4858' };

export function setupPhone({ pane }){
  const fP = pane.addFolder({ title:'Phone' });
  const [tBody, tGlass, tMetal, tMotion] = tabs(fP, 'Body', 'Glass', 'Metal', 'Motion');
  tBody.addBinding(P.phone, 'pose', { label:'Pose', options:{ 'Lean':'lean', 'Flat':'flat', 'Float':'float' } }).on('change', e => setPose(e.value));
  tBody.addBinding(P.phone, 'yaw', { label:'Yaw', min:-180, max:180, step:1 }).on('change', e => gsap.to(anchor.rotation, { y:THREE.MathUtils.degToRad(e.value), duration:DUR, ease:EASE, overwrite:true }));
  tBody.addBinding(P.phone, 'y', { label:'Y', min:-0.6, max:1.5, step:0.005 });
  tBody.addBinding(P.phone, 'radius', { label:'Radius', min:0.04, max:0.33, step:0.005 }).on('change', rebuildShape);
  tBody.addBinding(P.phone, 'btnDepth', { label:'Buttons', min:0.001, max:0.02, step:0.0005 }).on('change', makeButtons);
  tBody.addBlade({ view:'separator' });
  tBody.addBinding(P.phone, 'island', { label:'Island' }).on('change', e => island.visible = e.value);
  tBody.addBinding(P.phone, 'islandW', { label:'Width', min:0.08, max:0.34, step:0.005 }).on('change', rebuildShape);
  tBody.addBinding(P.phone, 'islandR', { label:'Round', min:0.05, max:1, step:0.01 }).on('change', rebuildShape);

  tGlass.addBinding(P.phone, 'glass', { label:'Reflect', min:0, max:2, step:0.01 }).on('change', e => mGlass.envMapIntensity = e.value * 1.6);
  tGlass.addBinding(P.phone, 'glassRough', { label:'Rough', min:0, max:0.5, step:0.005 }).on('change', e => mGlass.roughness = e.value);
  tGlass.addBlade({ view:'separator' });
  // Huellas (mapa de smudge): Smear = +roughness, Sheen = +metalness, Haze = velo lechoso, Scale = tiling
  tGlass.addBinding(P.phone, 'smudgeR', { label:'Smear', min:0, max:1, step:0.01 }).on('change', e => smudgeU.uSmudgeR.value = e.value);
  tGlass.addBinding(P.phone, 'smudgeM', { label:'Sheen', min:0, max:1, step:0.01 }).on('change', e => smudgeU.uSmudgeM.value = e.value);
  tGlass.addBinding(P.phone, 'smudgeH', { label:'Haze', min:0, max:1, step:0.01 }).on('change', e => smudgeU.uSmudgeH.value = e.value);
  tGlass.addBinding(P.phone, 'smudgeScale', { label:'Scale', min:0.3, max:6, step:0.05 }).on('change', applySmudgeScale);

  tMetal.addBinding(P.phone, 'finish', { label:'Finish', options:FINISHES }).on('change', e => {
    if (isSyncing()) return;
    P.phone.frame = FINISH_COLORS[e.value]; mFrame.color.set(P.phone.frame); pane.refresh();
  });
  tMetal.addBinding(P.phone, 'frame', { label:'Color' }).on('change', e => mFrame.color.set(e.value));
  tMetal.addBinding(P.metal, 'rough', { label:'Rough', min:0.02, max:1, step:0.01 }).on('change', e => mFrame.roughness = e.value);
  tMetal.addBinding(P.metal, 'metal', { label:'Metal', min:0, max:1, step:0.01 }).on('change', e => mFrame.metalness = e.value);
  tMetal.addBlade({ view:'separator' });
  tMetal.addBinding(P.metal, 'streak', { label:'Brush', min:0, max:1, step:0.01 }).on('change', ev => { if (ev.last !== false) makeBrushed(); });
  tMetal.addBinding(P.metal, 'scale', { label:'Scale', min:0.5, max:20, step:0.1 }).on('change', e => brushedTex.repeat.set(e.value, e.value));
  tMetal.addBinding(P.metal, 'angle', { label:'Angle', min:0, max:180, step:1 }).on('change', e => { const r = THREE.MathUtils.degToRad(e.value); brushedTex.rotation = r; mFrame.anisotropyRotation = r; });
  tMetal.addBinding(P.metal, 'aniso', { label:'Aniso', min:0, max:1, step:0.01 }).on('change', e => mFrame.anisotropy = e.value);

  tMotion.addBinding(P.anim, 'type', { label:'Type', options:{ 'None':'none', 'Float':'float', 'Breathe':'breathe', 'Sway':'sway', 'Spin':'spin' } });
  tMotion.addBinding(P.anim, 'amp', { label:'Amp', min:0, max:3, step:0.01 });
  tMotion.addBinding(P.anim, 'speed', { label:'Speed', min:0.1, max:3, step:0.01 });
}
