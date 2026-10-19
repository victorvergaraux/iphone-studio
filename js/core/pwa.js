import { toast } from './utils.js';

/* ── PWA: registro del service worker ──
   Solo en producción (no localhost) o con ?sw=1 → en desarrollo normal no se cachea nada; si quedó un SW de una
   sesión con ?sw=1 y se abre localhost sin el parámetro, se desregistra (y se vacían sus cachés) para no servir archivos viejos. */
const host = location.hostname;
const isLocal = host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.localhost');
const forced = new URLSearchParams(location.search).has('sw');

function offerUpdate(reg){
  toast('Hay una versión nueva — recargar');
  const t = document.getElementById('toast'); if (!t) return;
  clearTimeout(toast.t); // el toast normal se apaga a los 2 s: este se queda y es clicable
  t.style.pointerEvents = 'auto'; t.style.cursor = 'pointer';
  const go = () => { t.removeEventListener('click', go); reg.waiting?.postMessage('SKIP_WAITING'); };
  t.addEventListener('click', go);
  toast.t = setTimeout(() => { t.classList.remove('on'); t.style.pointerEvents = t.style.cursor = ''; t.removeEventListener('click', go); }, 15000);
}

async function register(){
  const reg = await navigator.serviceWorker.register('sw.js');
  // hay un SW previo controlando la página y llega uno nuevo → avisar (en la primera instalación no hay nada que recargar)
  const watch = w => w.addEventListener('statechange', () => { if (w.state === 'installed' && navigator.serviceWorker.controller) offerUpdate(reg); });
  if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg);
  reg.addEventListener('updatefound', () => reg.installing && watch(reg.installing));
  // al activarse el SW nuevo (tras pulsar el toast) se recarga una sola vez
  let reloading = false;
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had && !reloading) { reloading = true; location.reload(); } });
}
async function unregister(){
  const regs = await navigator.serviceWorker.getRegistrations();
  if (!regs.length) return;
  regs.forEach(r => (r.active || r.waiting)?.postMessage('PURGE')); // el SW deja de cachear y vacía sus cachés
  await Promise.all(regs.map(r => r.unregister()));
  if (self.caches) for (const k of await caches.keys()) if (k.startsWith('mockup-studio-')) await caches.delete(k);
  console.info('[pwa] service worker desregistrado (localhost sin ?sw=1)');
}

if ('serviceWorker' in navigator) {
  const run = () => (!isLocal || forced ? register() : unregister()).catch(err => console.warn('[pwa]', err));
  document.readyState === 'complete' ? run() : addEventListener('load', run, { once: true });
}
