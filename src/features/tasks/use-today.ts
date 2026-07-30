import { useCallback, useEffect, useState } from 'react';

import { ApiError, type Today } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { tasksApi } from './api';

type State = {
  today: Today | null;
  error: string;
  loading: boolean;
  /** Cuando llego el dato: el cronometro del servidor se sigue contando desde aqui. */
  fetchedAt: number;
};

/**
 * El dia del usuario, listo para pintar.
 *
 * ponytail: useState y un reload a mano en vez de react-query. Es UNA consulta y dos acciones
 * que la invalidan; una libreria de cache aqui seria mas configuracion que codigo. Techo: si
 * aparecen varias pantallas compartiendo este dato, ahi si conviene un cache de verdad.
 */
export function useToday() {
  const { token } = useAuth();
  const [state, setState] = useState<State>({
    today: null,
    error: '',
    loading: true,
    fetchedAt: 0,
  });

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const today = await tasksApi.today(token);
      // Sin guardas de "sigo montado": desde React 18 un setState tras desmontar no hace nada.
      setState({ today, error: '', loading: false, fetchedAt: Date.now() });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer tu día';
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, [token]);

  useEffect(() => {
    // La carga vive dentro del efecto y no llama a reload directo: asi no hay un setState
    // sincrono en el cuerpo del efecto, que es lo que dispara renders en cascada.
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [reload]);

  /** Arranca o para el cronometro y vuelve a traer el dia: el servidor es el que cuenta. */
  const toggleTimer = useCallback(
    async (id: number, action: 'start' | 'stop') => {
      if (!token) return;
      try {
        await tasksApi.timer(token, id, action);
        await reload();
      } catch (e) {
        const error = e instanceof ApiError ? e.message : 'No pudimos con el cronómetro';
        setState((s) => ({ ...s, error }));
      }
    },
    [token, reload]
  );

  return { ...state, reload, toggleTimer };
}
