# Mockup Studio

Fullscreen Three.js iPhone mockup. Shows mobile screens (images/video, carousel with transitions) on a procedural iPhone, camera shots + presentation mode, HDRI lighting, PNG / MP4 / WebM export.

## Layout
- `index.html` — markup + importmap + `<script type="module" src="js/main.js">`.
- `css/tokens.css` (design tokens: `:root`, palette, type, motion, Tweakpane theme) · `css/main.css` (layout + components, consumes tokens).
- `js/` — ES modules, one file per section:
  - `core/` utils (`$`, `EASE`, `DUR`, `toast`) · params (`P`) · persist · hooks (bridge to the UI, avoids import cycles)
  - `three/` renderer · scene · hdri · metal · iphone · screen · smudge · camera · format · loop
  - `screens/` carousel · examples · load
  - `ui/` pane (Tweakpane) · strips · dockToggle · onboarding (3-step floating card; flag `mockup-studio:onboarded`, panel starts collapsed) · exportcard (export UI, opens from the left rail) · quality (Auto/High/Max) · shotbar (cinematic timeline card above the dock: one dot per shot, DOM only: never in PNG/video)
  - Left **rail** (`#rail`): Export · Dock · Help. Cards (onboarding, export) anchor to its right and are mutually exclusive. Dock visibility = `P.ui.dock` (key D), independent of the Controls panel.
  - `export/` export · offline · project
  - `data/` manifiestos mínimos (sin base64): `examples-data.js` = `EXAMPLES = [[url, nombre], …]` → `assets/examples/ex-01.jpg…` (JPEG originales sin recomprimir, 880×1912) · `smudge-map.js` = ruta a `assets/smudge-map.jpg`. Los ejemplos se descargan en paralelo y solo se espera el primero (el resto se agrega en orden en segundo plano); si hay pantallas guardadas no se piden. `tools/extract-examples.py` es la migración original base64 → archivos (ya ejecutada). Para cambiar un ejemplo, reemplaza el archivo de `assets/` (mismo nombre) o edita el manifiesto.
  - `main.js` — load order + Boot.
- A `let` reassigned from another module exposes `setX(v)` (e.g. `setCur`, `setShots`). Low layers call the UI through `hooks.*` to avoid circular imports (TDZ errors).
- No build step. Run `npm start` (static server on :5173). Do not open via `file://`.

## Stack (vendorizado en `vendor/`, sin CDN en runtime)
Three r165 (0.165.0) (OrbitControls, RoundedBoxGeometry, EffectComposer, GTAOPass, EXRLoader) · GSAP 3.12.5 · Tweakpane 4.0.4 + plugin-essentials 0.2.1 (buttongrid) · Lucide 0.460.0 · mp4-muxer 5.1.3 / webm-muxer 5.0.3 (WebCodecs export). El importmap y los `<script>` de `index.html` apuntan a `vendor/…`; licencias en `vendor/licenses/`. Fuentes (Bricolage Grotesque, Inter, JetBrains Mono; woff2 latin + latin-ext) en `vendor/fonts/` vía `css/fonts.css` (mismos nombres de familia que `--f-*`).
- **Regenerar vendor/** (versiones fijadas en `tools/vendor.mjs`, Node sin dependencias): `node tools/vendor.mjs` (o `--only=three,libs,licenses,hdri,fonts`). Subir una versión = cambiar la constante, regenerar, actualizar el importmap si cambian rutas y subir `CACHE_VERSION` en `sw.js`. Iconos PWA: `python tools/make-icons.py` (Pillow).
- **HDRI**: solo el por defecto (`hall`, `P.env.preset`) está en `vendor/hdri/`; el resto se baja de `@pmndrs/assets@1.7.0` (CDN) bajo demanda y el SW lo cachea en runtime (`mockup-studio-hdri`). Sin red y sin cachear → toast y se conserva el HDRI actual.
- **PWA / offline**: `manifest.webmanifest` + `sw.js` (precache versionado `mockup-studio-vN`; cache-first vendor/assets/fuentes; stale-while-revalidate js/css/index). Registro en `js/core/pwa.js`: solo en producción o con `?sw=1`; en localhost sin `?sw=1` NO se registra y desregistra uno previo. **Tras añadir/quitar archivos en js/, css/, vendor/ o assets/ ejecutar `node tools/sw-list.mjs`** (regenera `PRECACHE`; `tests/offline.test.mjs` falla si está desactualizada) y subir `CACHE_VERSION` al publicar. Probar: `npm start` → abrir `http://localhost:5173/?sw=1`, DevTools > Application > Service Workers, marcar Offline y recargar. Si hay SW nuevo aparece el toast «Hay una versión nueva — recargar».

## Code map (section comments, one module each under js/)
Parámetros `P` (single source of truth) → Persistencia (`localStorage` key `mockup-studio:v2`, throttled save) → Renderer + postprocessing (RenderPass → GTAO → OutputPass → grade ShaderPass) → Escena → HDRI loader (rotation, normalization, derived key light) → iPhone procedural (superellipse body, layers Z_FRONT/SCREEN/ISLAND/GLASS) → Screen shader (carousel, parallax) → Glass smudge → Carousel → Camera shots (`camTween`, `cutTo`, `SHOT_PRESETS`) → Format/guide → Render loop → Tweakpane → Strips → Export → Offline video → Project JSON → Boot.

## Conventions
- UI language: **English, one word or acronym** for every Tweakpane label/option. Related controls grouped in tabs (5 folders: Scene, Phone, Screens, Camera, UI; shots/cinematic rhythm live in the cinematics card). Export lives in the `exportcard` outside the panel (cards use Spanish short labels, Inter + Bricolage). Keep the panel compact.
- Animations: `expo.inOut`, 850 ms (`EASE`, `DUR`).
- Design: brutalist, minimal, editorial, neutral greys, no borders/shadows on panels, bento floating panels (`--gap 12px`, `--radius 18px`).
- Shaders: explain with comments.
- Grid (thirds) draws over the active frame (full viewport for `Pantalla`, via `gridRect`; `guide` stays null for `Pantalla` and is the export rect). Hidden while shots play (`body.pres-playing`) and while recording; `no-grid` is the user toggle.
- Quality: `P.quality.mode` auto (adaptive pixel ratio only while moving) · high · max. Export path is independent of it.
- Exports: every downloaded file gets a random 5-char code (`offer()` → `name-XXXXX.ext`).
- Video export must restart the carousel at image 1; offline mode = frame-by-frame with a virtual GSAP clock.
- Persist new params through `P` so they save/import automatically; "UI · temporal" values (`UI_TMP`) are intentionally not saved.

## Gotchas
- `downloads` artifact capability exists only inside claude.ai; outside it `offer()` falls back to a modal/anchor download — test PNG + video locally.
- Headless testing uses Swiftshader: inject `gsap.ticker.lagSmoothing(0)` so timings are real.
- Glass/island/screen are excluded from the GTAO G-buffer via an `overrideVisibility` wrapper; don't reintroduce a 2D AO mask.
- Shape: `rrShape` point list must not repeat the closing point (breaks bottom geometry).



