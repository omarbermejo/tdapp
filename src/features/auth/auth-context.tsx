import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

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

/** En que punto del alta esta el usuario. Se deriva del user, nunca se guarda aparte. */
export type Stage = 'guest' | 'verify' | 'onboarding' | 'ready';

/**
 * Compara contra false/null explicitos a proposito: mientras el API no mande los campos
 * nuevos, todos son 'ready' y nadie queda atrapado en una pantalla sin endpoint detras.
 */
export const stageOf = (user: User | null): Stage =>
  !user ? 'guest' : user.emailVerified === false ? 'verify' : user.onboardedAt === null ? 'onboarding' : 'ready';

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
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  const start = useCallback(async (next: Session) => {
    await storage.set(next);
    setSession(next);
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
      finishOnboarding: async (input) => withUser((await api.onboard(token!, input)).user),
      signOut: async () => {
        await storage.clear();
        setSession(null);
      },
    };
  }, [session, loading, start]);

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth necesita estar dentro de <AuthProvider>');
  return value;
}
