/* Service worker de Mockup Studio: la app funciona sin red tras la primera visita.
   - Precache versionado de la shell (index, css, js, vendor, assets). Subir CACHE_VERSION al publicar cambios en vendor/ o assets/.
   - cache-first: vendor/, assets/, fuentes · stale-while-revalidate: js/, css/, index, manifest.
   - HDRI de la CDN (@pmndrs/assets): runtime cache propio, se rellena al usarlos y sobrevive a las versiones.
   La lista PRECACHE se regenera con `node tools/sw-list.mjs` (un test comprueba que no esté desactualizada). */
const CACHE_VERSION = 1;
const CACHE = `mockup-studio-v${CACHE_VERSION}`;
const HDRI_CACHE = 'mockup-studio-hdri';

// >>> PRECACHE (generado por tools/sw-list.mjs)
const PRECACHE = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/export.css',
  'css/fonts.css',
  'css/main.css',
  'css/notices.css',
  'css/shoteditor.css',
  'css/tokens.css',
  'js/core/history.js',
  'js/core/hooks.js',
  'js/core/notice.js',
  'js/core/params.js',
  'js/core/persist.js',
  'js/core/pwa.js',
  'js/core/utils.js',
  'js/data/examples-data.js',
  'js/data/smudge-map.js',
  'js/export/export.js',
  'js/export/offline.js',
  'js/export/project.js',
  'js/export/videosync.js',
  'js/main.js',
  'js/screens/carousel.js',
  'js/screens/examples.js',
  'js/screens/load.js',
  'js/screens/store.js',
  'js/three/accum.js',
  'js/three/camera.js',
  'js/three/format.js',
  'js/three/glcontext.js',
  'js/three/hdri.js',
  'js/three/iphone.js',
  'js/three/loop.js',
  'js/three/metal.js',
  'js/three/quality.js',
  'js/three/renderer.js',
  'js/three/scene.js',
  'js/three/screen.js',
  'js/three/smudge.js',
  'js/ui/dockToggle.js',
  'js/ui/exportcard.js',
  'js/ui/onboarding.js',
  'js/ui/pane.js',
  'js/ui/quality.js',
  'js/ui/shotbar.js',
  'js/ui/shoteditor.js',
  'js/ui/strips.js',
  'js/ui/touch.js',
  'vendor/fonts/bricolage-grotesque-latin-ext.woff2',
  'vendor/fonts/bricolage-grotesque-latin.woff2',
  'vendor/fonts/inter-latin-ext.woff2',
  'vendor/fonts/inter-latin.woff2',
  'vendor/fonts/jetbrains-mono-latin-ext.woff2',
  'vendor/fonts/jetbrains-mono-latin.woff2',
  'vendor/gsap/gsap.min.js',
  'vendor/hdri/hall.exr.js',
  'vendor/licenses/gsap.LICENSE.txt',
  'vendor/licenses/lucide.LICENSE.txt',
  'vendor/licenses/mp4-muxer.LICENSE.txt',
  'vendor/licenses/pmndrs-assets.LICENSE.txt',
  'vendor/licenses/three.LICENSE.txt',
  'vendor/licenses/tweakpane-plugin-essentials.LICENSE.txt',
  'vendor/licenses/tweakpane.LICENSE.txt',
  'vendor/licenses/webm-muxer.LICENSE.txt',
  'vendor/lucide/lucide.min.js',
  'vendor/mp4-muxer/mp4-muxer.js',
  'vendor/three/build/three.module.js',
  'vendor/three/examples/jsm/controls/OrbitControls.js',
  'vendor/three/examples/jsm/environments/RoomEnvironment.js',
  'vendor/three/examples/jsm/geometries/RoundedBoxGeometry.js',
  'vendor/three/examples/jsm/libs/fflate.module.js',
  'vendor/three/examples/jsm/loaders/EXRLoader.js',
  'vendor/three/examples/jsm/math/SimplexNoise.js',
  'vendor/three/examples/jsm/postprocessing/EffectComposer.js',
  'vendor/three/examples/jsm/postprocessing/GTAOPass.js',
  'vendor/three/examples/jsm/postprocessing/MaskPass.js',
  'vendor/three/examples/jsm/postprocessing/OutputPass.js',
  'vendor/three/examples/jsm/postprocessing/Pass.js',
  'vendor/three/examples/jsm/postprocessing/RenderPass.js',
  'vendor/three/examples/jsm/postprocessing/ShaderPass.js',
  'vendor/three/examples/jsm/shaders/CopyShader.js',
  'vendor/three/examples/jsm/shaders/GTAOShader.js',
  'vendor/three/examples/jsm/shaders/OutputShader.js',
  'vendor/three/examples/jsm/shaders/PoissonDenoiseShader.js',
  'vendor/tweakpane/tweakpane-plugin-essentials.min.js',
  'vendor/tweakpane/tweakpane.min.js',
  'vendor/webm-muxer/webm-muxer.js',
  'assets/examples/ex-01.jpg',
  'assets/examples/ex-02.jpg',
  'assets/examples/ex-03.jpg',
  'assets/examples/ex-04.jpg',
  'assets/examples/ex-05.jpg',
  'assets/icons/apple-touch-icon.png',
  'assets/icons/icon-192.png',
  'assets/icons/icon-512.png',
  'assets/icons/icon-maskable-512.png',
  'assets/smudge-map.jpg',
];
// <<< PRECACHE

self.addEventListener('install', e => {
  // 'reload' evita que la caché HTTP del navegador meta archivos viejos en el precache nuevo
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' })))));
  // sin skipWaiting automático: la página decide (toast «Hay una versión nueva») salvo en la primera instalación
});
self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k !== CACHE && k !== HDRI_CACHE && k.startsWith('mockup-studio-')) await caches.delete(k);
    await self.clients.claim();
  })());
});
// PURGE: la página (localhost sin ?sw=1) va a desregistrar este SW. Mientras siga vivo deja pasar todo a la red
// y vacía las cachés, para que no las recree con peticiones en vuelo.
let purged = false;
self.addEventListener('message', async e => {
  if (e.data === 'SKIP_WAITING') self.skipWaiting();
  if (e.data === 'PURGE') { purged = true; for (const k of await caches.keys()) if (k.startsWith('mockup-studio-')) await caches.delete(k); }
});

const ROOT = new URL('./', self.location).pathname; // raíz de la app (soporta despliegue en subruta / basePath)

const cacheFirst = async (req, name = CACHE) => {
  const c = await caches.open(name), hit = await c.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req); if (res.ok) c.put(req, res.clone()); return res;
};
const staleWhileRevalidate = async (req, e) => {
  const c = await caches.open(CACHE), hit = await c.match(req, { ignoreSearch: true });
  const net = fetch(req).then(res => { if (res.ok) c.put(req, res.clone()); return res; }).catch(() => null);
  if (hit) { e.waitUntil(net); return hit; }
  return (await net) || Response.error();
};

self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET' || purged) return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    // HDRI bajo demanda desde la CDN → runtime cache (cache-first: son inmutables, versión fijada en la URL)
    if (url.hostname === 'cdn.jsdelivr.net' && url.pathname.includes('/@pmndrs/assets@')) e.respondWith(cacheFirst(req, HDRI_CACHE));
    return;
  }
  const p = url.pathname.startsWith(ROOT) ? url.pathname.slice(ROOT.length) : url.pathname;
  if (/^(vendor|assets)\//.test(p)) e.respondWith(cacheFirst(req));
  else if (req.mode === 'navigate') e.respondWith(staleWhileRevalidate(new Request(ROOT), e)); // cualquier navegación (con o sin ?sw=1) sirve la shell
  else if (/^(js|css)\//.test(p) || p === 'manifest.webmanifest') e.respondWith(staleWhileRevalidate(req, e));
});
