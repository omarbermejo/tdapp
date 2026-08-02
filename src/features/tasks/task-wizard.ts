import { AREA_ICON, type Icon3DName } from '@/components/ui/icon3d';
import type { Workspace } from '@/features/auth/api';

/**
 * Las reglas del asistente de crear tarea. Puro, sin React: aqui se decide QUE se pregunta en cada
 * paso y cuando se puede avanzar, y la pantalla solo lo pinta.
 */

export type Draft = {
  icon: Icon3DName | null;
  title: string;
  /** null = espacio personal. Es el mismo significado que `workspaceId` en la tarea. */
  workspaceId: number | null;
  /** La clasificacion. '' = sin clasificar, que es una respuesta valida. */
  focusArea: string;
  date: string | null;
  hour: string;
};

export const TOTAL_STEPS = 4;

/**
 * Las caras que se ofrecen para una tarea.
 *
 * Un subconjunto de `Icon3DName`, no los dieciocho: `home-chrome` y `user` son cromo de la interfaz
 * (la pestaña de inicio, el avatar) y ofrecerlos como cara de una tarea mezclaria dos idiomas. Los
 * doce que quedan cubren lo que la gente anota.
 */
export const TASK_ICONS: readonly Icon3DName[] = [
  'check', 'lightning', 'clock', 'calendar', 'academic', 'work',
  'home', 'health', 'money', 'creativity', 'leaf', 'trophy',
];

/**
 * La cara que se sugiere para una clasificacion.
 *
 * Se usa como valor INICIAL del paso 1, no como valor final: si eliges "Salud" en el paso 3, la
 * tarea ya se veria con el icono de salud aunque no toques nada. Elegir uno a mano lo sobreescribe,
 * y de ahi que `tasks.icon` sea nullable — null significa "el derivado esta bien".
 */
export const iconForArea = (area: string): Icon3DName | null =>
  (area && AREA_ICON[area]) || null;

/**
 * Si un paso esta resuelto y se puede seguir.
 *
 * Solo el primero puede bloquear: una tarea sin nombre no es nada, pero una sin clasificar o sin
 * espacio es perfectamente normal — y forzar una respuesta en cada paso es como se muere una tarea
 * en un formulario. Los pasos 2 y 3 siempre dejan pasar porque su respuesta por defecto ya es buena.
 */
export const canAdvance = (step: number, draft: Draft): boolean => {
  if (step === 0) return draft.title.trim().length > 0;
  if (step === 3) return !!draft.date;
  return true;
};

/**
 * Las clasificaciones que se ofrecen en el paso 3, y de donde salen.
 *
 * Si la tarea va a un ESPACIO, la unica que se ofrece es la del espacio: un espacio ya declara de
 * que es ("Tesis" es estudio), asi que volver a preguntarlo seria pedir dos veces lo mismo y abrir
 * la puerta a que se contradigan.
 *
 * En el espacio personal se ofrecen los focos que la persona eligio en el onboarding, y no los siete
 * del catalogo: dijo que le importan tres, y ensenarle los otros cuatro es ruido. Si no eligio
 * ninguno, se ofrecen todos.
 */
export function areasFor(
  space: Workspace | null,
  mine: readonly string[],
  all: readonly string[]
): readonly string[] {
  if (space) return space.tag ? [space.tag] : [];
  return mine.length ? mine : all;
}
