import { api, bearer, request, type Task } from '@/features/auth/api';
import { refreshTaskAlerts } from '@/features/notifications/reminders';
import { syncTodayWidget } from '@/features/widgets/sync-today';

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
  /** Minutos exactos. null vuelve a dejar que manden los del tamaño. */
  minutes?: number | null;
  status?: Task['status'];
  focusArea?: string | null;
  /** ISO con zona; usa localIso() o isoAt(). null lo desagenda. */
  dueAt?: string | null;
};

export type TaskQuery = {
  date?: string;
  status?: Task['status'];
  focusArea?: string;
  /**
   * Una fecha, y trae lo que quedo ATRAS de ella: vencido o sin agendar nunca. Los dos casos en un
   * solo filtro porque son la misma pantalla — ver `listByUser` en el API.
   */
  backlog?: string;
};

/**
 * Refresca el widget despues de una mutacion, y devuelve lo que devolvia la mutacion.
 *
 * Vive AQUI y no en cada pantalla a proposito. El widget solo se actualizaba al volver la app al
 * frente (`useWidgetSync`), asi que completar una tarea y salir a la pantalla de inicio dejaba el
 * widget diciendo lo viejo — justo en el momento en que el widget es lo unico que se ve. Y son cuatro
 * sitios los que mutan (crear, marcar, borrar, cronometro): puesto en el cliente no se puede olvidar
 * ninguno, y el que agregue el quinto lo hereda gratis.
 *
 * No espera al refresco (`void`): la pantalla no debe quedarse colgada de un widget, y si falla ya se
 * queja `syncTodayWidget` por su cuenta.
 */
const andSync = async <T>(token: string, work: Promise<T>): Promise<T> => {
  const result = await work;
  void syncTodayWidget(token);
  /**
   * Y los avisos, aqui y no en cada pantalla, por el mismo argumento del comentario de arriba —
   * pero este caso lo hace obligatorio: marcar hecha a las 5:45 una tarea de las 6:00 pasa con la
   * app AL FRENTE, sin cambio de `AppState`, asi que `useReminders` no se enteraria y el aviso
   * sonaria a las 5:50 por algo que ya esta cerrado.
   *
   * En el start/stop del cronometro sobra, y se acepta: es un GET en un boton que se toca un puñado
   * de veces al dia, contra cuatro sitios de los que acordarse.
   *
   * ponytail: reagenda todas desde cero en cada mutacion. Techo: `update` y `remove` ya saben el id
   * y podrian cancelar solo el suyo, y `create` agendar solo el nuevo.
   */
  void refreshTaskAlerts(token);
  return result;
};

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
    andSync(
      token,
      request<{ task: Task }>('/tasks', {
        method: 'POST',
        headers: bearer(token),
        body: JSON.stringify(input),
      })
    ),

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
    andSync(
      token,
      request<{ task: Task }>(`/tasks/${id}`, {
        method: 'PATCH',
        headers: bearer(token),
        body: JSON.stringify(patch),
      })
    ),

  remove: (token: string, id: number) =>
    andSync(token, request<void>(`/tasks/${id}`, { method: 'DELETE', headers: bearer(token) })),

  /** El API impone un solo timer corriendo por usuario: si ya hay otro, responde 409. */
  timer: (token: string, id: number, action: 'start' | 'stop') =>
    andSync(
      token,
      request<{ task: Task }>(`/tasks/${id}/timer`, {
        method: 'POST',
        headers: bearer(token),
        body: JSON.stringify({ action }),
      })
    ),
};
