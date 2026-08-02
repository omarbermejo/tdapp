import { invalidate, type Domain } from '@/features/cache/store';
import {
  bearer,
  request,
  type Collaborator,
  type Invite,
  type InvitePreview,
  type Member,
  type Workspace,
} from '@/features/auth/api';

/** Lo que se puede mandar al crear o editar. Todo opcional menos el nombre al crear. */
export type NewWorkspace = {
  name?: string;
  icon?: string;
  accent?: Workspace['accent'];
  /** De que es. Una de las diez de `GET /workspaces/catalogs`. */
  tag?: string | null;
  position?: number;
};

/**
 * El cliente de los espacios de trabajo.
 *
 * Archivo aparte de `features/tasks/api.ts` a proposito, y no es solo orden: ahi TODA mutacion pasa
 * por `andSync`, que refresca el widget y reagenda las notificaciones. Un espacio no aparece en el
 * widget ni tiene hora que avisar, asi que pasarlo por ahi seria hacer dos peticiones de mas por cada
 * espacio que alguien renombra.
 *
 * Lo que SI cambia el widget es borrar un espacio, porque sus tareas se quedan sueltas — pero eso no
 * altera el dia de hoy ni las horas, solo a que proyecto pertenecen, y el widget no pinta el proyecto.
 *
 * Todo eso sigue en pie. Lo que le FALTABA a este razonamiento es el cache: el widget no cambia, pero
 * la lista de espacios EN PANTALLA si deja de ser cierta. De ahi `andInvalidate`, que es el hermano
 * flaco de `andSync` — sin token, sin widget y sin avisos, solo caducar lo que dejo de valer.
 *
 * Sin el, crear un espacio no lo enseñaba hasta reiniciar la app: `useWorkspaces` va por cache con
 * politica `WARM`, o sea cinco minutos, y volver al inicio daba acierto de cache.
 */
const andInvalidate = async <T>(work: Promise<T>, ...stale: Domain[]): Promise<T> => {
  const result = await work;
  invalidate(...stale);
  return result;
};

export const workspacesApi = {
  list: (token: string) =>
    request<{ workspaces: Workspace[] }>('/workspaces', { headers: bearer(token) }),

  /** Uno solo, con su progreso. 404 si no existe o no es tuyo: la pantalla de detalle lo distingue. */
  get: (token: string, id: number) =>
    request<{ workspace: Workspace }>(`/workspaces/${id}`, { headers: bearer(token) }),

  create: (token: string, input: NewWorkspace) =>
    andInvalidate(
      request<{ workspace: Workspace }>('/workspaces', {
        method: 'POST',
        headers: bearer(token),
        body: JSON.stringify(input),
      }),
      'workspaces'
    ),

  /** PATCH de verdad: lo que no viene se conserva. */
  update: (token: string, id: number, patch: NewWorkspace) =>
    andInvalidate(
      request<{ workspace: Workspace }>(`/workspaces/${id}`, {
        method: 'PATCH',
        headers: bearer(token),
        body: JSON.stringify(patch),
      }),
      'workspaces'
    ),

  /** Las tareas del espacio SOBREVIVEN, sueltas: el API las deja con workspaceId en null. */
  remove: (token: string, id: number) =>
    andInvalidate(
      request<void>(`/workspaces/${id}`, { method: 'DELETE', headers: bearer(token) }),
      // Sus tareas se quedan SUELTAS: cambian de dueño en la lista del dia, y el mapa acotado al
      // espacio deja de existir.
      'workspaces',
      'tasks',
      'stats'
    ),

  /** Quien esta dentro. Lo pueden ver los miembros, no solo el dueño. */
  members: (token: string, id: number) =>
    request<{ members: Member[] }>(`/workspaces/${id}/members`, { headers: bearer(token) }),

  /** Con quien ya has trabajado, para no teclear un correo cada vez. */
  collaborators: (token: string) =>
    request<{ collaborators: Collaborator[] }>('/workspaces/collaborators', { headers: bearer(token) }),
};

/**
 * Las invitaciones. Junto a `workspacesApi` y no en su propio archivo: son del mismo recurso y
 * comparten sus rutas.
 *
 * Ninguna pasa por `andSync` — el docblock de `workspacesApi` ya argumenta por que: un espacio no sale
 * en el widget ni tiene hora que avisar. Pero `join` SI caduca el cache: entrar a un espacio cambia
 * lo que tienes en pantalla. Crear y revocar codigos no, porque ningun hook cacheado pinta
 * invitaciones.
 */
/**
 * Quien ha pedido entrar a algo mio, y la respuesta.
 *
 * Aparte de `workspacesApi` y de `invitesApi` porque es de un tercer actor: aqui el sujeto no es el
 * espacio ni la invitacion, es la PERSONA que espera. Y su lista no se pide por espacio sino de
 * golpe — la pantalla de novedades pregunta "¿alguien quiere entrar a algo mio?".
 */
export const requestsApi = {
  list: (token: string) =>
    request<{ requests: JoinRequest[] }>('/workspaces/requests', { headers: bearer(token) }),

  decide: (token: string, workspaceId: number, personId: number, approve: boolean) =>
    andInvalidate(
      request<{ approved: boolean }>(`/workspaces/${workspaceId}/requests/${personId}`, {
        method: 'POST',
        headers: bearer(token),
        body: JSON.stringify({ approve }),
      }),
      // Aprobar suma un miembro al espacio; rechazar no cambia nada del espacio pero si la lista de
      // solicitudes, que no esta cacheada. Invalidar de mas aqui cuesta un GET y evita un anillo viejo.
      'workspaces'
    ),
};

/** Una solicitud pendiente, ya resuelta a persona y espacio por el API. */
export type JoinRequest = {
  person: Member;
  workspace: { id: number; name: string };
  askedAt: string;
};

export const invitesApi = {
  /**
   * Crea un codigo. Del dueño.
   *
   * Sin nada, es un codigo abierto para quien lo tenga. Con `email`, ademas sale el correo. Con
   * `personId` —alguien de `collaborators`— el correo lo resuelve el API: la lista de colaboradores
   * no trae correos a proposito, asi que invitar de un toque no obliga a que la app conozca ninguno.
   */
  create: (token: string, workspaceId: number, to?: { email?: string; personId?: number }) =>
    request<{ invite: Invite; resent: boolean }>(`/workspaces/${workspaceId}/invites`, {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify(to ?? {}),
    }),

  list: (token: string, workspaceId: number) =>
    request<{ invites: Invite[] }>(`/workspaces/${workspaceId}/invites`, { headers: bearer(token) }),

  revoke: (token: string, workspaceId: number, code: string) =>
    request<void>(`/workspaces/${workspaceId}/invites/${code}`, {
      method: 'DELETE',
      headers: bearer(token),
    }),

  /** De que espacio es este codigo, SIN consumirlo. Gasta intento del mismo limite que `join`. */
  check: (token: string, code: string) =>
    request<InvitePreview>('/workspaces/join/check', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify({ code }),
    }),

  /** Entra. El codigo es de un solo uso: despues de esto ya no vale. */
  join: (token: string, code: string) =>
    andInvalidate(
      request<{
        workspace: { id: number; name: string; icon: string; accent: Workspace['accent'] };
        /**
         * `false` cuando el codigo era ABIERTO: no entraste, dejaste una solicitud que el dueño
         * tiene que aprobar. Un codigo atado a un correo si entra directo y devuelve `true`.
         */
        joined: boolean;
      }>(
        '/workspaces/join',
        { method: 'POST', headers: bearer(token), body: JSON.stringify({ code }) }
      ),
      // Entrar a un espacio gana uno en la lista y cambia todo lo que estaba acotado a el.
      'workspaces',
      'tasks',
      'stats'
    ),
};
