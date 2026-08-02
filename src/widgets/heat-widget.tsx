import { HStack, RoundedRectangle, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundColor,
  frame,
  lineLimit,
  opacity,
  padding,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * Props planas y primitivas a proposito: cruzan al proceso de la extension por `JSON.stringify`, y
 * objetos anidados o `Date` no sobreviven el viaje.
 */
export type HeatWidgetProps = {
  /**
   * Un entero 0..`steps` por dia, en orden de FECHA — `levels[0]` es el lunes de hace 17 semanas.
   *
   * En orden de fecha y NO de fila, aunque la rejilla se pinte por filas. Asi el futuro es un sufijo
   * contiguo (`i > todayIndex`) y el layout lo resuelve con una comparacion. Es obligatorio: el
   * layout NO PUEDE tocar fechas — `grid.ts` las parte con `const [y, m, d] = date.split('-')`, y
   * babel convierte eso en `_slicedToArray`, un helper de modulo que la extension no tiene.
   */
  levels: number[];
  /** Columnas de la rejilla. Siete filas siempre: una por dia de la semana. */
  weeks: number;
  /** Cuantos pasos de color tiene la rampa, sin contar el vacio. */
  steps: number;
  /** Una entrada por columna; '' donde la columna no abre mes. Resueltas con la locale de la app. */
  months: string[];
  /** Indice de hoy dentro de `levels`. -1 si no cae; todo lo posterior es futuro. */
  todayIndex: number;
  /** Cerradas en la ventana, y el mejor dia. Solo se pintan en `systemLarge`. */
  total: number;
  busiest: number;
  /**
   * `steps + 1` colores: `[0]` es el dia vacio y `[1..steps]` la rampa de soft a solid.
   *
   * La rampa viaja YA COCIDA porque el layout no puede resolver un acento — vive en otro proceso, sin
   * el tema. Aqui solo se hace `palette[level]`, que es una indexacion y no una decision.
   */
  palette: string[];
  paletteDark: string[];
  /** El dia que todavia no llega. Distinto del vacio: uno dice "no hiciste" y el otro "todavia no". */
  future: string;
  futureDark: string;
  /** El papel de la baldosa, un paso por esquema. Sale de `WIDGET_PAPER` en la app. */
  bg: string;
  bgDark: string;
};

/**
 * El mapa de calor del inicio, en la pantalla de inicio del telefono.
 *
 * Es el unico widget que no dice que TOCA hacer: dice que has hecho. Y por eso vale la pena — la
 * racha es un numero y el dia es una lista, pero un trimestre entero solo se lee como forma.
 *
 * **Solo `systemMedium` y `systemLarge`.** La pequeña queda fuera por aritmetica: diecisiete columnas
 * en los 126pt utiles de una baldosa chica dan celdas de 5.2pt, por debajo de donde una rejilla se
 * lee como rejilla. Y las `accessory*` quedan fuera por producto: ahi iOS aplana todo a un tinte
 * monocromo, y un mapa cuyo significado ENTERO es la rampa de color se convierte en 119 cuadrados
 * identicos. Es peor que no estar.
 *
 * **Alto fijo, ancho flexible**, que es lo que lo hace caber en cualquier telefono. Un
 * `RoundedRectangle` sin `frame` de ancho es infinitamente flexible y un `HStack` reparte el ancho
 * entre sus hermanos a partes iguales — el equivalente exacto del `flex: 1` que usa la app. Asi el
 * eje vertical, que es el escaso, lo controlamos nosotros y nunca desborda; y el horizontal lo
 * reparte SwiftUI y tampoco. El precio es que en un Pro Max las celdas salen un tercio mas anchas
 * que altas; la alternativa dejaba 75pt de hueco muerto a la derecha.
 *
 * El layout se serializa como fuente y se evalua suelto: NO captura nada de fuera de su propia
 * funcion. Helpers y constantes van dentro.
 */
const HeatWidget = (props: HeatWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  /**
   * Los props, con suelo. Sin esto la baldosa sale EN BLANCO: `placeholder(in:)` pasa `props: nil` y
   * `EntryView` evalua con `{}`, o sea que la galeria y todo arranque en frio entran por aqui sin
   * datos — y `levels.map` sobre `undefined` lanza. En Release el error no se ve: se cae en
   * `EmptyView()`. Es el mismo suelo que hay en `today-widget` y por el mismo motivo.
   */
  const p: HeatWidgetProps = Object.assign(
    {
      levels: [],
      weeks: 17,
      steps: 4,
      months: [],
      todayIndex: -1,
      total: 0,
      busiest: 0,
      palette: ['#eeeeee'],
      paletteDark: ['#222222'],
      future: '#f7f7f7',
      futureDark: '#111111',
      bg: 'white',
      bgDark: 'black',
    },
    props
  );

  const family = environment.widgetFamily;
  const large = family === 'systemLarge';
  const dark = environment.colorScheme === 'dark';

  /**
   * El fondo del contenedor, y sin esto el widget NO SE DIBUJA — ver el docstring largo en
   * `today-widget`. Aqui no hay ramas `accessory*`, asi que siempre lleva papel.
   */
  const paper = containerBackground(dark ? p.bgDark : p.bg, 'widget');
  const open = widgetURL('tdapp:///');

  const ramp = dark ? p.paletteDark : p.palette;
  const nothing = dark ? p.futureDark : p.future;
  /** Pantalla siempre encendida: el sistema pide apagar las formas macizas, y esto son 119. */
  const dim = environment.isLuminanceReduced ? 0.55 : 1;

  /** Alto de una celda. El ancho lo reparte el `HStack`; ver el docstring de arriba. */
  const cell = large ? 16 : 13;
  const gap = 2;

  /**
   * Una columna: siete dias de la misma semana, de lunes a domingo.
   *
   * Se indexa `week * 7 + day` porque `levels` va en orden de FECHA. Un dia posterior a hoy se pinta
   * con `nothing` y no con `ramp[0]`: son dos vacios distintos.
   */
  const column = (week: number) => (
    <VStack key={week} spacing={gap}>
      {[0, 1, 2, 3, 4, 5, 6].map((day) => {
        const at = week * 7 + day;
        const level = p.levels[at] ?? 0;
        const later = p.todayIndex >= 0 && at > p.todayIndex;
        return (
          <RoundedRectangle
            key={day}
            cornerRadius={3}
            modifiers={[
              frame({ height: cell }),
              foregroundColor(later ? nothing : (ramp[level] ?? ramp[0])),
              opacity(dim),
            ]}
          />
        );
      })}
    </VStack>
  );

  /**
   * El riel de meses. Una etiqueta por columna, vacia donde no abre mes.
   *
   * El `frame` va en el `HStack` que envuelve al `<Text>` y NUNCA en el texto: en este renderer los
   * modifiers de un `<Text>` se aplican DOS VECES, y un `frame` duplicado sobre un texto fue la causa
   * de cuatro crashes de layout. Ver `focus-activity`.
   */
  const rail = (
    <HStack spacing={gap}>
      {p.months.map((label, i) => (
        <HStack key={i} modifiers={[frame({ height: 11 })]}>
          <Text
            modifiers={[
              font({ size: 9, weight: 'semibold' }),
              foregroundColor('secondary'),
              lineLimit(1),
            ]}>
            {label}
          </Text>
          <Spacer />
        </HStack>
      ))}
    </HStack>
  );

  const weeks: number[] = [];
  for (let i = 0; i < p.weeks; i++) weeks.push(i);

  return (
    <VStack
      alignment="leading"
      spacing={6}
      // Los margenes son NUESTROS: `contentMarginsDisabled` los quita, y los 16pt de iOS se comian
      // el 11% del ancho util y el 22% del alto en la baldosa media.
      modifiers={[padding({ horizontal: 12, vertical: 10 }), open, paper]}>
      {large && (
        <Text
          modifiers={[
            font({ size: 11, weight: 'semibold' }),
            foregroundColor('secondary'),
            lineLimit(1),
          ]}>
          TU TRIMESTRE
        </Text>
      )}

      {rail}

      <HStack spacing={gap}>{weeks.map((week) => column(week))}</HStack>

      {/*
        Las cifras solo en la grande. En la mediana no caben sin robarle alto a las celdas, y el
        widget existe para enseñar la FORMA — un numero al pie no es lo que se viene a leer.
      */}
      {large && (
        <VStack alignment="leading" spacing={2}>
          <Spacer />
          <Text modifiers={[font({ size: 22, weight: 'bold', design: 'rounded' }), lineLimit(1)]}>
            {`${p.total} cerradas`}
          </Text>
          <Text modifiers={[font({ size: 12 }), foregroundColor('secondary'), lineLimit(1)]}>
            {p.busiest > 0 ? `Tu mejor día: ${p.busiest}` : 'Cierra algo y empieza a pintarse'}
          </Text>
        </VStack>
      )}
    </VStack>
  );
};

export default createWidget<HeatWidgetProps>('HeatWidget', HeatWidget);
