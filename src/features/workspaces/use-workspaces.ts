import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';

import { ApiError, type Workspace } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { workspacesApi } from './api';

/**
 * `loaded` distingue "todavia no llego" de "no hay ninguno", y aqui esa diferencia es toda la
 * pantalla: con null se pinta el hueco callado y con `[]` el mensaje de "sin espacios todavia".
 *
 * No lleva un `for` como `use-tasks` o `use-streak` porque los espacios no son de un dia: son de la
 * cuenta. No hay dato viejo que descartar al cambiar de fecha.
 */
type State = { workspaces: Workspace[] | null; error: string };

/** Pintar ya y traer la verdad. Lo mismo que `TaskMutations`, para lo que hay hoy. */
export type WorkspaceMutations = {
  /** Quita el espacio del estado local y devuelve el deshacer. */
  drop: (workspace: Workspace) => () => void;
  reload: () => Promise<void> | void;
};

/**
 * Los espacios de trabajo con su progreso, listos para pintar.
 *
 * El `total`/`done` de cada uno lo cuenta el API en SQL, asi que esto es UNA peticion y no una por
 * espacio — que es lo que habria hecho falta contando tareas en el cliente.
 */
export function useWorkspaces() {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ workspaces: null, error: '' });

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const { workspaces } = await workspacesApi.list(token);
      setState({ workspaces, error: '' });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer tus espacios';
      // Si ya habia espacios se quedan: un fallo no borra lo que se esta viendo.
      setState((s) => ({ workspaces: s.workspaces, error }));
    }
  }, [token]);

  // useFocusEffect y no useEffect: volver de /new-task o de /new-workspace tiene que repintar los
  // anillos. La carga va dentro de una async para que el setState no sea sincrono con el efecto.
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
   * Se arma con `useMemo` por lo mismo que en `use-tasks`: la card lo recibe como prop y lo mete en
   * las dependencias de sus callbacks, asi que un objeto nuevo por render los recrearia todos.
   */
  const mutate = useMemo<Omit<WorkspaceMutations, 'reload'>>(
    () => ({
      drop: (workspace) => {
        setState((s) => ({
          ...s,
          workspaces: s.workspaces?.filter((w) => w.id !== workspace.id) ?? null,
        }));
        // Restaura en su sitio por `position`, que es el mismo orden que usa el API.
        return () =>
          setState((s) => ({
            ...s,
            workspaces: s.workspaces
              ? [...s.workspaces, workspace].sort((a, b) => a.position - b.position || a.id - b.id)
              : null,
          }));
      },
    }),
    []
  );

  return { workspaces: state.workspaces, error: state.error, reload, ...mutate };
}
