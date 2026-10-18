import * as THREE from 'three';
import { P } from '../core/params.js';
import { PD, SH, SR, SW, Z_ISLAND, Z_SCREEN, depthBias, phone, rrPlane } from './iphone.js';

/* ── Pantalla: shader del carrusel con parallax bottom→top ── */
export const screenMat = new THREE.ShaderMaterial({
  uniforms: {
    uTexA:{value:null}, uTexB:{value:null},
    uXfA:{value:new THREE.Vector4(1,1,.5,.5)}, uXfB:{value:new THREE.Vector4(1,1,.5,.5)},
    uProgress:{value:0}, uDir:{value:new THREE.Vector2(0, 1)}, uFade:{value:0}, uParallax:{value:P.car.parallax}, uExposure:{value:P.car.exposure}, uBg:{value:new THREE.Color(P.car.screenBg)}
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D uTexA, uTexB;
    uniform vec4 uXfA, uXfB;      // xy = fracción visible de la imagen, zw = centro de muestreo (encuadre: fit/zoom/offset/scroll)
    uniform float uProgress;      // 0→1, animado por GSAP con expo.inOut
    uniform float uParallax;      // cuánto avanza la imagen saliente (más lento que la entrante = profundidad)
    uniform vec2 uDir;            // dirección del movimiento: (0,1) sube · (0,-1) baja · (1,0) izq→der · (-1,0) der→izq
    uniform float uFade;          // 1 = fundido por opacidad (ignora uDir)
    uniform float uExposure;
    uniform vec3 uBg;             // color de relleno fuera de la imagen (modo contain)
    varying vec2 vUv;

    // Muestrea una imagen aplicando su encuadre; fuera de 0..1 devuelve el fondo de pantalla
    vec3 frameSample(sampler2D t, vec4 xf, vec2 uv){
      vec2 s = xf.zw + (uv - 0.5) * xf.xy;
      vec2 inside = step(vec2(0.0), s) * step(s, vec2(1.0));
      vec3 c = texture2D(t, clamp(s, 0.0, 1.0)).rgb;
      return mix(uBg, c, inside.x * inside.y);
    }

    void main(){
      float p = uProgress;
      vec3 col;
      if (uFade > 0.5) {
        // Fundido: mezcla lineal de ambas imágenes en el mismo encuadre
        col = mix(frameSample(uTexA, uXfA, vUv), frameSample(uTexB, uXfB, vUv), p);
      } else {
        // Un solo shader para las 4 direcciones: proyectamos el UV sobre el eje de movimiento.
        // along = 0 en el borde por donde entra la imagen nueva, 1 en el borde opuesto.
        float along = dot(vUv - 0.5, uDir) + 0.5;
        vec2 uvA = vUv - uDir * p * uParallax;               // saliente: avanza en uDir a velocidad parcial
        vec2 uvB = vUv + uDir * (1.0 - p);                   // entrante: llega desde el lado opuesto a velocidad completa
        vec3 a = frameSample(uTexA, uXfA, uvA);
        vec3 b = frameSample(uTexB, uXfB, uvB);
        a *= 1.0 - 0.9 * p;                                 // la saliente se oscurece progresivamente al quedar "detrás" (sin sombra de contacto en el borde)
        col = mix(a, b, step(along, p));                     // máscara dura: antes de p se ve la entrante
      }
      gl_FragColor = vec4(col * uExposure, 1.0);
    }`
});
const TRANSITION_DIRS = { up:[0, 1], down:[0, -1], ltr:[1, 0], rtl:[-1, 0] };
export function applyTransitionMode(){
  const u = screenMat.uniforms, fade = P.car.mode === 'fade';
  u.uFade.value = fade ? 1 : 0;
  if (!fade) u.uDir.value.fromArray(TRANSITION_DIRS[P.car.mode] || TRANSITION_DIRS.up);
}
applyTransitionMode();
export const screen = new THREE.Mesh(rrPlane(SW, SH, SR), screenMat);
screen.position.z = PD/2 + Z_SCREEN; phone.add(screen); depthBias(screenMat, 1);

// Isla: píldora real (radio = mitad del alto con círculo exacto; con squircle se veía rectangular)
export const island = new THREE.Mesh(rrPlane(0.18, 0.054, 0.0269, 2), new THREE.MeshBasicMaterial({ color:0x000000 }));
island.position.set(0, SH/2 - 0.058, PD/2 + Z_ISLAND); phone.add(island); depthBias(island.material, 2); // por encima de la pantalla, por debajo del vidrio

// Cristal: material negro con blending aditivo → solo suma reflejos especulares del entorno y del sol sobre la pantalla
export const mGlass = new THREE.MeshPhysicalMaterial({ color:0x000000, roughness:P.phone.glassRough, metalness:0, clearcoat:1, clearcoatRoughness:0.02,
  envMapIntensity:P.phone.glass * 1.6, transparent:true, blending:THREE.AdditiveBlending, depthWrite:false });
