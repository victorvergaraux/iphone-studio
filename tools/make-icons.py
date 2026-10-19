# Genera los iconos PWA (assets/icons/) con Pillow: teléfono geométrico en tinta/papel (tokens --ink / --paper).
# Uso: python tools/make-icons.py
from PIL import Image, ImageDraw
INK = (18, 18, 17); PAPER = (235, 234, 230)
def icon(size, maskable):
    S = size * 4; im = Image.new('RGB', (S, S), INK); d = ImageDraw.Draw(im)
    k = 0.52 if maskable else 0.70   # alto del teléfono respecto al lienzo (maskable: zona segura del 80 %)
    h = S * k; w = h * 0.49; x = (S - w) / 2; y = (S - h) / 2; r = w * 0.2
    d.rounded_rectangle([x, y, x + w, y + h], r, fill=PAPER)
    m = w * 0.07; d.rounded_rectangle([x + m, y + m, x + w - m, y + h - m], r - m * 0.6, fill=INK)
    iw = w * 0.3; d.rounded_rectangle([S/2 - iw/2, y + m*2.2, S/2 + iw/2, y + m*2.2 + w*0.075], w*0.04, fill=PAPER)   # isla
    d.rounded_rectangle([S/2 - w*0.18, y + h - m*2.6, S/2 + w*0.18, y + h - m*2.6 + w*0.03], w*0.015, fill=PAPER)   # barra inferior
    return im.resize((size, size), Image.LANCZOS)
for n, s, mk in [('icon-192.png', 192, False), ('icon-512.png', 512, False), ('icon-maskable-512.png', 512, True), ('apple-touch-icon.png', 180, False)]:
    icon(s, mk).save('assets/icons/' + n, optimize=True)
