import { useEffect, useState } from 'react';

import { ApiError, type Member } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { workspacesApi } from './api';

/**
 * Quien esta dentro de un espacio.
 *
 * `for` es el espacio al que pertenece lo guardado, igual que en `use-workspace`: sin el, cambiar de
 * espacio dejaria las caras del anterior pintadas hasta que llegara la respuesta nueva — y en una pila
 * de avatares eso es enseñar a gente que no esta ahi.
 *
 * `useEffect` y no `useFocusEffect`, al reves que sus hermanos: la lista de miembros no cambia por
 * volver a la pestaña. Cambia cuando alguien acepta una invitacion, y eso ya trae consigo un cambio de
 * espacio activo o una recarga entera. Con `useFocusEffect` serian tres peticiones por cada toque en la
 * barra de pestañas para pintar cuatro caras.
 *
 * El `setState` vive DENTRO de la async: `set-state-in-effect` esta en `error` y un `setState` sincrono
 * dentro de un efecto no compila con el React Compiler.
 */
type State = { for: number | null; members: Member[] };

export function useMembers(workspaceId: number | null | undefined) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ for: null, members: [] });

  useEffect(() => {
    // La guarda no es opcional: `SpacePill` y compañia montan sus hooks ANTES de su return
    // condicional, asi que en modo general esto corre con el id en null.
    if (!token || !workspaceId) return;
    let cancelled = false;
    (async () => {
      try {
        const { members } = await workspacesApi.members(token, workspaceId);
        if (!cancelled) setState({ for: workspaceId, members });
      } catch (e) {
        // Un fallo aqui se pinta como "todavia no llego" y no como un error: unas caras que faltan no
        // valen una linea roja en la cabecera del inicio. `ApiError` se toca para no tragar un fallo
        // de programacion — un TypeError tiene que seguir llegando a la consola.
        if (!cancelled && !(e instanceof ApiError)) throw e;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, workspaceId]);

  return state.for === workspaceId ? state.members : [];
}
