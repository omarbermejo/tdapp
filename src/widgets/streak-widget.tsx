import { Circle, HStack, Text, VStack } from '@expo/ui/swift-ui';
import {
  containerBackground,
  font,
  foregroundColor,
  frame,
  lineLimit,
  opacity,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
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
  /** El papel de la baldosa, un paso por esquema. Sale de `WIDGET_PAPER` en la app. */
  bg: string;
  bgDark: string;
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

  /**
   * Los props, con suelo. **Sin esto la baldosa sale EN BLANCO** en cuatro de las cinco familias:
   * `p.week.map` lanza con `{}`, que es lo que pasa `placeholder(in:)` en la galeria y en todo
   * arranque en frio. Ver el docstring largo en `today-widget`, que tiene el mismo bug y la misma
   * causa raiz.
   *
   * La semana por defecto son siete ceros y NO un array vacio: el layout cuenta con siete columnas
   * para no tener que saber en que dia vive quien mira.
   */
  const p: StreakWidgetProps = Object.assign(
    {
      days: 0,
      best: 0,
      week: [0, 0, 0, 0, 0, 0, 0],
      labels: ['L', 'M', 'M', 'J', 'V', 'S', 'D'],
      todayIndex: -1,
      tint: '',
      tintDark: '',
      /**
       * El suelo del papel son colores CON NOMBRE y no los tokens: `placeholder(in:)` entra sin
       * props, y una baldosa sin fondo es justo la que iOS tacha (ver `paper` mas abajo). Los hex
       * del tema viven en `theme.ts` y llegan por props; aqui solo hace falta que nunca sea vacio.
       */
      bg: 'white',
      bgDark: 'black',
    },
    props
  );

  const family = environment.widgetFamily;
  const rectangular = family === 'accessoryRectangular';
  const inline = family === 'accessoryInline';

  /**
   * El color se decide por `widgetRenderingMode`, NO por la familia.
   *
   * La familia era un proxy — "si es de pantalla de bloqueo, monocromo" — y falla en los iconos TEÑIDOS
   * de la pantalla de inicio (iOS 18+): ahi la familia sigue siendo `systemSmall` pero el modo es
   * 'accented' y iOS desatura lo que pintes, asi que el acento salia lavado. 'fullColor' es el unico
   * modo en que un color propio significa algo. El `?? 'fullColor'` cubre iOS 15, donde el campo no
   * llega y solo existe pantalla de inicio a todo color.
   */
  const full = (environment.widgetRenderingMode ?? 'fullColor') === 'fullColor';
  const dark = environment.colorScheme === 'dark';
  const ink = full ? (dark ? p.tintDark : p.tint) : undefined;
  const paint = ink ? [foregroundColor(ink)] : [];

  /**
   * El fondo del contenedor, y **sin esto el widget NO SE DIBUJA**: desde iOS 17 iOS sustituye por
   * una tarjeta blanca que dice «Please adopt containerBackground API» a todo widget que no declare
   * su papel. El porque largo esta en `today-widget`, que tiene el mismo bug y la misma causa.
   *
   * En las `accessory*` va 'clear': ahi el fondo lo pone el sistema.
   */
  const paper = containerBackground(
    rectangular || inline ? 'clear' : dark ? p.bgDark : p.bg,
    'widget'
  );

  /** Pantalla siempre encendida: el sistema baja el brillo y pide apagar las formas macizas. */
  const dim = environment.isLuminanceReduced ? 0.55 : 1;

  const label = p.days === 1 ? '1 día' : `${p.days} días`;
  const open = widgetURL('tdapp:///');

  if (inline) {
    return <Text modifiers={[open, paper]}>{`Racha: ${label}`}</Text>;
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
    const closed = p.week[index] > 0;
    const isToday = index === p.todayIndex;
    return (
      <Circle
        key={index}
        modifiers={[
          frame({ width: size, height: size }),
          // `dim` apaga el punteo en la pantalla siempre encendida: son siete formas macizas y es justo
          // lo que Apple pide bajar ahi. El numero de la racha no se toca — es lo que se viene a leer.
          opacity((closed ? 1 : isToday ? 0.45 : 0.18) * dim),
          // Se decide por `ink` y no por la familia: donde el sistema manda el color, `ink` ya es
          // undefined. Antes esto necesitaba un `as string` para tapar justo esa contradiccion.
          ...(ink ? [foregroundColor(closed || isToday ? ink : 'secondary')] : []),
        ]}
      />
    );
  };

  if (rectangular) {
    // Filas planas en un solo VStack: anidar stacks colapsa en la pantalla de bloqueo real.
    /**
     * `alignment="leading"` explicito: un VStack centra a sus hijos por default, asi que tres lineas de
     * anchos distintos quedaban centradas UNA SOBRE OTRA en vez de compartir el borde izquierdo — se
     * leia como si cada linea empezara donde le toco. Y `fill` reclama el ancho de la
     * baldosa: sin el, el bloque se encoge a su ancho ideal y el sistema lo centra dentro del widget.
     */
    return (
      <VStack alignment="leading" spacing={2} modifiers={[open, paper]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
          {`RACHA · ${label}`}
        </Text>
        <HStack spacing={4}>{p.week.map((_, i) => dot(i, 8))}</HStack>
      </VStack>
    );
  }

  // --- pantalla de inicio ---
  const small = family === 'systemSmall';

  return (
    <VStack spacing={small ? 6 : 8} modifiers={[open, paper]}>
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

      <HStack spacing={small ? 5 : 7}>{p.week.map((_, i) => dot(i, small ? 9 : 11))}</HStack>

      {!small && (
        <HStack spacing={small ? 5 : 7}>
          {p.labels.map((day, i) => (
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
        {p.best > p.days ? `Tu mejor: ${p.best}` : p.days > 0 ? 'Es tu mejor racha' : 'Cierra algo hoy'}
      </Text>
    </VStack>
  );
};

export default createWidget<StreakWidgetProps>('StreakWidget', StreakWidget);
