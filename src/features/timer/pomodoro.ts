import * as Haptics from 'expo-haptics';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';

/**
 * El pomodoro como maquina de estados. Cuenta HACIA ABAJO, que es la mitad del punto: contar
 * hacia arriba fue lo que saco al cronometro del home (pasarse de los 25 min se leia como una
 * app rota). Aqui el bloque tiene final y el final es la recompensa.
 */
export type Phase = 'focus' | 'short' | 'long';

/** Enfoques antes del descanso largo. Cuatro es el pomodoro clasico y cabe en una fila de brotes. */
export const ROUNDS = 4;

/**
 * Los largos de enfoque son los MISMOS 5/25/50 de `sizeMinutes` del API (quick/medium/deep).
 * Reusar el vocabulario que la persona ya eligio al anotar la tarea evita que el cronometro
 * hable de "pomodoros de 25" cuando la tarea decia "profunda, 50 min".
 */
export const FOCUS_MINUTES = [5, 25, 50] as const;

const BREAK_MINUTES: Record<Exclude<Phase, 'focus'>, number> = { short: 5, long: 15 };

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
  /**
   * Bloques que llegaron a cero. Solo sube.
   *
   * Existe para que el aviso (haptico, `onFinish`) NO tenga que salir de un `setState` dentro de
   * un efecto: el cierre del bloque es aritmetica y vive en el tick, y este contador es la señal
   * que el efecto observa para avisar. Un booleano no serviria — dos bloques seguidos lo dejarian
   * en true las dos veces y el segundo aviso no se distinguiria del primero.
   */
  closed: number;
  /** La fase que cerro en el ultimo `closed`. Es lo que `onFinish` necesita saber. */
  lastClosed: Phase | null;
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
    closed: 0,
    lastClosed: null,
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
 * `onFinish` recibe la fase que ACABA de cerrar (no la que sigue): es lo que necesita quien
 * quiera avisar, apagar el cronometro del servidor o celebrar. NO necesita ser estable — el
 * disparo se guarda con un ref contra el contador de cierres, asi que aunque cambie de identidad
 * en cada render el aviso sale exactamente una vez por bloque.
 */
export function usePomodoro({ onFinish }: { onFinish?: (closed: Phase) => void } = {}) {
  const [state, setState] = useState<State>(() => start(25));

  /**
   * El latido. Solo existe mientras hay `endsAt`, asi que un cronometro en pausa no despierta al
   * telefono. 250ms y no 1000: con un tick por segundo el digito cambia hasta un segundo tarde y
   * el reloj se lee retrasado.
   *
   * El cierre del bloque pasa AQUI DENTRO, en el updater, y no en un efecto aparte: llegar a cero
   * es la misma transicion que descontar un segundo, solo que la que se pasa de la raya. Sacarla a
   * un efecto seria un setState dentro de un efecto, que es un render en cascada y lo que el
   * compilador de React rechaza con razon.
   *
   * El listener de AppState recalcula al volver al frente porque el intervalo se congela con la
   * app al fondo: sin el, la pantalla reaparece con el tiempo de cuando la dejaste.
   */
  useEffect(() => {
    if (state.endsAt === null) return;

    const tick = () =>
      setState((s) => {
        if (s.endsAt === null) return s;
        const left = Math.max(0, s.endsAt - Date.now());
        // Devolver el MISMO objeto cuando no cambio evita un render por tick entre segundos.
        if (left > 0) return left === s.leftMs ? s : { ...s, leftMs: left };

        const next = nextPhase(s.phase, s.done);
        return { ...arm(s, next.phase, next.done), closed: s.closed + 1, lastClosed: s.phase };
      });

    tick();
    const id = setInterval(tick, 250);
    const sub = AppState.addEventListener('change', (status) => {
      if (status === 'active') tick();
    });

    return () => {
      clearInterval(id);
      sub.remove();
    };
  }, [state.endsAt]);

  /**
   * El aviso de que un bloque cerro. Solo efectos secundarios: el estado ya cambio en el tick.
   *
   * El ref es lo que hace que salga UNA vez por bloque sin importar cuantas veces corra el efecto
   * — y corre de mas, porque `onFinish` viene de la pantalla y su identidad cambia con las tareas
   * del dia. Comparar contra el contador es mas barato y mas seguro que exigir que el llamador
   * memoice bien.
   */
  const announced = useRef(0);
  useEffect(() => {
    if (state.closed === announced.current) return;
    announced.current = state.closed;
    if (!state.lastClosed) return;

    // Success y no Impact: es el unico premio del bloque y tiene que sentirse distinto a un toque.
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    onFinish?.(state.lastClosed);
  }, [state.closed, state.lastClosed, onFinish]);

  /** Arranca o reanuda: el instante final se calcula aqui, en el unico lugar que lee el reloj. */
  const begin = useCallback(() => {
    setState((s) => (s.endsAt !== null ? s : { ...s, endsAt: Date.now() + s.leftMs }));
  }, []);

  /** Pausa. Se recalcula lo que queda en vez de confiar en `leftMs`, que trae el ultimo tick. */
  const pause = useCallback(() => {
    setState((s) =>
      s.endsAt === null ? s : { ...s, endsAt: null, leftMs: Math.max(0, s.endsAt - Date.now()) }
    );
  }, []);

  /** Vuelve a empezar ESTE bloque. No toca el ciclo: reiniciar no es rendirse. */
  const reset = useCallback(() => {
    setState((s) => arm(s, s.phase, s.done));
  }, []);

  /**
   * Saltar al siguiente bloque sin esperarlo. Cuenta el enfoque como cerrado igual que si hubiera
   * llegado a cero: mentir sobre eso desalinearia los brotes de lo que la persona hizo. No avisa
   * (no toca `closed`) porque el aviso es para un bloque que se cumplio, no para uno que se salto.
   */
  const skip = useCallback(() => {
    setState((s) => {
      const next = nextPhase(s.phase, s.done);
      return arm(s, next.phase, next.done);
    });
  }, []);

  /**
   * El largo de enfoque. Vive DENTRO del hook y no como prop para no tener que sincronizarlo con
   * un efecto: el estado del cronometro tiene un solo dueño.
   *
   * Solo se aplica sobre un enfoque que no esta corriendo. Reescribir el bloque a media carrera
   * deja el dial mintiendo sobre lo que falta.
   */
  const setFocusMinutes = useCallback((minutes: number) => {
    setState((s) => {
      if (s.endsAt !== null || s.phase !== 'focus') return s;
      const focusMs = ms(minutes);
      return focusMs === s.focusMs ? s : { ...s, focusMs, totalMs: focusMs, leftMs: focusMs };
    });
  }, []);

  return {
    phase: state.phase,
    leftMs: state.leftMs,
    totalMs: state.totalMs,
    done: state.done,
    focusMinutes: Math.round(state.focusMs / 60_000),
    running: state.endsAt !== null,
    /** Un bloque intacto: ni corriendo ni mordido. Es lo que distingue "Empezar" de "Reanudar". */
    fresh: state.endsAt === null && state.leftMs === state.totalMs,
    begin,
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
