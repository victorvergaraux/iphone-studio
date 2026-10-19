/* ── Carpeta «UI» (sin pestañas) ──
   Controles temporales de interfaz (UI_TMP: Dim, Grid, Frame; NO se guardan a propósito), fila JSON
   (Export/Import del proyecto) y el botón «Clear» (formatea el caché del navegador, pide confirmación). */
import { $ } from '../../core/utils.js';
import { T } from '../../core/strings.js';
import { resetAll } from '../../core/persist.js';
import { exportProject } from '../../export/project.js';
import { reset as resetHistory } from '../../core/history.js';
import { row } from './shared.js';

const UI_TMP = { guideDim:0.8, showGrid:true, showFrame:true };

export function setupUI({ pane }){
  const fUI = pane.addFolder({ title:'UI' });
  fUI.addBinding(UI_TMP, 'guideDim', { label:'Dim', min:0.1, max:1, step:0.01 })
    .on('change', e => document.documentElement.style.setProperty('--guide-dim', e.value));
  fUI.addBinding(UI_TMP, 'showGrid', { label:'Grid' }).on('change', e => document.body.classList.toggle('no-grid', !e.value));
  fUI.addBinding(UI_TMP, 'showFrame', { label:'Frame' }).on('change', e => document.body.classList.toggle('no-frame', !e.value));
  fUI.addBlade({ view:'separator' });
  row(fUI, ['Export', 'Import'], [exportProject, () => $('#projFile').click()], 'JSON');
  // Kill cache: formatea todos los ajustes y cinemática guardados en el navegador (pide confirmación; no se puede deshacer)
  fUI.addButton({ title:'Clear', label:'Cache' }).on('click', () => { if (confirm(T.persist.confirmReset)) { resetHistory(); resetAll(); } });
  return fUI;
}
