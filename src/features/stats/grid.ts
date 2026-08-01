import type { Stats } from '@/features/auth/api';

/**
 * La rejilla del mapa de calor. Puro, sin hooks y sin React, como `streak.ts`.
 *
 * La regla vive aparte de la pintura porque rellenar los huecos NO es un detalle de dibujo: el API
 * devuelve solo los dias con algo cerrado, y una rejilla construida sobre esa lista no queda hueca
 * sino DESALINEADA — el 3 de agosto se pintaria en la casilla del 1 y todo lo demas se correria.
 */

/** Cuatro filas de siete. El API ya devuelve esta ventana por defecto: el numero es el mismo. */
export const GRID_DAYS = 28;
export const GRID_COLUMNS = 7;

/**
 * Cuantas cosas cerradas hacen una celda del todo llena.
 *
 * Tope FIJO y no el maximo del periodo. Con un maximo dinamico, cerrar cinco cosas hoy repintaria
 * los veintisiete dias anteriores mas apagados — el mismo martes cambiaria de color sin que hubiera
 * cambiado lo que paso ese martes. Un mapa que se reescribe solo no es un registro.
 */
export const LEVEL_CAP = 3;

export type Cell = {
  date: string;
  done: number;
  /** 0..1, lo que se interpola entre el fondo apagado y el acento. */
  level: number;
};

/**
 * `date` menos `back` dias, en texto ISO.
 *
 * Con el constructor de tres numeros y nunca `new Date('YYYY-MM-DD')`: ese lo lee como medianoche
 * UTC y al oeste de Greenwich devuelve el dia anterior, con lo que la rejilla entera saldria corrida
 * un dia. Es la misma trampa que documentan `day.ts` y `calendar.tsx`.
 */
const shift = (date: string, back: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, m - 1, d - back);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

/**
 * Las 28 celdas en orden cronologico: la primera es la mas vieja y la ultima es HOY.
 *
 * Ese orden pone hoy en la esquina inferior derecha, que es donde el ojo termina de leer y donde lo
 * busca. Y como son 28 exactos, la celda de una columna y la de siete despues comparten dia de la
 * semana — las columnas siguen siendo consistentes aunque la primera no sea lunes. Por eso la
 * rejilla NO lleva iniciales L M M J V S D: no es un calendario, es densidad.
 */
export function heatGrid(stats: Stats | null, today: string): Cell[] {
  const done = new Map(stats?.byDay.map((day) => [day.date, day.done]) ?? []);

  return Array.from({ length: GRID_DAYS }, (_, i) => {
    const date = shift(today, GRID_DAYS - 1 - i);
    const count = done.get(date) ?? 0;
    return { date, done: count, level: Math.min(count / LEVEL_CAP, 1) };
  });
}

/** Lo que lee un lector de pantalla de la rejilla, que como celdas sueltas no diria nada. */
export function heatLabel(cells: Cell[]): string {
  const active = cells.filter((cell) => cell.done > 0).length;
  const total = cells.reduce((sum, cell) => sum + cell.done, 0);
  if (!total) return 'Sin nada cerrado en las últimas 4 semanas.';
  return `${total} ${total === 1 ? 'tarea cerrada' : 'tareas cerradas'} en ${active} de ${cells.length} días.`;
}
