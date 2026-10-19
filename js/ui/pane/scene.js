/* ── Carpeta «Scene» ── 4 pestañas:
   · Set   — paleta (presets Light/MeLi/Dark), colores BG/Floor/Blocks/Props, visibilidad (Solids/Ground), superficie del piso (Real, Rough, Metal, mapas).
   · Objs  — preset de objetos + posición XYZ (picker 3D) de torre, bloque, cilindro y esfera.
   · HDRI  — mapa, intensidad, rotación, exposición, tone mapping, fondo (Backdrop/Blur/Gain).
   · Light — sombra (Shadow/Strength/Softness/Elevation) y AO (GTAO).
   Devuelve la carpeta (pane.js la deja expandida por defecto; el resto arranca colapsado). */
import * as THREE from 'three';
import { P } from '../../core/params.js';
import { gtao, renderer } from '../../three/renderer.js';
import { bgColor, blocksG, ground, mAccent, mBlocks, mFloor, OBJ_PRESETS, applyFloorMode, applyObjPos, applyObjPreset, applySurfaceTex, placeKey, sun } from '../../three/scene.js';
import { HDRI, applyBackground, applyEnvIntensity, loadEnv, scheduleEnv } from '../../three/hdri.js';
import { prop } from '../../three/smudge.js';
import { tabs, isSyncing, isApplyingPreset, setApplyingPreset } from './shared.js';

/* Presets de color. Regla 60-30-10 en Mercado Libre: 60 % fondo + piso blanco, 30 % bloques
   amarillo #FFE600, 10 % objetos azul #3483FA. */
const SCENE_PRESETS = {
  light: { bg:'#eceae6', floor:'#eceae6', blocks:'#e3e1dc', accent:'#cbc8c1' },
  meli:  { bg:'#ffffff', floor:'#f6f6f6', blocks:'#ffe600', accent:'#3483fa' },
  dark:  { bg:'#111111', floor:'#151515', blocks:'#222222', accent:'#3a3a3a' },
};

/* Objs: posición XYZ (picker 3D) de torre, bloque, cilindro y esfera. Proxy con accesores sobre las claves planas de P. */
const objPt = k => ({ get x(){ return P.scene[k + 'X']; }, set x(v){ P.scene[k + 'X'] = v; },
                      get y(){ return P.scene[k + 'Y']; }, set y(v){ P.scene[k + 'Y'] = v; },
                      get z(){ return P.scene[k + 'Z']; }, set z(v){ P.scene[k + 'Z'] = v; } });

export function setupScene({ pane }){
  function applyScenePreset(k){
    if (isSyncing()) return; // un refresco (deshacer) no debe reaplicar la paleta sobre los colores restaurados
    const c = SCENE_PRESETS[k]; if (!c || isApplyingPreset()) return;
    setApplyingPreset(true);
    Object.assign(P.scene, c);
    bgColor.set(c.bg); mFloor.color.set(c.floor); mBlocks.color.set(c.blocks); mAccent.color.set(c.accent);
    applyBackground(); pane.refresh();
    setApplyingPreset(false);
  }

  /* ── Scene: Set (colores + visibilidad) · HDRI · Light (sombra + AO) ── */
  const fS = pane.addFolder({ title:'Scene' });
  const [tSet, tObjs, tHdri, tLight] = tabs(fS, 'Set', 'Objs', 'HDRI', 'Light');

  tSet.addBinding(P.scene, 'preset', { label:'Palette', options:{ 'Light':'light', 'MeLi':'meli', 'Dark':'dark' } }).on('change', e => applyScenePreset(e.value));
  tSet.addBinding(P.scene, 'bg', { label:'BG' }).on('change', e => { bgColor.set(e.value); applyBackground(); });
  tSet.addBinding(P.scene, 'floor', { label:'Floor' }).on('change', e => mFloor.color.set(e.value));
  tSet.addBinding(P.scene, 'blocks', { label:'Blocks' }).on('change', e => mBlocks.color.set(e.value));
  tSet.addBinding(P.scene, 'accent', { label:'Props' }).on('change', e => mAccent.color.set(e.value));
  tSet.addBlade({ view:'separator' });
  tSet.addBinding(P.scene, 'showBlocks', { label:'Solids' }).on('change', e => { blocksG.visible = e.value; prop.visible = e.value && P.phone.pose === 'lean'; });
  tSet.addBinding(P.scene, 'showFloor', { label:'Ground' }).on('change', e => { ground.visible = e.value; });
  tSet.addBlade({ view:'separator' });
  tSet.addBinding(P.scene, 'floorReal', { label:'Real' }).on('change', applyFloorMode); // piso y losa: físico con manchas / Standard plano
  tSet.addBinding(P.scene, 'rough', { label:'Rough', min:0, max:1, step:0.01 }).on('change', applySurfaceTex); // rugosidad base de piso y losa
  tSet.addBinding(P.scene, 'metal', { label:'Metal', min:0, max:1, step:0.01 }).on('change', applySurfaceTex);  // metalness base
  tSet.addBinding(P.scene, 'texRough', { label:'Map R', min:0, max:1, step:0.01 }).on('change', applySurfaceTex); // manchas en roughnessMap
  tSet.addBinding(P.scene, 'texMetal', { label:'Map M', min:0, max:1, step:0.01 }).on('change', applySurfaceTex); // manchas en metalnessMap
  tSet.addBinding(P.scene, 'texScale', { label:'Scale', min:0.05, max:4, step:0.01 }).on('change', applySurfaceTex);

  tObjs.addBinding(P.scene, 'objPreset', { label:'Preset', options:Object.fromEntries(Object.entries(OBJ_PRESETS).map(([k, v]) => [v.label, k])) })
    .on('change', () => { if (isSyncing()) return; applyObjPreset(); pane.refresh(); });
  for (const [k, label] of [['tower', 'Tower'], ['block', 'Block'], ['cyl', 'Cylinder'], ['sphere', 'Sphere']])
    tObjs.addBinding({ p: objPt(k) }, 'p', { label, picker:'inline', expanded:false,
      x:{ min:-8, max:8, step:0.05 }, y:{ min:0, max:6, step:0.05 }, z:{ min:-8, max:8, step:0.05 } })
      .on('change', applyObjPos);

  tHdri.addBinding(P.env, 'preset', { label:'Map', options:Object.fromEntries(HDRI.map(n => [n, n])) }).on('change', e => loadEnv(e.value));
  tHdri.addBinding(P.env, 'intensity', { label:'Intensity', min:0, max:4, step:0.01 }).on('change', applyEnvIntensity);
  tHdri.addBinding(P.env, 'normalize', { label:'Normalize' }).on('change', applyEnvIntensity);
  tHdri.addBinding(P.env, 'rotation', { label:'Rotation', min:0, max:360, step:1 }).on('change', scheduleEnv);
  tHdri.addBinding(P.env, 'exposure', { label:'Exposure', min:0.2, max:3, step:0.01 }).on('change', e => renderer.toneMappingExposure = e.value);
  tHdri.addBinding(P.env, 'tone', { label:'Tone', options:{ 'Neutral':'neutral', 'AgX':'agx', 'ACES':'aces' } })
    .on('change', e => renderer.toneMapping = { neutral:THREE.NeutralToneMapping, agx:THREE.AgXToneMapping, aces:THREE.ACESFilmicToneMapping }[e.value]);
  tHdri.addBlade({ view:'separator' });
  tHdri.addBinding(P.env, 'background', { label:'Backdrop', options:{ 'Solid':'solid', 'HDRI':'hdri' } }).on('change', applyBackground);
  tHdri.addBinding(P.env, 'blur', { label:'Blur', min:0, max:1, step:0.01 }).on('change', applyBackground);
  tHdri.addBinding(P.env, 'bgIntensity', { label:'Gain', min:0, max:3, step:0.01 }).on('change', applyBackground);

  tLight.addBinding(P.shadow, 'on', { label:'Shadow' }).on('change', e => { sun.castShadow = e.value; });
  tLight.addBinding(P.shadow, 'strength', { label:'Strength', min:0, max:5, step:0.01 }).on('change', e => sun.intensity = e.value);
  tLight.addBinding(P.shadow, 'size', { label:'Softness', min:0.2, max:12, step:0.1 }).on('change', e => sun.shadow.radius = e.value); // tamaño angular de la luz (°) → PCSS
  tLight.addBinding(P.shadow, 'minElev', { label:'Elevation', min:5, max:80, step:1 }).on('change', placeKey);
  tLight.addBlade({ view:'separator' });
  tLight.addBinding(P.shadow, 'ao', { label:'AO', min:0, max:1, step:0.01 }).on('change', e => gtao.blendIntensity = e.value);
  tLight.addBinding(P.shadow, 'aoRadius', { label:'Radius', min:0.05, max:1, step:0.01 }).on('change', e => gtao.updateGtaoMaterial({ radius:e.value }));

  return fS;
}
