import { api, bearer, request, type Task } from '@/features/auth/api';
import { invalidate, type Domain } from '@/features/cache/store';
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
  /** El slug de `assets/icons3d/` elegido a mano. null lo deja derivarse de la clasificacion. */
  icon?: string | null;
  /** El espacio de trabajo al que pertenece. null la deja suelta, sin borrarla. */
  workspaceId?: number | null;
  /** ISO con zona; usa localIso() o isoAt(). null lo desagenda. */
  dueAt?: string | null;
  /**
   * El dia LOCAL en que se cerro, 'YYYY-MM-DD'. Lo rellena `update` solo; no hay que pasarlo.
   *
   * Existe porque la racha cuenta el dia en que cerraste algo, y el servidor no puede deducirlo:
   * `completed_at` es UTC, asi que cerrar a las 11 de la noche en Mexico caeria en el dia siguiente.
   * Misma disciplina que `dueAt` — la fecha local la manda quien la vive.
   */
  completedOn?: string | null;
};

export type TaskQuery = {
  date?: string;
  status?: Task['status'];
  focusArea?: string;
  /** Todas las de un espacio, de cualquier dia y sin fecha incluidas. Es su pantalla de detalle. */
  workspaceId?: number;
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
const andSync = async <T>(token: string, work: Promise<T>, ...stale: Domain[]): Promise<T> => {
  const result = await work;
  /**
   * Primero la invalidacion, y sincrona: no pide nada —solo sube contadores— asi que cuanto antes
   * lo sepa el hook que esta al frente, antes repinta. Los dos `void` de abajo son trabajo de red.
   *
   * Que dominios caduca cada mutacion lo decide su call site, y el criterio es: **se invalida lo que
   * la pantalla no puede saber por si sola.** Las listas de tareas ya se parchean en el sitio
   * (`mutate.patch`/`drop`), asi que `update` y `remove` NO invalidan `tasks`.
   */
  invalidate(...stale);
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
      }),
      // Una fila NUEVA no se puede parchear a ciegas: `patch()` ni escribe si no hay entrada, y los
      // mutadores de `use-tasks` no tienen `add`. Sube el `total` del espacio y las `planned` del
      // dia. NO la racha: anotar no es cerrar.
      'tasks',
      'workspaces',
      'stats'
    ),

  list: (token: string, query: TaskQuery = {}) => {
    const search = new URLSearchParams(
      Object.entries(query).filter(([, v]) => v != null && v !== '') as [string, string][]
    ).toString();
    return request<{ tasks: Task[] }>(`/tasks${search ? `?${search}` : ''}`, {
      headers: bearer(token),
    });
  },

  /**
   * PATCH de verdad: lo que no viene se conserva. Marcar hecha es { status: 'done' }.
   *
   * El dia local del cierre se sella AQUI y no en el call site, por el mismo argumento que `andSync`:
   * puesto en el cliente no se puede olvidar ninguno. Hoy solo hay un sitio que marca hecha, pero el
   * que agregue el segundo lo hereda gratis — y olvidarlo no rompe nada visible, solo deja la racha
   * clavada, que es justo el bug que esto arregla.
   */
  update: (token: string, id: number, patch: NewTask) =>
    andSync(
      token,
      request<{ task: Task }>(`/tasks/${id}`, {
        method: 'PATCH',
        headers: bearer(token),
        body: JSON.stringify(
          patch.status === 'done' ? { completedOn: localDate(), ...patch } : patch
        ),
      }),
      // Cerrar o reabrir mueve la llama, el mapa, la tira y el anillo del espacio. La fila en si ya
      // la parcheo quien la toco, asi que `tasks` sobra.
      'workspaces',
      'streak',
      'stats'
    ),

  remove: (token: string, id: number) =>
    andSync(
      token,
      request<void>(`/tasks/${id}`, { method: 'DELETE', headers: bearer(token) }),
      // Lo mismo que `update` pero al reves: `drop` ya quito la fila de su lista.
      'workspaces',
      'streak',
      'stats'
    ),

  /**
   * Guarda el orden manual de un dia: la posicion de cada tarea es su indice en `ids`.
   *
   * Manda la lista COMPLETA del dia y no la que se movio. Si solo fuera una, las demas se quedarian
   * sin posicion y el ORDER BY del API las mandaria juntas al final — o sea que mover una cosa
   * reordenaria el dia entero sin pedirlo.
   *
   * **NO pasa por `andSync`**, y es la unica mutacion que no lo hace. De los dos efectos que dispara,
   * solo uno aplica: el widget pinta la lista del dia en el orden del servidor, asi que hay que
   * refrescarlo. `refreshTaskAlerts` no — reordenar no mueve ninguna hora, y reagendar todos los
   * avisos por un arrastre es trabajo puro de mas en el gesto mas repetible de la lista.
   */
  order: async (token: string, ids: number[]) => {
    const result = await request<{ tasks: Task[] }>('/tasks/order', {
      method: 'PATCH',
      headers: bearer(token),
      body: JSON.stringify({ ids }),
    });
    void syncTodayWidget(token);
    return result;
  },

  /**
   * El API impone un solo timer corriendo por usuario: si ya hay otro, responde 409.
   *
   * NO invalida nada: solo acumula minutos, no cierra tareas y no mueve anillos. Y es de las
   * mutaciones mas repetidas, asi que tres GET por cada start y cada stop serian gratis para nadie.
   */
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
