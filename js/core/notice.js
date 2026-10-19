/* ───────────────────────── Aviso persistente ─────────────────────────
   Como el toast, pero se queda hasta que se cierra (pérdida de GPU, formato de video sin soporte…). Admite un botón de acción.
   Su CSS (css/notices.css) se inyecta aquí la primera vez, así no depende de que index.html lo enlace. */
let el = null;
function ensure(){
  if (el) return el;
  if (!document.querySelector('link[data-notices]')) {
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = new URL('../../css/notices.css', import.meta.url).href; l.dataset.notices = ''; document.head.append(l);
  }
  el = document.createElement('div'); el.className = 'notice'; el.id = 'notice'; el.setAttribute('role', 'status');
  document.body.append(el); return el;
}
/* showNotice(msg, { label, onClick }?, ms?) → muestra el aviso (reemplaza al anterior; ms>0 = se oculta solo). hideNotice() lo oculta. */
let hideT = 0;
export function showNotice(msg, action, ms = 0){
  const n = ensure(); n.textContent = ''; clearTimeout(hideT); if (ms) hideT = setTimeout(hideNotice, ms);
  const s = document.createElement('span'); s.textContent = msg; n.append(s);
  if (action) { const b = document.createElement('button'); b.type = 'button'; b.textContent = action.label; b.onclick = action.onClick; n.append(b); }
  requestAnimationFrame(() => n.classList.add('on'));
}
export function hideNotice(){ clearTimeout(hideT); if (el) el.classList.remove('on'); }
