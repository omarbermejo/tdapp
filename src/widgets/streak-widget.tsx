import { Circle, HStack, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundColor, frame, lineLimit, opacity, widgetURL } from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

export type StreakWidgetProps = {
  /** Dias seguidos cerrando algo. Hoy sin cerrar nada NO lo rompe (ver domain/streak.js del API). */
  days: number;
  /** La mejor marca del historial. Es el numero que da algo que superar. */
  best: number;
  /**
   * Lunes a domingo. Siete valores SIEMPRE, con 0 en los dias sin nada — el layout no puede rellenar
   * huecos porque no sabe en que dia vive el usuario.
   */
  week: number[];
  /** Iniciales de los dias, en el orden de `week`. Vienen de la app: la locale no cruza. */
  labels: string[];
  /** Cual de los siete es hoy, 0..6. -1 si por lo que sea no cae en la semana. */
  todayIndex: number;
  tint: string;
  tintDark: string;
};

/**
 * La racha: cuantos dias seguidos cerraste algo, y como va esta semana.
 *
 * Existe porque es el unico numero de la app que premia la CONSTANCIA en vez del volumen. Y por eso
 * el API la calcula sin castigar: el dia de hoy no cuenta hasta que cierras algo, pero tampoco la
 * rompe — una racha que se pone en cero a las 00:01 es exactamente el mensaje que hace que alguien con
 * TDAH abandone la app.
 *
 * El punteo son circulos y no barras: lo que se lee de un vistazo es "cuantos dias", no "cuanto".
 *
 * El layout se serializa como fuente y se evalua suelto: NO captura nada de fuera. Todo vive dentro
 * de la funcion o llega por props.
 */
const StreakWidget = (props: StreakWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const family = environment.widgetFamily;
  const rectangular = family === 'accessoryRectangular';
  const inline = family === 'accessoryInline';
  const lock = rectangular || inline;

  // En la pantalla de bloqueo el sistema pinta monocromo: un color propio se ignora o se ve sucio.
  const ink = lock ? undefined : environment.colorScheme === 'dark' ? props.tintDark : props.tint;
  const paint = ink ? [foregroundColor(ink)] : [];

  const label = props.days === 1 ? '1 día' : `${props.days} días`;
  const open = widgetURL('tdapp:///');

  if (inline) {
    return <Text modifiers={[open]}>{`Racha: ${label}`}</Text>;
  }

  /**
   * Los puntos de la semana. Un `Circle` es HOJA en el renderer de widgets (no propaga hijos), asi que
   * solo lleva tamaño y opacidad — el dia que toca se distingue por estar lleno, no por un numero
   * dentro.
   *
   * El de hoy sin cerrar nada se pinta a medias: ni apagado (parece que fallaste) ni lleno (seria
   * mentira). Es el mismo criterio que el API usa para no romper la racha.
   */
  const dot = (index: number, size: number) => {
    const closed = props.week[index] > 0;
    const isToday = index === props.todayIndex;
    return (
      <Circle
        key={index}
        modifiers={[
          frame({ width: size, height: size }),
          opacity(closed ? 1 : isToday ? 0.45 : 0.18),
          ...(lock ? [] : [foregroundColor(closed || isToday ? (ink as string) : 'secondary')]),
        ]}
      />
    );
  };

  if (rectangular) {
    // Filas planas en un solo VStack: anidar stacks colapsa en la pantalla de bloqueo real.
    return (
      <VStack spacing={2} modifiers={[open]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
          {`RACHA · ${label}`}
        </Text>
        <HStack spacing={4}>{props.week.map((_, i) => dot(i, 8))}</HStack>
      </VStack>
    );
  }

  // --- pantalla de inicio ---
  const small = family === 'systemSmall';

  return (
    <VStack spacing={small ? 6 : 8} modifiers={[open]}>
      <Text
        modifiers={[
          font({ size: 11, weight: 'semibold' }),
          foregroundColor('secondary'),
          lineLimit(1),
        ]}>
        RACHA
      </Text>

      <Text modifiers={[font({ size: small ? 30 : 34, weight: 'bold', design: 'rounded' }), ...paint]}>
        {label}
      </Text>

      <HStack spacing={small ? 5 : 7}>{props.week.map((_, i) => dot(i, small ? 9 : 11))}</HStack>

      {!small && (
        <HStack spacing={small ? 5 : 7}>
          {props.labels.map((day, i) => (
            <Text
              key={i}
              modifiers={[font({ size: 10, weight: 'medium' }), foregroundColor('secondary')]}>
              {day}
            </Text>
          ))}
        </HStack>
      )}

      <Text modifiers={[font({ size: 11 }), foregroundColor('secondary'), lineLimit(1)]}>
        {/* La mejor marca solo cuando ya la superaste o la estas persiguiendo: en una cuenta nueva un
            "tu mejor: 0" no dice nada. */}
        {props.best > props.days ? `Tu mejor: ${props.best}` : props.days > 0 ? 'Es tu mejor racha' : 'Cierra algo hoy'}
      </Text>
    </VStack>
  );
};

export default createWidget<StreakWidgetProps>('StreakWidget', StreakWidget);
