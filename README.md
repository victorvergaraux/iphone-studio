# Mockup Studio

Single-file Three.js mockup tool. Drop images/videos onto the page, tweak the scene, record shots, export PNG or 15/30 s video.

## Run
```bash
npm start          # or: python3 -m http.server 5173
# open http://localhost:5173
```
Needs internet (CDN modules + HDRI downloads). Chrome/Edge recommended (WebCodecs for MP4).

## Use with Claude Code
```bash
git init && git add -A && git commit -m "Mockup Studio v54"
claude
```
Read `CLAUDE.md` first; it has the code map and conventions.

## Shortcuts
`Space` play/stop presentation · `S` save shot.
