import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { $ } from '../core/utils.js';
import { P } from '../core/params.js';

/* ───────────────────────── Renderer + postpro ───────────────────────── */
export const canvas = $('#c');
// alpha:true → el canvas puede exportar PNG con transparencia real (en modo normal el fondo de escena lo cubre)
export const renderer = new THREE.WebGLRenderer({ canvas, antialias:false, alpha:true, powerPreference:'high-performance' });
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap; // PCF entrega shadowRadius al shader; lo reemplazamos por PCSS abajo

/* PCSS (Percentage-Closer Soft Shadows): sombra dura en el contacto y difusa al alejarse, como una fuente de luz con tamaño real.
   Se inyecta en el chunk de sombras de three antes de compilar cualquier material. shadow.radius = tamaño angular de la luz (°). */
THREE.ShaderChunk.shadowmap_pars_fragment = THREE.ShaderChunk.shadowmap_pars_fragment
  .replace('#ifdef USE_SHADOWMAP', `#ifdef USE_SHADOWMAP
  #define PCSS_SAMPLES 16
  #define PCSS_DEPTH_RANGE 29.5   // far - near de la cámara de sombra (mundo)
  #define PCSS_FRUSTUM 12.0       // ancho del frustum ortográfico (mundo)
  float pcssHash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  // Disco de Vogel: muestras repartidas con el ángulo áureo, cobertura uniforme con pocas muestras
  vec2 pcssVogel(int i, float phi){ float r = sqrt(float(i) + 0.5) / sqrt(float(PCSS_SAMPLES)); float t = float(i) * 2.399963 + phi; return vec2(cos(t), sin(t)) * r; }
  float PCSS(sampler2D map, vec4 sc, float lightDeg){
    float tanA = tan(radians(max(lightDeg, 0.05)));
    float mapSize = float(textureSize(map, 0).x);
    float texelW = PCSS_FRUSTUM / mapSize;                // tamaño de un texel en mundo → resultado independiente de la resolución
    float phi = pcssHash(gl_FragCoord.xy) * 6.2831853;     // rotación aleatoria por píxel: cambia banding por ruido fino
    // 1) Búsqueda de oclusores: profundidad media de lo que bloquea la luz
    float searchR = tanA * 2.0 / texelW, sum = 0.0, cnt = 0.0;
    for (int i = 0; i < PCSS_SAMPLES; i++) {
      float d = unpackRGBAToDepth(texture2D(map, sc.xy + pcssVogel(i, phi) * searchR / mapSize));
      if (d < sc.z) { sum += d; cnt += 1.0; }
    }
    if (cnt == 0.0) return 1.0;
    // 2) Penumbra = distancia receptor-oclusor × tamaño angular de la luz
    float dist = (sc.z - sum / cnt) * PCSS_DEPTH_RANGE;
    float filterR = max(1.0, dist * tanA / texelW);
    // 3) PCF con radio variable
    float lit = 0.0;
    for (int i = 0; i < PCSS_SAMPLES; i++) lit += step(sc.z, unpackRGBAToDepth(texture2D(map, sc.xy + pcssVogel(i, phi) * filterR / mapSize)));
    return lit / float(PCSS_SAMPLES);
  }`)
  .replace('#if defined( SHADOWMAP_TYPE_PCF )', 'return PCSS(shadowMap, shadowCoord, shadowRadius);\n#if defined( SHADOWMAP_TYPE_PCF )');
// NeutralToneMapping (Khronos PBR Neutral): pensado para producto, conserva los colores sRGB de la UI en pantalla
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = P.env.exposure;
renderer.toneMapping = { neutral:THREE.NeutralToneMapping, agx:THREE.AgXToneMapping, aces:THREE.ACESFilmicToneMapping }[P.env.tone] ?? THREE.NeutralToneMapping;

export const scene = new THREE.Scene();
// near 0.2 (antes 0.05): la precisión del depth buffer depende de near/far; con FOV 14 la cámara está a ~10 u
// y un near muy chico hacía que capas separadas por milésimas pelearan (z-fighting). minDistance es 1.2, así que no recorta nada.
export const camera = new THREE.PerspectiveCamera(P.cam.fov, 16/9, 0.2, 80);
// Zoom óptico global (camera.zoom escala la proyección). Las tomas guardan posición/target/fov, NO el zoom:
// así el mismo zoom se aplica encima de cualquier toma o preset.
camera.zoom = P.cam.zoom; camera.updateProjectionMatrix();
camera.position.set(3.1, 2.7, 3.6);

// HDRI → PMREM: única fuente de luz de la escena (difusa + reflejos). Sin point/hemi/ambient.
export const pmrem = new THREE.PMREMGenerator(renderer);
scene.environmentIntensity = P.env.intensity;

export const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true; controls.dampingFactor = 0.06;
controls.minDistance = 1.2; controls.maxDistance = 30;
controls.maxPolarAngle = Math.PI * 0.49;

// Render target con MSAA (samples:4) porque el composer reemplaza el antialias del canvas
const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
export const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
/* GTAO (Ground-Truth Ambient Occlusion): oscurece pliegues y contactos. Con iluminación solo de entorno
   es lo que "asienta" los objetos. Preview a media resolución; export a resolución completa. */
export let aoScale = 1; // AO a resolución completa también en preview: a 0.5 los bordes se escalonaban
export const gtao = new GTAOPass(scene, camera, 16, 16, undefined,
  { radius:P.shadow.aoRadius, distanceExponent:1, thickness:1, scale:1, samples:12, distanceFallOff:1 },
  { lumaPhi:10, depthPhi:2, normalPhi:3, radius:4, rings:2, samples:16 });
const _gtaoSetSize = gtao.setSize.bind(gtao);
gtao.setSize = (w, h) => _gtaoSetSize(Math.max(1, Math.round(w * aoScale)), Math.max(1, Math.round(h * aoScale)));
gtao.blendIntensity = P.shadow.ao;
composer.addPass(gtao);
composer.addPass(new OutputPass()); // tone mapping + sRGB

/* Grade pass: corre DESPUÉS de OutputPass, en espacio de display, para que brillo/contraste se perciban lineales */
export const gradePass = new ShaderPass({
  uniforms: { tDiffuse:{value:null}, uAlpha:{value:0}, uBrightness:{value:P.grade.brightness}, uContrast:{value:P.grade.contrast}, uVignette:{value:P.grade.vignette}, uGrain:{value:P.grade.grain}, uTime:{value:0}, uRes:{value:new THREE.Vector2(1,1)} },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uBrightness, uContrast, uVignette, uGrain, uTime, uAlpha; uniform vec2 uRes;
    varying vec2 vUv;
    // hash 2D barato → ruido blanco para el grano de película
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      c += uBrightness;                         // brillo: desplazamiento uniforme
      c = (c - 0.5) * uContrast + 0.5;          // contraste: escala alrededor del gris medio
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - uVignette * smoothstep(0.35, 0.85, d); // viñeta suave en esquinas
      c += (hash(vUv * uRes + fract(uTime)) - 0.5) * uGrain; // grano animado por frame
      // uAlpha = 1 solo en export transparente: conserva el alfa de la escena y premultiplica (el canvas usa premultipliedAlpha)
      float a = mix(1.0, clamp(src.a, 0.0, 1.0), uAlpha);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0) * a, a);
    }`
});
composer.addPass(gradePass);

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setAoScale = v => { aoScale = v; };
