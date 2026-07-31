import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ApiError, api, type Streak } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

/**
 * `for` es el dia al que pertenece lo guardado, y por eso vive DENTRO del estado. Arranca en null y
 * no en '': null nunca coincide con el dia pedido, asi que el primer render sale como "cargando" y no
 * como "sin racha" — y pintar un cero mientras carga es justo la mentira que aqui castiga.
 */
type State = { for: string | null; streak: Streak | null; error: string };

/**
 * La racha de un dia, lista para pintar. Calcado de `use-tasks`.
 *
 * El guard de `date` NO es por analogia: `useLocalToday()` devuelve '' hasta que ancla, y
 * `api.streak(token, '')` omite el parametro, con lo que el API cae en el dia UTC del SERVIDOR. De
 * noche en Mexico eso es mañana, asi que la racha se veria rota una hora al dia.
 */
export function useStreak(date: string) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ for: null, streak: null, error: '' });

  const reload = useCallback(async () => {
    if (!token || !date) return;
    try {
      const streak = await api.streak(token, date);
      setState({ for: date, streak, error: '' });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer tu racha';
      // Si ya habia racha de ESTE dia se queda: un fallo no borra lo que se esta viendo.
      setState((s) => (s.for === date ? { ...s, error } : { for: date, streak: null, error }));
    }
  }, [token, date]);

  // useFocusEffect y no useEffect: corre al montar Y al VOLVER, asi cerrar una tarea en el home y
  // pasar al perfil enseña la racha nueva. La carga va dentro de una async para que el primer
  // setState no sea sincrono con el cuerpo del efecto.
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
    streak: fresh ? state.streak : null,
    error: fresh ? state.error : '',
    loading: !fresh,
    reload,
  };
}
