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
 */
export const workspacesApi = {
  list: (token: string) =>
    request<{ workspaces: Workspace[] }>('/workspaces', { headers: bearer(token) }),

  /** Uno solo, con su progreso. 404 si no existe o no es tuyo: la pantalla de detalle lo distingue. */
  get: (token: string, id: number) =>
    request<{ workspace: Workspace }>(`/workspaces/${id}`, { headers: bearer(token) }),

  create: (token: string, input: NewWorkspace) =>
    request<{ workspace: Workspace }>('/workspaces', {
      method: 'POST',
      headers: bearer(token),
      body: JSON.stringify(input),
    }),

  /** PATCH de verdad: lo que no viene se conserva. */
  update: (token: string, id: number, patch: NewWorkspace) =>
    request<{ workspace: Workspace }>(`/workspaces/${id}`, {
      method: 'PATCH',
      headers: bearer(token),
      body: JSON.stringify(patch),
    }),

  /** Las tareas del espacio SOBREVIVEN, sueltas: el API las deja con workspaceId en null. */
  remove: (token: string, id: number) =>
    request<void>(`/workspaces/${id}`, { method: 'DELETE', headers: bearer(token) }),

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
 * en el widget ni tiene hora que avisar.
 */
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
    request<{ workspace: { id: number; name: string; icon: string; accent: Workspace['accent'] } }>(
      '/workspaces/join',
      { method: 'POST', headers: bearer(token), body: JSON.stringify({ code }) }
    ),
};
