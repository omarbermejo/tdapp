import { useFocusEffect } from 'expo-router';
import { useCallback, useSyncExternalStore } from 'react';

import { ApiError } from '@/features/auth/api';

import { track } from './meter';
import {
  isStale,
  read,
  readError,
  revalidate,
  setError,
  subscribe,
  subscribeError,
  type Policy,
} from './store';

/**
 * Leer algo del servidor, con lo guardado por delante.
 *
 * Sustituye el patron que los diez hooks de datos repiten hoy: un `useState` con una llave `for` que
 * hace de guard de staleness, mas un `useFocusEffect` que dispara SIEMPRE. Aqui lo guardado se
 * devuelve al instante y el foco solo comprueba el TTL — la peticion sale unicamente si de verdad
 * hace falta.
 *
 * `useSyncExternalStore` y no `useState`: garantiza que todos los suscriptores de una llave ven el
 * mismo valor en el mismo render. Es lo que hace que cuatro `useWorkspaces` sean una sola copia.
 *
 * `useFocusEffect` se queda, y a proposito: el foco es la unica señal real de "esta persona esta
 * mirando esto AHORA", y es lo que atrapa un cambio hecho desde otro dispositivo. Lo que cambia es
 * que ahora dispara una comparacion contra el TTL en vez de una peticion.
 */
export function useCached<T>(
  key: string | null,
  fetcher: () => Promise<T>,
  policy: Policy
): { data: T | undefined; error: string; loading: boolean; reload: () => Promise<void> } {
  /*
    `key` puede ser null y eso NO es un caso raro: `useLocalToday()` devuelve '' hasta que ancla el
    reloj en un efecto, y varios hooks dependen de esa fecha. Con la llave en null no se lee, no se
    suscribe y no se pide — igual que hacen hoy los guards `if (!date) return`.
  */
  const data = useSyncExternalStore(
    useCallback((listener) => (key ? subscribe(key, listener) : () => {}), [key]),
    useCallback(() => (key ? read<T>(key) : undefined), [key])
  );

  // El error vive en el store pero APARTE de las entradas y sin persistirse: ver su docblock alli.
  const error = useSyncExternalStore(
    useCallback((listener) => (key ? subscribeError(key, listener) : () => {}), [key]),
    useCallback(() => (key ? readError(key) : ''), [key])
  );

  const run = useCallback(async () => {
    if (!key) return;
    try {
      await revalidate(key, fetcher, policy);
      setError(key, '');
    } catch (e) {
      setError(key, e instanceof ApiError ? e.message : 'No pudimos traerlo');
    }
    // `fetcher` cambia en cada render (es una arrow) y meterlo en las deps haria que el efecto de
    // foco se re-armara sin parar. La llave ya identifica lo que se pide.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, policy]);

  useFocusEffect(
    useCallback(() => {
      if (!key) return;
      if (!isStale(key, policy)) {
        // Se apunta como acierto para que el medidor pueda decir cuantas peticiones se evitaron.
        track(key, 'hit');
        return;
      }
      let cancelled = false;
      (async () => {
        if (cancelled) return;
        await run();
      })();
      return () => {
        cancelled = true;
      };
    }, [key, policy, run])
  );

  return {
    data,
    error,
    // Cargando solo si NO hay nada que pintar. Con dato viejo en pantalla la revalidacion es
    // invisible, que es todo el punto.
    loading: !!key && data === undefined && !error,
    reload: run,
  };
}
