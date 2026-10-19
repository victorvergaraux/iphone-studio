 // buttongrid: filas de botones compactas

export const $ = s => document.querySelector(s);
export const EASE = 'expo.inOut', DUR = 0.85;
export const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
export const icons = () => window.lucide && lucide.createIcons({ attrs: { 'stroke-width': 1.6 } });
// ms = duración visible (por defecto 2,2 s; los avisos largos piden más)
export function toast(msg, ms = 2200){ const t = $('#toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), ms); }
// Aviso de una sola vez por sesión y clave (p. ej. almacenamiento roto): evita repetir el mismo mensaje en cada guardado fallido
const _once = new Set();
export function toastOnce(key, msg, ms = 4500){ if (_once.has(key)) return false; _once.add(key); toast(msg, ms); return true; }
