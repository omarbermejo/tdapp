import { Capsule, HStack, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundColor, frame, lineLimit, opacity, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * Props planas y primitivas a proposito: cruzan al proceso de la extension por `JSON.stringify`, y
 * objetos anidados o `Date` no sobreviven el viaje. Todo el formateo se hace en la app antes de
 * mandar el snapshot — el widget solo pinta.
 */
export type TodayWidgetProps = {
  /** '' cuando no queda nada pendiente. */
  nextTitle: string;
  /** '18:00' o 'sin hora'. Vacio si no hay siguiente. */
  nextTime: string;
  pending: number;
  done: number;
  /** Titulo de la tarea con el cronometro corriendo, '' si ninguna. */
  running: string;
  /**
   * Las siguientes pendientes, para `systemLarge`. Van planas: 'titulo' y 'hora' en dos arrays
   * paralelos porque un array de objetos tambien cruza, pero asi el layout no tiene que desestructurar
   * nada — y en un JSContext pelado cada linea de mas es una linea que puede fallar.
   */
  soonTitles: string[];
  soonTimes: string[];
  /** Los dos pasos del acento; cual se usa lo decide el esquema en que se dibuja el widget. */
  tint: string;
  tintDark: string;
};

/**
 * "Tu día" en la pantalla de inicio: que sigue y cuanto falta.
 *
 * Es la respuesta a "¿en que estaba?" sin abrir la app, que para TDAH es justo donde se pierde el
 * hilo. Por eso lo primero y mas grande es UNA tarea, no una lista: un widget con siete pendientes
 * reproduce la misma paralisis que la app.
 *
 * La barra segmentada es el mismo idioma que la `DayCard` de la app: un segmento por tarea en vez de
 * un porcentaje, porque con pocas tareas al dia "3 de 5" y cinco pastillas dicen lo mismo y un 60% no
 * dice ninguna. Aqui los segmentos no llevan el color de su foco (el widget no recibe los focos) pero
 * si el escalon de lleno/vacio, que es lo que se lee de reojo.
 *
 * El layout se serializa como fuente y se evalua suelto: NO captura nada de fuera de su propia
 * funcion. Helpers y constantes van dentro.
 */
const TodayWidget = (props: TodayWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const family = environment.widgetFamily;
  const small = family === 'systemSmall';
  const large = family === 'systemLarge';
  const rectangular = family === 'accessoryRectangular';
  const inline = family === 'accessoryInline';
  const lock = rectangular || inline;

  // En la pantalla de bloqueo el sistema pinta monocromo: un color propio se ignora o se ve sucio.
  const ink = lock ? undefined : environment.colorScheme === 'dark' ? props.tintDark : props.tint;
  const paint = ink ? [foregroundColor(ink)] : [];

  const total = props.done + props.pending;
  const hasNext = props.nextTitle.length > 0;
  // Lo que corre gana a lo que sigue: si hay cronometro, ESO es en lo que estas.
  const headline = props.running || (hasNext ? props.nextTitle : 'Nada pendiente');
  const open = widgetURL('tdapp:///');

  if (inline) {
    return <Text modifiers={[open]}>{total === 0 ? 'Nada hoy' : `${props.done}/${total} · ${headline}`}</Text>;
  }

  /**
   * La barra segmentada. Se corta a ocho: con un dia largo los segmentos se vuelven mas finos que el
   * aire que los separa y la barra deja de leerse como progreso. Los llenos van primero para que el
   * escalon sea uno solo — salpicados no se leen (es la misma decision que `filledFirst` en la app).
   */
  const bar = (height: number, cap: number) => {
    const shown = Math.min(total, cap);
    return (
      <HStack spacing={3}>
        {Array.from({ length: shown }, (_, i) => (
          <Capsule
            key={i}
            modifiers={[
              frame({ height }),
              opacity(i < props.done ? 1 : 0.22),
              ...(ink ? [foregroundColor(ink)] : [foregroundColor('secondary')]),
            ]}
          />
        ))}
      </HStack>
    );
  };

  if (rectangular) {
    // Filas planas en un solo VStack: anidar stacks colapsa en la pantalla de bloqueo real.
    return (
      <VStack spacing={2} modifiers={[open]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
          {total === 0 ? 'NADA HOY' : `${props.done}/${total}`}
        </Text>
        <Text modifiers={[font({ size: 14, weight: 'semibold' }), lineLimit(1)]}>{headline}</Text>
        {total > 0 && bar(4, 8)}
      </VStack>
    );
  }

  // --- pantalla de inicio ---
  return (
    <VStack spacing={6} modifiers={[open]}>
      <HStack>
        <Text
          modifiers={[
            font({ size: 11, weight: 'semibold' }),
            foregroundColor('secondary'),
            lineLimit(1),
          ]}>
          {props.running ? 'AHORA' : 'LO QUE SIGUE'}
        </Text>
        <Spacer />
        {!small && total > 0 && (
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              lineLimit(1),
              ...paint,
            ]}>
            {`${props.done}/${total}`}
          </Text>
        )}
      </HStack>

      {/* lineLimit(1) en las filas de al lado, no aqui: este es el titular y si tiene que ocupar dos
          o tres lineas, las ocupa. */}
      <Text
        modifiers={[
          font({ size: small ? 17 : 20, weight: 'bold', design: 'rounded' }),
          lineLimit(small ? 3 : 2),
        ]}>
        {headline}
      </Text>

      <Spacer />

      {total > 0 && bar(small ? 5 : 6, 8)}

      <Text modifiers={[font({ size: 13 }), foregroundColor('secondary'), lineLimit(1)]}>
        {props.running
          ? 'Cronómetro corriendo'
          : hasNext
            ? props.nextTime
            : `${props.done} hechas hoy`}
      </Text>

      {/*
        Las siguientes SOLO en el grande. En el mediano caben pero no deben: el widget existe para
        enseñar UNA cosa, y una lista de tres compite con el titular. En el grande sobra el espacio y
        entonces si ayuda a saber que viene despues.
      */}
      {large && props.soonTitles.length > 0 && (
        <VStack spacing={4}>
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              foregroundColor('secondary'),
              lineLimit(1),
            ]}>
            DESPUÉS
          </Text>
          {props.soonTitles.map((title, i) => (
            <HStack key={i} spacing={8}>
              <Text modifiers={[font({ size: 14, weight: 'medium' }), lineLimit(1)]}>{title}</Text>
              <Spacer />
              <Text
                modifiers={[
                  font({ size: 13 }),
                  foregroundColor('secondary'),
                  lineLimit(1),
                ]}>
                {props.soonTimes[i]}
              </Text>
            </HStack>
          ))}
        </VStack>
      )}
    </VStack>
  );
};

export default createWidget<TodayWidgetProps>('TodayWidget', TodayWidget);
