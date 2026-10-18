<p align="center">
  <img src="ref/67ab41d4-6b5d-4c30-b31b-8047d00bb865.png" alt="Mockup Studio: iPhone mockup leaning on a block, soft studio light" width="100%">
</p>

# Mockup Studio

Fullscreen Three.js iPhone mockup. Drop your screens (images or video), compose the scene, save camera shots and export a PNG or a 15 / 30 s video. Everything runs in the browser, there is no build step.

## Quick start

```bash
npm start          # static server on http://localhost:5173
# or: python3 -m http.server 5173
```

Open <http://localhost:5173> in **Chrome or Edge** (WebCodecs is needed for MP4 export). Do not open `index.html` through `file://`: ES modules need a server. Internet is required (CDN modules + HDRI downloads).

## Basic use

1. **Load your screens.** Click **Cargar**, drag & drop files onto the page, or paste from the clipboard. Images and videos both work.
   - **Replace all** (next to Cargar): off = new screens are added to the existing ones; on = they replace every current screen.
   - Use the arrows and the trash icon in the *Pantallas* bar to reorder or delete the selected screen; the pause button stops the carousel.
2. **Move the camera.** Drag to orbit, scroll to zoom. The phone and the objects behind it stay where they are.
3. **Save shots.** Frame a view and press **Save** (or `S`). **Update** overwrites the selected shot, **Delete** removes it. Click a shot in the list to jump to it.
4. **Play the shots.** Press `Space` (or **Play**) to run the presentation. *Move* is the travel time between shots (`0.0` = hard cut) and *Hold* is how long each one stays.
5. **Export.**
   - **Image** tab → **Capture PNG** (optional transparent background with *Alpha*).
   - **Video** tab → **Render video**. Pick *Format* (Screen, 16:9, 4:5, 1:1, 9:16, 3:2), *Size* (HD to 4K), *FPS* and *Length*.

Every downloaded file gets a random 5-character code (`name-XXXXX.ext`).

### Shortcuts

| Key | Action |
| --- | --- |
| `Space` | Play / stop the shots presentation |
| `S` | Save current view as a shot |
| `←` / `→` | Previous / next screen |

## Panel overview

| Folder | What it controls |
| --- | --- |
| **Scene** | Palette and colors, solids / ground visibility, floor material (*Real* adds the smudge texture, *Rough*, *Metal*, *Scale*), object positions and presets (*Objs*), HDRI, shadow and AO |
| **Phone** | Body, glass and fingerprints, brushed metal, pose and idle motion |
| **Screens** | Carousel transition (↑ ↓ → ← Fade), timing, parallax, framing of the selected screen |
| **Camera** | Lens (FOV, zoom, easing, handheld drift) and grade (brightness, contrast, vignette, grain) |
| **Shots** | Presentation timing, shot list, presets (Product, Detail, Editorial, Vic) and **Copy JSON** |
| **Export** | Format, size, video and PNG options |
| **UI** | Panel opacity / blur, guides, project JSON and **Cache → Clear** |

Everything you change is saved in your browser automatically.

---

## Advanced

### Video export

- **Offline (default)** renders frame by frame with a virtual clock: the video is perfectly smooth no matter how slow the GPU is. It starts at screen 1 and, if *Shots* is on, plays the shot presentation. Length `Shots` = exactly one pass of the presentation.
- **Realtime** records what you see as it plays, so a slow GPU can drop frames. It is also the automatic fallback when the browser has no WebCodecs.
- **Codec** `Auto` tries MP4 (H.264, then software H.264) and falls back to WebM (VP9, then VP8). If one attempt fails it retries with the next. Force MP4 or WebM from the *Codec* option.
- If every codec fails, open the browser console (F12): each attempt logs its reason (`Video: <codec> …`, `Export de video falló: …`).

### Shots and presets

- **Move = 0.0** gives instant cuts, also when clicking a shot in the list.
- *Random* / *Count* shorten 1 or 2 random shots to half their move and hold time on every loop.
- Presets Product, Detail and Editorial are defined relative to the phone, so they follow its pose. **Vic** uses fixed world coordinates.
- **Copy JSON** copies the shot list as `[{ "p": [x, y, z], "t": [x, y, z], "fov": n, "name": "…" }]` (`p` = camera position, `t` = look-at target).

### Scene and materials

- *Objs* has a position picker (X / Y / Z) for Tower, Block, Cylinder and Sphere plus the location presets Base, Tight and Frame. The slab and the block the phone leans on are fixed.
- Floor and slab can use a realistic physical material (*Real*, off by default) with a procedural, non-repeating smudge texture from `ref/`. *Map R* / *Map M* set how much the texture drives roughness and metalness, *Scale* sets its size. With *Real* off they use the same flat material as the objects.

### Saving and resetting

- Settings and shots live in `localStorage` under the key `mockup-studio:v2`.
- **UI → JSON → Export / Import** saves and loads the whole project as a file (settings + shots). Loaded screens are kept on import.
- **UI → Cache → Clear** wipes all saved settings and shots and reloads with the defaults (asks for confirmation, cannot be undone).

### Project structure

```
index.html      markup + importmap + <script type="module" src="js/main.js">
css/            tokens.css (design tokens) · main.css (layout and components)
js/core/        utils · params (P, single source of truth) · persist · hooks
js/three/       renderer · scene · hdri · metal · iphone · screen · smudge · camera · format · loop
js/screens/     carousel · examples · load
js/ui/          pane (Tweakpane) · strips
js/export/      export · offline · project
js/data/        embedded base64 (smudge map, example posters) — never edit by hand
ref/            textures and reference images
```

New parameters go through `P` so they are saved and exported automatically. See `CLAUDE.md` for the code map, conventions and gotchas.

### Testing notes

- `downloads` only works inside claude.ai; elsewhere the export falls back to a modal / anchor download.
- Headless browsers use a software GPU (Swiftshader): set `gsap.ticker.lagSmoothing(0)` so timings are real.

### Use with Claude Code

```bash
claude
```

Read `CLAUDE.md` first.
