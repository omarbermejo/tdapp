import { api, bearer, request, type Task } from '@/features/auth/api';

/**
 * El dia del usuario, no el del servidor.
 *
 * El API calcula "hoy" en UTC cuando no se le manda fecha, asi que en -06:00 despues de las
 * 18:00 locales devolveria el dia siguiente. Quien sabe en que dia vive el usuario es su
 * telefono, asi que la fecha va siempre desde aqui.
 */
export const localDate = (at = new Date()) =>
  `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * ISO con la zona del telefono, ej '2026-07-30T15:12:00-06:00'.
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

/**
 * Los tipos `Task` y `Today` y el `today()` crudo viven en features/auth/api.ts, que es donde
 * esta el cliente http. Aqui solo va lo que le falta al home: la fecha local y el cronometro.
 */
export const tasksApi = {
  today: (token: string) => api.today(token, localDate()),

  /**
   * Anotar y nada mas: solo el titulo.
   *
   * `dueAt` con la hora local de ahora porque /me/today filtra por dia y una tarea sin fecha
   * no aparece en ninguno — lo que acabas de anotar tiene que estar donde vas a verlo. El
   * tamano NO se manda: el API lo deja en 'medium' y adivinarlo seria inventar un dato que
   * quien anota todavia no sabe.
   */
  create: (token: string, title: string) =>
    request<{ task: Task }>('/tasks', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ title, dueAt: localIso() }),
    }),

  /** El API impone un solo timer corriendo por usuario: si ya hay otro, responde 409. */
  timer: (token: string, id: number, action: 'start' | 'stop') =>
    request<{ task: Task }>(`/tasks/${id}/timer`, {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ action }),
    }),
};
