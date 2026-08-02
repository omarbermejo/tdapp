import { useFocusEffect } from 'expo-router';
import { useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { ApiError, type Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { useActiveSpaceId } from '@/features/workspaces/active-space';

import { tasksApi } from './api';
import { useRevalidate } from '@/features/cache/use-revalidate';

/**
 * `for` es el dia al que pertenece lo que hay guardado, y por eso vive DENTRO del estado.
 * Arranca en null y no en '': null nunca coincide con el dia pedido, asi que el primer render
 * (cuando la pantalla todavia no sabe que dia es hoy) sale como "cargando" y no como "vacio".
 */
type State = { for: string | null; tasks: Task[] | null; error: string };

/**
 * Lo que una fila necesita para cambiar la lista: pintar YA, quitar YA, y traer la verdad.
 *
 * Va como UN tipo y no como tres props porque `day-timeline` lo enhebra por tres niveles: con
 * `reload`, `patch` y `drop` sueltos serian nueve props de paso. Y los dos hooks de abajo lo
 * cumplen estructuralmente, asi que una pantalla puede pasar su hook entero sin desestructurar.
 */
export type TaskMutations = {
  /** Aplica el cambio en el estado local y devuelve la funcion que lo deshace. */
  patch: (task: Task, changes: Partial<Task>) => () => void;
  /** Quita la fila del estado local. Si el servidor rechaza, se restaura con `reload`. */
  drop: (task: Task) => void;
  /**
   * Cambia el orden de la lista local y devuelve el deshacer.
   *
   * Recibe las DOS listas ya calculadas y no un par (id, indice): es la misma regla que obliga a
   * `patch` a recibir la tarea entera. Estos mutadores corren dentro de updaters de `setState`, que
   * React puede ejecutar dos veces, asi que no pueden leer el estado ni calcular nada dentro.
   */
  reorder: (next: Task[], previous: Task[]) => () => void;
  reload: () => Promise<void> | void;
};

/**
 * Reemplaza o quita una tarea del estado. PURA, y eso es el requisito: la usan updaters de
 * `setState`, que React puede ejecutar dos veces — un efecto o una captura ahi dentro se
 * duplicaria. Es la misma regla que obliga al espejo sincrono de `usePomodoro`.
 */
const replace = (s: State, id: number, next: Task | null): State => {
  if (!s.tasks) return s;
  return {
    ...s,
    tasks: next ? s.tasks.map((t) => (t.id === id ? next : t)) : s.tasks.filter((t) => t.id !== id),
  };
};

/**
 * Los dos mutadores optimistas. Iguales para los dos hooks, asi que se arman una vez.
 *
 * `patch` recibe la tarea ENTERA y no un id: el deshacer restaura ese objeto tal cual estaba, sin
 * tener que leer el estado desde dentro del updater. Es lo que permite que todo esto sea puro.
 */
const mutators = (setState: React.Dispatch<React.SetStateAction<State>>) => ({
  patch: (task: Task, changes: Partial<Task>) => {
    setState((s) => replace(s, task.id, { ...task, ...changes }));
    return () => setState((s) => replace(s, task.id, task));
  },
  drop: (task: Task) => setState((s) => replace(s, task.id, null)),
  /**
   * El orden nuevo se pinta YA y el deshacer restaura el anterior tal cual.
   *
   * Los dos arrays llegan hechos desde fuera justo para que este updater sea PURO: calcular el nuevo
   * orden aqui dentro (mover el elemento i al hueco j) correria dos veces en desarrollo y la segunda
   * partiria de una lista ya movida.
   */
  reorder: (next: Task[], previous: Task[]) => {
    setState((s) => (s.tasks ? { ...s, tasks: next } : s));
    return () => setState((s) => (s.tasks ? { ...s, tasks: previous } : s));
  },
});

/**
 * Las tareas de UN dia, listas para pintar.
 *
 * Sin `date` no pide nada: `list` ignora los filtros vacios y traeria TODAS las tareas del
 * usuario, que en la agenda de un dia seria mentira.
 *
 * **Recuerda los dias que ya viste**, y eso es lo que hace que moverse por la tira no parpadee.
 *
 * Antes, cambiar de dia ponia `fresh` en false: la lista se VACIABA y salia "Trayendo ese dia…"
 * hasta que contestaba el servidor. Con la memoria, un dia ya visto se pinta en el mismo frame del
 * toque y la peticion solo lo confirma por detras. De paso arregla la tardanza al entrar: volver a
 * la agenda ya no espera a la red para enseñar algo.
 *
 * Es un `Map` por hook y no un cache de verdad a proposito: `/tasks?workspaceId` puede pesar ~180 KB
 * (ver `MAX_ENTRY` en el store), asi que esto no se persiste ni se comparte entre pantallas — vive lo
 * que vive la pantalla y se va con ella.
 */
export function useTasks(date: string) {
  const { token } = useAuth();
  /**
   * El espacio activo se lee AQUI DENTRO y no llega por parametro, y es deliberado: si fuera un
   * argumento, cada pantalla tendria que acordarse de pasarlo y la que lo olvidara enseñaria el dia
   * equivocado sin ningun error. Es el mismo argumento por el que `andSync` vive en el cliente de la
   * API y no en cada sitio que muta una tarea.
   */
  const space = useActiveSpaceId();
  const [state, setState] = useState<State>({ for: null, tasks: null, error: '' });

  // La llave de lo guardado lleva el espacio: al cambiar de espacio, lo del anterior se descarta al
  // pintar en vez de quedarse un frame diciendo lo que no es.
  const key = `${date}:${space ?? ''}`;

  /** Lo ultimo que se supo de cada dia. En un ref y no en estado: escribirlo no repinta nada. */
  const seen = useRef(new Map<string, Task[]>());

  /**
   * Al cambiar de dia, si ya lo vimos se siembra el estado con lo que se sabia.
   *
   * `useLayoutEffect` y no `useEffect` porque corre ANTES de pintar: con el normal se colaria un
   * frame con la lista vacia, que es exactamente el parpadeo que esto viene a quitar.
   *
   * Y se siembra el ESTADO en vez de pintar del mapa directamente para que los mutadores sigan
   * valiendo: `patch` y `drop` escriben sobre `state`, asi que si el estado todavia apuntara al dia
   * anterior, marcar una tarea en el dia recien abierto no haria nada visible.
   */
  useLayoutEffect(() => {
    const remembered = seen.current.get(key);
    if (remembered) setState({ for: key, tasks: remembered, error: '' });
  }, [key]);

  const reload = useCallback(async () => {
    if (!token || !date) return;
    try {
      const { tasks } = await tasksApi.list(token, { date, workspaceId: space });
      seen.current.set(key, tasks);
      setState({ for: key, tasks, error: '' });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer ese día';
      // Si ya habia tareas de ESTE dia se quedan: un fallo no borra lo que se esta viendo.
      setState((s) => (s.for === key ? { ...s, error } : { for: key, tasks: null, error }));
    }
  }, [token, date, space, key]);

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
  const fresh = state.for === key;

  /**
   * La memoria sigue a lo que se ve, no solo a lo que contesta el servidor.
   *
   * Sin esto, marcar una tarea y saltar a otro dia y volver antes de que llegue la confirmacion la
   * enseñaria otra vez sin marcar: `patch` y `drop` escriben en el estado, y el mapa se habria
   * quedado con la version de la ultima peticion.
   */
  useLayoutEffect(() => {
    if (fresh && state.tasks) seen.current.set(key, state.tasks);
  }, [fresh, state.tasks, key]);

  /**
   * Se arman con `useMemo` y no en el cuerpo: la fila los recibe como prop y los mete en las
   * dependencias de sus callbacks. Un objeto nuevo por render volveria a crear esos callbacks en
   * cada pintada de la pantalla.
   */
  const mutate = useMemo(() => mutators(setState), []);

  /**
   * Y sin cambio de foco: una tarea creada desde otra pantalla caduca el dominio y esta lista
   * la vuelve a pedir donde este.
   */
  useRevalidate('tasks', reload);

  return {
    tasks: fresh ? state.tasks : null,
    error: fresh ? state.error : '',
    loading: !fresh,
    reload,
    ...mutate,
  };
}

/**
 * TODAS las tareas de un espacio de trabajo, de cualquier dia y sin fecha incluidas.
 *
 * Sin filtro de dia a proposito: la pantalla de un espacio es la vista del PROYECTO, no de una fecha —
 * ahi lo que se quiere ver es todo lo que hay dentro. El orden lo pone el API (pendientes primero, y
 * dentro de ellas el orden manual si existe).
 *
 * Comparte forma con `useTasks` —mismo estado, mismo `useFocusEffect`, mismos mutadores— pero su llave
 * es un id y no una fecha, asi que no se fusionan en un hook con bandera: son dos preguntas distintas.
 */
export function useWorkspaceTasks(workspaceId: number) {
  const { token } = useAuth();
  const [state, setState] = useState<State>({ for: null, tasks: null, error: '' });
  // El estado guarda su llave como texto, igual que los otros dos hooks.
  const key = String(workspaceId);

  const reload = useCallback(async () => {
    if (!token || !workspaceId) return;
    try {
      const { tasks } = await tasksApi.list(token, { workspaceId });
      setState({ for: key, tasks, error: '' });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer las tareas';
      setState((s) => (s.for === key ? { ...s, error } : { for: key, tasks: null, error }));
    }
  }, [token, workspaceId, key]);

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
  const mutate = useMemo(() => mutators(setState), []);

  /**
   * Y sin cambio de foco: una tarea creada desde otra pantalla caduca el dominio y esta lista
   * la vuelve a pedir donde este.
   */
  useRevalidate('tasks', reload);

  return {
    tasks: fresh ? state.tasks : null,
    error: fresh ? state.error : '',
    loading: !fresh,
    reload,
    ...mutate,
  };
}

/**
 * Lo que quedo atras: pendiente de un dia anterior, o anotado sin fecha.
 *
 * Existe porque hasta ahora esas tareas NO SALIAN EN NINGUNA PANTALLA. `list` filtra por fecha
 * exacta, Hoy pide hoy y Planear pide de hoy en adelante, asi que una tarea que se te paso
 * desaparecia en silencio y nunca te enterabas. En una app para TDAH ese es el modo de falla que
 * importa, no el que se te olvide algo: es que la app te lo esconda.
 *
 * Comparte forma con `useTasks` a proposito — mismo estado, mismo `useFocusEffect`, mismo descarte
 * del dia viejo — pero no se fusionan en un hook con bandera: son dos preguntas distintas y una
 * pantalla hace las dos a la vez.
 */
export function useBacklog(today: string) {
  const { token } = useAuth();
  // Dentro de un espacio, el atraso tambien es el suyo. Ver la nota de `useTasks`.
  const space = useActiveSpaceId();
  const [state, setState] = useState<State>({ for: null, tasks: null, error: '' });
  const key = `${today}:${space ?? ''}`;

  const reload = useCallback(async () => {
    if (!token || !today) return;
    try {
      const { tasks } = await tasksApi.list(token, {
        backlog: today,
        status: 'pending',
        workspaceId: space,
      });
      setState({ for: key, tasks, error: '' });
    } catch {
      // Sin mensaje: el backlog es una seccion secundaria y un error suyo no debe robarle la
      // pantalla al dia. Si falla, no aparece.
      setState({ for: key, tasks: null, error: '' });
    }
  }, [token, today, space, key]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload])
  );

  const fresh = state.for === key;
  const mutate = useMemo(() => mutators(setState), []);
  /**
   * Y sin cambio de foco: una tarea creada desde otra pantalla caduca el dominio y esta lista
   * la vuelve a pedir donde este.
   */
  useRevalidate('tasks', reload);

  return { tasks: fresh ? state.tasks : null, reload, ...mutate };
}
