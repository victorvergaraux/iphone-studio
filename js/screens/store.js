import { toast } from '../core/utils.js';
import { T } from '../core/strings.js';
import { hooks } from '../core/hooks.js';
import { items } from './carousel.js';

/* ───────────────────────── Persistencia de pantallas (IndexedDB) ─────────────────────────
   Base 'mockup-studio-screens' v1, dos almacenes:
     · 'blobs' (keyPath 'id')  → { id, blob }   el archivo ORIGINAL (imagen o video), sin recodificar.
     · 'meta'  (clave 'list')  → [{ id, name, type, fit, zoom, offX, offY, scroll, autoScroll }]  orden + encuadre.
   Las pantallas de ejemplo (example:true) nunca se guardan. Todo se escribe en UNA transacción (atómica):
   si falla por cuota, no queda un estado a medias. Sin IndexedDB (modo privado) la app sigue solo en memoria. */
const DB_NAME = 'mockup-studio-screens', LIMIT = 300 * 1024 * 1024;   // aviso si el total supera ~300 MB
const EDIT_KEYS = ['fit', 'zoom', 'offX', 'offY', 'scroll', 'autoScroll'];
let dbP = null, failed = false, warnedFail = false, warnedSize = false, wiped = false, t = 0, chain = Promise.resolve();

// Aviso de error: una sola vez por sesión, luego la app sigue en memoria.
// Cuota llena: no se marca como fallo permanente (si el usuario libera espacio o borra pantallas, el siguiente guardado puede funcionar).
const isQuota = e => e?.name === 'QuotaExceededError' || e?.code === 22;
function fail(err){
  const quota = isQuota(err); if (!quota) failed = true;
  if (!warnedFail) { warnedFail = true; toast(quota ? T.store.quotaFull : T.store.noStorage, 5000); }
}
const req = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
const done = tx => new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = tx.onabort = () => rej(tx.error || new Error('tx')); });
function openDb(){
  if (!dbP) dbP = new Promise((res, rej) => {
    try {
      const r = indexedDB.open(DB_NAME, 1);
      r.onupgradeneeded = () => { r.result.createObjectStore('blobs', { keyPath:'id' }); r.result.createObjectStore('meta'); };
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
    } catch (e) { rej(e); }
  });
  return dbP;
}
export const pickEdit = it => Object.fromEntries(EDIT_KEYS.map(k => [k, it[k]]));
// Aplica un encuadre guardado solo si cada clave conserva el tipo esperado (un registro corrupto no rompe la escena)
export function applyEdit(it, st){ for (const k of EDIT_KEYS) if (st && typeof st[k] === typeof it[k]) it[k] = st[k]; }

/* Lee lo guardado → [{ id, name, type, blob, ...encuadre }] en orden. Vacío si no hay nada o IndexedDB falla. */
export async function loadStored(){
  try {
    const db = await openDb(), tx = db.transaction(['blobs', 'meta']);
    const [list, blobs] = await Promise.all([req(tx.objectStore('meta').get('list')), req(tx.objectStore('blobs').getAll())]);
    const byId = new Map((Array.isArray(blobs) ? blobs : []).filter(b => b && typeof b.id === 'string').map(b => [b.id, b.blob]));
    // Registros corruptos (no objeto, id/blob inválidos) se descartan sin lanzar; el encuadre se valida luego con applyEdit
    const valid = m => m && typeof m === 'object' && typeof m.id === 'string' && byId.get(m.id) instanceof Blob;
    return (Array.isArray(list) ? list : []).filter(valid).map(m => ({ ...m, blob:byId.get(m.id), stored:true }));
  } catch (err) { fail(err); return []; }   // IndexedDB no disponible (modo privado, bloqueada): arranca con ejemplos y avisa una vez
}

async function doSync(){
  if (wiped || failed) return;
  const own = items.filter(i => !i.example && i.blob);
  const total = own.reduce((s, i) => s + i.blob.size, 0);
  if (total > LIMIT && !warnedSize) { warnedSize = true; toast(T.store.heavy((total / 1048576) | 0)); }
  const fresh = own.filter(i => !i.stored);
  try {
    const db = await openDb(), tx = db.transaction(['blobs', 'meta'], 'readwrite'), bs = tx.objectStore('blobs');
    fresh.forEach(i => bs.put({ id:i.id, blob:i.blob }));
    tx.objectStore('meta').put(own.map(i => ({ id:i.id, name:i.name, type:i.blob.type, ...pickEdit(i) })), 'list');
    const keep = new Set(own.map(i => i.id));
    bs.getAllKeys().onsuccess = e => e.target.result.forEach(k => { if (!keep.has(k)) bs.delete(k); });   // elimina huérfanos
    await done(tx); fresh.forEach(i => { i.stored = true; });
  } catch (err) { fail(err); }
}
/* Sincroniza el estado actual (orden, encuadre, altas/bajas). Con debounce y serializado para no solapar escrituras. */
export function syncScreens(delay = 400){
  if (wiped || failed) return;
  clearTimeout(t); t = setTimeout(() => { chain = chain.then(doSync); }, delay);
}
/* Al ocultar/cerrar la pestaña se escribe YA (sin debounce): una edición de encuadre hecha justo antes de cerrar no se pierde. */
function flushNow(){ if (wiped || failed) return; clearTimeout(t); chain = chain.then(doSync); }
addEventListener('pagehide', flushNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) flushNow(); });
/* Borra toda la base (botón Clear). Tras esto no se vuelve a escribir. */
function wipeScreens(){
  wiped = true; clearTimeout(t);
  return chain.catch(() => {}).then(async () => {
    try { (await dbP)?.close(); } catch {}
    await new Promise(res => { try { const r = indexedDB.deleteDatabase(DB_NAME); r.onsuccess = r.onerror = r.onblocked = () => res(); } catch { res(); } });
  });
}
hooks.syncScreens = syncScreens; hooks.wipeScreens = wipeScreens;
