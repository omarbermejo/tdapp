import { useEffect, useState } from 'react';

import { ApiError, type Collaborator } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

import { workspacesApi } from './api';

/**
 * Con quien ya has trabajado, para no teclear un correo cada vez.
 *
 * `useEffect` y no `useFocusEffect` como sus hermanos: esto se pinta DENTRO de un paso de un stepper,
 * no en una pantalla que se enfoca — la lista no cambia mientras alguien elige a quien invitar, y
 * recargarla al volver de la hoja del sistema para compartir seria trabajo por nada.
 *
 * El `setState` vive dentro de la async, que es lo que exige `set-state-in-effect` en `error`: un
 * `setState` sincrono dentro de un efecto no compila con el React Compiler.
 */
export function useCollaborators() {
  const { token } = useAuth();
  /** `null` es "todavia no llego" y `[]` es "no has trabajado con nadie": la tira se calla o no existe. */
  const [people, setPeople] = useState<Collaborator[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const { collaborators } = await workspacesApi.collaborators(token);
        if (!cancelled) setPeople(collaborators);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof ApiError ? e.message : 'No pudimos traer tus contactos');
        // Con `[]` la tira desaparece en vez de quedarse cargando para siempre.
        setPeople([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  return { people, error };
}
