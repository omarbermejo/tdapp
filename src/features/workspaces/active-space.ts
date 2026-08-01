import type { User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

/**
 * El espacio en el que estas trabajando. `null` es el modo general — un ESTADO, no un hueco.
 *
 * Sin estado propio, sin efectos y sin shared values: es una lectura de `useAuth`, y por eso ninguna
 * regla del compilador de React entra en juego aqui.
 *
 * **Vive en el servidor** (`user_profiles.active_workspace_id`) y no en un store local, y eso resuelve
 * dos cosas de golpe: el espacio viaja entre aparatos, y la reconciliacion es la clave ajena — borrar
 * el espacio te devuelve al modo general con un `ON DELETE SET NULL`, sin codigo que mantener.
 *
 * Devuelve el objeto entero y no el id porque quien lo consume pinta su nombre, su icono y su color.
 */
export type SpaceRef = NonNullable<User['activeWorkspace']>;

export function useActiveSpace(): SpaceRef | null {
  return useAuth().user?.activeWorkspace ?? null;
}

/**
 * El id del espacio activo, para los hooks que acotan sus peticiones.
 *
 * `undefined` y no `null` a proposito: es lo que los clientes de `tasksApi`/`api.stats` interpretan
 * como "sin filtro", y `null` viajaria en el query string como la cadena "null".
 */
export function useActiveSpaceId(): number | undefined {
  return useAuth().user?.activeWorkspace?.id ?? undefined;
}
