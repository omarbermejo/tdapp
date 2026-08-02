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
  /**
   * El memoji elegido, ej. 'memoji-07'. null = no eligio, y se pinta la inicial del nombre.
   *
   * `string` y no una union de nombres a proposito: el catalogo vive en los assets de ESTA version
   * de la app, y el servidor puede devolver una cara que aqui todavia no exista (o que ya no). Se
   * valida al pintar, con la misma tolerancia con la que `useAccent` cae al acento por defecto.
   */
  avatar?: string | null;
  /**
   * El espacio en el que esta trabajando, ya resuelto. `null` = el modo general.
   *
   * Viene el OBJETO y no solo el id para que la pastilla se pinte en el primer frame, sin esperar a
   * la lista de espacios. Opcional por lo mismo que `stage`: un API desplegado sin la columna no lo
   * manda, y ahi la app se comporta como siempre (modo general).
   */
  activeWorkspace?: { id: number; name: string; icon: string; accent: AccentName; tag: string | null } | null;
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
  /**
   * OPCIONAL, y no por comodidad: el onboarding arma este objeto entero a mano y no pregunta por
   * la cara. Si fuera obligatorio habria que inventarle un valor ahi para satisfacer al tipo.
   */
  avatar?: string | null;
  /** Opcional por lo mismo que `avatar`: quien cambia de espacio no manda el perfil entero. */
  activeWorkspaceId?: number | null;
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
  /**
   * La cara elegida a mano, o null para derivarla de la clasificacion como se ha hecho siempre.
   *
   * Es un slug de `assets/icons3d/`, no una imagen: los archivos viven en el bundle. Opcional
   * mientras haya un API desplegado sin la columna.
   */
  icon?: string | null;
  /**
   * El espacio de trabajo al que pertenece, o null si esta suelta.
   *
   * Opcional por el mismo motivo que los campos de `stageOf` mas abajo: mientras haya un API
   * desplegado sin la columna, un build de la app que lo asumiera leeria undefined donde su tipo
   * promete un numero.
   */
  workspaceId?: number | null;
  /**
   * La clasificacion del ESPACIO al que pertenece, resuelta por el API.
   *
   * De aqui sale el icono y el color de la fila cuando la tarea no trae foco propio: `focusOf(task)`
   * es `focusArea ?? workspaceTag`. La resuelve el servidor porque el cliente tiene el id del espacio
   * pero no el espacio entero, y tenerlo a mano en cada fila obligaria a pasar la lista por props.
   */
  workspaceTag?: string | null;
  /** Quien la cerro. En un espacio compartido puede no ser su dueño. null en las abiertas. */
  completedBy?: number | null;
  /** Orden manual dentro del dia. null = nunca se reordeno. Lo escribe solo PATCH /tasks/order. */
  position?: number | null;
  /** ISO con zona, tal como lo mando el cliente. */
  dueAt: string | null;
  dueDate: string | null;
  suggestedMinutes: number;
  elapsedSeconds: number;
  running: boolean;
};

/**
 * Un espacio de trabajo: agrupa tareas por proyecto, no por tipo.
 *
 * Convive con `focusArea` y no lo reemplaza. El foco dice de que TIPO es la tarea (siete valores
 * fijos, de ahi salen su color y su icono en la fila) y el espacio dice a que PROYECTO pertenece
 * (los crea la persona, son cuantos quiera).
 *
 * `total` y `done` los cuenta el API con un LEFT JOIN, asi que la pantalla pinta el anillo de
 * progreso sin traerse ni una tarea.
 */
export type Workspace = {
  id: number;
  name: string;
  /** Un slug de `assets/icons3d/`. El catalogo lo manda el API en /workspaces/catalogs. */
  icon: string;
  accent: AccentName;
  position: number;
  /** De que es. `null` = sin clasificar, que es un estado y no un hueco. Ver `WORKSPACE_TAGS`. */
  tag?: string | null;
  total: number;
  done: number;
  /**
   * Si lo ADMINISTRAS. La lista trae tambien los espacios a los que te invitaron, y solo el dueño
   * puede renombrar, invitar o borrar — sin esto, la app ofreceria acciones que el API contesta con
   * un 404. Opcional como el resto: una version del API sin el campo se comporta como "no eres".
   */
  isOwner?: boolean;
};

/**
 * Otra persona, vista desde aqui. Espeja `toPublicMember` del API: cuatro campos y ni uno mas.
 *
 * Deliberadamente NO es un `User`: aquel trae correo, fecha de nacimiento y el perfil entero, y esto
 * se pinta en listas de gente que no eres tu.
 */
export type Member = {
  id: number;
  name: string;
  avatar: string | null;
  accentColor: AccentName;
  /** Solo en la lista de un espacio: 'owner' o 'member'. */
  role?: string;
};

/** Alguien con quien ya trabajaste, y el espacio donde mas han colaborado juntos. */
export type Collaborator = {
  person: Member;
  workspace: { id: number; name: string; icon: string; accent: AccentName };
  tasks: number;
};

/** Una invitacion viva a un espacio. `email` null = codigo abierto, lo usa quien lo tenga. */
export type Invite = {
  code: string;
  email: string | null;
  expiresAt: string;
  createdAt: string;
};

/** Lo que se ve de un espacio ANTES de entrar, con solo el codigo. */
export type InvitePreview = {
  workspace: { id: number; name: string; icon: string; accent: AccentName };
  invitedBy: Member | null;
  members: number;
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

/**
 * El trabajo cerrado de una ventana, partido por dia y por area.
 *
 * `byDay` OMITE los dias sin nada cerrado: no es una serie completa, es una lista de dias con algo.
 * Quien pinte una rejilla tiene que rellenar los ceros (ver `features/stats/grid.ts`).
 *
 * Los minutos son PLANEADOS, no cronometrados: casi nadie usa el temporizador, asi que un total de
 * tiempo real saldria en cero. Y todo se agrupa por `dueDate` (el dia local de la tarea), no por
 * cuando se cerro — por eso una tarea de ayer cerrada hoy cuenta para AYER.
 */
export type Stats = {
  from: string;
  to: string;
  /**
   * `done` son las CERRADAS de ese dia y `planned` las AGENDADAS, cerradas o no.
   *
   * Son dos preguntas distintas y por eso viajan las dos: `done` mide logro (es lo que pinta la
   * rejilla del perfil) y `planned` mide carga (es lo que pinta el mapa del trimestre en Hoy). Un dia
   * por venir con seis cosas agendadas tiene `done: 0` y `planned: 6`.
   *
   * `planned` es opcional porque un API desplegado sin la columna no lo manda.
   */
  byDay: { date: string; done: number; minutes: number; planned?: number }[];
  byArea: { focusArea: string | null; done: number; minutes: number }[];
  totals: { done: number; minutes: number };
};

/**
 * Cuantas tareas lleva la cuenta, de siempre.
 *
 * Es un numero distinto al de `Stats.totals.done`, y la diferencia importa: ese mira 28 dias y solo
 * tareas con fecha, asi que encoge con el tiempo. Este solo sube, que es lo que puede vivir en un
 * perfil. Mismas llaves que `Today.counts`.
 */
export type TaskCounts = { counts: { total: number; pending: number; done: number } };

/** Las seis cosas que le pueden pasar a una tarea y que merecen contarse. */
export type EventKind = 'created' | 'completed' | 'reopened' | 'moved' | 'edited' | 'deleted';

/**
 * Una novedad de una tarea.
 *
 * `taskTitle` y `workspaceId` son el estado EN EL MOMENTO del evento, no el de ahora: por eso una
 * novedad de borrado sigue teniendo algo que pintar cuando la tarea ya no existe. Y por lo mismo
 * `taskId` puede apuntar a una tarea que ya no esta — tocar la fila puede dar 404 y hay que
 * tratarlo, no evitarlo con una consulta previa.
 *
 * `actor` viene en null si esa cuenta se borro: el hecho de que la tarea se cerro sigue siendo
 * cierto aunque ya no se sepa de quien fue.
 */
export type ActivityEvent = {
  id: number;
  kind: EventKind;
  taskId: number | null;
  taskTitle: string;
  workspaceId: number | null;
  meta: { changed?: string[]; from?: number | null; to?: number | null } | null;
  actor: { id: number; name: string | null } | null;
  createdAt: string;
  read: boolean;
};

/** Una pagina del feed. `next` es el cursor de la siguiente, o null si ya no hay mas. */
export type ActivityPage = { events: ActivityEvent[]; unread: number; next: number | null };

/**
 * Un logro y las tres caras que abre.
 *
 * De las tres se elige UNA, no se ganan las tres: `chosen` es la elegida y las otras dos se quedan
 * cerradas para siempre. `claimable` es el estado que importa a la pantalla — cumplido y sin elegir,
 * o sea hay un premio esperando.
 */
export type Milestone = {
  id: string;
  label: string;
  hint: string;
  /** Los tres nombres de memoji, en el orden en que se pintan. */
  choices: string[];
  metric: 'done' | 'best';
  target: number;
  /** Lo que lleva, ya topado en `target`: "50 de 50" y nunca "173 de 50". */
  progress: number;
  unlocked: boolean;
  chosen: string | null;
  claimable: boolean;
};

/**
 * El vestidor: que caras hay libres y como van los cinco logros.
 *
 * Lo arma el API y no la app a proposito. Cruzar el catalogo con el avance y con lo ya elegido aqui
 * significaria que la app decide que esta desbloqueado — y entonces el candado seria decorativo.
 */
export type AvatarState = { free: string[]; milestones: Milestone[] };

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

  /**
   * `from` es OPCIONAL y quien lo omite se queda con el default del API: 28 dias contando hoy, que es
   * exactamente la rejilla de 4x7 del perfil — para esa, mandarlo seria repetir aqui un numero que
   * alla ya sale de la misma rejilla.
   *
   * Lo manda quien necesita otra ventana, como el mapa del trimestre en Hoy, que pide 17 semanas.
   * `workspaceId` acota todo a un espacio, para su pantalla de detalle.
   *
   * Un objeto y no tres posicionales: con `date`, `from` y `workspaceId` sueltos, pedir solo el espacio
   * obligaba a escribir dos `undefined` de relleno. Con `URLSearchParams` y no plantillas, igual que
   * `tasksApi.list`.
   */
  stats: (token: string, query: { date?: string; from?: string; workspaceId?: number } = {}) => {
    const search = new URLSearchParams(
      Object.entries(query)
        .filter(([, v]) => v != null && v !== '')
        .map(([k, v]) => [k, String(v)])
    ).toString();
    return request<Stats>(`/me/stats${search ? `?${search}` : ''}`, { headers: bearer(token) });
  },

  taskCounts: (token: string) =>
    request<TaskCounts>('/me/tasks/summary', { headers: bearer(token) }),

  /**
   * Las novedades. `before` pagina hacia atras; `since` trae el hueco que te perdiste.
   *
   * Son excluyentes: uno mira al pasado y el otro al presente. `since` es lo que usa el cliente al
   * reconectar el socket, y es la razon de que la pantalla funcione igual con el socket caido.
   */
  events: (token: string, opts: { before?: number; since?: number; limit?: number } = {}) => {
    const query = Object.entries(opts)
      .filter(([, v]) => v != null)
      .map(([k, v]) => `${k}=${v}`)
      .join('&');
    return request<ActivityPage>(`/me/events${query ? `?${query}` : ''}`, { headers: bearer(token) });
  },

  /** Solo el numero del globo: el inicio lo pide en cada foco y no necesita ni una fila. */
  unread: (token: string) =>
    request<{ unread: number }>('/me/events/unread', { headers: bearer(token) }),

  /** Sin `id`, marca todas. Devuelve el contador ya recalculado. */
  readEvents: (token: string, id?: number) =>
    request<{ unread: number }>('/me/events/read', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify(id == null ? {} : { id }),
    }),

  /** `date` por lo mismo que en la racha: la mejor marca se mide en dias locales del telefono. */
  avatars: (token: string, date?: string) =>
    request<AvatarState>(`/me/avatars${date ? `?date=${date}` : ''}`, { headers: bearer(token) }),

  /** Devuelve el vestidor entero al dia, para no encadenar una segunda peticion. */
  claimAvatar: (token: string, milestone: string, avatar: string, date?: string) =>
    request<AvatarState>(`/me/avatars${date ? `?date=${date}` : ''}`, {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ milestone, avatar }),
    }),

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
