import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ApiError, api, type TaskCounts } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Cuantas tareas lleva la cuenta. Calcado de `use-stats` pero sin dia: el conteo es de siempre, asi
 * que no hay nada a lo que pertenezca — `loading` sale de que todavia no llego nada, y no de que lo
 * que hay sea de otro dia.
 */
export function useTaskCounts() {
  const { token } = useAuth();
  const [counts, setCounts] = useState<TaskCounts['counts'] | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      setCounts((await api.taskCounts(token)).counts);
      setError('');
    } catch (e) {
      // Los conteos viejos se quedan en pantalla: un fallo de red no vacia un numero que ya era
      // cierto hace un minuto.
      setError(e instanceof ApiError ? e.message : 'No pudimos traer tus tareas');
    }
  }, [token]);

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

  return { counts, error, loading: !counts && !error, reload };
}
