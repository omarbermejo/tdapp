import { useIsFocused } from 'expo-router';
import { useEffect, useRef, useSyncExternalStore } from 'react';

import { revisionOf, subscribeRevision, type Domain } from './store';

/**
 * Vuelve a pedir cuando algo de `domain` cambio, sin depender de que la pantalla pierda el foco.
 *
 * Es el hueco que no cubria NADA. La app tenia dos sistemas de frescura y ninguno sabia que acabas
 * de escribir algo: el de `useFocusEffect` solo reacciona a la NAVEGACION, y el de TTL solo al
 * RELOJ. Cerrar una tarea desde el inicio no es ninguna de las dos cosas — no cambias de pantalla y
 * no pasa el tiempo — asi que la racha, el mapa de calor, los puntos de la tira y el anillo del
 * espacio se quedaban congelados delante de ti hasta que salias y volvias.
 *
 * Las DOS mitades importan, y por razones distintas:
 *
 * - **Solo pide con la pantalla al frente.** Sin esto, cerrar una tarea en el inicio dispararia
 *   tambien las peticiones de las tres pestañas que siguen montadas detras.
 * - **Pero la revision vista avanza SIEMPRE.** Sin esto, volver a una de esas pestañas dispararia
 *   DOS peticiones: la de este efecto y la del `useFocusEffect` que ese hook ya tenia. Dejandola
 *   avanzar, lo que no se pidio mientras no mirabas lo trae el foco de siempre.
 *
 * `domain` acepta `null` por el mismo motivo que la llave de `useCached`: `useLocalToday()` devuelve
 * '' hasta que ancla, y hasta entonces no hay nada que revalidar.
 */
export function useRevalidate(domain: Domain | null, reload: () => Promise<void> | void) {
  const focused = useIsFocused();
  const revision = useSyncExternalStore(
    (listener) => (domain ? subscribeRevision(domain, listener) : () => {}),
    () => (domain ? revisionOf(domain) : 0)
  );

  /**
   * La revision que este hook ya atendio. Nace con la ACTUAL y no en cero: montarse no es una
   * invalidacion, y arrancar en cero haria que cada pantalla pidiera de mas la primera vez.
   */
  const seen = useRef(revision);

  useEffect(() => {
    if (seen.current === revision) return;
    seen.current = revision;
    if (focused) void reload();
  }, [revision, focused, reload]);
}
