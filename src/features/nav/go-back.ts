import { router } from 'expo-router';

/**
 * Volver, y si no hay a donde volver, ir al inicio.
 *
 * `router.back()` a secas no hace NADA cuando la pantalla es la primera de la pila, y eso no es un
 * caso raro: pasa SIEMPRE que se llega por un deep link — el QR de una invitacion, un widget, un
 * aviso, un `openurl`. La consola dice `The action 'GO_BACK' was not handled by any navigator` y
 * quien toca la flecha se queda encerrado mirando un boton que no responde.
 *
 * Estaba resuelto en UN sitio (`screen-header`) y no en los otros seis, que es como se descubrio:
 * abriendo el detalle de un espacio por deep link no habia forma de salir.
 *
 * **`replace` y no `dismissTo`**, y esto se probo al reves primero. `dismissTo` significa "vuelve a
 * ESA ruta de la pila", asi que necesita que la ruta ya este en la pila — y en el caso que estamos
 * arreglando la pila tiene UNA pantalla, la que se abrio por el enlace. No hay a donde volver, asi
 * que no hacia nada y el boton seguia muerto. Con `replace` el inicio se monta, que es lo que hace
 * falta cuando no hay historial.
 *
 * El riesgo de `replace` —meter un segundo navegador de pestañas cuando `(tabs)` YA esta en la
 * pila— no aplica aqui: el `canGoBack()` de arriba ya se llevo ese caso. Solo se llega a esta linea
 * cuando no hay nada detras que duplicar. Es lo mismo que `screen-header` hacia desde el principio.
 */
export const goBackOrHome = () => {
  if (router.canGoBack()) return router.back();
  router.replace('/');
};
