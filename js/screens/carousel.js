import * as THREE from 'three';
import { EASE } from '../core/utils.js';
import { P } from '../core/params.js';
import { renderer } from '../three/renderer.js';
import { S_ASPECT } from '../three/iphone.js';
import { applyTransitionMode, screenMat } from '../three/screen.js';
import { hooks } from '../core/hooks.js';

/* ───────────────────────── Pantallas (carrusel) ───────────────────────── */
export const maxTex = renderer.capabilities.maxTextureSize;
const aniso = renderer.capabilities.getMaxAnisotropy();
export const items = [];
export let cur = 0, sel = 0, nextIdx = -1, carPlaying = P.car.autoplay, carTimer = null, carTween = null, scrollTween = null;

function makeTex(src){
  const t = src instanceof HTMLVideoElement ? new THREE.VideoTexture(src) : new THREE.Texture(src);
  t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; t.needsUpdate = true;
  // VideoTexture nace SIN mipmaps (minFilter Linear): un video de 1080p/4K en una pantalla pequeña e inclinada se muestrea saltando
  // píxeles (alias, centelleo, detalle perdido) y la anisotropía no hace nada. Con mipmaps se filtra igual que las imágenes.
  if (src instanceof HTMLVideoElement) { t.generateMipmaps = true; t.minFilter = THREE.LinearMipmapLinearFilter; }
  return t;
}
export function addItem(src, name, opts = {}){
  const w = src.videoWidth || src.width, h = src.videoHeight || src.height, ia = w / h;
  const tall = ia < S_ASPECT * 0.82; // screenshot largo → ajuste a ancho con scroll
  const it = { name, src, tex: makeTex(src), aspect: ia, isVideo: src instanceof HTMLVideoElement,
    fit: tall ? 'width' : 'cover', zoom: 1, offX: 0, offY: 0, scroll: tall ? 0 : 0.5, autoScroll: tall, thumb: opts.thumb || null, example: !!opts.example,
    // id/blob/stored: persistencia en IndexedDB (screens/store.js). blob = archivo original; stored = ya escrito en la base
    id: opts.id || (Date.now().toString(36) + Math.random().toString(36).slice(2, 8)), blob: opts.blob || null, stored: !!opts.stored };
  items.push(it); return it;
}
// Fracción visible + centro de muestreo según encuadre (equivalente a object-fit + object-position)
export function xform(it, out){
  const sa = S_ASPECT, ia = it.aspect; let vx, vy;
  if (it.fit === 'width') { vx = 1; vy = ia / sa; }
  else if (it.fit === 'cover') { if (ia > sa) { vx = sa / ia; vy = 1; } else { vx = 1; vy = ia / sa; } }
  else { if (ia > sa) { vx = 1; vy = ia / sa; } else { vx = sa / ia; vy = 1; } } // contain
  vx /= it.zoom; vy /= it.zoom;
  const cy = vy < 1 ? 0.5 + (0.5 - vy/2) * (1 - 2 * it.scroll) : 0.5;
  out.set(vx, vy, 0.5 + it.offX, cy + it.offY);
}
const canScroll = it => { const v = new THREE.Vector4(); xform(it, v); return v.y < 0.999; };

export function clearCar(){ carTimer?.kill(); carTween?.kill(); scrollTween?.kill(); carTimer = carTween = scrollTween = null; }
export function scheduleCar(){
  clearCar();
  const it = items[cur]; if (!it) return;
  const hold = Math.max(0.2, P.car.hold);
  if (it.autoScroll && canScroll(it)) {
    // delay: la pantalla queda quieta arriba antes de bajar; el scroll ocupa el resto del tiempo visible
    const d = Math.min(Math.max(0, P.car.scrollDelay), Math.max(0, hold - 0.2));
    it.scroll = 0;
    scrollTween = gsap.to(it, { scroll:1, delay:d, duration:Math.max(0.2, hold - d), ease:'power3.inOut', onUpdate:() => hooks.refreshScroll() }); // power3 = Quart en GSAP (t⁴)
  }
  if (carPlaying && items.length > 1) carTimer = gsap.delayedCall(hold, () => goTo((cur + 1) % items.length));
}
/* Reinicio duro del carrusel (export): sin animar, pantalla 1 activa, scroll arriba, videos al inicio,
   y el ciclo de tiempos vuelve a empezar desde cero en el reloj del export. */
export function resetCarousel(){
  clearCar(); nextIdx = -1; cur = 0; sel = 0;
  screenMat.uniforms.uProgress.value = 0;
  items.forEach(it => { if (it.autoScroll && canScroll(it)) it.scroll = 0; if (it.isVideo) { try { it.src.currentTime = 0; } catch {} } it.t0 = gsap.globalTimeline.time(); }); // t0: lo usa el export offline para sincronizar videos
  hooks.renderStrip(); hooks.refreshEdit(); scheduleCar();
}
export function goTo(i){
  if (!items.length) return;
  if (nextIdx >= 0) { cur = nextIdx; nextIdx = -1; } // interrumpir: fijar la entrante como actual
  i = (i + items.length) % items.length;
  if (i === cur && nextIdx < 0) { scheduleCar(); return; }
  clearCar();
  nextIdx = i;
  const it = items[i]; if (it.autoScroll && canScroll(it)) it.scroll = 0;
  if (it.isVideo) it.src.currentTime = 0;
  it.t0 = gsap.globalTimeline.time(); // instante de activación (reloj GSAP): el export offline sincroniza los videos con él
  screenMat.uniforms.uProgress.value = 0;
  applyTransitionMode();
  const fade = P.car.mode === 'fade';
  // fundido con sine.inOut: con expo la mezcla se concentra en el centro y se percibe como un corte
  carTween = gsap.to(screenMat.uniforms.uProgress, { value:1, duration:fade ? P.car.fadeDur : P.car.transition, ease:fade ? 'sine.inOut' : EASE, onComplete(){
    cur = i; nextIdx = -1; screenMat.uniforms.uProgress.value = 0; hooks.renderStrip(); scheduleCar();
  }});
  hooks.renderStrip();
}

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setCur = v => { cur = v; };

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setSel = v => { sel = v; };

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setNextIdx = v => { nextIdx = v; };

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setCarPlaying = v => { carPlaying = v; };
