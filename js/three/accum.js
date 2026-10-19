import * as THREE from 'three';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { camera, composer, gradePass, renderer } from './renderer.js';
import { sun } from './scene.js';

/* ───────────────────────── Refinamiento progresivo (acumulación temporal) ─────────────────────────
   Se renderizan N cuadros de la MISMA escena con la cámara desplazada una fracción de píxel (jitter Halton 2,3) y se
   promedian. Los bordes quedan suavizados por encima del MSAA 4× y el ruido por píxel del PCSS y del GTAO se promedia.

   Dónde se acumula: en un pase propio (AccumPass) entre OutputPass y gradePass → se promedia en espacio de display
   (ya con tone mapping, así un brillo extremo no domina el promedio) y brillo/contraste/viñeta/GRANO corren una sola vez
   sobre el promedio. Decisión sobre el grano: se aplica UNA vez sobre el resultado final (no se promedia: promediar N
   granos independientes lo reduciría ~√N y el PNG perdería la intensidad que el usuario ajustó).

   Alfa: se acumula PREMULTIPLICADO (rgb·a) y se resuelve dividiendo entre el alfa promedio, así un borde que cae en
   unas muestras sí y en otras no pesa por su cobertura real. Con alfa 1 (modo opaco) es idéntico a un promedio simple.

   Costo: con el pase deshabilitado (movimiento, video export) el composer lo salta → cero costo extra. */

const MAX_PREVIEW = 16; // muestras del preview cuando la escena está quieta

// Vértice común: triángulo a pantalla completa (mismo patrón que el gradePass)
const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`;

class AccumPass extends Pass {
  constructor(){
    super();
    this.needsSwap = true; this.enabled = false; // deshabilitado por defecto: solo corre mientras se acumula
    this.n = 0; this.cur = 0; this.w = 1; this.h = 1; this.rt = [null, null]; this.held = null;
    this.fsQuad = new FullScreenQuad();
    // Media incremental: out = mix(prev, cur, 1/(n+1)). Guarda el color premultiplicado por el alfa.
    this.accMat = new THREE.ShaderMaterial({
      uniforms: { tCur:{ value:null }, tPrev:{ value:null }, uW:{ value:1 } }, vertexShader: VERT, depthTest:false, depthWrite:false,
      fragmentShader: /* glsl */`
        uniform sampler2D tCur, tPrev; uniform float uW; varying vec2 vUv;
        void main(){
          vec4 c = texture2D(tCur, vUv);
          vec4 pm = vec4(c.rgb * c.a, c.a);                   // premultiplicado
          // Primera muestra: se ignora tPrev (puede traer basura de un uso anterior)
          gl_FragColor = uW >= 1.0 ? pm : mix(texture2D(tPrev, vUv), pm, uW);
        }` });
    // Resolución: des-premultiplica para devolver al pipeline el mismo formato que entrega OutputPass
    this.resMat = new THREE.ShaderMaterial({
      uniforms: { tAcc:{ value:null } }, vertexShader: VERT, depthTest:false, depthWrite:false,
      fragmentShader: /* glsl */`
        uniform sampler2D tAcc; varying vec2 vUv;
        void main(){ vec4 a = texture2D(tAcc, vUv); gl_FragColor = vec4(a.a > 1e-4 ? a.rgb / a.a : vec3(0.0), a.a); }` });
  }
  _free(){ this.rt.forEach(r => r?.dispose()); this.held?.dispose(); this.rt = [null, null]; this.held = null; }
  _rt(){ return new THREE.WebGLRenderTarget(this.w, this.h, { type:THREE.HalfFloatType, depthBuffer:false, minFilter:THREE.NearestFilter, magFilter:THREE.NearestFilter }); }
  // El composer llama a setSize al cambiar tamaño/pixel ratio: los acumuladores quedan inválidos
  setSize(w, h){ this.w = w; this.h = h; this._free(); this.n = 0; this.enabled = false; }
  _draw(mat, target){ renderer.setRenderTarget(target); this.fsQuad.material = mat; this.fsQuad.render(renderer); }
  render(_r, writeBuffer, readBuffer){
    if (!this.rt[0]) this.rt = [this._rt(), this._rt()];
    const dst = this.rt[1 - this.cur], u = this.accMat.uniforms;
    u.tCur.value = readBuffer.texture; u.tPrev.value = this.rt[this.cur].texture; u.uW.value = 1 / (this.n + 1);
    this._draw(this.accMat, dst);
    this.cur = 1 - this.cur; this.n++;
    this.resMat.uniforms.tAcc.value = dst.texture;
    this._draw(this.resMat, this.renderToScreen ? null : writeBuffer);
  }
  // Promedio actual resuelto en un RT propio (para redibujar solo el grade sin re-renderizar la escena)
  present(){
    this.held ??= this._rt();
    this.resMat.uniforms.tAcc.value = this.rt[this.cur].texture;
    this._draw(this.resMat, this.held);
    return this.held;
  }
}
const pass = new AccumPass();
composer.insertPass(pass, composer.passes.indexOf(gradePass)); // OutputPass → AccumPass → gradePass

// Halton(base): secuencia de baja discrepancia en [0,1)
const halton = (i, b) => { let f = 1, r = 0; while (i > 0) { f /= b; r += f * (i % b); i = Math.floor(i / b); } return r; };
const _sz = new THREE.Vector2();

export const accum = {
  pass, busy:false, // busy: un snapshot está acumulando → el loop de rAF no debe dibujar
  max: MAX_PREVIEW,
  get n(){ return pass.n; },
  // Reinicia la acumulación y apaga el pase (el composer lo salta: sin costo mientras hay movimiento)
  reset(){ pass.n = 0; pass.enabled = false; },
  /* Renderiza UNA muestra jitter y la suma al promedio (dibuja el promedio parcial en pantalla).
     - Jitter: desplaza la proyección ±½ px (Halton 2,3; la muestra 0 no se desplaza → igual a un cuadro normal).
       Se suma en proyección (elements[8/9]) y se recalcula la inversa, que GTAO usa para reconstruir posiciones.
     - PCSS: la rotación del muestreo depende del hash de gl_FragCoord (fijo por píxel); sin cambiarlo, el ruido sería
       idéntico en todas las muestras y no se promediaría. Se codifica el índice de muestra en la fracción de
       shadow.radius (±0.0004°/muestra, imperceptible): el shader lo lee con fract(radius·1000) y rota el hash.
     - Sombras: el mapa no depende de la cámara → solo se re-renderiza en la muestra 0. */
  sample(){
    const k = pass.n; pass.enabled = true;
    renderer.getDrawingBufferSize(_sz);
    const jx = k ? halton(k, 2) - 0.5 : 0, jy = k ? halton(k, 3) - 0.5 : 0;
    camera.updateProjectionMatrix(); // base limpia (respeta el view offset vigente)
    const e = camera.projectionMatrix.elements; e[8] += jx * 2 / _sz.x; e[9] += jy * 2 / _sz.y;
    camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    const baseR = sun.shadow.radius, au = renderer.shadowMap.autoUpdate;
    sun.shadow.radius = baseR + k * 0.00037; if (k) renderer.shadowMap.autoUpdate = false;
    try { composer.render(); }
    finally { sun.shadow.radius = baseR; renderer.shadowMap.autoUpdate = au; camera.updateProjectionMatrix(); }
  },
  // Promedio completo y escena quieta: redibuja solo el grade (grano animado) sin tocar la escena
  hold(){ gradePass.renderToScreen = true; gradePass.render(renderer, null, pass.present()); }
};
