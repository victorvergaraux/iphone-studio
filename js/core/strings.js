/* ───────────────────────── Textos de interfaz (español) ─────────────────────────
   Único sitio con los mensajes que la app genera desde JS: toasts, avisos persistentes, confirmaciones, aria-labels/tooltips
   puestos por script, etiquetas de las cards, pasos del onboarding y motivos del historial.

   · VOCABULARIO: «cinemática» = el CONJUNTO de tomas (la secuencia completa, la que se reproduce o se exporta);
     «toma» = CADA ángulo de cámara guardado dentro de la cinemática. Nunca «tus tomas guardadas» para el conjunto.
   · CÓMO AÑADIR UN TEXTO: elige el grupo por área (shot, export, load…), añade la clave en minúscula camelCase. Texto fijo → cadena;
     con parámetros → función que devuelve la cadena (T.shot.updated = n => …). En el módulo: `import { T } from '../core/strings.js'`
     y usa `toast(T.shot.updated(n))`. Nunca un literal en toast()/toastOnce()/showNotice()/confirm() (lo vigila tests/strings.test.mjs).
     Si dos claves tienen el mismo texto, reutiliza una sola.
   · NO SE CENTRALIZA: el markup estático de index.html (se queda ahí), las etiquetas de Tweakpane (convención en inglés, una palabra),
     console.*, mensajes técnicos de excepciones que no se muestran, claves e identificadores.
   · Este módulo es PURO: no importa nada de js/ (evita ciclos de import). */

const pad2 = n => String(n).padStart(2, '0');
const plural = (n, uno, varios) => n === 1 ? uno : varios;

export const T = {
  /* Palabras sueltas reutilizadas por varias áreas */
  common: {
    load: 'Cargar', global: 'Global', shot: 'Toma', cancel: 'Cancelar', close: 'Cerrar',
    format: 'Formato', shadow: 'Sombra', screen: 'archivo', screenName: 'pantalla',
    undo: 'Deshacer', redo: 'Rehacer',
  },

  /* Tomas y cinemática (camera.js) */
  shot: {
    tag: n => `T${pad2(n)}`,
    tagName: (n, name) => `T${pad2(n)}${name ? ' · ' + name : ''}`,
    defaultName: n => `Toma ${pad2(n)}`,
    saved: n => `Toma T${pad2(n)} guardada`,
    updated: n => `Toma T${pad2(n)} actualizada`,
    deleted: n => `Toma T${pad2(n)} eliminada`,
    duplicated: n => `Toma T${pad2(n)} duplicada`,
    presetLoaded: label => `Preset ${label} cargado`,
    pickFirst: 'Elige una toma de la lista primero',
    emptyCinematic: 'Tu cinemática está vacía: guarda al menos una toma',
    jsonCopied: n => `Cinemática copiada como JSON (${n} ${plural(n, 'toma', 'tomas')})`,
  },

  /* Editor de cinemática (shoteditor.js) */
  editor: {
    tabsAria: 'Ajustes de',
    corte: 'Corte',
    globalAria: label => `${label}: usar valor global`,
    sliderGlobalAria: label => `${label} global`,
    halfAria: 'Tomas a la mitad',
    headPick: 'Elige una toma',
    headAll: 'Toda la cinemática',
    easeGlobal: key => `Global · ${key}`,
    empty: 'Tu cinemática está vacía. Mueve la cámara y guarda la primera toma.',
    gripAria: n => `Mover toma ${pad2(n)}: arrastra o usa flechas arriba y abajo`,
    nameAria: n => `Nombre de la toma ${pad2(n)}`,
    saveCam: 'Guardar cámara', update: 'Actualizar', duplicate: 'Duplicar', rename: 'Renombrar',
    remove: 'Eliminar', up: 'Subir', down: 'Bajar', copyJson: 'Copiar JSON',
    undoTip: 'Deshacer · Ctrl+Z', redoTip: 'Rehacer · Ctrl+Shift+Z',
  },

  /* Historial deshacer/rehacer (history.js, pane.js) */
  history: {
    base: 'inicio',
    toast: (verb, label) => `${verb}: ${label}`,
    adjust: label => `ajuste ${label}`,
    reasons: { add:'añadir toma', update:'actualizar toma', rename:'renombrar toma', timing:'tiempos de toma', duplicate:'duplicar toma', delete:'eliminar toma', move:'mover toma', preset:'cargar preset' },
  },

  /* Rail y tira de pantallas (strips.js, shotbar.js) */
  rail: {
    stopTip: 'Detener · Espacio', playTip: 'Cinemática · Espacio',
    stopAria: 'Detener cinemática', playAria: 'Reproducir cinemática',
    pauseCar: 'Pausar carrusel', resumeCar: 'Reanudar carrusel',
    videoBadge: 'VIDEO',
    screenAria: (n, name) => `Pantalla ${n}: ${name}`,
    keepOne: 'Debe quedar al menos una pantalla',
  },

  /* Onboarding (onboarding.js) */
  onboarding: {
    steps: [
      { title:'Imágenes', text:'Arrastra imágenes o video sobre la escena. También puedes pegarlos con Ctrl+V.' },
      { title:'Exportar', text:'Elige el formato y descarga un PNG o un video con la composición actual.' },
      { title:'Cinemática', sub:'Modo avanzado', text:'Mueve la cámara con el mouse y guarda cada ángulo para armar tu cinemática. O parte de un preset.' },
    ],
    openExport: 'Abrir exportar', advanced: 'Avanzado', saveS: 'Guardar · S', play: 'Reproducir',
    next: 'Siguiente', done: 'Listo',
    output: (w, h, screen) => `Salida ${w}×${h} px` + (screen ? ' · depende de tu ventana' : ''),
  },

  /* Card de exportación (exportcard.js) */
  exportCard: {
    size: 'Tamaño', kind: 'Tipo', duration: 'Duración', mode: 'Modo', scale: 'Escala',
    no: 'No', yes: 'Sí',
    capturePng: 'Capturar PNG', renderVideo: 'Renderizar video',
    screenNote: 'Pantalla: depende de tu ventana',
    shadowNeedsAlpha: 'Solo aplica con Alpha activo',
    videoNote: (mbText, frames) => `≈ ${mbText} MB · ${frames} cuadros`,
  },

  /* Descargas y PNG (export.js) */
  export: {
    saved: 'Archivo guardado',
    declined: 'Descarga cancelada',
    ready: 'Archivo listo',
    modalAlt: 'Captura del mockup',
    modalJsonHow: 'Copia el texto y guárdalo como archivo .json.',
    modalSaveHow: isVid => `Para guardar: clic derecho o mantén presionado sobre ${isVid ? 'el video' : 'la imagen'} → Guardar.`,
    png2xLimit: maxTex => `La GPU no admite PNG 2× a este tamaño (máx. ${maxTex}px): uso 1×`,
    refining: (i, n) => `Refinando ${i}/${n}…`,
    png2xRetry: 'No se pudo generar el PNG 2×: reintento a 1×',
    pngFail: 'No se pudo generar el PNG. Prueba con un tamaño menor o recarga la página',
  },

  /* Video: grabación y render offline (offline.js, project.js) */
  video: {
    noEncoder: 'Tu navegador no tiene VideoEncoder (WebCodecs; p. ej. Safari o Firefox antiguos)',
    noMuxers: 'No se cargaron las librerías de video MP4/WebM (¿sin conexión?)',
    noRealtimeEither: lacks => `${lacks} y tampoco hay grabación en tiempo real`,
    realtimeFallback: lacks => `${lacks}: grabo en tiempo real`,
    webmFallback: 'Tu navegador no admite H.264 a esta resolución: exporto en WebM',
    renderCancelled: 'Render cancelado',
    codecRetry: label => `${label} falló, reintentando con otro códec…`,
    noCodecRealtime: 'Ningún códec de video cuadro a cuadro es compatible aquí: grabo en tiempo real',
    noCodec: 'Este navegador no admite ningún códec de video',
    exportFailed: err => `No se pudo exportar el video (${err})`,
    encodeError: 'error de codificación',
    unsupported: (label, codec, w, h, fps) => `${label}: no soportado (${codec} ${w}x${h}@${fps})`,
    stopCancelling: 'Cancelando…',
    progress: (ext, pct, done, total, eta) => `${ext} · ${pct}% · ${done}/${total} cuadros · faltan ${eta}`,
    recCancelled: 'Grabación cancelada',
    noRecorderFormat: 'Este navegador no puede grabar el lienzo en ningún formato de video',
    noMediaRecorder: 'Este navegador no tiene MediaRecorder (grabación de video)',
    rejected: name => `El navegador rechazó la grabación (${name})`,
    rejectedDefault: 'error',
    noticeTail: why => `${why}. Puedes exportar la imagen en PNG.`,
    exportPng: 'Exportar PNG',
  },

  /* Carga de pantallas (load.js, store.js) */
  load: {
    videoTimeout: 'no se pudo leer a tiempo (¿formato o códec no soportado?)',
    videoNoSize: 'códec de video no soportado (sin dimensiones)',
    videoCodec: 'códec de video no soportado',
    badType: 'tipo no soportado (usa imagen o video)',
    tooBig: (size, max) => `pesa ${size} MB (máx. ${max} MB)`,
    badImage: 'imagen dañada o formato no soportado',
    failed: 'error al cargarla',
    loaded: n => `${n} ${plural(n, 'cargada', 'cargadas')}`,
    skipped: list => `${list.length} ${plural(list.length, 'omitida', 'omitidas')}: ${list.slice(0, 2).map(s => `${s.name} (${s.why})`).join('; ')}${list.length > 2 ? '…' : ''}`,
    heavy: names => `pesado para el navegador (>4K o >60 s): ${names.slice(0, 2).join(', ')}`,
    join: parts => parts.join(' · '),
  },
  store: {
    quotaFull: 'Almacenamiento lleno: las pantallas nuevas solo duran esta sesión',
    noStorage: 'Sin almacenamiento local: las pantallas solo duran esta sesión',
    heavy: mb => `Pantallas pesadas (${mb} MB): el guardado local puede fallar`,
  },

  /* Proyecto JSON (project.js) */
  project: {
    skippedVideos: n => `${n} video(s) omitido(s) del proyecto (más de 25 MB)`,
    notProject: 'el archivo no es un proyecto de Mockup Studio',
    notOurs: 'el archivo no pertenece a Mockup Studio',
    noVersion: 'no trae versión o es desconocida',
    newer: v => `es de una versión más nueva (v${v}): actualiza la app`,
    badSettings: 'los ajustes están dañados',
    badCinematic: 'la cinemática está dañada',
    badScreens: 'las pantallas están dañadas',
    importFail: msg => `No se pudo importar: ${msg}. No se cambió nada`,
    badJson: 'el archivo no es un JSON válido',
    applyError: 'error al aplicar los ajustes',
    imported: (name, bad) => `Proyecto ${name} importado${bad ? ` (${bad} pantalla(s) inválida(s) omitida(s))` : ''}`,
  },

  /* Persistencia local (persist.js) */
  persist: {
    readSettings: 'Tus ajustes guardados no se pudieron leer: uso los valores por defecto',
    readShots: 'Los datos de tu cinemática no se pudieron leer: uso la de ejemplo',
    writeFail: 'No se pueden guardar los ajustes (almacenamiento lleno o bloqueado): se perderán al cerrar',
    confirmReset: '¿Borrar todos los ajustes y tomas guardados y volver a los valores iniciales?',
  },

  /* GPU y HDRI (glcontext.js, hdri.js) */
  gpu: {
    lost: 'Se perdió la GPU, recuperando…',
    notRecovered: 'No se recuperó la GPU.',
    reload: 'Recargar',
    hdriFallback: 'No se pudo cargar el HDRI; uso un estudio de respaldo',
    hdriKeep: name => `No se pudo cargar «${name}» (¿sin conexión?); conservo el HDRI actual`,
  },

  /* PWA (pwa.js) */
  pwa: {
    update: 'Hay una versión nueva — recargar',
  },
};
