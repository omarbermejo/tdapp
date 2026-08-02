import type { Icon3DName } from '@/components/ui/icon3d';
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
 * El acento de una tarea. Sin foco devuelve `undefined`, y eso es justo lo que hace falta:
 * `useAccent(undefined)` cae en el acento HEREDADO — el del espacio si estas dentro de uno, y si no
 * el de la persona.
 *
 * Antes el fallback era obligatorio y los tres llamantes escribian `?? 'olive'`, asi que una tarea
 * recien anotada se veia oliva aunque hubieras elegido otro color.
 *
 * `FAMILY` NO se toca: una tarea CON foco sigue pintada por su area, que es lo que deja leer el dia
 * de un vistazo. Lo que cambia es solo el hueco que dejaba sin cubrir.
 */
export const accentForFocus = (
  focusArea: string | null | undefined,
  fallback?: AccentName
): AccentName | undefined => (focusArea && FAMILY[focusArea]) || fallback;

/**
 * La cara de una clasificacion.
 *
 * Es el hermano de `FAMILY` —ahi el color, aqui la forma— y existe por el onboarding: ahi se pregunta
 * DE QUE va tu primer espacio, no que dibujo quieres, asi que el icono tiene que salir de la respuesta.
 * `study` mapea a `academic` porque el mapa de assets se indexa por slug de archivo y no por area.
 */
const FACE: Record<string, Icon3DName> = {
  study: 'academic',
  work: 'work',
  creativity: 'creativity',
  fitness: 'trophy',
  home: 'home',
  health: 'health',
  relationships: 'relationships',
  event: 'calendar',
  money: 'money',
  business: 'graph-up',
};

/** El icono 3D de una clasificacion. Sin ella, el maletin: es el default del alta de un espacio. */
export const iconForTag = (tag: string | null | undefined): Icon3DName =>
  (tag && FACE[tag]) || 'work';

/**
 * El foco que le toca a una clasificacion.
 *
 * Los siete primeros tags SON los siete focos, asi que casi siempre es la identidad. Las tres nuevas
 * caen en el foco mas cercano, por la misma regla con la que `FAMILY` les asigna color: entrenar es
 * cuidarse, un evento se organiza en casa, y un negocio es dinero. Sirve para que el onboarding pueda
 * dejar de preguntar por el foco sin que el dia se quede sin nada con que ordenarse.
 */
const AS_FOCUS: Record<string, string> = { fitness: 'health', event: 'home', business: 'money' };

export const focusForTag = (tag: string | null | undefined): string[] =>
  tag ? [AS_FOCUS[tag] ?? tag] : [];
