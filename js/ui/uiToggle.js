import { $ } from '../core/utils.js';

/* ───────────────────────── Ocultar / mostrar TODA la interfaz (tecla H) ─────────────────────────
   Estado temporal (no se guarda): clase `ui-hidden` en <body>. El CSS desvanece solo con opacidad todo lo que lleva `.ui`
   (rail, dock, modelo, panel avanzado, cards, línea de tiempo) y lo deja inerte; las guías (grid / marco) tienen su propia tecla (G).
   Al volver, `ui-showing` reproduce el fundido de entrada y se retira sola. */
let showT = 0;
export const uiHidden = () => document.body.classList.contains('ui-hidden');
export function toggleUI(){
  const b = document.body;
  if (uiHidden()) {
    b.classList.remove('ui-hidden'); b.classList.add('ui-showing');
    clearTimeout(showT); showT = setTimeout(() => b.classList.remove('ui-showing'), 450);
    return;
  }
  clearTimeout(showT); b.classList.remove('ui-showing'); b.classList.add('ui-hidden');
  if (document.activeElement && document.activeElement !== b) document.activeElement.blur?.(); // el foco no se queda en algo invisible
}
