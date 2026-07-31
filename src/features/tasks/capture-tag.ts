/**
 * La etiqueta que empareja el botón de anotar del home con el de crear en la pantalla de nueva
 * tarea. Reanimated busca DOS vistas con este mismo `sharedTransitionTag` —una en la pantalla que
 * sale y otra en la que entra— y anima la primera hasta el marco de la segunda.
 *
 * Vive en su propio módulo y no en ninguna de las dos partes: es un contrato entre las dos, y con
 * la cadena escrita a mano en cada sitio un cambio de nombre rompe la transición EN SILENCIO — si
 * las etiquetas no coinciden simplemente no pasa nada, no hay error que lo delate.
 *
 * Requiere el flag estático `ENABLE_SHARED_ELEMENT_TRANSITIONS` (ver package.json) y un build
 * nativo. Sin él la navegación funciona igual, solo con el push normal de iOS.
 */
export const CAPTURE_TAG = 'tdapp-capture-cta';
