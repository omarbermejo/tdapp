import { Platform } from 'react-native';

/**
 * Deja los layouts de los widgets donde la extension pueda leerlos. En CADA arranque.
 *
 * Es la segunda causa de "el widget sale en blanco", y la mas dificil de ver: `WidgetObject.swift`
 * escribe el string del layout en el App Group **en su constructor**, o sea cuando la app importa
 * `src/widgets/*.tsx`. Y todos esos imports son dinamicos y estan detras de una condicion:
 *
 * - Today, Capture y Streak solo se importan desde `syncTodayWidget`, y solo **si la peticion HTTP
 *   salio bien** y solo si hay sesion.
 * - **FocusWidget solo se importa desde `sync-focus`**, alcanzable unicamente al montar la pestaña
 *   del cronometro. Quien nunca abre esa pestaña no registra ese layout NUNCA — y su baldosa se
 *   queda vacia para siempre, sin un solo error en pantalla.
 *
 * Instalacion limpia + sin red + widget añadido desde la galeria = las cuatro en blanco. Es la
 * combinacion exacta que se reporto.
 *
 * Importar YA es registrar: no hay nada que llamar despues. Y tiene que correr en cada arranque
 * porque el string del layout cambia con cada build — uno viejo en el App Group es un widget que
 * pinta la version anterior de si mismo.
 *
 * Los imports siguen siendo dinamicos, y eso no es negociable: `@expo/ui/swift-ui` llama
 * `requireNativeView` en ambito de modulo, asi que un import estatico revienta la app entera al
 * arrancar en web. El `try` cubre lo mismo por si acaso.
 */
export async function registerWidgetLayouts() {
  if (Platform.OS !== 'ios') return;
  try {
    await Promise.all([
      import('@/widgets/today-widget'),
      import('@/widgets/capture-widget'),
      import('@/widgets/streak-widget'),
      import('@/widgets/focus-widget'),
    ]);
  } catch (e) {
    if (__DEV__) console.warn('[widget] layouts sin registrar', e);
  }
}
