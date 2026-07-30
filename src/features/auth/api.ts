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
  /** ISO 'YYYY-MM-DD'. */
  birthDate: string | null;
  focusAreas: string[];
  peakEnergy: string;
  reminderStyle: string;
  accentColor: AccentName;
  createdAt: string;
  /**
   * ponytail: opcionales mientras haya APIs desplegadas sin estos campos. `stageOf` compara
   * contra false/null explicitos, asi que ausentes = cuenta lista y nadie queda atrapado.
   */
  emailVerified?: boolean;
  onboardedAt?: string | null;
  /** Lo calcula el API a partir de las dos marcas de arriba; es la fuente buena. */
  stage?: 'verify' | 'onboarding' | 'ready';
  /** Como entra la cuenta. Una de Google o Apple no tiene contraseña con la que entrar. */
  authProvider?: 'password' | 'google' | 'apple' | 'oauth';
};

export type RegisterInput = { name: string; email: string; password: string };

/** Los campos que afina el onboarding. Espeja el perfil que ya devuelve el registro. */
export type ProfileInput = {
  birthDate: string | null;
  focusAreas: string[];
  peakEnergy: string;
  reminderStyle: string;
  accentColor: AccentName;
};

export type DevicePlatform = 'ios' | 'android' | 'web';

export class ApiError extends Error {
  fields: Record<string, string>;
  /** 0 = no hubo respuesta. Separa "tu sesion murio" de "no hay wifi". */
  status: number;
  constructor(message: string, fields: Record<string, string> = {}, status = 0) {
    super(message);
    this.fields = fields;
    this.status = status;
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
    // La URL del servidor no es asunto de quien usa la app y en dev es la IP de la LAN:
    // se queda en la consola, que solo existe en desarrollo.
    if (__DEV__) console.warn(`[api] sin respuesta de ${API_URL}${path}`);
    throw new ApiError('No hay conexión. Revisa tu internet e inténtalo de nuevo.');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(data.error ?? 'Algo salió mal', data.fields, res.status);
  return data as T;
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

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

  me: (token: string) => request<{ user: User }>('/me', { headers: bearer(token) }),

  /** Devuelve token nuevo: el de antes decia que el correo no estaba verificado. */
  verify: (token: string, code: string) =>
    request<Session>('/auth/verify', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ code }),
    }),

  resend: (token: string) =>
    request<void>('/auth/resend', { method: 'POST', headers: bearer(token) }),

  /** Guarda el perfil del onboarding; el API sella onboardedAt la primera vez. */
  onboard: (token: string, input: ProfileInput) =>
    request<{ user: User }>('/me/profile', {
      method: 'PATCH',
      headers: bearer(token),
      body: JSON.stringify(input),
    }),

  registerDevice: (token: string, pushToken: string, platform: DevicePlatform) =>
    request<void>('/me/devices', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ token: pushToken, platform }),
    }),
};
