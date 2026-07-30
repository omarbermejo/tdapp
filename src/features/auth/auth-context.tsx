import * as SecureStore from 'expo-secure-store';
import { createContext, use, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Platform } from 'react-native';

import { api, type RegisterInput, type User } from './api';

const KEY = 'tdapp.token';

// ponytail: SecureStore no existe en web, localStorage cubre el caso de dev.
const storage = {
  get: (): Promise<string | null> =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.getItem(KEY))
      : SecureStore.getItemAsync(KEY),
  set: (token: string) =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.setItem(KEY, token))
      : SecureStore.setItemAsync(KEY, token),
  clear: () =>
    Platform.OS === 'web'
      ? Promise.resolve(localStorage.removeItem(KEY))
      : SecureStore.deleteItemAsync(KEY),
};

type AuthValue = {
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: (idToken: string) => Promise<void>;
  signUp: (input: RegisterInput) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    storage
      .get()
      .then(async (token) => {
        if (!token) return null;
        return (await api.me(token)).user;
      })
      .then(setUser)
      .catch(() => storage.clear())
      .finally(() => setLoading(false));
  }, []);

  const start = useCallback(async (session: { token: string; user: User }) => {
    await storage.set(session.token);
    setUser(session.user);
  }, []);

  const value = useMemo<AuthValue>(
    () => ({
      user,
      loading,
      signIn: async (email, password) => start(await api.login(email, password)),
      signInWithGoogle: async (idToken) => start(await api.google(idToken)),
      signUp: async (input) => start(await api.register(input)),
      signOut: async () => {
        await storage.clear();
        setUser(null);
      },
    }),
    [user, loading, start]
  );

  return <AuthContext value={value}>{children}</AuthContext>;
}

export function useAuth() {
  const value = use(AuthContext);
  if (!value) throw new Error('useAuth necesita estar dentro de <AuthProvider>');
  return value;
}
