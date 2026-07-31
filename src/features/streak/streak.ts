import type { Streak } from '@/features/auth/api';

/**
 * La semántica y el copy de la racha. Puro, sin hooks y sin React.
 *
 * Vive aparte porque lo consumen DOS pinturas distintas: la tarjeta del perfil y el widget de racha.
 * Con las reglas duplicadas, el mismo martes se vería medio lleno en el widget y con aro en la app —
 * y el copy de la mejor marca ya estaba escrito dos veces. Aquí la regla se decide una vez; lo único
 * que cada superficie decide por su cuenta es cómo lo dibuja (el widget no sabe hacer aros: `Circle`
 * es hoja en el renderer y solo admite relleno y opacidad).
 */

/**
 * En qué estado está un día de la semana. Son CUATRO y no dos, y la diferencia importa:
 *
 * - `closed`  — cerraste algo. Macizo.
 * - `today`   — es hoy y sigue abierto. A medias: ni apagado (parecería que fallaste) ni lleno
 *               (sería mentira). Es el mismo criterio con el que el API decide no romper la racha.
 * - `missed`  — pasó en blanco. Aro visible, nunca `danger`: un día sin cerrar nada no es un error.
 * - `ahead`   — todavía no llega. Aro apagado, más tenue que `missed`.
 */
export type DayLevel = 'closed' | 'today' | 'missed' | 'ahead';

/** Índice de hoy dentro de la semana (0 = lunes). -1 si por lo que sea no cae dentro. */
export const todayIndexOf = (streak: Streak): number =>
  streak.week.findIndex((day) => day.date === streak.date);

/**
 * El nivel de cada uno de los siete días.
 *
 * El orden de las ramas importa: un día con algo cerrado es `closed` AUNQUE sea hoy — cerrar la
 * primera cosa del día tiene que verse como una victoria y no como "hoy sigue a medias".
 */
export function levelsOf(streak: Streak): DayLevel[] {
  const today = todayIndexOf(streak);

  return streak.week.map((day, i) => {
    if (day.done > 0) return 'closed';
    if (i === today) return 'today';
    // Sin hoy en la semana se comparan las fechas: es más fiable que asumir una posición.
    if (today === -1 ? day.date < streak.date : i < today) return 'missed';
    return 'ahead';
  });
}

/** 'N días' con el singular resuelto. El número NUNCA se repite en la línea de abajo. */
export const daysLabel = (days: number): string => (days === 1 ? '1 día' : `${days} días`);

/**
 * El titular. Con la racha en cero NO se pinta un `0`: un cero en tamaño de métrica se lee como un
 * reproche, y el estado vacío del resto de la app tampoco imprime números (ver `day-card.tsx`).
 */
export const headlineOf = (days: number): string =>
  days === 0 ? 'Sin racha todavía' : daysLabel(days);

/**
 * La línea que acompaña al número, y que nunca lo repite.
 *
 * `best` incluye la corrida en curso (lo calcula `bestStreak` en el API), así que `best >= days`
 * SIEMPRE y no existe el estado "rompiste tu récord": el tope es empatarlo.
 */
export function bestLine(days: number, best: number): string {
  if (days === 0) {
    return best > 0
      ? `Tu mejor marca son ${daysLabel(best)}. Se vuelve a empezar cuando quieras.`
      : 'Cierra una cosa y arranca. Con una basta.';
  }
  if (days < best) return `Tu mejor marca son ${daysLabel(best)}.`;
  if (days === 1) return 'Arrancó. Un día ya es una racha.';
  return 'Es tu mejor marca. Nunca has llegado más lejos.';
}

/**
 * El recordatorio de que el día de hoy no te puede quitar la racha. `''` cuando no aplica.
 *
 * Condicional a propósito: permanente se vuelve mobiliario y deja de leerse. Solo aparece cuando de
 * verdad tranquiliza — hay racha viva y hoy todavía no has cerrado nada.
 */
export function clemencyLine(streak: Streak): string {
  const today = todayIndexOf(streak);
  const openToday = today >= 0 && streak.week[today].done === 0;
  return streak.days > 0 && openToday
    ? 'Hoy no cuenta hasta que cierres algo. Tampoco la rompe.'
    : '';
}

/** Lo que lee un lector de pantalla de la fila de la semana, que como puntos sueltos no diría nada. */
export function weekLabel(streak: Streak): string {
  const levels = levelsOf(streak);
  const closed = levels.filter((level) => level === 'closed').length;
  const open = levels.includes('today') ? ' Hoy todavía abierto.' : '';
  return `${closed} de 7 días cerrados esta semana.${open}`;
}
