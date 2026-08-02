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

  /**
   * Los props, con suelo. **Sin esto la baldosa sale EN BLANCO**, y fue el bug reportado.
   *
   * `TimelineProvider.placeholder(in:)` pasa `props: nil`, y `EntryView` evalua con `{}` — o sea que
   * la galeria de widgets y todo arranque en frio entran por aqui sin datos. `p.nextTitle.length`
   * lanzaba un TypeError, `evaluateLayout` devolvia un RedBox... y `DynamicView.swift` solo mapea
   * `RedBoxView` dentro de `#if DEBUG`. En Release cae en `default: EmptyView()`: baldosa vacia, sin
   * un solo log que lo delate.
   *
   * `Object.assign` y no spread por costumbre: babel baja `{...a, ...b}` a esto igualmente, y aqui lo
   * que se serializa es el fuente — cuanto menos azucar, menos superficie para que el transpilador
   * meta un helper de modulo que la extension no tiene.
   */
  const p: TodayWidgetProps = Object.assign(
    {
      nextTitle: '',
      nextTime: '',
      pending: 0,
      done: 0,
      running: '',
      soonTitles: [],
      soonTimes: [],
      tint: '',
      tintDark: '',
    },
    props
  );

  const family = environment.widgetFamily;
  const small = family === 'systemSmall';
  const large = family === 'systemLarge';
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
  const ink = full ? (environment.colorScheme === 'dark' ? p.tintDark : p.tint) : undefined;
  const paint = ink ? [foregroundColor(ink)] : [];


  /** Pantalla siempre encendida: el sistema baja el brillo y pide apagar las formas macizas. */
  const dim = environment.isLuminanceReduced ? 0.55 : 1;

  const total = p.done + p.pending;
  const hasNext = p.nextTitle.length > 0;
  // Lo que corre gana a lo que sigue: si hay cronometro, ESO es en lo que estas.
  const headline = p.running || (hasNext ? p.nextTitle : 'Nada pendiente');
  const open = widgetURL('tdapp:///');

  if (inline) {
    return <Text modifiers={[open]}>{total === 0 ? 'Nada hoy' : `${p.done}/${total} · ${headline}`}</Text>;
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
              opacity((i < p.done ? 1 : 0.22) * dim),
              foregroundColor(ink ?? 'secondary'),
            ]}
          />
        ))}
      </HStack>
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
      <VStack alignment="leading" spacing={2} modifiers={[open]}>
        <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
          {total === 0 ? 'NADA HOY' : `${p.done}/${total}`}
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
          {p.running ? 'AHORA' : 'LO QUE SIGUE'}
        </Text>
        <Spacer />
        {!small && total > 0 && (
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              lineLimit(1),
              ...paint,
            ]}>
            {`${p.done}/${total}`}
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
        {p.running
          ? 'Cronómetro corriendo'
          : hasNext
            ? p.nextTime
            : `${p.done} hechas hoy`}
      </Text>

      {/*
        Las siguientes SOLO en el grande. En el mediano caben pero no deben: el widget existe para
        enseñar UNA cosa, y una lista de tres compite con el titular. En el grande sobra el espacio y
        entonces si ayuda a saber que viene despues.
      */}
      {large && p.soonTitles.length > 0 && (
        <VStack spacing={4}>
          <Text
            modifiers={[
              font({ size: 11, weight: 'semibold' }),
              foregroundColor('secondary'),
              lineLimit(1),
            ]}>
            DESPUÉS
          </Text>
          {p.soonTitles.map((title, i) => (
            <HStack key={i} spacing={8}>
              <Text modifiers={[font({ size: 14, weight: 'medium' }), lineLimit(1)]}>{title}</Text>
              <Spacer />
              <Text
                modifiers={[
                  font({ size: 13 }),
                  foregroundColor('secondary'),
                  lineLimit(1),
                ]}>
                {p.soonTimes[i]}
              </Text>
            </HStack>
          ))}
        </VStack>
      )}
    </VStack>
  );
};

export default createWidget<TodayWidgetProps>('TodayWidget', TodayWidget);
