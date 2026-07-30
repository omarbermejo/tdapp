import Constants from 'expo-constants';

import type { AccentName } from '@/constants/theme';

/** El simulador alcanza localhost; un celular real no. Reusamos el host del dev server de Expo. */
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL || `http://${devHost ?? 'localhost'}:3000`;

export type User = {
  id: number;
  email: string;
  name: string;
  birthYear: number | null;
  diagnosis: string;
  treatment: string;
  focusAreas: string[];
  peakEnergy: string;
  reminderStyle: string;
  accentColor: AccentName;
  createdAt: string;
};

export type RegisterInput = {
  name: string;
  email: string;
  password: string;
  birthYear?: number | null;
  diagnosis?: string;
  treatment?: string;
  focusAreas?: string[];
  peakEnergy?: string;
  reminderStyle?: string;
  accentColor?: string;
};

export class ApiError extends Error {
  fields: Record<string, string>;
  constructor(message: string, fields: Record<string, string> = {}) {
    super(message);
    this.fields = fields;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init.headers },
    });
  } catch {
    throw new ApiError(`No hay conexión con el servidor (${API_URL})`);
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Algo salió mal', data.fields);
  return data as T;
}

type Session = { token: string; user: User };

export const api = {
  register: (input: RegisterInput) =>
    request<Session>('/auth/register', { method: 'POST', body: JSON.stringify(input) }),

  login: (email: string, password: string) =>
    request<Session>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  /** Canjea el id_token de Google por nuestro JWT. Crea la cuenta si el correo es nuevo. */
  google: (idToken: string) =>
    request<Session>('/auth/google', { method: 'POST', body: JSON.stringify({ idToken }) }),

  /** Igual que google, pero Apple solo manda el nombre en la primera autorizacion. */
  apple: (idToken: string, name?: string) =>
    request<Session>('/auth/apple', { method: 'POST', body: JSON.stringify({ idToken, name }) }),

  me: (token: string) =>
    request<{ user: User }>('/auth/me', { headers: { Authorization: `Bearer ${token}` } }),
};
