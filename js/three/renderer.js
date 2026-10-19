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
  // Disco de Vogel: muestras repartidas con el ángulo áureo, cobertura uniforme con pocas muestras.
  // Optimización: en vez de cos/sin por muestra (32 de cada uno por píxel), se rota la dirección un ángulo áureo por
  // iteración (2 mult-add). Matemáticamente idéntico: el ángulo de la muestra i sigue siendo i·2.399963 + phi.
  const vec2 PCSS_GOLD = vec2(cos(2.399963), sin(2.399963));
  vec2 pcssNext(vec2 d){ return vec2(d.x * PCSS_GOLD.x - d.y * PCSS_GOLD.y, d.x * PCSS_GOLD.y + d.y * PCSS_GOLD.x); }
  float pcssRad(int i){ return sqrt((float(i) + 0.5) / float(PCSS_SAMPLES)); } // radio de la muestra i (0..1)
  float PCSS(sampler2D map, vec4 sc, float lightDeg){
    float tanA = tan(radians(max(lightDeg, 0.05)));
    float mapSize = float(textureSize(map, 0).x);
    float texelW = PCSS_FRUSTUM / mapSize;                // tamaño de un texel en mundo → resultado independiente de la resolución
    // rotación aleatoria por píxel: cambia banding por ruido fino. La fracción de radius·1000 es una "semilla" por muestra
    // de la acumulación progresiva (js/three/accum.js suma k·0.00037° al radio): rota el patrón en cada muestra para que el
    // ruido se promedie. Con la semilla en 0 (cualquier render normal con radio entero) el resultado es el de siempre.
    float phi = pcssHash(gl_FragCoord.xy + vec2(fract(lightDeg * 1000.0) * 97.0)) * 6.2831853;
    // textureLod(…, 0.0) en vez de texture2D: el mapa de sombras no tiene mipmaps (mismo resultado) y así no se piden derivadas implícitas
    // dentro de bucles tras un return condicional (aviso X3595 del compilador HLSL/ANGLE: derivadas indefinidas).
    // 1) Búsqueda de oclusores: profundidad media de lo que bloquea la luz
    float searchR = tanA * 2.0 / texelW, sum = 0.0, cnt = 0.0;
    vec2 dir = vec2(cos(phi), sin(phi));
    float searchUv = searchR / mapSize;
    for (int i = 0; i < PCSS_SAMPLES; i++) {
      float d = unpackRGBAToDepth(textureLod(map, sc.xy + dir * (pcssRad(i) * searchUv), 0.0));
      if (d < sc.z) { sum += d; cnt += 1.0; }
      dir = pcssNext(dir);
    }
    if (cnt == 0.0) return 1.0;
    // 2) Penumbra = distancia receptor-oclusor × tamaño angular de la luz
    float dist = (sc.z - sum / cnt) * PCSS_DEPTH_RANGE;
    float filterR = max(1.0, dist * tanA / texelW);
    // 3) PCF con radio variable
    float lit = 0.0, filterUv = filterR / mapSize;
    dir = vec2(cos(phi), sin(phi)); // misma rotación por píxel que en la búsqueda
    for (int i = 0; i < PCSS_SAMPLES; i++) {
      lit += step(sc.z, unpackRGBAToDepth(textureLod(map, sc.xy + dir * (pcssRad(i) * filterUv), 0.0)));
      dir = pcssNext(dir);
    }
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
// Se puede orbitar por DEBAJO del objetivo (contrapicada, cámara baja mirando hacia arriba): el límite ya no es el ángulo polar
// sino una altura mínima de cámara (MIN_CAM_Y, se aplica en loop.js) para no atravesar el piso.
controls.maxPolarAngle = Math.PI * 0.95;
export const MIN_CAM_Y = 0.08;

// Render target con MSAA (samples:4) porque el composer reemplaza el antialias del canvas
const rt = new THREE.WebGLRenderTarget(16, 16, { type: THREE.HalfFloatType, samples: 4 });
export const composer = new EffectComposer(renderer, rt);
composer.addPass(new RenderPass(scene, camera));
/* GTAO (Ground-Truth Ambient Occlusion): oscurece pliegues y contactos. Con iluminación solo de entorno
   es lo que "asienta" los objetos. Preview a media resolución; export a resolución completa. */
let aoScale = 1; // AO a resolución completa también en preview: a 0.5 los bordes se escalonaban
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
    // Grano: hash entero de 32 bits (lowbias32) ENCADENADO sobre x, y, cuadro y canal. Encadenar (en vez de hashear un
    // vector entero de golpe) rompe la estructura lineal x/y que se veía como líneas diagonales.
    uint mix32(uint x){ x ^= x >> 16u; x *= 0x7feb352du; x ^= x >> 15u; x *= 0x846ca68bu; x ^= x >> 16u; return x; }
    float hash1(uvec2 p, uint fr, uint ch){
      uint h = mix32(p.x + 0x9e3779b9u * (ch + 1u));
      h = mix32(h ^ (p.y + 0x85ebca6bu));
      h = mix32(h ^ (fr * 0xc2b2ae35u + ch));
      return float(h >> 8u) * (1.0 / 16777215.0);                  // 24 bits exactos en un float → 0..1
    }
    // Ruido gaussiano ≈ suma de 3 uniformes (Irwin-Hall), centrado en 0 y con σ≈0.5. Más colas que un triangular → granos sueltos.
    float gauss(uvec2 p, uint fr, uint ch){ return hash1(p, fr, ch * 3u) + hash1(p, fr, ch * 3u + 1u) + hash1(p, fr, ch * 3u + 2u) - 1.5; }
    void main(){
      vec4 src = texture2D(tDiffuse, vUv);
      vec3 c = src.rgb;
      c += uBrightness;                         // brillo: desplazamiento uniforme
      c = (c - 0.5) * uContrast + 0.5;          // contraste: escala alrededor del gris medio
      float d = distance(vUv, vec2(0.5));
      c *= 1.0 - uVignette * smoothstep(0.35, 0.85, d); // viñeta suave en esquinas
      // Grano en 2 escalas: fino (1 px) + grumo (~2 px, medio tono). El desplazamiento aleatorio por cuadro evita que el
      // patrón se alinee con la rejilla de píxeles (moiré/diagonales) cuando el canvas se escala por CSS.
      // Sin grano (uGrain = 0) el término sumado es exactamente 0 → se salta el cálculo (18 hashes de 3 rondas por píxel).
      // uGrain es uniform: la rama es coherente en todo el cuadro, sin divergencia.
      if (uGrain > 0.0) {
      uint fr = uint(floor(uTime * 24.0));                          // 24 cuadros de grano por segundo
      uvec2 px = uvec2(gl_FragCoord.xy);
      uvec2 off = uvec2(hash1(uvec2(7u, 3u), fr, 9u) * 1024.0, hash1(uvec2(5u, 11u), fr, 8u) * 1024.0);
      uvec2 pc = (px + off) / 2u;                                   // celdas de 2×2 px
      vec3 fine  = vec3(gauss(px + off, fr, 0u), gauss(px + off, fr, 1u), gauss(px + off, fr, 2u));
      vec3 coarse = vec3(gauss(pc, fr, 3u), gauss(pc, fr, 4u), gauss(pc, fr, 5u));
      vec3 g = (fine + 0.6 * coarse) * 1.5;                         // rango ≈ -2..2, σ ≈ 0.9 (más ruidoso que antes)
      g = mix(vec3(g.g), g, 0.35);                                  // 65 % monocromo (película) + 35 % croma
      float luma = dot(c, vec3(0.2126, 0.7152, 0.0722));
      float w = 1.0 - 0.55 * pow(abs(luma * 2.0 - 1.0), 2.0);      // más grano en medios tonos, menos en negros/blancos
      c += g * w * uGrain;
      }
      // uAlpha = 1 solo en export transparente: conserva el alfa de la escena y premultiplica (el canvas usa premultipliedAlpha)
      float a = mix(1.0, clamp(src.a, 0.0, 1.0), uAlpha);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0) * a, a);
    }`
});
composer.addPass(gradePass);

// Los importadores no pueden reasignar un binding: se expone un setter.
export const setAoScale = v => { aoScale = v; };
