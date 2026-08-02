import { HEAT_NEUTRAL, WIDGET_PAPER, accentRamp } from '@/constants/theme';
import { mixHex } from '@/constants/color';
import type { Stats } from '@/features/auth/api';
import { QUARTER_HEAT, heatGrid, monthSpans } from '@/features/stats/grid';
import type { HeatWidgetProps } from '@/widgets/heat-widget';

/**
 * Cuantos pasos de color tiene la rampa del widget.
 *
 * Cuatro y no los seis del `cap` de `QUARTER_HEAT`: en una celda de 13pt vista de reojo en la
 * pantalla de inicio, seis tonos del mismo color no se distinguen — cuatro si, y con `cap: 6` el
 * reparto queda 1,2,2,3,4,4, que sube rapido al principio (que es donde importa: uno contra ninguno)
 * y se aplana arriba.
 */
const STEPS = 4;

/**
 * El nivel discreto de una celda, 0..STEPS.
 *
 * `Math.max(1, ...)` es la pieza que importa: un dia con UNA cosa tiene que verse, y con el
 * redondeo natural `1/6` de la rampa caia en cero — o sea que un dia trabajado se pintaba igual que
 * uno vacio. Es la misma correccion que la app hace metiendo el vacio FUERA de la interpolacion.
 */
const stepOf = (count: number, cap: number) =>
  count === 0 ? 0 : Math.max(1, Math.ceil(Math.min(count / cap, 1) * STEPS));

/**
 * La rampa entera, cocida aqui.
 *
 * Se manda hecha y no como dos extremos porque el layout no puede interpolar colores: corre en un
 * JSContext pelado dentro de la extension, sin el tema y sin `mixHex`. Y el paso 0 —el dia vacio— NO
 * sale de la interpolacion: va aparte, igual que en `heat-map.tsx`. Interpolar desde el neutro daria
 * grises sucios en los primeros pasos en vez de tinte del acento.
 */
const rampOf = (soft: string, solid: string, empty: string) => {
  const out = [empty];
  for (let i = 1; i <= STEPS; i++) out.push(mixHex(soft, solid, (i - 1) / (STEPS - 1)));
  return out;
};

/**
 * El mapa de calor, aplanado para el widget.
 *
 * `heatGrid` se reutiliza tal cual — es puro, no importa React ni react-native, y ya rellena los dias
 * que el API omite. Lo unico que se hace aqui es **aplanar por FECHA y no por fila**: asi el futuro
 * queda como un sufijo contiguo y el layout lo resuelve con `i > todayIndex`, sin tocar una sola
 * fecha. Eso no es una comodidad: `grid.ts` parte las fechas con destructuring de array, y babel lo
 * convierte en un helper de modulo que la extension no tiene.
 *
 * Con `stats` en null la rejilla sale entera en ceros, que es la forma correcta de decir "todavia no
 * se" — por eso quien llama empuja igual en vez de saltarse el widget.
 */
export const toHeatProps = (
  stats: Stats | null,
  today: string,
  accent: string | null
): HeatWidgetProps => {
  const rows = heatGrid(stats, today, QUARTER_HEAT);
  const weeks = rows[0]?.length ?? 0;

  const levels: number[] = [];
  let todayIndex = -1;
  let busiest = 0;
  let total = 0;

  // Orden de FECHA: la celda [fila][columna] de `heatGrid` es el dia `columna * 7 + fila`.
  for (let week = 0; week < weeks; week++) {
    for (let day = 0; day < rows.length; day++) {
      const cell = rows[day][week];
      const count = cell?.count ?? 0;
      if (cell?.isToday) todayIndex = week * 7 + day;
      if (count > busiest) busiest = count;
      total += count;
      levels.push(stepOf(count, QUARTER_HEAT.cap));
    }
  }

  const ramp = accentRamp(accent);

  return {
    levels,
    weeks,
    steps: STEPS,
    months: monthSpans(rows),
    todayIndex,
    total,
    busiest,
    palette: rampOf(ramp.soft, ramp.solid, HEAT_NEUTRAL.empty),
    paletteDark: rampOf(ramp.softDark, ramp.solidDark, HEAT_NEUTRAL.emptyDark),
    future: HEAT_NEUTRAL.future,
    futureDark: HEAT_NEUTRAL.futureDark,
    bg: WIDGET_PAPER.light,
    bgDark: WIDGET_PAPER.dark,
  };
};
