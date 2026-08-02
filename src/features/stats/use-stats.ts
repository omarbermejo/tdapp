import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ApiError, api, type Stats } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { useRevalidate } from '@/features/cache/use-revalidate';

/** `for` es la ventana a la que pertenece lo guardado. Arranca en null por lo mismo que en `use-streak`. */
type State = { for: string | null; stats: Stats | null; error: string };

/**
 * `date` mas `days` dias, en texto ISO. Duplicado a proposito del `shift` privado de `grid.ts`: aqui
 * hace falta antes de que exista una rejilla, y exportarlo desde alla ataria el hook a la pintura.
 *
 * Con el constructor de tres numeros, nunca `new Date('YYYY-MM-DD')`: ese lo lee como UTC y al oeste
 * de Greenwich devuelve el dia anterior, con lo que la ventana empezaria un dia antes.
 */
const shiftDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, m - 1, d + days);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

/**
 * Los dias con actividad de una ventana, listos para pintar. Calcado de `use-streak`.
 *
 * El guard de `date` es el mismo y por la misma razon: `useLocalToday()` devuelve '' hasta que
 * ancla, y `api.stats(token, '')` omite el parametro, con lo que el API cae en el dia UTC del
 * SERVIDOR. De noche en Mexico eso es mañana y la rejilla entera se correria un dia.
 *
 * `days` es cuantos dias hacia atras se piden, contando hoy. Omitido, se queda con el default del API
 * (28, la rejilla del perfil); el mapa del trimestre en Hoy pide 119.
 *
 * `workspaceId` acota todo a un espacio, y es lo que deja que la pantalla de detalle de un espacio use
 * el MISMO hook y el mismo mapa de calor que la cuenta entera.
 *
 * Las dos opciones entran en la llave del estado —no solo la fecha— para que dos pantallas con
 * ventanas o espacios distintos no se lean los datos.
 */
export function useStats(date: string, opts: { days?: number; workspaceId?: number } = {}) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ for: null, stats: null, error: '' });
  const { days, workspaceId } = opts;

  // La llave de lo guardado: el dia, la ventana Y el espacio.
  const key = `${date}:${days ?? ''}:${workspaceId ?? ''}`;

  const reload = useCallback(async () => {
    if (!token || !date) return;
    try {
      const stats = await api.stats(token, {
        date,
        from: days ? shiftDays(date, -(days - 1)) : undefined,
        workspaceId,
      });
      setState({ for: key, stats, error: '' });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer tu avance';
      // Si ya habia datos de ESTA ventana se quedan: un fallo no borra lo que se esta viendo.
      setState((s) => (s.for === key ? { ...s, error } : { for: key, stats: null, error }));
    }
  }, [token, date, days, workspaceId, key]);

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

  const fresh = state.for === key;

  /**
   * Y sin salir de la pantalla: una mutacion caduca el dominio y esto vuelve a pedir en el sitio.
   * Es lo que hace que el mapa de calor y los puntos de la tira se mueva al cerrar una tarea en el inicio, donde no hay cambio de foco
   * que dispare el efecto de arriba.
   */
  useRevalidate('stats', reload);

  return {
    stats: fresh ? state.stats : null,
    error: fresh ? state.error : '',
    loading: !fresh,
    reload,
  };
}
