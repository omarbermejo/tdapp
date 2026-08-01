import type { Stats } from '@/features/auth/api';

/**
 * La rejilla del mapa de calor. Puro, sin hooks y sin React, como `streak.ts`.
 *
 * La regla vive aparte de la pintura porque rellenar los huecos NO es un detalle de dibujo: el API
 * devuelve solo los dias con algo, y una rejilla construida sobre esa lista no queda hueca sino
 * DESALINEADA — el 3 de agosto se pintaria en la casilla del 1 y todo lo demas se correria.
 *
 * Un solo modulo sirve a los DOS mapas de la app porque la unica diferencia real entre ellos es
 * cuanto miran, que cuentan y como se alinean. Ver `HeatSpec`.
 */

/** Que cuenta una celda: lo cerrado (logro) o lo agendado (carga). Son dos preguntas distintas. */
export type HeatMetric = 'done' | 'planned';

/**
 * La forma de un mapa.
 *
 * `weekAligned` es la diferencia estructural: apagado, las filas son 7 dias CORRIDOS que terminan hoy
 * (28 dias = 4 filas, y la primera columna no es lunes); encendido, cada FILA es un dia de la semana y
 * cada COLUMNA una semana, que es el layout de GitHub y el unico en el que rotular L M M J V S D no
 * seria mentira.
 */
export type HeatSpec = {
  /** Multiplo de 7. Con `weekAligned`, son semanas completas. */
  days: number;
  metric: HeatMetric;
  /**
   * Cuantas cosas llenan una celda del todo.
   *
   * Tope FIJO y no el maximo del periodo. Con un maximo dinamico, cerrar cinco cosas hoy repintaria
   * los dias anteriores mas apagados — el mismo martes cambiaria de color sin que hubiera cambiado lo
   * que paso ese martes. Un mapa que se reescribe solo no es un registro.
   */
  cap: number;
  weekAligned: boolean;
};

/**
 * El mapa del perfil: cuatro semanas de trabajo cerrado, en 4x7.
 *
 * 28 es exactamente la ventana que el API devuelve por defecto, y `cap: 3` porque cerrar tres cosas en
 * un dia ya es un dia bueno.
 */
export const PROGRESS_HEAT: HeatSpec = { days: 28, metric: 'done', cap: 3, weekAligned: false };

/**
 * El mapa de Hoy: el trimestre agendado, en 7x17.
 *
 * 119 dias son 17 semanas exactas, que en el ancho de un telefono caben en celdas de ~13pt sin
 * scroll. `cap: 6` porque con seis cosas el dia ya esta lleno: seguir oscureciendo despues solo
 * mentiria sobre la diferencia entre 7 y 12.
 */
export const QUARTER_HEAT: HeatSpec = { days: 119, metric: 'planned', cap: 6, weekAligned: true };

/**
 * El mismo trimestre, pero de UN espacio de trabajo.
 *
 * Solo cambia el tope, y no es un detalle: `cap: 6` esta calibrado para la cuenta entera, donde un dia
 * lleno son seis cosas de todo lo que llevas. Dentro de un solo proyecto, dos tareas en un dia YA es un
 * dia dedicado a el — con el tope en 6, una tarea pintaba la celda al 17% del acento y el mapa del
 * espacio se veia en blanco aunque hubiera trabajo todos los dias.
 */
export const WORKSPACE_HEAT: HeatSpec = { ...QUARTER_HEAT, cap: 2 };

export type Cell = {
  date: string;
  count: number;
  /** 0..1, lo que se interpola entre el fondo apagado y el acento. */
  level: number;
  /** Todavia no llega. Se distingue por TONO, no por opacidad: ver la nota de `HeatCell`. */
  future: boolean;
  isToday: boolean;
};

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * `date` mas `days` dias (negativo va hacia atras), en texto ISO.
 *
 * Con el constructor de tres numeros y nunca `new Date('YYYY-MM-DD')`: ese lo lee como medianoche UTC
 * y al oeste de Greenwich devuelve el dia anterior, con lo que la rejilla entera saldria corrida un
 * dia. Es la misma trampa que documentan `day.ts` y `calendar.tsx`.
 */
const shift = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, m - 1, d + days);
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
};

/** El lunes de la semana de `date`. getDay() da 0 el domingo, de ahi el `(day + 6) % 7`. */
const mondayOf = (date: string): string => {
  const [y, m, d] = date.split('-').map(Number);
  return shift(date, -((new Date(y, m - 1, d).getDay() + 6) % 7));
};

/**
 * Las celdas ya partidas en las FILAS que se pintan.
 *
 * Devuelve filas y no una lista plana porque las dos formas se recorren distinto y decidirlo aqui deja
 * al componente como un simple `rows.map(row => row.map(cell => ...))`.
 *
 * Sin dia anclado no se inventan fechas: `useLocalToday()` devuelve '' hasta que el efecto corre, y
 * `shift('')` daria 'NaN-NaN-NaN' en cada celda. La rejilla se pinta apagada igual, que es exactamente
 * la forma correcta de "todavia no se".
 */
export function heatGrid(stats: Stats | null, today: string, spec: HeatSpec = PROGRESS_HEAT): Cell[][] {
  const counts = new Map(
    stats?.byDay.map((day) => [day.date, spec.metric === 'planned' ? (day.planned ?? day.done) : day.done]) ??
      []
  );

  const cell = (date: string): Cell => {
    const count = counts.get(date) ?? 0;
    return {
      date,
      count,
      level: Math.min(count / spec.cap, 1),
      // Comparar cadenas 'YYYY-MM-DD' ya ordena por fecha.
      future: !!date && !!today && date > today,
      isToday: !!date && date === today,
    };
  };

  if (!spec.weekAligned) {
    // 7 dias corridos por fila, la ultima celda es HOY: queda en la esquina inferior derecha, que es
    // donde el ojo termina de leer y donde lo busca.
    const flat = Array.from({ length: spec.days }, (_, i) =>
      cell(today ? shift(today, i - (spec.days - 1)) : '')
    );
    return Array.from({ length: spec.days / 7 }, (_, r) => flat.slice(r * 7, (r + 1) * 7));
  }

  /*
    Alineado a la semana: la ULTIMA columna es la semana en curso, asi que la ventana termina el
    domingo de esta semana y no hoy. Sin eso las filas no serian dias de la semana y rotularlas
    mentiria — y de paso los dias que quedan de esta semana se ven como lo que son: futuro agendado.
  */
  const weeks = spec.days / 7;
  const start = today ? shift(mondayOf(today), -(weeks - 1) * 7) : '';

  return Array.from({ length: 7 }, (_, row) =>
    Array.from({ length: weeks }, (_, col) => cell(start ? shift(start, col * 7 + row) : ''))
  );
}

/**
 * La etiqueta de mes de cada columna, o '' si esa columna no abre mes.
 *
 * Se lee de la PRIMERA fila (los lunes): el mes de una columna es el de su lunes, y rotular por
 * cualquier otro dia correria la etiqueta a la columna de al lado a fin de mes.
 */
export function monthSpans(rows: Cell[][]): string[] {
  const mondays = rows[0] ?? [];
  let last = '';
  return mondays.map((cell) => {
    if (!cell.date) return '';
    const month = cell.date.slice(0, 7);
    if (month === last) return '';
    last = month;
    const [y, m] = cell.date.split('-').map(Number);
    return new Date(y, m - 1, 1).toLocaleDateString('es-MX', { month: 'short' }).replace('.', '');
  });
}

/**
 * Lo que lee un lector de pantalla de la rejilla, que como celdas sueltas no diria nada.
 *
 * `ready` distingue "no hay nada" de "todavia no llega": anunciar cero mientras carga es la misma
 * mentira que pintar un cero, solo que en voz alta.
 */
export function heatLabel(rows: Cell[][], ready: boolean, spec: HeatSpec = PROGRESS_HEAT): string {
  const cells = rows.flat();
  const weeks = Math.round(spec.days / 7);
  const span = `las últimas ${weeks} semanas`;

  if (!ready) return `Cargando ${span}.`;

  const active = cells.filter((cell) => cell.count > 0).length;
  const total = cells.reduce((sum, cell) => sum + cell.count, 0);

  if (spec.metric === 'planned') {
    if (!total) return `Sin nada agendado en ${span}.`;
    const busiest = Math.max(...cells.map((cell) => cell.count));
    return `${total} ${total === 1 ? 'tarea agendada' : 'tareas agendadas'} en ${active} días de ${span}. ${busiest} en el día más lleno.`;
  }

  if (!total) return `Sin nada cerrado en ${span}.`;
  return `${total} ${total === 1 ? 'tarea cerrada' : 'tareas cerradas'} en ${active} de ${cells.length} días.`;
}
