import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ApiError, type Today } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { tasksApi } from './api';
import { useOnTasksChanged } from './revalidate';

type State = { today: Today | null; error: string; loading: boolean };

/**
 * El dia del usuario, listo para pintar.
 *
 * ponytail: useState y un reload a mano en vez de react-query. Es UNA consulta y dos acciones
 * que la invalidan; una libreria de cache aqui seria mas configuracion que codigo. Techo: si
 * aparecen varias pantallas compartiendo este dato, ahi si conviene un cache de verdad.
 */
export function useToday() {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ today: null, error: '', loading: true });

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const today = await tasksApi.today(token);
      // Sin guardas de "sigo montado": desde React 18 un setState tras desmontar no hace nada.
      setState({ today, error: '', loading: false });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer tu día';
      setState((s) => ({ ...s, error, loading: false }));
    }
  }, [token]);

  // useFocusEffect y no useEffect: tambien corre al montar, y ademas al VOLVER. Sin esto,
  // crear una tarea en /new-task o marcar algo en el calendario dejaba el home con el dia viejo.
  useFocusEffect(
    useCallback(() => {
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
    }, [reload])
  );

  // Y cuando se anota desde la barra, que esta fuera de esta pantalla y no cambia el foco.
  useOnTasksChanged(reload);

  return { ...state, reload };
}
