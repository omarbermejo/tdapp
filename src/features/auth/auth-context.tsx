import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { clearReminders } from '@/features/notifications/reminders';
import { syncTodayWidget } from '@/features/widgets/sync-today';

import { ApiError, api, type ProfileInput, type RegisterInput, type User } from './api';

// ponytail: clave nueva (antes solo el token). Las sesiones de dev se caen una vez y ya.
const KEY = 'tdapp.session';

type Session = { token: string; user: User };

// ponytail: SecureStore no existe en web, localStorage cubre el caso de dev.
const raw = {
  get: (): Promise<string | null> =>
    Platform.OS === 'web' ? Promise.resolve(localStorage.getItem(KEY)) : SecureStore.getItemAsync(KEY),
  set: (value: string) =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.setItem(KEY, value))
      : SecureStore.setItemAsync(KEY, value),
  clear: () =>
    Platform.OS === 'web' ? Promise.resolve(localStorage.removeItem(KEY)) : SecureStore.deleteItemAsync(KEY),
};

const storage = {
  async get(): Promise<Session | null> {
    const value = await raw.get();
    if (!value) return null;
    try {
      return JSON.parse(value) as Session;
    } catch {
      return null;
    }
  },
  set: (session: Session) => raw.set(JSON.stringify(session)),
  clear: raw.clear,
};

/**
 * Cola de uno para los guardados del perfil.
 *
 * `update-profile.js` en el API hace `findById` → `createProfile` → `saveProfile` SIN transaccion, asi
 * que dos PATCH en vuelo se pisan: el segundo lee el perfil de antes del primero y le devuelve el
 * campo viejo. Tocar dos chips rapido es exactamente eso. Encadenando por esta promesa, el segundo
 * espera al primero — y no hay debounce, porque un debounce descartaria el guardado intermedio.
 */
let queue: Promise<unknown> = Promise.resolve();

/** En que punto del alta esta el usuario. Se deriva del user, nunca se guarda aparte. */
export type Stage = 'guest' | 'verify' | 'onboarding' | 'ready';

/**
 * El paso lo decide el API (`user.stage`); aqui solo se traduce "sin sesion" a 'guest'.
 * El fallback deriva de las marcas de tiempo por si contesta un API viejo sin el campo,
 * y compara contra false/null explicitos para que un user sin esos campos sea 'ready'
 * en vez de quedar atrapado en una pantalla sin endpoint detras.
 */
export const stageOf = (user: User | null): Stage =>
  !user
    ? 'guest'
    : (user.stage ??
      (user.emailVerified === false ? 'verify' : user.onboardedAt === null ? 'onboarding' : 'ready'));

type AuthValue = {
  user: User | null;
  token: string | null;
  stage: Stage;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signInWithApple: (idToken: string, name?: string) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  verify: (code: string) => Promise<void>;
  resend: () => Promise<void>;
  finishOnboarding: (input: ProfileInput) => Promise<void>;
  /**
   * Cambia UN campo (o varios) del perfil desde el perfil ya hecho. Optimista: la UI se repinta antes
   * de que el servidor conteste, y si falla se revierte y relanza el error.
   *
   * Es hermano de `finishOnboarding` y NO lo reusa: aquel tira confeti, y celebrar por cambiar la hora
   * de un aviso sería absurdo. El API es el mismo (`PATCH /me/profile` mergea por campo).
   */
  updateProfile: (patch: Partial<ProfileInput>) => Promise<void>;
  /**
   * Entra a un espacio de trabajo, o vuelve al modo general con `null`.
   *
   * Aparte de `updateProfile` aunque escriba el mismo endpoint: la firma pide un espacio y no un
   * parche de perfil, y quien la llama esta cambiando el CONTEXTO de la app, no editando sus ajustes.
   */
  setActiveSpace: (space: User['activeWorkspace']) => Promise<void>;
  /**
   * Cambia la contraseña con el codigo del correo. Vive aqui y no en la pantalla —al contrario que
   * `api.forgot`— porque devuelve sesion: es un `start`, como `signUp` y `verify`.
   */
  resetPassword: (email: string, code: string, password: string) => Promise<void>;
  /**
   * Borra la cuenta y cierra la sesion. `password` va sin valor en cuentas de Google o Apple: no
   * tienen ninguna, y el API decide por `authProvider` a quien se la pide.
   */
  deleteAccount: (password?: string) => Promise<void>;
  signOut: () => Promise<void>;
  /**
   * Se acaba de terminar el onboarding. Vive aqui y no en la pantalla porque al guardar el
   * perfil el guard cambia de grupo y desmonta el onboarding: el confeti tiene que caer
   * encima de la app que se acaba de abrir, no de un formulario que ya no existe.
   */
  celebrating: boolean;
  stopCelebrating: () => void;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [celebrating, setCelebrating] = useState(false);

  const start = useCallback(async (next: Session) => {
    await storage.set(next);
    setSession(next);
  }, []);

  /**
   * El final de la sesion. Lo comparten cerrar sesion y borrar la cuenta porque es el mismo final:
   * quedarse sin sesion devuelve `stage` a 'guest' y el guard del root desmonta `(app)`.
   */
  const wipe = useCallback(async () => {
    setCelebrating(false);
    // Obligatorio, no cortesia: el recordatorio diario es un trigger DAILY que repite para siempre
    // sin que la app corra, asi que sin esto una cuenta cerrada seguiria recibiendolo hasta que
    // alguien desinstale la app. Cancela solo lo suyo, por prefijo.
    void clearReminders();
    await storage.clear();
    setSession(null);
  }, []);

  useEffect(() => {
    storage.get().then((cached) => {
      setSession(cached);
      setLoading(false);
      if (!cached) return;

      // Se pinta con lo cacheado y se revalida detras: asi el primer frame ya trae el stage
      // correcto. Solo un 401 borra la sesion — un fallo de red no debe sacar al usuario.
      api
        .me(cached.token)
        .then(({ user }) => start({ token: cached.token, user }))
        .catch((e) => {
          if (e instanceof ApiError && e.status === 401) {
            storage.clear();
            setSession(null);
          }
        });
    });
  }, [start]);

  const value = useMemo<AuthValue>(() => {
    const token = session?.token ?? null;
    // Cada mutacion devuelve el user nuevo, asi que no hace falta un refresh() suelto.
    const withUser = (user: User) => start({ token: token!, user });

    return {
      user: session?.user ?? null,
      token,
      stage: stageOf(session?.user ?? null),
      loading,
      signIn: async (email, password) => start(await api.login(email, password)),
      signInWithGoogle: async (idToken) => start(await api.google(idToken)),
      signInWithApple: async (idToken, name) => start(await api.apple(idToken, name)),
      signUp: async (input) => start(await api.register(input)),
      verify: async (code) => start(await api.verify(token!, code)),
      resend: () => api.resend(token!),
      finishOnboarding: async (input) => {
        const { user } = await api.onboard(token!, input);
        // Primero la fiesta y luego el commit: el commit es lo que voltea el guard.
        setCelebrating(true);
        await withUser(user);
      },
      updateProfile: async (patch) => {
        const previous = session?.user;
        if (!token || !previous) return;

        /**
         * Optimista y desde AQUI, no desde la pantalla. Es lo que hace que la confirmacion funcione:
         * al cambiar el color, el avatar del perfil y la capsula de pestañas (que lee
         * `useAccent(user?.accentColor)` de este mismo contexto) se repintan en el mismo frame. Con un
         * borrador local de la pantalla, el chip se teñiria al instante y la barra seguiria del color
         * viejo medio segundo — la repintada como confirmacion fallaria justo en su momento estrella.
         *
         * `setSession` y no `start`: no se escribe el almacen con algo que el servidor no confirmo.
         */
        setSession({ token, user: { ...previous, ...patch } });

        queue = queue.then(async () => {
          try {
            const { user } = await api.onboard(token, patch);
            // Ahora si: commit de verdad, con el user del servidor y escribiendo el almacen.
            await start({ token, user });
            // El widget lleva el acento en sus props, asi que un color nuevo lo deja mintiendo.
            if (patch.accentColor) void syncTodayWidget(token);
          } catch (error) {
            // Vuelve a lo que habia. Quien llamo se encarga de contarlo; aqui no se traga nada.
            setSession({ token, user: previous });
            throw error;
          }
        });

        return queue as Promise<void>;
      },
      /**
       * Entra a un espacio, o vuelve al modo general con `null`.
       *
       * Hermana de `updateProfile` y **comparte su `queue`**, que no es cosmetico: las dos escriben en
       * `user_profiles` y el API hace `findById -> createProfile -> saveProfile` sin transaccion, asi
       * que dos en vuelo se pisan. Cambiar de espacio mientras se guarda un color es un caso real.
       *
       * Optimista con el objeto entero y no solo el id: la pastilla del saludo lee `name`, `icon` y
       * `accent`, y sin ellos parpadearia vacia hasta que volviera el servidor. Es el mismo argumento
       * del acento en `updateProfile`.
       */
      setActiveSpace: async (space) => {
        const previous = session?.user;
        if (!token || !previous) return;

        setSession({ token, user: { ...previous, activeWorkspace: space } });

        queue = queue.then(async () => {
          try {
            const { user } = await api.onboard(token, { activeWorkspaceId: space?.id ?? null });
            await start({ token, user });
          } catch (error) {
            setSession({ token, user: previous });
            throw error;
          }
        });

        return queue as Promise<void>;
      },
      resetPassword: async (email, code, password) => start(await api.reset(email, code, password)),
      deleteAccount: async (password) => {
        await api.deleteAccount(token!, password);
        // No hay nada mas que limpiar: al quedarse sin sesion el guard desmonta `(app)`, y ese
        // desmontaje ya cierra la Live Activity y la alarma del cronometro (ver (tabs)/timer.tsx).
        await wipe();
      },
      signOut: wipe,
      celebrating,
      stopCelebrating: () => setCelebrating(false),
    };
  }, [session, loading, start, wipe, celebrating]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth necesita estar dentro de <AuthProvider>');
  return value;
}
