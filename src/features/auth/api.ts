import Constants from 'expo-constants';

import type { AccentName } from '@/constants/theme';

/** El simulador alcanza localhost; un celular real no. Reusamos el host del dev server de Expo. */
const devHost = Constants.expoConfig?.hostUri?.split(':')[0];

/** El API desplegado. Es el destino por defecto de cualquier build instalado en un telefono. */
const PRODUCTION_API = 'https://tdapp-api-production.up.railway.app';

/**
 * La URL base del API.
 *
 * El fallback esta detras de `__DEV__` a proposito. Antes caia a `devHost:3000` siempre, y en un build
 * de release eso es una trampa: `hostUri` no existe sin dev server, asi que quedaba
 * `http://localhost:3000` — el propio telefono— y la app arrancaba, pintaba el login y moria con un
 * error de red genérico. Un fallo sin ruido en el build y sin pista en la pantalla.
 *
 * Con la guarda, un release que se quedara sin `EXPO_PUBLIC_API_URL` incrustada sigue funcionando
 * contra produccion en vez de apuntarse al pie.
 */
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (__DEV__ ? `http://${devHost ?? 'localhost'}:3000` : PRODUCTION_API);

export type User = {
  id: number;
  email: string;
  name: string;
  /** ISO 'YYYY-MM-DD'. */
  birthDate: string | null;
  focusAreas: string[];
  peakEnergy: string;
  reminderStyle: string;
  /** Hora del recordatorio diario, 0..23. Sin ella no hay nada que agendar. */
  reminderHour: number;
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
  reminderHour: number;
  accentColor: AccentName;
};

/** Lo que el API considera una tarea. Solo los campos que hoy consume la app. */
export type Task = {
  id: number;
  title: string;
  status: 'pending' | 'done';
  size: 'quick' | 'medium' | 'deep';
  /** Minutos exactos que puso la persona; null = "que decida el tamaño". */
  minutes: number | null;
  focusArea: string | null;
  /** ISO con zona, tal como lo mando el cliente. */
  dueAt: string | null;
  dueDate: string | null;
  suggestedMinutes: number;
  elapsedSeconds: number;
  running: boolean;
};

/**
 * La racha y la semana, para el widget. Va aparte de `Today` porque son dos preguntas distintas y
 * ningun widget necesita las dos.
 */
export type Streak = {
  date: string;
  /** Dias seguidos cerrando al menos una cosa. Hoy sin cerrar nada no la rompe. */
  days: number;
  /** La mejor marca del historial (un año hacia atras). Es el numero que da algo que superar. */
  best: number;
  /** Lunes a domingo, con cuantas se cerraron cada dia. Un dia sin nada es 0, no un hueco. */
  week: { date: string; done: number }[];
};

/** El dia completo en una sola llamada: es lo que alimentan el widget y la Live Activity. */
export type Today = {
  date: string;
  user: { name: string; accentColor: AccentName; reminderStyle: string };
  counts: { total: number; pending: number; done: number };
  next: Task | null;
  running: Task | null;
  tasks: Task[];
};

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

/**
 * El cliente http de la app. Se exporta porque `features/tasks` habla con el mismo servidor
 * y no tiene sentido que duplique el manejo de errores.
 */
export async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
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

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

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

  /** `date` en YYYY-MM-DD local; sin el, el API usa su propio dia. */
  today: (token: string, date?: string) =>
    request<Today>(`/me/today${date ? `?date=${date}` : ''}`, { headers: bearer(token) }),

  /** La fecha va SIEMPRE desde aqui: quien sabe en que dia vive el usuario es su telefono. */
  streak: (token: string, date?: string) =>
    request<Streak>(`/me/streak${date ? `?date=${date}` : ''}`, { headers: bearer(token) }),

  /** Devuelve token nuevo: el de antes decia que el correo no estaba verificado. */
  verify: (token: string, code: string) =>
    request<Session>('/auth/verify', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ code }),
    }),

  resend: (token: string) =>
    request<void>('/auth/resend', { method: 'POST', headers: bearer(token) }),

  /**
   * Pide el codigo para cambiar la contraseña.
   *
   * Contesta 202 sin cuerpo **exista la cuenta o no**, y eso no es un descuido del API: un 404 aqui
   * dejaria averiguar que correos tienen cuenta preguntando uno a uno. Por eso la pantalla no puede
   * decir "ese correo no existe" ni "esa cuenta es de Google" — no lo sabe, y no debe saberlo.
   */
  forgot: (email: string) =>
    request<void>('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) }),

  /**
   * Cambia la contraseña con el codigo del correo y devuelve sesion: el codigo llego a ese buzon,
   * asi que de paso queda verificado. El correo viaja en el body porque todavia no hay sesion.
   */
  reset: (email: string, code: string, password: string) =>
    request<Session>('/auth/reset', {
      method: 'POST',
      body: JSON.stringify({ email, code, password }),
    }),

  /** `password` va vacio en cuentas de Google o Apple: no tienen ninguna que teclear. */
  deleteAccount: (token: string, password?: string) =>
    request<void>('/me', {
      method: 'DELETE',
      headers: bearer(token),
      body: JSON.stringify({ password }),
    }),

  /**
   * Guarda el perfil; el API sella `onboardedAt` la primera vez.
   *
   * `Partial` porque es un PATCH de verdad: mergea sobre lo que ya hay, asi que el mismo endpoint sirve
   * para el onboarding completo y para cambiar un solo campo desde el perfil (lo dice su propio
   * comentario en `application/update-profile.js`).
   */
  onboard: (token: string, input: Partial<ProfileInput>) =>
    request<{ user: User }>('/me/profile', {
      method: 'PATCH',
      headers: bearer(token),
      body: JSON.stringify(input),
    }),

};
