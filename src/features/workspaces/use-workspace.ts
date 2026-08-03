import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";

import { ApiError, type Workspace } from "@/features/auth/api";
import { useAuth } from "@/features/auth/auth-context";

import { useRevalidate } from "@/features/cache/use-revalidate";
import { workspacesApi } from "./api";

/**
 * `for` es el espacio al que pertenece lo guardado. Arranca en null por lo mismo que en `use-streak`:
 * null nunca coincide, asi que el primer render sale como "cargando" y no como "no existe".
 *
 * `missing` separa los dos fallos que la pantalla trata distinto: un 404 (el espacio se borro, o el
 * enlace es viejo) tiene que decir eso y ofrecer volver, mientras que un fallo de red tiene que ofrecer
 * reintentar. Con un solo `error` la pantalla pondria "Reintentar" en algo que nunca va a existir.
 */
type State = {
  for: number | null;
  workspace: Workspace | null;
  error: string;
  missing: boolean;
};

/** Un espacio con su progreso, listo para pintar. Calcado de `use-streak`. */
export function useWorkspace(id: number) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({
    for: null,
    workspace: null,
    error: "",
    missing: false,
  });

  const reload = useCallback(async () => {
    if (!token || !id) return;
    try {
      const { workspace } = await workspacesApi.get(token, id);
      setState({ for: id, workspace, error: "", missing: false });
    } catch (e) {
      const missing = e instanceof ApiError && e.status === 404;
      const error =
        e instanceof ApiError ? e.message : "No pudimos traer este espacio";
      setState((s) =>
        s.for === id
          ? { ...s, error, missing }
          : { for: id, workspace: null, error, missing },
      );
    }
  }, [token, id]);

  // useFocusEffect y no useEffect: cerrar una tarea del espacio y volver aqui repinta el anillo.
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
    }, [reload]),
  );

  const fresh = state.for === id;

  /**
   * Y sin salir de la pantalla: una mutacion caduca el dominio y esto vuelve a pedir en el sitio.
   * Es lo que hace que el anillo del espacio se mueva al cerrar una tarea en el inicio, donde no hay cambio de foco
   * que dispare el efecto de arriba.
   */
  useRevalidate("workspaces", reload);

  return {
    workspace: fresh ? state.workspace : null,
    error: fresh ? state.error : "",
    missing: fresh && state.missing,
    loading: !fresh,
    reload,
  };
}
