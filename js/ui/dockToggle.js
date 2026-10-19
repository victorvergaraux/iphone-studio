import { $ } from '../core/utils.js';
import { P } from '../core/params.js';
import { saveSoon } from '../core/persist.js';

/* ───────────────────────── Dock: mostrar / ocultar ─────────────────────────
   Independiente del panel de controles avanzados. Estado en P.ui.dock (persistente; oculto por defecto), clase `dock-hidden` en <body>
   (el CSS desliza el dock fuera con --dur / --ease) y aria-pressed del botón #railDock sincronizado. */
const btn = $('#railDock');

function apply(){
  document.body.classList.toggle('dock-hidden', !P.ui.dock);
  btn?.setAttribute('aria-pressed', String(!!P.ui.dock));
}

function setDock(v){ P.ui.dock = !!v; apply(); saveSoon(); }
export function toggleDock(){ setDock(!P.ui.dock); }

btn?.addEventListener('click', toggleDock);
apply(); // estado inicial al cargar el módulo (el <body> ya trae `dock-hidden`, así que ocultar no se anima)
// Las transiciones del dock/timeline solo se activan tras la carga: si el usuario lo dejó visible, aparece sin deslizarse
setTimeout(() => document.body.classList.add('ui-ready'), 150);
