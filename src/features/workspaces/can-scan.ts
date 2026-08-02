/**
 * ¿Trae este binario la cámara?
 *
 * `expo-camera` es un módulo NATIVO, así que un dev build compilado antes de instalarla no lo tiene —
 * y un import estático de algo que no está no falla suave: lanza al evaluar el módulo y se lleva por
 * delante la pantalla entera. Le pasó a la de unirse con un `Cannot find native module 'ExpoCamera'`.
 *
 * Es el mismo patrón que `detectGlass` en la barra de pestañas, y por el mismo motivo escrito allí:
 * ya nos pasó con `ExpoGlassEffect` y con `ExpoPushTokenManager`. Dos veces es una regla.
 *
 * Constante del módulo y no un hook: lo que hay en el binario no cambia mientras la app corre.
 */
export const CAN_SCAN: boolean = (() => {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('expo-camera');
    return true;
  } catch {
    return false;
  }
})();
