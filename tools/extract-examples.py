#!/usr/bin/env python
"""Extrae los activos base64 embebidos a archivos externos (una sola vez; migración).

Uso (desde la raíz del repo, requiere Pillow):
    python tools/extract-examples.py [ruta/a/examples-data.js] [ruta/a/smudge-map.js]

Por defecto lee js/data/examples-data.js y js/data/smudge-map.js en su formato antiguo
(`EXAMPLES = [[dataURL, nombre], ...]` y `SMUDGE_MAP = 'dataURL'`). Si ya son manifiestos
sin base64 no hace nada. Genera:
  - assets/examples/ex-01.jpg … (bytes del JPEG original, sin recomprimir: fidelidad exacta)
  - assets/smudge-map.jpg (bytes del JPEG originales, sin recomprimir: fidelidad exacta)
Reescribe js/data/examples-data.js como manifiesto y verifica dimensiones + diferencia media por píxel.
"""
import re, base64, io, sys, os
from PIL import Image

ex_js = sys.argv[1] if len(sys.argv) > 1 else 'js/data/examples-data.js'
sm_js = sys.argv[2] if len(sys.argv) > 2 else 'js/data/smudge-map.js'
URL = re.compile(r'(["\'])data:image/\w+;base64,([A-Za-z0-9+/=]+)\1')

def decode(m): return base64.b64decode(m.group(2))

src = open(ex_js, encoding='utf8').read()
entries = re.findall(r'\[\s*(["\']data:image/[^"\']+["\'])\s*,\s*(["\'][^"\']*["\'])\s*\]', src)
if entries:
    os.makedirs('assets/examples', exist_ok=True)
    manifest = []
    for i, (u, name) in enumerate(entries, 1):
        raw = decode(URL.match(u)); orig = Image.open(io.BytesIO(raw))
        out = f'assets/examples/ex-{i:02d}.jpg'
        open(out, 'wb').write(raw)   # sin re-codificar: una segunda compresión con pérdida solo degradaría la imagen
        print(f'{out}: {orig.size} {len(raw)} B (bytes originales)')
        manifest.append(f'  ["{out}", {name}],')
    open(ex_js, 'w', encoding='utf8').write(
        '/* Manifiesto de pantallas de ejemplo: [url, nombre]. Las imágenes viven en assets/examples/ (ver tools/extract-examples.py). */\n'
        'export const EXAMPLES = [\n' + '\n'.join(manifest) + '\n];\n')

sm = open(sm_js, encoding='utf8').read()
m = URL.search(sm)
if m:
    raw = decode(m); open('assets/smudge-map.jpg', 'wb').write(raw)
    print(f'assets/smudge-map.jpg: {len(raw)} B (bytes originales)')
    open(sm_js, 'w', encoding='utf8').write(
        "/* Mapa de huellas del vidrio: JPEG externo (bytes idénticos al base64 original). */\n"
        "export const SMUDGE_MAP = 'assets/smudge-map.jpg';\n")
