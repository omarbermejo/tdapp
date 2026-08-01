import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { ApiError, api, type AvatarState } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

/**
 * El vestidor: que caras hay libres, que logros van y cual esperando eleccion. Calcado de
 * `use-stats`.
 *
 * El guard de `date` es el mismo y por la misma razon: `useLocalToday()` devuelve '' hasta que
 * ancla, y sin fecha el API cae en su dia UTC — con lo que la mejor racha, y por tanto los logros de
 * constancia, se medirian sobre una ventana corrida.
 */
export function useAvatars(date: string) {
  const { token } = useAuth();
  const [state, setState] = useState<AvatarState | null>(null);
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    if (!token || !date) return;
    try {
      setState(await api.avatars(token, date));
      setError('');
    } catch (e) {
      // Lo que ya estaba se queda: un fallo de red no vuelve a poner candados sobre lo ganado.
      setError(e instanceof ApiError ? e.message : 'No pudimos traer tus caras');
    }
  }, [token, date]);

  /**
   * Reclama una cara y deja el vestidor al dia con lo que responde el servidor.
   *
   * El estado NO se toca de forma optimista, al reves que `updateProfile`. Ahi lo peor que pasa si
   * falla es que un color vuelve atras; aqui seria enseñar una cara ganada y quitarla medio segundo
   * despues, que es la manera mas rapida de que una recompensa se sienta falsa.
   */
  const claim = useCallback(
    async (milestone: string, avatar: string) => {
      if (!token || !date) return;
      setState(await api.claimAvatar(token, milestone, avatar, date));
    },
    [token, date]
  );

  // useFocusEffect y no useEffect: cerrar la tarea que cumple un logro y volver aqui abre el trio.
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

  return { state, error, loading: !state && !error, claim, reload };
}
