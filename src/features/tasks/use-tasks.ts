import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ApiError, type Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { tasksApi } from './api';

/**
 * `for` es el dia al que pertenece lo que hay guardado, y por eso vive DENTRO del estado.
 * Arranca en null y no en '': null nunca coincide con el dia pedido, asi que el primer render
 * (cuando la pantalla todavia no sabe que dia es hoy) sale como "cargando" y no como "vacio".
 */
type State = { for: string | null; tasks: Task[] | null; error: string };

/**
 * Las tareas de UN dia, listas para pintar.
 *
 * Sin `date` no pide nada: `list` ignora los filtros vacios y traeria TODAS las tareas del
 * usuario, que en la agenda de un dia seria mentira.
 *
 * ponytail: no hay cache entre dias — moverse por la tira vuelve a preguntar. Techo: si el
 * ir y venir se siente lento, aqui entra un Map de fecha -> tareas o un cache de verdad.
 */
export function useTasks(date: string) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ for: null, tasks: null, error: '' });

  const reload = useCallback(async () => {
    if (!token || !date) return;
    try {
      const { tasks } = await tasksApi.list(token, { date });
      setState({ for: date, tasks, error: '' });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer ese día';
      // Si ya habia tareas de ESTE dia se quedan: un fallo no borra lo que se esta viendo.
      setState((s) => (s.for === date ? { ...s, error } : { for: date, tasks: null, error }));
    }
  }, [token, date]);

  // useFocusEffect y no useEffect: corre al montar Y al VOLVER, asi lo que se crea en /new-task
  // aparece al regresar. La carga va dentro y no llama a reload en seco, asi el primer setState
  // no es sincrono con el cuerpo del efecto.
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

  /**
   * Al cambiar de dia el estado todavia trae el anterior. Se descarta al pintar en vez de
   * limpiarlo con un setState: pintar el lunes bajo el encabezado del martes es peor que
   * un instante de "cargando".
   */
  const fresh = state.for === date;

  return {
    tasks: fresh ? state.tasks : null,
    error: fresh ? state.error : '',
    loading: !fresh,
    reload,
  };
}
