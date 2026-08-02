import { useMemo } from 'react';

import type { Workspace } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { WARM, keyOf, patch } from '@/features/cache/store';
import { useCached } from '@/features/cache/use-cached';

import { workspacesApi } from './api';

/** La llave del cache. Vive aqui para que la precarga del arranque pueda pedir lo mismo. */
export const workspacesKey = () => keyOf('workspaces');

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
 *
 * **Va por el cache, y aqui esa es la diferencia mas visible de toda la app**: este hook esta montado
 * en CUATRO sitios a la vez (inicio, selector de espacios, anotar por pasos, ajustes). Antes eran
 * cuatro `useState` con cuatro peticiones y cuatro copias que divergian — borrar un espacio en el
 * selector dejaba a las otras tres mintiendo hasta el siguiente foco. Ahora es una sola copia y una
 * sola peticion, y el `drop` de abajo repinta las cuatro en el mismo frame.
 *
 * La forma de retorno no cambia: los cuatro sitios de montaje siguen igual.
 */
export function useWorkspaces() {
  const { token } = useAuth();
  const key = token ? workspacesKey() : null;

  const { data, error, reload } = useCached(
    key,
    () => workspacesApi.list(token!),
    // WARM y no LIVE: el nombre, el icono y la clasificacion de un espacio no cambian nunca; lo unico
    // que se mueve es su contador, y para eso ya esta la invalidacion al mutar una tarea.
    WARM
  );

  /**
   * Se arma con `useMemo` por lo mismo que en `use-tasks`: la card lo recibe como prop y lo mete en
   * las dependencias de sus callbacks, asi que un objeto nuevo por render los recrearia todos.
   */
  const mutate = useMemo<Omit<WorkspaceMutations, 'reload'>>(
    () => ({
      drop: (workspace) => {
        if (!key) return () => {};
        patch<{ workspaces: Workspace[] }>(key, (old) => ({
          workspaces: old.workspaces.filter((w) => w.id !== workspace.id),
        }));
        // Restaura en su sitio por `position`, que es el mismo orden que usa el API.
        return () =>
          patch<{ workspaces: Workspace[] }>(key, (old) => ({
            workspaces: [...old.workspaces, workspace].sort(
              (a, b) => a.position - b.position || a.id - b.id
            ),
          }));
      },
    }),
    [key]
  );

  return {
    // null y no [] mientras no haya llegado: con null se pinta el hueco callado y con `[]` el
    // mensaje de "sin espacios todavia". Esa diferencia es toda la pantalla del selector.
    workspaces: data?.workspaces ?? null,
    error,
    reload,
    ...mutate,
  };
}
