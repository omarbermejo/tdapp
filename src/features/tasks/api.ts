import { api, bearer, request, type Task } from '@/features/auth/api';

/**
 * El dia del usuario, no el del servidor.
 *
 * El API calcula "hoy" en UTC cuando no se le manda fecha, asi que en -07:00 despues de las
 * 17:00 locales devolveria el dia siguiente. Quien sabe en que dia vive el usuario es su
 * telefono, asi que la fecha va siempre desde aqui.
 */
export const localDate = (at = new Date()) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * ISO con la zona del telefono, ej '2026-07-30T15:12:00-07:00'.
 *
 * El API exige zona y de ahi recorta la fecha del dia: `toISOString()` seria UTC y volveria a
 * meter el mismo error de dia que arregla localDate.
 */
export const localIso = (at = new Date()) => {
  const offset = -at.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
  return `${localDate(at)}T${time}${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
};

/** Construye el ISO local de un dia y una hora concretos, para agendar. */
export const isoAt = (date: string, hour: number, minute = 0) => {
  const [y, m, d] = date.split('-').map(Number);
  return localIso(new Date(y, m - 1, d, hour, minute, 0));
};

/** Lo que se puede mandar al crear o editar. Todo opcional menos el titulo al crear. */
export type NewTask = {
  title?: string;
  notes?: string | null;
  size?: Task['size'];
  status?: Task['status'];
  focusArea?: string | null;
  /** ISO con zona; usa localIso() o isoAt(). null lo desagenda. */
  dueAt?: string | null;
};

export type TaskQuery = { date?: string; status?: Task['status']; focusArea?: string };

/**
 * Los tipos `Task` y `Today` y el `today()` crudo viven en features/auth/api.ts, que es donde
 * esta el cliente http. Aqui va lo que le falta al feature de tareas.
 */
export const tasksApi = {
  today: (token: string) => api.today(token, localDate()),

  /**
   * Anotar. El tamano NO se manda por defecto: el API lo deja en 'medium' y adivinarlo seria
   * inventar un dato que quien anota todavia no sabe.
   *
   * `dueAt` importa porque /me/today filtra por dia y una tarea sin fecha no aparece en
   * ninguno: lo que se anota para hoy tiene que llevar la hora local de hoy.
   */
  create: (token: string, input: NewTask) =>
    request<{ task: Task }>('/tasks', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify(input),
    }),

  list: (token: string, query: TaskQuery = {}) => {
    const search = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v != null && v !== '') as [string, string][]
    ).toString();
    return request<{ tasks: Task[] }>(`/tasks${search ? `?${search}` : ''}`, {
      headers: bearer(token),
    });
  },

  /** PATCH de verdad: lo que no viene se conserva. Marcar hecha es { status: 'done' }. */
  update: (token: string, id: number, patch: NewTask) =>
    request<{ task: Task }>(`/tasks/${id}`, {
      method: 'PATCH',
      headers: bearer(token),
      body: JSON.stringify(patch),
    }),

  remove: (token: string, id: number) =>
    request<void>(`/tasks/${id}`, { method: 'DELETE', headers: bearer(token) }),

  /** El API impone un solo timer corriendo por usuario: si ya hay otro, responde 409. */
  timer: (token: string, id: number, action: 'start' | 'stop') =>
    request<{ task: Task }>(`/tasks/${id}/timer`, {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ action }),
    }),
};
