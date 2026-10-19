/* Formatos de exportación (relación de aspecto) y tamaño de salida en píxeles.
   Módulo hoja: solo depende de los parámetros `P`.
   Lo usan: frame.js (guía), export/*, ui/exportcard.js, ui/onboarding.js. */
import { P } from '../core/params.js';

// Relación ancho/alto por formato. 'Pantalla' = 0 → sin recorte (se usa el viewport).
export const FORMATS = { 'Pantalla':0, '16:9':16/9, '4:5':4/5, '1:1':1, '9:16':9/16, '3:2':3/2 };

// Tamaño de salida [w, h] (pares, para códecs de vídeo): el lado largo es P.exp.long.
export function exportSize(){
  const r = FORMATS[P.exp.format] || innerWidth / innerHeight, L = P.exp.long;
  let w, h; if (r >= 1) { w = L; h = L / r; } else { h = L; w = L * r; }
  return [Math.round(w / 2) * 2, Math.round(h / 2) * 2];
}
