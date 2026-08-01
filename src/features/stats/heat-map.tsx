import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Radius, Space, useAccent, useTheme, type AccentName } from '@/constants/theme';

import { GRID_COLUMNS, heatGrid, heatLabel, type Cell } from './grid';
import type { useStats } from './use-stats';

/** La celda entra escalonada como el punto de la racha, pero mas rapido: son veintiocho, no siete. */
const ENTER = { duration: Motion.enter, easing: Easing.out(Easing.cubic) } as const;
const STEP = Motion.step / 3;

/**
 * Una celda del mapa.
 *
 * Sin borde y sin tamaño fijo, al reves que el `Dot` de la racha: alli cuatro estados tenian que
 * distinguirse por FORMA, aqui solo hay intensidad. Y el tamaño sale de `flex` porque la rejilla vive
 * en media pantalla — en un telefono chico cada celda cae a unos dieciocho puntos y tiene que
 * encogerse sola en vez de desbordar.
 */
function HeatCell({
  level,
  index,
  tint,
  animate,
}: {
  level: number;
  index: number;
  tint: { solid: string; soft: string; ink: string };
  animate: boolean;
}) {
  const t = useTheme();
  const enter = useSharedValue(animate ? 0 : 1);
  // El relleno se anima aparte de la entrada: cerrar una tarea en el home y volver aqui tiñe la
  // ultima celda, y eso tiene que verse pasar.
  const fill = useSharedValue(level);

  useEffect(() => {
    if (!animate) return;
    // .set() y no .value =: el compilador de React trata el shared value como inmutable.
    enter.set(withDelay(index * STEP, withTiming(1, ENTER)));
  }, [animate, index, enter]);

  useEffect(() => {
    fill.set(animate ? withTiming(level, ENTER) : level);
  }, [level, animate, fill]);

  const style = useAnimatedStyle(
    () => ({
      opacity: enter.get(),
      // `sunken` es literalmente el relleno apagado del sistema, asi que un dia en blanco no es un
      // agujero sino una casilla que existe y esta vacia.
      backgroundColor: interpolateColor(fill.get(), [0, 1], [t.sunken, tint.solid]),
    }),
    [t.sunken, tint.solid]
  );

  return <Animated.View style={[styles.cell, style]} />;
}

/**
 * Cuatro semanas de trabajo cerrado, en 4x7.
 *
 * NO es un calendario del mes: un mes real casi nunca cabe en cuatro filas — solo un febrero no
 * bisiesto que empiece en lunes — y el dia 3 la rejilla estaria en blanco al noventa por ciento. Son
 * 28 dias corridos que terminan hoy, que ademas es exactamente la ventana que el API devuelve por
 * defecto. Hoy queda en la esquina inferior derecha, donde el ojo termina de leer.
 *
 * Sin iniciales de dia de la semana a proposito: la primera columna no es lunes, asi que rotularlas
 * seria mentir. Esto mide densidad, no calendario; para leer "los martes rindo mas" esta la fila de
 * siete de la racha.
 */
export function HeatMap({
  stats: data,
  today,
  accent,
}: {
  stats: ReturnType<typeof useStats>;
  today: string;
  accent: AccentName;
}) {
  const tint = useAccent(accent);
  const still = useReducedMotion();
  const { stats, loading } = data;

  const cells = heatGrid(stats, today);
  // Mientras carga se pintan las celdas apagadas y sin animar: la rejilla vacia YA es la forma
  // correcta del estado de carga, y un spinner en media pantalla seria mas ruido que dato. Lo que no
  // se hace es animarlas, para que la entrada escalonada ocurra cuando llegan los datos de verdad.
  const ready = !loading && !!stats;

  return (
    <View accessible accessibilityLabel={heatLabel(cells)} style={styles.grid}>
      {chunk(cells).map((week, row) => (
        <View key={week[0].date} style={styles.row}>
          {week.map((cell, column) => (
            <HeatCell
              key={cell.date}
              level={ready ? cell.level : 0}
              index={row * GRID_COLUMNS + column}
              tint={tint}
              animate={ready && !still}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

/** Las 28 celdas partidas en filas de siete. */
const chunk = (cells: Cell[]): Cell[][] =>
  Array.from({ length: cells.length / GRID_COLUMNS }, (_, i) =>
    cells.slice(i * GRID_COLUMNS, (i + 1) * GRID_COLUMNS)
  );

const styles = StyleSheet.create({
  grid: { gap: Space.xs },
  row: { flexDirection: 'row', gap: Space.xs },
  // flex + aspectRatio y no un tamaño en puntos: la rejilla ocupa la mitad de la cabecera y tiene
  // que caber igual en un SE que en un Max.
  cell: { flex: 1, aspectRatio: 1, borderRadius: Radius.sm },
});
