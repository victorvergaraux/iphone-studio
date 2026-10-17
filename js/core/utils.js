 // buttongrid: filas de botones compactas

export const $ = s => document.querySelector(s);
export const EASE = 'expo.inOut', DUR = 0.85;
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const icons = () => window.lucide && lucide.createIcons({ attrs: { 'stroke-width': 1.6 } });
export function toast(msg){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2200); }
