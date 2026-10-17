import { S_ASPECT } from '../three/iphone.js';

/* ── Pantallas de ejemplo dibujadas en canvas (marcadas como EJEMPLO) ── */
const CW = 720, CH = Math.round(720 / S_ASPECT);
export const DF = '"Bricolage Grotesque", Arial, sans-serif', MF = '"JetBrains Mono", monospace';
function rr(ctx, x, y, w, h, r){ ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function exampleTag(ctx, w, dark){
  ctx.font = `500 18px ${MF}`; const tw = ctx.measureText('EJEMPLO').width + 24;
  rr(ctx, w - tw - 36, 70, tw, 34, 17); ctx.fillStyle = dark ? '#fff' : '#121211'; ctx.fill();
  ctx.fillStyle = dark ? '#121211' : '#d6ff3d'; ctx.fillText('EJEMPLO', w - tw - 24, 93);
}
function statusBar(ctx, w, col){
  ctx.fillStyle = col; ctx.font = `600 26px ${DF}`; ctx.fillText('9:41', 60, 62);
  ctx.fillRect(w - 110, 44, 46, 20); ctx.fillRect(w - 62, 50, 4, 8);
}
function sampleIndex(){
  const c = document.createElement('canvas'); c.width = CW; c.height = CH; const x = c.getContext('2d');
  x.fillStyle = '#eef1ea'; x.fillRect(0, 0, CW, CH); statusBar(x, CW, '#121211');
  x.fillStyle = '#6f6d67'; x.font = `400 22px ${MF}`; x.fillText('← ARCHIVO / CATEGORÍAS', 52, 190);
  const cats = [['Interfaces', 168], ['Motion & 3D', 71], ['Sistemas', 199], ['Editorial', 36], ['Identidad', 92]];
  cats.forEach(([t, n], i) => {
    const y = 290 + i * 92;
    x.fillStyle = '#121211'; x.font = `800 72px ${DF}`; x.fillText(t, 48, y);
    x.fillStyle = '#3f8f3a'; x.font = `500 22px ${MF}`; x.fillText(String(n).padStart(3, '0'), CW - 100, y - 36);
    x.fillStyle = '#cdcac3'; x.fillRect(48, y + 22, CW - 96, 1.5);
  });
  x.fillStyle = '#6f6d67'; x.font = `400 22px ${MF}`; x.fillText('DESTACADOS — 04', 52, 840);
  const cards = [['#dfe9d6', 'Sistema de diseño', 'Tokens, componentes y guías para 12 equipos.'], ['#dde3ee', 'Campaña generativa', 'Piezas animadas con shaders para redes.']];
  cards.forEach(([bg, t, d], i) => {
    const y = 880 + i * 300; rr(x, 40, y, CW - 80, 270, 34); x.fillStyle = bg; x.fill();
    const g = x.createLinearGradient(80, y + 40, 180, y + 140); g.addColorStop(0, i ? '#3949ff' : '#ff7a2f'); g.addColorStop(1, i ? '#9fb0ff' : '#ffd36e');
    rr(x, 80, y + 40, 100, 100, 24); x.fillStyle = g; x.fill();
    x.fillStyle = '#121211'; x.font = `800 40px ${DF}`; x.fillText(t, 210, y + 92);
    x.fillStyle = '#56544f'; x.font = `400 24px ${DF}`; x.fillText(d, 80, y + 200);
  });
  exampleTag(x, CW, false); return c;
}
function samplePoster(){
  const c = document.createElement('canvas'); c.width = CW; c.height = CH; const x = c.getContext('2d');
  x.fillStyle = '#2b33e6'; x.fillRect(0, 0, CW, CH); statusBar(x, CW, '#fff');
  // anillos concéntricos generativos
  x.strokeStyle = 'rgba(214,255,61,.9)'; x.lineWidth = 2;
  for (let i = 0; i < 14; i++) { x.beginPath(); x.ellipse(CW * 0.62, CH * 0.66, 40 + i * 26, 18 + i * 13, -0.5, 0, Math.PI * 2); x.stroke(); }
  x.fillStyle = '#fff'; x.font = `400 22px ${MF}`; x.fillText('FESTIVAL DE', 52, 200); x.fillText('INTERFACES · MDE', 52, 230);
  x.font = `800 150px ${DF}`; x.fillText('MUES', 40, 420); x.fillText('TRA', 40, 550);
  x.fillStyle = '#d6ff3d'; x.fillText('26', 40, 680);
  const pill = (y, t, fill) => { rr(x, 52, y, CW - 104, 84, 42); if (fill) { x.fillStyle = '#fff'; x.fill(); } else { x.strokeStyle = '#fff'; x.lineWidth = 3; x.stroke(); }
    x.fillStyle = fill ? '#2b33e6' : '#fff'; x.font = `600 30px ${DF}`; const w = x.measureText(t).width; x.fillText(t, (CW - w) / 2, y + 53); };
  pill(CH - 330, 'Comprar entradas', false); pill(CH - 230, 'Postular proyecto', true);
  exampleTag(x, CW, true); return c;
}
function sampleLong(){
  const H = CH * 2.6 | 0, c = document.createElement('canvas'); c.width = CW; c.height = H; const x = c.getContext('2d');
  x.fillStyle = '#f6f5f2'; x.fillRect(0, 0, CW, H); statusBar(x, CW, '#121211');
  x.fillStyle = '#121211'; x.font = `800 96px ${DF}`; x.fillText('Feed', 48, 230);
  x.fillStyle = '#6f6d67'; x.font = `400 22px ${MF}`; x.fillText('SCROLL VERTICAL · 2.6× ALTO', 52, 280);
  const hues = [[255, 122, 47], [57, 73, 255], [214, 255, 61], [18, 18, 17], [255, 79, 163], [70, 160, 120]];
  let y = 330;
  for (let i = 0; y < H - 200; i++) {
    const [r, g, b] = hues[i % hues.length], h = i % 3 === 0 ? 520 : 360;
    const gr = x.createLinearGradient(48, y, CW - 48, y + h);
    gr.addColorStop(0, `rgb(${r},${g},${b})`); gr.addColorStop(1, `rgba(${r},${g},${b},.35)`);
    rr(x, 48, y, CW - 96, h, 30); x.fillStyle = gr; x.fill();
    x.fillStyle = '#121211'; x.font = `600 34px ${DF}`; x.fillText(['Estudio tipográfico', 'Prototipo WebGL', 'Retícula editorial', 'Paleta nocturna', 'Afiche cinético', 'Sistema de íconos'][i % 6], 48, y + h + 52);
    x.fillStyle = '#6f6d67'; x.font = `400 20px ${MF}`; x.fillText(`N.º ${String(i + 1).padStart(2, '0')} — 2026`, 48, y + h + 86);
    y += h + 130;
  }
  exampleTag(x, CW, false); return c;
}
