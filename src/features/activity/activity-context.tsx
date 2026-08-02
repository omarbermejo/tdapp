import { createContext, use, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState } from 'react-native';

import { ApiError, api, type ActivityEvent } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

type Activity = {
  events: ActivityEvent[];
  unread: number;
  loading: boolean;
  error: string;
  /** El cursor de la siguiente pagina, o null cuando ya no hay mas historia. */
  next: number | null;
  reload: () => Promise<void>;
  more: () => Promise<void>;
  markRead: () => Promise<void>;
};

const Empty: Activity = {
  events: [],
  unread: 0,
  loading: true,
  error: '',
  next: null,
  reload: async () => {},
  more: async () => {},
  markRead: async () => {},
};

const Context = createContext<Activity>(Empty);

/**
 * Las novedades, en UN solo sitio.
 *
 * Contexto y no dos hooks sueltos porque hay dos consumidores que tienen que ver lo MISMO: el globo
 * de la campana en el inicio y la lista de la pantalla. Con un hook por cada uno, abrir la pantalla
 * y marcar leido dejaria el globo encendido hasta el siguiente foco del inicio — el clasico "ya lo
 * vi y sigue ahi".
 *
 * Y es tambien donde va a entrar el socket: un unico punto al que empujar eventos, en vez de
 * repartirlos a cada pantalla que los pinte.
 *
 * La carga es REST y el socket solo se salta la espera. Esa es la regla dura del diseño: si el
 * tiempo real desaparece, lo unico que cambia es la latencia.
 */
/**
 * `for` es la sesion a la que pertenece lo guardado, y por eso vive DENTRO del estado.
 *
 * Es el mismo patron de `use-tasks` y `use-streak`, y aqui resuelve algo concreto: al cambiar de
 * cuenta, el feed viejo se descarta AL PINTAR en vez de limpiarse con un efecto. Un `setState`
 * sincrono dentro de un efecto es justo lo que el compilador de React rechaza — y con razon, porque
 * encadena renders.
 */
type State = {
  for: string | null;
  events: ActivityEvent[];
  unread: number;
  next: number | null;
  error: string;
};

const BLANK: State = { for: null, events: [], unread: 0, next: null, error: '' };

export function ActivityProvider({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const [state, setState] = useState<State>(BLANK);

  // Lo guardado solo vale si es de ESTA sesion. Sin esto, cerrar sesion y entrar con otra cuenta
  // enseñaria las novedades de la anterior durante un frame.
  const fresh = !!token && state.for === token;

  const reload = useCallback(async () => {
    if (!token) return;
    try {
      const page = await api.events(token);
      setState({ for: token, events: page.events, unread: page.unread, next: page.next, error: '' });
    } catch (e) {
      const error = e instanceof ApiError ? e.message : 'No pudimos traer tus novedades';
      // Lo que ya estaba se queda: un fallo de red no vacia una lista que era cierta hace un minuto.
      setState((s) => (s.for === token ? { ...s, error } : { ...BLANK, for: token, error }));
    }
  }, [token]);

  /** La siguiente pagina hacia atras. Sin cursor no hay nada que pedir. */
  const more = useCallback(async () => {
    if (!token || !state.next || state.for !== token) return;
    try {
      const page = await api.events(token, { before: state.next });
      setState((s) => {
        if (s.for !== token) return s;
        // Se concatena por id y no a ciegas: una recarga a mitad de scroll trae solapamiento.
        const seen = new Set(s.events.map((e) => e.id));
        return { ...s, events: [...s.events, ...page.events.filter((e) => !seen.has(e.id))], next: page.next };
      });
    } catch {
      // El scroll infinito que falla no dice nada: lo que ya se ve sigue ahi, y el siguiente intento
      // ocurre solo al llegar otra vez al final.
    }
  }, [token, state.next, state.for]);

  const markRead = useCallback(async () => {
    if (!token) return;
    /*
      Optimista: el globo se apaga en el mismo frame en que abres la pantalla. Si la peticion falla,
      el proximo foco lo devuelve — mucho mejor que quedarse mirando un punto que ya no significa
      nada mientras la red responde.
    */
    setState((s) =>
      s.for !== token || !s.unread
        ? s
        : { ...s, unread: 0, events: s.events.map((e) => (e.read ? e : { ...e, read: true })) }
    );
    try {
      const { unread } = await api.readEvents(token);
      setState((s) => (s.for === token ? { ...s, unread } : s));
    } catch {
      // Sin rollback: el servidor manda, y el proximo `reload` trae la verdad.
    }
  }, [token]);

  /**
   * La primera carga en cuanto hay sesion.
   *
   * `fresh` en la condicion y no un `loaded` aparte: el efecto solo dispara cuando lo guardado NO es
   * de esta sesion, que cubre a la vez el arranque y el cambio de cuenta. Y no toca el estado de
   * forma sincrona — llamar a `reload` deja el `setState` para cuando responda la red, que es lo que
   * el compilador pide.
   */
  useEffect(() => {
    if (!token || fresh) return;
    // La llamada va dentro de una async, como en `use-streak`: asi el primer `setState` nunca es
    // sincrono con el cuerpo del efecto, que es justo lo que el compilador de React exige.
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await reload();
    })();
    return () => {
      cancelled = true;
    };
  }, [token, fresh, reload]);

  /**
   * Al volver del segundo plano, refrescar.
   *
   * Sin esto, una app que estuvo una hora dormida enseña el feed de hace una hora. Es el mismo
   * patron con el que el widget se sincroniza, y es tambien el fallback natural del socket: aunque
   * la conexion se haya muerto sin avisar, volver a la app pone todo al dia.
   */
  const appState = useRef(AppState.currentState);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const woke = appState.current.match(/inactive|background/) && state === 'active';
      appState.current = state;
      if (woke) reload();
    });
    return () => sub.remove();
  }, [reload]);

  const value = useMemo(
    () => ({
      events: fresh ? state.events : [],
      unread: fresh ? state.unread : 0,
      loading: !!token && !fresh,
      error: fresh ? state.error : '',
      next: fresh ? state.next : null,
      reload,
      more,
      markRead,
    }),
    [fresh, state, token, reload, more, markRead]
  );

  return <Context value={value}>{children}</Context>;
}

export const useActivity = () => use(Context);
