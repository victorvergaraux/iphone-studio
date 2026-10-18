import { reduced } from './utils.js';

/* ───────────────────────── Parámetros (fuente única de verdad para Tweakpane) ───────────────────────── */
export const P = {
  scene: { preset:'light', bg:'#e9e7e2', floor:'#e9e7e2', blocks:'#e6e3dd', accent:'#c9c5bc', showBlocks:true, showFloor:true,
    towerX:-2.7, towerY:1.7, towerZ:-1.9, blockX:2.5, blockY:0.14, blockZ:1.9, cylX:1.7, cylY:1.175, cylZ:-0.95, sphereX:-1.25, sphereY:0.82, sphereZ:0.85 },
  env:   { preset:'hall', intensity:1, normalize:true, rotation:0, exposure:1, tone:'neutral', background:'solid', blur:0.35, bgIntensity:1 },
  shadow:{ on:true, strength:1.2, size:3, minElev:22, ao:1, aoRadius:0.3 },
  phone: { finish:'graphite', btnDepth:0.006, pose:'lean', yaw:-23, y:0, radius:0.18, islandW:0.18, islandR:1, frame:'#4a4a4c', glass:0.63, glassRough:0.08, smudgeR:0.02, smudgeM:0.89, smudgeH:0.2, smudgeScale:0.35, island:true },
  metal: { rough:0.38, metal:1, streak:0.55, scale:4, angle:0, aniso:0.55 },
  anim:  { type:'none', amp:1, speed:1 },
  cam:   { fov:10, zoom:1, ease:'expo.inOut', flyDur:1.8, drift: reduced ? 0 : 0.35, driftSpeed:0.6 },
  car:   { mode:'rtl', transition:0.85, fadeDur:1.2, hold:2.6, scrollDelay:0.6, parallax:0.38, autoplay:true, exposure:1.0, screenBg:'#0b0b0b', replaceAll:false },
  grade: { brightness:0, contrast:1, vignette:0.12, grain:0 },
  shots: { preset:'producto', transition:0, hold:3, loop:true, randomHalf:false, halfCount:1 },
  exp:   { format:'Pantalla', long:1920, length:15, mbps:16, fps:30, pngScale:2, playShots:true, mode:'offline', container:'auto', transparent:false, shadowOpacity:0.45 },
};
