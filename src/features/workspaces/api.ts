import { bearer, request, type Workspace } from '@/features/auth/api';

/** Lo que se puede mandar al crear o editar. Todo opcional menos el nombre al crear. */
export type NewWorkspace = {
  name?: string;
  icon?: string;
  accent?: Workspace['accent'];
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
};
