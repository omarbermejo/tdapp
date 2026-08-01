import type { AccentName } from '@/constants/theme';

/**
 * Color por FAMILIA de foco, no por foco.
 *
 * Hay siete focos y cinco acentos, asi que un color por foco no cabe. Pero el reparto de todas
 * formas no queria ser uno a uno: lo que se lee de un vistazo en una agenda no es "esto es
 * salud", eso ya lo dice el icono — es "mi dia entero es verde", o sea todo produccion y nada
 * de vida. Tres familias:
 *
 * - verdes  → produccion (trabajo, estudio, creatividad)
 * - calidos → vida (casa, salud, relaciones)
 * - cobre   → dinero, que no es ninguna de las dos
 *
 * El icono distingue dentro de la familia; el color responde la pregunta de mas arriba.
 * Techo: cuando cada tarea pueda traer su propio color (Tiimo deja elegirlo por actividad),
 * esto pasa a ser solo el default de la familia.
 */
const FAMILY: Record<string, AccentName> = {
  work: 'forest',
  study: 'olive',
  creativity: 'leaf',
  home: 'clay',
  health: 'clay',
  relationships: 'clay',
  money: 'copper',
  /*
    Las tres clasificaciones que los siete focos no nombraban, repartidas por la misma regla:
    entrenar es produccion sobre uno mismo (verde), un evento se organiza y se vive (calido), y un
    negocio es dinero — que sigue sin ser ninguna de las dos familias.
  */
  fitness: 'leaf',
  event: 'clay',
  business: 'copper',
};

/**
 * De que va una tarea: su foco propio si lo tiene, y si no, la clasificacion de su espacio.
 *
 * **Esta es la herencia**, y vive aqui para que exista en UN solo sitio: el icono, el color y la
 * etiqueta de una fila salen los tres de esta funcion, y si cada uno resolviera su propio fallback
 * acabarian discrepando. El foco propio gana siempre — es un override explicito.
 */
export const focusOf = (task: {
  focusArea?: string | null;
  workspaceTag?: string | null;
}): string | null => task.focusArea ?? task.workspaceTag ?? null;

/**
 * El acento de una tarea. Sin foco cae en el del usuario: una tarea recien anotada no tiene
 * area todavia y no por eso debe verse gris entre las demas.
 */
export const accentForFocus = (
  focusArea: string | null | undefined,
  fallback: AccentName
): AccentName => (focusArea && FAMILY[focusArea]) || fallback;
