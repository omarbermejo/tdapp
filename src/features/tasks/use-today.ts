import { useCallback, useEffect, useRef, useState } from 'react';

import { ApiError, type Today } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { tasksApi } from './api';

/**
 * El dia del usuario, listo para pintar.
 *
 * ponytail: useState y un reload a mano en vez de react-query. Es UNA consulta y dos acciones
 * que la invalidan; una libreria de cache aqui seria mas configuracion que codigo. Techo: si
 * aparecen varias pantallas compartiendo este dato, ahi si conviene un cache de verdad.
 */
export function useToday() {
  const { token } = useAuth();
  const [today, setToday] = useState<Today | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  /** Cuando llego el dato: el cronometro del servidor se sigue contando desde aqui. */
  const [fetchedAt, setFetchedAt] = useState(() => Date.now());
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const data = await tasksApi.today(token);
      if (!alive.current) return;
      setToday(data);
      setFetchedAt(Date.now());
      setError('');
    } catch (e) {
      if (!alive.current) return;
      setError(e instanceof ApiError ? e.message : 'No pudimos traer tu día');
    } finally {
      if (alive.current) setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    reload();
  }, [reload]);

  /** Arranca o para el cronometro y vuelve a traer el dia: el servidor es el que cuenta. */
  const toggleTimer = useCallback(
    async (id: number, action: 'start' | 'stop') => {
      if (!token) return;
      try {
        await tasksApi.timer(token, id, action);
        await reload();
      } catch (e) {
        setError(e instanceof ApiError ? e.message : 'No pudimos con el cronómetro');
      }
    },
    [token, reload]
  );

  return { today, error, loading, fetchedAt, reload, toggleTimer };
}
