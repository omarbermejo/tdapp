import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { clearBlock, loadBlock, saveBlock, type Saved } from './vault';

/**
 * El pomodoro como maquina de estados. Cuenta HACIA ABAJO, que es la mitad del punto: contar
 * hacia arriba fue lo que saco al cronometro del home (pasarse de los 25 min se leia como una
 * app rota). Aqui el bloque tiene final y el final es la recompensa.
 */
export type Phase = 'focus' | 'short' | 'long';

/** Enfoques antes del descanso largo. Cuatro es el pomodoro clasico y cabe en una fila de brotes. */
export const ROUNDS = 4;

const BREAK_MINUTES: Record<Exclude<Phase, 'focus'>, number> = { short: 5, long: 15 };

/** Con que largo arranca la pantalla. El pomodoro clasico, y de ahi se gira la caratula. */
const DEFAULT_MINUTES = 25;

const ms = (minutes: number) => minutes * 60_000;

/** El largo de un bloque. El de enfoque lo elige la persona; los descansos son fijos. */
const lengthOf = (phase: Phase, focusMs: number) =>
  phase === 'focus' ? focusMs : ms(BREAK_MINUTES[phase]);

type State = {
  phase: Phase;
  /** Largo elegido para enfocar. Sobrevive a los descansos. */
  focusMs: number;
  /** Largo del bloque actual: de aqui sale la proporcion del dial. */
  totalMs: number;
  /**
   * Epoch en que termina el bloque. `null` = armado o en pausa, nunca corriendo.
   *
   * La cuenta sale de un instante ABSOLUTO y no de sumar intervalos: iOS congela los timers de
   * JS al irse la app al fondo, asi que restar 250ms por tick perderia todo el tiempo que el
   * telefono estuvo bloqueado — justo el tiempo en que la persona estaba trabajando.
   */
  endsAt: number | null;
  /** Lo que queda. Es lo unico que se pinta, asi que nunca se deriva de un reloj rancio. */
  leftMs: number;
  /** Enfoques cerrados del ciclo, 0..ROUNDS. */
  done: number;
};

const start = (focusMinutes: number): State => {
  const focusMs = ms(focusMinutes);
  return {
    phase: 'focus',
    focusMs,
    totalMs: focusMs,
    endsAt: null,
    leftMs: focusMs,
    done: 0,
  };
};

/** Deja un bloque armado: con su largo entero y sin correr. */
const arm = (s: State, phase: Phase, done: number): State => ({
  ...s,
  phase,
  totalMs: lengthOf(phase, s.focusMs),
  endsAt: null,
  leftMs: lengthOf(phase, s.focusMs),
  done,
});

/** Que sigue despues de cerrar un bloque. El ciclo se reinicia DESPUES del descanso largo. */
const nextPhase = (phase: Phase, done: number): { phase: Phase; done: number } => {
  if (phase !== 'focus') return { phase: 'focus', done: phase === 'long' ? 0 : done };
  const closed = done + 1;
  return closed >= ROUNDS ? { phase: 'long', done: closed } : { phase: 'short', done: closed };
};

/**
 * Reconstruye el estado a partir de lo guardado. Pura y con el reloj como parametro para poder
 * probarla: es la aritmetica que arregla el bloque que se perdia al cerrar la app, y equivocarse aqui
 * significa resucitar un bloque muerto o tirar uno que seguia vivo.
 *
 * Los tres casos:
 * - **en pausa o armado** (`endsAt === null`): tal cual se guardo, con lo que quedaba.
 * - **corriendo y con tiempo vivo**: `leftMs` se recalcula contra AHORA. Aqui se ve por que se guarda
 *   el instante del final y no los milisegundos restantes — lo segundo envejeceria en el almacen.
 * - **corriendo y ya vencido**: se cumplio con la app cerrada. Se cierra, se arma el siguiente y se
 *   devuelve `expired` para que el consumidor apague lo que haga falta sin volver a celebrar.
 */
export function rehydrate(
  saved: Saved,
  now: number
): { state: State; expired: { closed: Phase; done: number } | null } {
  const base: State = {
    phase: saved.phase,
    focusMs: saved.focusMs,
    totalMs: saved.totalMs,
    endsAt: saved.endsAt,
    leftMs: saved.leftMs,
    done: saved.done,
  };

  if (saved.endsAt === null) return { state: base, expired: null };

  const left = saved.endsAt - now;
  if (left > 0) return { state: { ...base, leftMs: left }, expired: null };

  const next = nextPhase(saved.phase, saved.done);
  return {
    state: arm(base, next.phase, next.done),
    expired: { closed: saved.phase, done: next.done },
  };
}

export type Pomodoro = ReturnType<typeof usePomodoro>;

/**
 * El cronometro. No arranca solo NUNCA: al cerrar un bloque queda armado con el siguiente y
 * espera un toque.
 *
 * Es a proposito y no pereza. Un pomodoro que se autoencadena arrastra: el descanso empieza
 * mientras sigues escribiendo y lo pierdes, o el enfoque empieza mientras sigues en la cocina.
 * Con TDAH el problema no es que el reloj corra, es decidir empezar — y esa decision tiene que
 * ser un toque visible, no algo que ya paso sin ti.
 *
 * `onFinish` recibe la fase que ACABA de cerrar (no la que sigue) y los enfoques cerrados DESPUES de
 * ese cierre. El segundo dato existe para que quien escuche pueda distinguir "cerre un bloque" de
 * "cerre el ciclo entero" (`done >= ROUNDS`) sin rehacer la aritmetica del ciclo por su cuenta: en el
 * render del consumidor, `done` todavia trae el valor viejo.
 *
 * Se llama desde el callback del intervalo, NO desde el cuerpo de un efecto: eso es lo que deja al
 * que lo escucha hacer `setState` con libertad. Un aviso disparado desde el cuerpo de un efecto
 * convierte cada `setState` del consumidor en un render en cascada — el mismo problema que el tick de
 * abajo evita, y que el lint no caza porque la llamada es indirecta.
 *
 * El tercer argumento, `silent`, es `true` cuando el bloque se cerro con la app CERRADA y solo se
 * descubrio al rehidratar. Ahi ya sono el aviso local en su momento, asi que celebrarlo al abrir seria
 * un festejo con veinte minutos de retraso — pero el resto (apagar el cronometro del servidor,
 * recargar el dia) si hay que hacerlo igual.
 *
 * El hook NO vibra ni suena por su cuenta: la celebracion es una decision de producto y vive en el
 * consumidor (`features/timer/cheer.ts`). Un haptico aqui dentro se pisaria con el patron de alla.
 *
 * La tarea enganchada se registra con `attach()` y solo sirve para persistirla junto al bloque; el hook
 * no la usa para nada mas. Se devuelve en `restoredTaskId` para reengancharla tras un reinicio.
 *
 * `attach` es una llamada y no una prop a proposito: como prop haria un ciclo — la pantalla deriva la
 * tarea de `restoredTaskId`, que sale de aqui.
 */
export function usePomodoro({
  onFinish,
}: {
  onFinish?: (closed: Phase, done: number, silent: boolean) => void;
} = {}) {
  const [state, setState] = useState<State>(() => start(DEFAULT_MINUTES));
  /**
   * `false` hasta que se leyo el almacen. La pantalla no debe pintar numeros antes: mostrar 25:00 y
   * saltar a 07:12 un frame despues se lee como un fallo.
   */
  const [ready, setReady] = useState(false);
  /** La tarea que estaba enganchada en el bloque recuperado. `undefined` = todavia no se sabe. */
  const [restoredTaskId, setRestoredTaskId] = useState<number | null | undefined>(undefined);

  /**
   * Espejo SINCRONO del estado. El tick corre desde un `setInterval`, o sea fuera de un render, y
   * necesita el estado de ESTE instante: con un updater de `setState` no podria hacer efectos
   * secundarios (un updater puede ejecutarse dos veces y el aviso saldria doble), y leyendo la
   * variable del closure leeria el del render en que se creo el intervalo.
   *
   * Todas las escrituras pasan por `commit`, asi que el ref y el estado no se pueden separar.
   */
  const live = useRef(state);

  /** La tarea enganchada. En un ref para que `commit` no cambie de identidad al cambiar de tarea. */
  const task = useRef<number | null>(null);

  const commit = useCallback((next: State) => {
    live.current = next;
    setState(next);
    /**
     * Se persiste en CADA cambio, incluido el tick del segundo. Suena a mucho, pero el tick solo
     * escribe cuando cambia `leftMs` (o sea una vez por segundo) y lo que se guarda es el instante
     * absoluto del final — barato, y es lo que hace que el bloque sobreviva a que iOS mate la app al
     * fondo sin avisar. Un bloque armado sin morder no vale la pena guardarlo.
     */
    if (next.endsAt === null && next.leftMs === next.totalMs) {
      clearBlock();
      return;
    }
    saveBlock({
      phase: next.phase,
      focusMs: next.focusMs,
      totalMs: next.totalMs,
      endsAt: next.endsAt,
      leftMs: next.leftMs,
      done: next.done,
      taskId: task.current,
    });
  }, []);

  /**
   * `onFinish` cambia de identidad en cada render del consumidor (depende de sus tareas del dia).
   * Se guarda en un ref para que NO entre en las dependencias del intervalo: si entrara, el
   * cronometro se reiniciaria en cada render del padre.
   */
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  }, [onFinish]);

  /**
   * Rehidratacion. Corre una vez al montar y es lo que arregla el bloque que se perdia al cerrar la app.
   *
   * El `setState` sale del `.then`, o sea de un callback de un sistema externo (el almacen), no del
   * cuerpo del efecto: es el mismo patron con el que `auth-context` recupera la sesion.
   *
   * Los tres casos del bloque guardado:
   * - **en pausa o armado** (`endsAt === null`): se restaura tal cual, con lo que quedaba.
   * - **corriendo y con tiempo vivo**: se recalcula `leftMs` contra el reloj de AHORA. Aqui es donde
   *   se ve que guardar el instante final y no los milisegundos restantes era lo correcto.
   * - **corriendo y ya vencido**: se cumplio con la app cerrada. Se cierra el bloque, se arma el
   *   siguiente y se avisa con `silent` — el aviso local ya sono cuando toco, y volver a celebrarlo
   *   veinte minutos despues seria mentira.
   */
  useEffect(() => {
    let cancelled = false;

    loadBlock().then((saved) => {
      if (cancelled) return;
      if (!saved) {
        setRestoredTaskId(null);
        setReady(true);
        return;
      }

      const { state: restored, expired } = rehydrate(saved, Date.now());

      live.current = restored;
      setState(restored);
      setRestoredTaskId(saved.taskId);
      setReady(true);

      if (expired) finish.current?.(expired.closed, expired.done, true);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * El latido. Solo existe mientras hay `endsAt`, asi que un cronometro en pausa no despierta al
   * telefono. 250ms y no 1000: con un tick por segundo el digito cambia hasta un segundo tarde y el
   * reloj se lee retrasado.
   *
   * El cierre del bloque y su aviso pasan AQUI, dentro del callback del intervalo. Es el patron
   * legitimo de `useEffect`: suscribirse a un sistema externo (el reloj) y llamar `setState` desde
   * su callback. El cuerpo del efecto no escribe estado ni una vez.
   *
   * El listener de AppState recalcula al volver al frente porque el intervalo se congela con la app
   * al fondo: sin el, la pantalla reaparece con el tiempo de cuando la dejaste — y si el bloque
   * vencio mientras estaba suspendida, es aqui donde se cierra al volver.
   */
  useEffect(() => {
    if (state.endsAt === null) return;

    const tick = () => {
      const s = live.current;
      if (s.endsAt === null) return;

      const left = Math.max(0, s.endsAt - Date.now());
      if (left > 0) {
        // Solo si cambio: sin esto habria un render por tick entre un segundo y el siguiente.
        if (left !== s.leftMs) commit({ ...s, leftMs: left });
        return;
      }

      const closed = s.phase;
      const next = nextPhase(s.phase, s.done);
      // El estado se cierra ANTES de avisar: asi el guard de arriba ya deja pasar un segundo tick
      // por las mismas fechas sin volver a avisar.
      commit(arm(s, next.phase, next.done));
      finish.current?.(closed, next.done, false);
    };

    /**
     * Sin un `tick()` de arranque a proposito: seria un `setState` en el cuerpo del efecto, y ademas
     * no hace falta — quien arranca el bloque ya dejo `leftMs` correcto. El primer latido llega a
     * los 250ms y no se nota.
     */
    const id = setInterval(tick, 250);
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') tick();
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [state.endsAt, commit]);

  /** Arranca o reanuda: el instante final se calcula aqui, en el unico lugar que lee el reloj. */
  const begin = useCallback(() => {
    const s = live.current;
    if (s.endsAt !== null) return;
    commit({ ...s, endsAt: Date.now() + s.leftMs });
  }, [commit]);

  /** Pausa. Se recalcula lo que queda en vez de confiar en `leftMs`, que trae el ultimo tick. */
  const pause = useCallback(() => {
    const s = live.current;
    if (s.endsAt === null) return;
    commit({ ...s, endsAt: null, leftMs: Math.max(0, s.endsAt - Date.now()) });
  }, [commit]);

  /** Vuelve a empezar ESTE bloque. No toca el ciclo: reiniciar no es rendirse. */
  const reset = useCallback(() => {
    const s = live.current;
    commit(arm(s, s.phase, s.done));
  }, [commit]);

  /**
   * Saltar al siguiente bloque sin esperarlo. Cuenta el enfoque como cerrado igual que si hubiera
   * llegado a cero: mentir sobre eso desalinearia los brotes de lo que la persona hizo. No avisa,
   * porque el aviso es para un bloque que se cumplio, no para uno que se salto.
   */
  const skip = useCallback(() => {
    const s = live.current;
    const next = nextPhase(s.phase, s.done);
    commit(arm(s, next.phase, next.done));
  }, [commit]);

  /**
   * Registra la tarea enganchada para que se guarde con el bloque.
   *
   * Solo persiste; el cronometro no sabe nada de tareas. Si ya hay un bloque vivo se reescribe el
   * registro con `commit` del MISMO estado: React no repinta (el objeto no cambio) y el almacen queda
   * al dia, que es justo lo que hace falta para reengancharla si la app muere.
   */
  const attach = useCallback(
    (id: number | null) => {
      task.current = id;
      const s = live.current;
      if (s.endsAt !== null || s.leftMs !== s.totalMs) commit(s);
    },
    [commit]
  );

  /**
   * El largo de enfoque. Vive DENTRO del hook y no como prop para no tener que sincronizarlo con un
   * efecto: el estado del cronometro tiene un solo dueño.
   *
   * Solo se aplica sobre un enfoque que no esta corriendo. Reescribir el bloque a media carrera deja
   * el dial mintiendo sobre lo que falta.
   */
  const setFocusMinutes = useCallback(
    (minutes: number) => {
      const s = live.current;
      if (s.endsAt !== null || s.phase !== 'focus') return;
      const focusMs = ms(minutes);
      if (focusMs === s.focusMs) return;
      commit({ ...s, focusMs, totalMs: focusMs, leftMs: focusMs });
    },
    [commit]
  );

  return {
    /** `false` mientras se lee el almacen: la pantalla no debe pintar numeros todavia. */
    ready,
    /** La tarea del bloque recuperado. `undefined` hasta que se sabe. */
    restoredTaskId,
    phase: state.phase,
    /**
     * El instante del final, o `null` en pausa. Se expone porque la Live Activity necesita el TRAMO
     * (no los milisegundos que quedan) para que SwiftUI pinte la cuenta atras el solito.
     */
    endsAt: state.endsAt,
    leftMs: state.leftMs,
    totalMs: state.totalMs,
    done: state.done,
    focusMinutes: Math.round(state.focusMs / 60_000),
    running: state.endsAt !== null,
    /** Un bloque intacto: ni corriendo ni mordido. Es lo que distingue "Empezar" de "Reanudar". */
    fresh: state.endsAt === null && state.leftMs === state.totalMs,
    begin,
    attach,
    pause,
    reset,
    skip,
    setFocusMinutes,
  };
}

/** 'MM:SS'. Redondea hacia arriba para que el reloj no muestre 00:00 con tiempo todavia vivo. */
export const clock = (leftMs: number) => {
  const total = Math.ceil(leftMs / 1000);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};
