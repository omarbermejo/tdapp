import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Radius, Space, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';

import { PROGRESS_HEAT, heatGrid, heatLabel, monthSpans, type Cell, type HeatSpec } from './grid';
import type { useStats } from './use-stats';

/** La celda entra escalonada como el punto de la racha, pero mas rapido: son decenas, no siete. */
const ENTER = { duration: Motion.enter, easing: Easing.out(Easing.cubic) } as const;
const STEP = Motion.step / 3;

/** El aro de hoy. 1.5pt se ve a 13pt de celda sin comerse el relleno. */
const RING = 1.5;

/**
 * Una celda del mapa.
 *
 * Sin borde y sin tamaño fijo, al reves que el `Dot` de la racha: alli cuatro estados tenian que
 * distinguirse por FORMA, aqui solo hay intensidad. Y el tamaño sale de `flex` porque la rejilla vive
 * en media pantalla — en un telefono chico cada celda cae a unos trece puntos y tiene que encogerse
 * sola en vez de desbordar.
 *
 * **El relleno cruza de color y NUNCA usa `opacity`.** En React Native la opacidad compone la vista
 * COMPLETA, borde incluido, asi que un aro de hoy dentro de una celda al 30% se veria al 30% — y esa
 * es justo la señal que no puede desvanecerse. Por eso el futuro tambien se distingue por TONO
 * (`sunken` mezclado hacia el papel) y no bajando la opacidad, y el aro va en una vista HERMANA.
 */
function HeatCell({
  cell,
  index,
  tint,
  animate,
  ring,
}: {
  cell: Cell;
  index: number;
  tint: { solid: string; soft: string; ink: string };
  animate: boolean;
  /** Marcar hoy con un aro. Solo el mapa alineado a la semana lo pide: en el otro, hoy es la ultima. */
  ring: boolean;
}) {
  const t = useTheme();
  const enter = useSharedValue(animate ? 0 : 1);
  // El relleno se anima aparte de la entrada: cerrar una tarea y volver aqui tiñe su celda, y eso
  // tiene que verse pasar.
  const fill = useSharedValue(cell.level);

  useEffect(() => {
    if (!animate) return;
    // .set() y no .value =: el compilador de React trata el shared value como inmutable.
    enter.set(withDelay(index * STEP, withTiming(1, ENTER)));
  }, [animate, index, enter]);

  useEffect(() => {
    fill.set(animate ? withTiming(cell.level, ENTER) : cell.level);
  }, [cell.level, animate, fill]);

  /*
    `sunken` es literalmente el relleno apagado del sistema, asi que un dia en blanco no es un agujero
    sino una casilla que existe y esta vacia. El futuro arranca de `surface`, un paso mas claro: se
    lee como "todavia no" y no como "aqui no hiciste nada", que es la misma distincion que la racha
    hace entre `ahead` y `missed`.
  */
  const empty = cell.future ? t.surface : t.sunken;

  /*
    La rampa va `soft` -> `solid`, y el vacio se queda FUERA de ella.

    Antes interpolaba `sunken` -> `solid` directo, y con un acento oscuro eso pintaba gris: en claro
    `forest.solid` es `blackForest[500]`, un verde casi negro, y el camino en RGB desde un beige calido
    hasta ahi pasa por el gris. Un dia con una tarea (nivel 0.5 con tope 2) caia exactamente en el
    punto mas turbio, asi que el mapa de un espacio se veia gris aunque el color estuviera aplicado.

    Con el vacio en su propia parada y la rampa entera dentro de la familia del acento —de su tinte
    claro a su tono lleno— todos los pasos intermedios son del mismo color. Es el modelo de GitHub:
    una casilla neutra para el cero y cuatro tonos del MISMO color para el resto.

    El 0.001 es lo que separa las dos cosas: por debajo es "no hay nada", desde ahi arriba es color.
  */
  const style = useAnimatedStyle(
    () => ({
      opacity: enter.get(),
      backgroundColor: interpolateColor(
        fill.get(),
        [0, 0.001, 1],
        [empty, tint.soft, tint.solid]
      ),
    }),
    [empty, tint.soft, tint.solid]
  );

  return (
    <View style={styles.slot}>
      <Animated.View style={[styles.cell, style]} />
      {/* Hermana y absoluta: encima del relleno, con su propia opacidad intacta. */}
      {ring && cell.isToday && (
        <View pointerEvents="none" style={[styles.ring, { borderColor: tint.ink }]} />
      )}
    </View>
  );
}

/**
 * Un mapa de calor de densidad diaria. Dos configuraciones, un componente.
 *
 * - `PROGRESS_HEAT` (el default, en Perfil): cuatro semanas de trabajo CERRADO en 4x7. NO es un
 *   calendario del mes — un mes real casi nunca cabe en cuatro filas y el dia 3 estaria en blanco al
 *   noventa por ciento. Son 28 dias corridos que terminan hoy, que ademas es la ventana que el API
 *   devuelve por defecto. Sin iniciales de dia de la semana a proposito: la primera columna no es
 *   lunes, asi que rotularlas seria mentir.
 * - `QUARTER_HEAT` (en Hoy): el trimestre AGENDADO en 7x17, alineado a la semana. Aqui las filas SI
 *   son dias de la semana, asi que van rotuladas, y hoy lleva aro porque ya no es la ultima celda.
 *
 * Es de solo lectura y no se toca. Una celda de trece puntos esta muy por debajo de `Touch.icon` (44)
 * y hacerla tocable seria prometer un objetivo que el pulgar no acierta; quien cambia el dia es la
 * tira de la semana, con celdas de 34. Eso resuelve de paso la accesibilidad: la rejilla es UN nodo
 * con un resumen —el patron de `weekLabel` en la racha— y no ciento diecinueve.
 */
export function HeatMap({
  stats: data,
  today,
  accent,
  spec = PROGRESS_HEAT,
}: {
  stats: ReturnType<typeof useStats>;
  today: string;
  accent: AccentName;
  spec?: HeatSpec;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const still = useReducedMotion();
  const { stats, loading } = data;

  const rows = heatGrid(stats, today, spec);
  // Mientras carga se pintan las celdas apagadas y sin animar: la rejilla vacia YA es la forma
  // correcta del estado de carga, y un spinner en media pantalla seria mas ruido que dato. Lo que no
  // se hace es animarlas, para que la entrada escalonada ocurra cuando llegan los datos de verdad.
  const ready = !loading && !!stats;
  const aligned = spec.weekAligned;
  const months = aligned ? monthSpans(rows) : [];

  return (
    <View accessible accessibilityLabel={heatLabel(rows, ready, spec)} style={styles.wrap}>
      {aligned && (
        <View style={styles.months}>
          {/* Hueco del riel de iniciales, para que las etiquetas caigan sobre su columna. */}
          <View style={styles.rail} />
          {/*
            Las etiquetas van ABSOLUTAS sobre un riel, no en columnas a `flex: 1`.
            Con flex, cada una recibia el ancho de UNA celda (~13pt) y "ago" salia como "a…" — el mes
            necesita tres caracteres y la columna mide uno. Absolutas, arrancan en su columna y se
            desbordan hacia la derecha sobre las siguientes, que estan vacias justo hasta el mes que
            viene.
          */}
          <View style={styles.monthRail}>
            {months.map((label, i) =>
              label ? (
                <Text
                  key={i}
                  style={[
                    Type.micro,
                    styles.month,
                    { color: t.textMuted, left: `${(i / months.length) * 100}%` },
                  ]}>
                  {label}
                </Text>
              ) : null
            )}
          </View>
        </View>
      )}

      <View style={styles.grid}>
        {/*
          La posicion es la llave y no la fecha: la rejilla siempre tiene la misma forma, las celdas
          nunca se reordenan, y `useLocalToday()` devuelve '' hasta que ancla — con lo que todas las
          fechas saldrian iguales y React se quejaria de llaves repetidas en el primer render.
        */}
        {rows.map((row, r) => (
          <View key={r} style={styles.row}>
            {aligned && (
              // Solo lunes, miercoles y viernes: siete iniciales en 13pt de alto se pisan entre si, y
              // tres bastan para orientar la vertical. Es el mismo recurso que usa GitHub.
              <Text style={[Type.micro, styles.rail, { color: t.textMuted }]} numberOfLines={1}>
                {r % 2 === 0 ? ['L', 'M', 'V', 'D'][r / 2] : ''}
              </Text>
            )}
            {row.map((cell, c) => (
              <HeatCell
                key={c}
                cell={ready ? cell : { ...cell, level: 0 }}
                // Escalona por COLUMNA en el alineado: 17 columnas se barren de izquierda a derecha en
                // ~170ms, mientras que escalonar las 119 celdas una por una tardaria mas de un segundo.
                index={aligned ? c : r * row.length + c}
                tint={tint}
                animate={ready && !still}
                ring={aligned}
              />
            ))}
          </View>
        ))}
      </View>
    </View>
  );
}

/** Ancho del riel de iniciales. Cabe una letra de `micro` sin empujar la rejilla. */
const RAIL = 14;

/**
 * 3pt y no `Space.xs` (4): con 17 columnas, un punto mas de aire por hueco se come 16pt del ancho y
 * las celdas caen por debajo de los 13 en un telefono chico. En 4x7 la diferencia no se nota, asi que
 * el numero es uno solo para los dos mapas.
 */
const GAP = 3;

const styles = StyleSheet.create({
  wrap: { gap: Space.xs },
  grid: { gap: GAP },
  row: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  months: { flexDirection: 'row', gap: GAP },
  rail: { width: RAIL },
  // El riel ocupa lo mismo que la rejilla; las etiquetas se colocan dentro por porcentaje.
  monthRail: { flex: 1, height: Type.micro.lineHeight },
  month: { position: 'absolute', top: 0 },
  // flex + aspectRatio y no un tamaño en puntos: la rejilla ocupa el ancho que le den y tiene que
  // caber igual en un SE que en un Max.
  slot: { flex: 1, aspectRatio: 1 },
  cell: { flex: 1, borderRadius: Radius.sm },
  ring: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    borderRadius: Radius.sm,
    borderWidth: RING,
  },
});
