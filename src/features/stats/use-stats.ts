import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ApiError, api, type Stats } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

/** `for` es el dia al que pertenece lo guardado. Arranca en null por lo mismo que en `use-streak`. */
type State = { for: string | null; stats: Stats | null; error: string };

/**
 * Las cuatro semanas de trabajo cerrado, listas para pintar. Calcado de `use-streak`.
 *
 * El guard de `date` es el mismo y por la misma razon: `useLocalToday()` devuelve '' hasta que
 * ancla, y `api.stats(token, '')` omite el parametro, con lo que el API cae en el dia UTC del
 * SERVIDOR. De noche en Mexico eso es mañana y la rejilla entera se correria un dia.
 */
export function useStats(date: string) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ for: null, stats: null, error: '' });

  const reload = useCallback(async () => {
    if (!token || !date) return;
    try {
      const stats = await api.stats(token, date);
      setState({ for: date, stats, error: '' });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer tu avance';
      // Si ya habia datos de ESTE dia se quedan: un fallo no borra lo que se esta viendo.
      setState((s) => (s.for === date ? { ...s, error } : { for: date, stats: null, error }));
    }
  }, [token, date]);

  // useFocusEffect y no useEffect: cerrar una tarea en el home y volver al perfil tiñe la celda.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        if (cancelled) return;
        await reload();
      })();
      return () => {
        cancelled = true;
      };
    }, [reload])
  );

  const fresh = state.for === date;

  return {
    stats: fresh ? state.stats : null,
    error: fresh ? state.error : '',
    loading: !fresh,
    reload,
  };
}
