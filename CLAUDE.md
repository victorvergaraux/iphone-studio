# Mockup Studio

Fullscreen Three.js iPhone mockup. Shows mobile screens (images/video, carousel with transitions) on a procedural iPhone, camera shots + presentation mode, HDRI lighting, PNG / MP4 / WebM export.

## Layout
- `index.html` — the whole app (CSS + importmap + one `<script type="module">`). ~1.8 MB because the example posters (`EXAMPLES`) and the fingerprint map (`SMUDGE_MAP`) are embedded as base64. **Never rewrite those lines by hand**; edit with Edit/sed on small unique strings.
- No build step. Run `npm start` (static server on :5173). Do not open via `file://`.

## Stack (all via CDN importmap)
Three r165 (OrbitControls, RoundedBoxGeometry, EffectComposer, GTAOPass, EXRLoader) · GSAP · Tweakpane 4.0.4 + plugin-essentials 0.2.1 (buttongrid) · Lucide · mp4-muxer / webm-muxer (WebCodecs export) · HDRIs from `@pmndrs/assets@1.7.0` (`hdri/<name>.exr.js`).

## Code map (search for these section comments in index.html)
Parámetros `P` (single source of truth) → Persistencia (`localStorage` key `mockup-studio:v2`, throttled save) → Renderer + postprocessing (RenderPass → GTAO → OutputPass → grade ShaderPass) → Escena → HDRI loader (rotation, normalization, derived key light) → iPhone procedural (superellipse body, layers Z_FRONT/SCREEN/ISLAND/GLASS) → Screen shader (carousel, parallax) → Glass smudge → Carousel → Camera shots (`camTween`, `cutTo`, `SHOT_PRESETS`) → Format/guide → Render loop → Tweakpane → Strips → Export → Offline video → Project JSON → Boot.

## Conventions
- UI language: **English, one word or acronym** for every Tweakpane label/option. Related controls grouped in tabs (7 folders: Scene, Phone, Screens, Camera, Shots, Export, UI). Keep the panel compact.
- Animations: `expo.inOut`, 850 ms (`EASE`, `DUR`).
- Design: brutalist, minimal, editorial, neutral greys, no borders/shadows on panels, bento floating panels (`--gap 12px`, `--radius 18px`).
- Shaders: explain with comments.
- Exports: every downloaded file gets a random 5-char code (`offer()` → `name-XXXXX.ext`).
- Video export must restart the carousel at image 1; offline mode = frame-by-frame with a virtual GSAP clock.
- Persist new params through `P` so they save/import automatically; "UI · temporal" values (`UI_TMP`) are intentionally not saved.

## Gotchas
- `downloads` artifact capability exists only inside claude.ai; outside it `offer()` falls back to a modal/anchor download — test PNG + video locally.
- Headless testing uses Swiftshader: inject `gsap.ticker.lagSmoothing(0)` so timings are real.
- Glass/island/screen are excluded from the GTAO G-buffer via an `overrideVisibility` wrapper; don't reintroduce a 2D AO mask.
- Shape: `rrShape` point list must not repeat the closing point (breaks bottom geometry).
