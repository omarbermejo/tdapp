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

/**
 * Los tipos `Task` y `Today` y el `today()` crudo viven en features/auth/api.ts, que es donde
 * esta el cliente http. Aqui solo va lo que le falta al home: la fecha local y el cronometro.
 */
export const tasksApi = {
  today: (token: string) => api.today(token, localDate()),

  /** El API impone un solo timer corriendo por usuario: si ya hay otro, responde 409. */
  timer: (token: string, id: number, action: 'start' | 'stop') =>
    request<{ task: Task }>(`/tasks/${id}/timer`, {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ action }),
    }),
};
