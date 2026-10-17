import * as THREE from 'three';
import { Pane } from 'tweakpane';
import * as EssentialsPlugin from '@tweakpane/plugin-essentials';
import { $, DUR, EASE } from '../core/utils.js';
import { P } from '../core/params.js';
import { STORE_KEY, saveSoon, saveT } from '../core/persist.js';
import { camera, gradePass, gtao, renderer } from '../three/renderer.js';
import { bgColor, blocksG, catcher, ground, mAccent, mBlocks, mFloor, applyObjPos, placeKey, sun } from '../three/scene.js';
import { HDRI, applyBackground, applyEnvIntensity, loadEnv, scheduleEnv } from '../three/hdri.js';
import { brushedTex, makeBrushed } from '../three/metal.js';
import { S_ASPECT, anchor, mFrame, makeButtons } from '../three/iphone.js';
import { applyTransitionMode, island, mGlass, screenMat } from '../three/screen.js';
import { applySmudgeScale, prop, rebuildShape, setPose, smudgeU } from '../three/smudge.js';
import { cur, goTo, items, nextIdx, scheduleCar, scrollTween, sel } from '../screens/carousel.js';
import { CAM_EASES, SHOT_PRESETS, applyShotPreset, camTweening } from '../three/camera.js';
import { FORMATS, INFO, infoBinding, layout, panelOpen, setInfoBinding, setPanel } from '../three/format.js';
import { addShot, deleteShot, togglePres, updateShot } from './strips.js';
import { snapshot } from '../export/export.js';
import { startRecording } from '../export/offline.js';
import { exportProject } from '../export/project.js';
import { hooks } from '../core/hooks.js';

/* ───────────────────────── Tweakpane ───────────────────────── */
// Panel raíz con título: Tweakpane dibuja su propia barra plegable → minimiza TODO el panel
/* Panel compacto: 7 carpetas (antes 13). Los grupos relacionados viven en pestañas (addTab, nativo de
   Tweakpane 4) → solo se ve una página a la vez y el alto total cae ~60 %. Etiquetas: una palabra en inglés
   o sigla. Las filas de botones usan 'buttongrid' (@tweakpane/plugin-essentials): 3 acciones en 1 fila. */
export const pane = new Pane({ container: $('#pane'), title:'Controls', expanded: panelOpen() });
pane.registerPlugin(EssentialsPlugin);
pane.on('fold', e => { if (e.target === pane) setPanel(e.expanded); }); // solo el panel raíz: plegarlo también oculta la barra de pantallas
const EDIT = { fit:'cover', zoom:1, offX:0, offY:0, scroll:.5, autoScroll:false };
const OFF = { xy:{ x:0, y:0 } }; // offset X/Y fusionado en un solo control Point2D (1 fila + pad 2D)
let syncing = false; // evita que refrescar el panel dispare los handlers de cambio
const quietRefresh = () => { syncing = true; pane.refresh(); syncing = false; };
export function refreshEdit(){ const it = items[sel]; if (!it) return; Object.assign(EDIT, { fit:it.fit, zoom:it.zoom, offX:it.offX, offY:it.offY, scroll:it.scroll, autoScroll:it.autoScroll }); OFF.xy.x = it.offX; OFF.xy.y = it.offY; quietRefresh(); }
export function refreshScroll(){ const it = items[cur]; if (!it || cur !== sel || !bScroll) return; EDIT.scroll = it.scroll; syncing = true; bScroll.refresh(); syncing = false; }
const tabs = (folder, ...titles) => folder.addTab({ pages: titles.map(title => ({ title })) }).pages;
const row = (parent, titles, fns, label) => parent.addBlade({ view:'buttongrid', size:[titles.length, 1], cells:x => ({ title:titles[x] }), ...(label ? { label } : {}) })
  .on('click', ev => fns[ev.index[0]]());

/* ── Scene: Set (colores + visibilidad) · HDRI · Light (sombra + AO) ── */
const fS = pane.addFolder({ title:'Scene' });
const [tSet, tObjs, tHdri, tLight] = tabs(fS, 'Set', 'Objs', 'HDRI', 'Light');
/* Presets de color. Regla 60-30-10 en Mercado Libre: 60 % fondo + piso blanco, 30 % bloques
   amarillo #FFE600, 10 % objetos azul #3483FA. */
const SCENE_PRESETS = {
  light: { bg:'#eceae6', floor:'#eceae6', blocks:'#e3e1dc', accent:'#cbc8c1' },
  meli:  { bg:'#ffffff', floor:'#f6f6f6', blocks:'#ffe600', accent:'#3483fa' },
  dark:  { bg:'#111111', floor:'#151515', blocks:'#222222', accent:'#3a3a3a' },
};
let applyingPreset = false;
function applyScenePreset(k){
  const c = SCENE_PRESETS[k]; if (!c || applyingPreset) return;
  applyingPreset = true;
  Object.assign(P.scene, c);
  bgColor.set(c.bg); mFloor.color.set(c.floor); mBlocks.color.set(c.blocks); mAccent.color.set(c.accent);
  applyBackground(); pane.refresh();
  applyingPreset = false;
}
tSet.addBinding(P.scene, 'preset', { label:'Palette', options:{ 'Light':'light', 'MeLi':'meli', 'Dark':'dark' } }).on('change', e => applyScenePreset(e.value));
tSet.addBinding(P.scene, 'bg', { label:'BG' }).on('change', e => { bgColor.set(e.value); applyBackground(); });
tSet.addBinding(P.scene, 'floor', { label:'Floor' }).on('change', e => mFloor.color.set(e.value));
tSet.addBinding(P.scene, 'blocks', { label:'Blocks' }).on('change', e => mBlocks.color.set(e.value));
tSet.addBinding(P.scene, 'accent', { label:'Props' }).on('change', e => mAccent.color.set(e.value));
tSet.addBlade({ view:'separator' });
tSet.addBinding(P.scene, 'showBlocks', { label:'Solids' }).on('change', e => { blocksG.visible = e.value; prop.visible = e.value && P.phone.pose === 'lean'; });
tSet.addBinding(P.scene, 'showFloor', { label:'Ground' }).on('change', e => { ground.visible = e.value; });

/* Objs: posición XYZ (picker 3D) de torre, bloque, cilindro y esfera. Proxy con accesores sobre las claves planas de P. */
const objPt = k => ({ get x(){ return P.scene[k + 'X']; }, set x(v){ P.scene[k + 'X'] = v; },
                      get y(){ return P.scene[k + 'Y']; }, set y(v){ P.scene[k + 'Y'] = v; },
                      get z(){ return P.scene[k + 'Z']; }, set z(v){ P.scene[k + 'Z'] = v; } });
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

/* ── Phone: Body · Glass (+ huellas) · Metal · Motion ── */
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

const FINISHES = { 'Graphite':'graphite', 'Natural':'natural', 'Black':'black', 'White':'white', 'Desert':'desert', 'Blue':'blue' };
const FINISH_COLORS = { graphite:'#4a4a4c', natural:'#b4afa6', black:'#2c2c2e', white:'#e2e1dc', desert:'#bfa58b', blue:'#3d4858' };
tMetal.addBinding(P.phone, 'finish', { label:'Finish', options:FINISHES }).on('change', e => {
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

/* ── Screens: Flow (carrusel) · Edit (pantalla seleccionada) ── */
const fK = pane.addFolder({ title:'Screens' });
const [tFlow, tEdit] = tabs(fK, 'Flow', 'Edit');
tFlow.addBinding(P.car, 'mode', { label:'Mode', options:{ 'Up':'up', 'Down':'down', 'LTR':'ltr', 'RTL':'rtl', 'Fade':'fade' } }).on('change', applyTransitionMode);
tFlow.addBinding(P.car, 'transition', { label:'Slide', min:0.3, max:3, step:0.05 });
tFlow.addBinding(P.car, 'fadeDur', { label:'Fade', min:0.1, max:4, step:0.05 });
tFlow.addBinding(P.car, 'hold', { label:'Hold', min:0.5, max:12, step:0.1 }).on('change', () => scheduleCar());
tFlow.addBinding(P.car, 'scrollDelay', { label:'Delay', min:0, max:6, step:0.05 }).on('change', () => scheduleCar());
tFlow.addBlade({ view:'separator' });
tFlow.addBinding(P.car, 'parallax', { label:'Parallax', min:0, max:1, step:0.01 }).on('change', e => screenMat.uniforms.uParallax.value = e.value);
tFlow.addBinding(P.car, 'exposure', { label:'Exposure', min:0.3, max:1.6, step:0.01 }).on('change', e => screenMat.uniforms.uExposure.value = e.value);
tFlow.addBinding(P.car, 'screenBg', { label:'Fill' }).on('change', e => screenMat.uniforms.uBg.value.set(e.value));

const pushEdit = () => { if (syncing) return; const it = items[sel]; if (!it) return; Object.assign(it, EDIT); if (sel !== cur && nextIdx !== sel) goTo(sel); };
tEdit.addBinding(EDIT, 'fit', { label:'Fit', options:{ 'Cover':'cover', 'Contain':'contain', 'Width':'width' } }).on('change', e => { if (syncing) return; if (e.value === 'width') { EDIT.scroll = 0; EDIT.autoScroll = true; } else { EDIT.scroll = .5; } pushEdit(); quietRefresh(); scheduleCar(); });
tEdit.addBinding(EDIT, 'zoom', { label:'Zoom', min:0.5, max:3, step:0.01 }).on('change', pushEdit);
// Point2D: offset X/Y en una fila (+ pad 2D). y invertida → arrastrar arriba sube la imagen
tEdit.addBinding(OFF, 'xy', { label:'Offset', x:{ min:-0.5, max:0.5, step:0.001 }, y:{ min:-0.5, max:0.5, step:0.001, inverted:true } })
  .on('change', e => { EDIT.offX = e.value.x; EDIT.offY = e.value.y; pushEdit(); });
const bScroll = tEdit.addBinding(EDIT, 'scroll', { label:'Scroll', min:0, max:1, step:0.001 }).on('change', () => { if (syncing) return; scrollTween?.kill(); pushEdit(); });
tEdit.addBinding(EDIT, 'autoScroll', { label:'Auto' }).on('change', () => { if (syncing) return; pushEdit(); scheduleCar(); });
tEdit.addButton({ title:'Reset' }).on('click', () => { const it = items[sel]; if (!it) return; const tall = it.aspect < S_ASPECT * .82; Object.assign(it, { fit: tall ? 'width' : 'cover', zoom:1, offX:0, offY:0, scroll: tall ? 0 : .5, autoScroll: tall }); refreshEdit(); scheduleCar(); });

/* ── Camera: Lens (óptica + movimiento) · Grade (post) ── */
const fC = pane.addFolder({ title:'Camera' });
const [tLens, tGrade] = tabs(fC, 'Lens', 'Grade');
tLens.addBinding(P.cam, 'fov', { label:'FOV', min:8, max:60, step:0.5 }).on('change', e => { if (!camTweening) { camera.fov = e.value; camera.updateProjectionMatrix(); } });
tLens.addBinding(P.cam, 'zoom', { label:'Zoom', min:0.5, max:4, step:0.01 }).on('change', e => { camera.zoom = e.value; camera.updateProjectionMatrix(); });
tLens.addBinding(P.cam, 'ease', { label:'Ease', options:CAM_EASES });
tLens.addBinding(P.cam, 'flyDur', { label:'Fly', min:0.3, max:6, step:0.05 });
tLens.addBinding(P.cam, 'drift', { label:'Drift', min:0, max:2, step:0.01 });
tLens.addBinding(P.cam, 'driftSpeed', { label:'Rate', min:0.05, max:2, step:0.01 });
tGrade.addBinding(P.grade, 'brightness', { label:'Bright', min:-0.3, max:0.3, step:0.005 }).on('change', e => gradePass.uniforms.uBrightness.value = e.value);
tGrade.addBinding(P.grade, 'contrast', { label:'Contrast', min:0.6, max:1.6, step:0.01 }).on('change', e => gradePass.uniforms.uContrast.value = e.value);
tGrade.addBinding(P.grade, 'vignette', { label:'Vignette', min:0, max:0.8, step:0.01 }).on('change', e => gradePass.uniforms.uVignette.value = e.value);
tGrade.addBinding(P.grade, 'grain', { label:'Grain', min:0, max:0.12, step:0.001 }).on('change', e => gradePass.uniforms.uGrain.value = e.value);

/* ── Shots: play → ritmo → edición (1 fila) → presets → lista ── */
const fT = pane.addFolder({ title:'Shots' });
export const btnPlay = fT.addButton({ title:'▶ Play  [Space]' }).on('click', togglePres);
fT.addBinding(P.shots, 'transition', { label:'Move', min:0, max:8, step:0.05 }); // 0 = corte seco
fT.addBinding(P.shots, 'hold', { label:'Hold', min:0, max:6, step:0.1 });
fT.addBinding(P.shots, 'loop', { label:'Loop' });
fT.addBinding(P.shots, 'randomHalf', { label:'Random' });
fT.addBinding(P.shots, 'halfCount', { label:'Count', min:1, max:2, step:1 });
row(fT, ['Save [S]', 'Update', 'Delete'], [addShot, updateShot, deleteShot]);
fT.addBinding(P.shots, 'preset', { label:'Preset', options:Object.fromEntries(Object.entries(SHOT_PRESETS).map(([k, v]) => [v.label, k])) });
fT.addButton({ title:'Load preset' }).on('click', applyShotPreset);
export const fList = fT.addFolder({ title:'List' });
export let shotBtns = [];

/* ── Export: formato y tamaño comunes arriba · Video / Image en pestañas ── */
const fE = pane.addFolder({ title:'Export' });
fE.addBinding(P.exp, 'format', { label:'Format', options:Object.fromEntries(Object.keys(FORMATS).map(k => [k === 'Pantalla' ? 'Screen' : k, k])) }).on('change', layout);
fE.addBinding(P.exp, 'long', { label:'Size', options:{ 'HD':1280, 'FHD':1920, 'QHD':2560, '4K':3840 } }).on('change', layout);
setInfoBinding(fE.addBinding(INFO, 'salida', { label:'Output', readonly:true }));
const [tVid, tImg] = tabs(fE, 'Video', 'Image');
tVid.addBinding(P.exp, 'length', { label:'Length', options:{ '15s':15, '30s':30, 'Shots':0 } });
tVid.addBinding(P.exp, 'mbps', { label:'Mbps', options:{ '6':6, '16':16, '40':40 } });
tVid.addBinding(P.exp, 'fps', { label:'FPS', options:{ '30':30, '60':60 } });
tVid.addBinding(P.exp, 'playShots', { label:'Shots' });
tVid.addBinding(P.exp, 'mode', { label:'Mode', options:{ 'Offline':'offline', 'Realtime':'realtime' } });
tVid.addBinding(P.exp, 'container', { label:'Codec', options:{ 'Auto':'auto', 'MP4':'mp4', 'WebM':'webm' } });
tVid.addButton({ title:'Render video' }).on('click', startRecording);
tImg.addBinding(P.exp, 'pngScale', { label:'Scale', options:{ '1×':1, '2×':2 } });
tImg.addBinding(P.exp, 'transparent', { label:'Alpha' });
tImg.addBinding(P.exp, 'shadowOpacity', { label:'Shadow', min:0, max:1, step:0.01 }).on('change', e => catcher.material.opacity = e.value);
tImg.addButton({ title:'Capture PNG' }).on('click', snapshot);

/* ── UI (temporal, no se guarda) + proyecto JSON ── */
const UI_TMP = { panelOpacity:0.1, panelBlur:18, guideDim:0.3, showGrid:true, showFrame:true };
const fUI = pane.addFolder({ title:'UI' });
fUI.addBinding(UI_TMP, 'panelOpacity', { label:'Opacity', min:0, max:1, step:0.01 })
  .on('change', e => document.documentElement.style.setProperty('--panel-a', e.value));
fUI.addBinding(UI_TMP, 'panelBlur', { label:'Blur', min:0, max:60, step:1 })
  .on('change', e => document.documentElement.style.setProperty('--panel-blur', `${e.value}px`));
fUI.addBinding(UI_TMP, 'guideDim', { label:'Dim', min:0, max:1, step:0.01 })
  .on('change', e => document.documentElement.style.setProperty('--guide-dim', e.value));
fUI.addBinding(UI_TMP, 'showGrid', { label:'Grid' }).on('change', e => document.body.classList.toggle('no-grid', !e.value));
fUI.addBinding(UI_TMP, 'showFrame', { label:'Frame' }).on('change', e => document.body.classList.toggle('no-frame', !e.value));
fUI.addBlade({ view:'separator' });
row(fUI, ['Export', 'Import', 'Reset'], [
  exportProject,
  () => $('#projFile').click(),
  () => { clearTimeout(saveT); try { localStorage.removeItem(STORE_KEY); } catch {} location.reload(); },
], 'JSON');
// Arranque limpio: todo colapsado salvo Scene y Shots (lo que más se usa al componer)
pane.children.forEach(c => { if ('expanded' in c && c !== fS && c !== fT) c.expanded = false; });
pane.on('change', () => { if (!syncing) saveSoon(); }); // cambios del usuario → guardado (los refrescos internos no cuentan)

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setShotBtns = v => { shotBtns = v; };

hooks.refreshEdit = refreshEdit;
hooks.refreshScroll = refreshScroll;
hooks.refreshPane = () => pane.refresh();
