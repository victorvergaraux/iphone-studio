/* Puente entre capas: los módulos de bajo nivel (cámara, carrusel, persistencia) llaman a la UI sin importarla,
   lo que evita dependencias circulares. La UI registra aquí sus funciones al cargarse. */
export const hooks = {};
