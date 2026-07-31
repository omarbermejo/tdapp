import { AccessoryWidgetBackground, HStack, Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import {
  fixedSize,
  font,
  foregroundColor,
  frame,
  lineLimit,
  monospacedDigit,
  opacity,
  widgetURL,
} from '@expo/ui/swift-ui/modifiers';
import { createWidget, type WidgetEnvironment } from 'expo-widgets';

/**
 * Props planas: cruzan por `JSON.stringify`, asi que nada de `Date` ni objetos anidados. Las fechas
 * viajan como epoch en milisegundos y se rearman dentro del layout.
 */
export type FocusWidgetProps = {
  /** Hay un bloque que enseñar. Si es false el widget invita a empezar uno. */
  live: boolean;
  /** 'Enfoque' · 'Descanso corto' · 'Descanso largo'. Ya formateado por la app. */
  phase: string;
  /** Si el bloque es un descanso. Booleano y no comparar `phase`: la etiqueta se puede reescribir. */
  resting: boolean;
  /** Titulo de la tarea enganchada, '' si el bloque va libre. */
  task: string;
  /** Extremos del tramo, en epoch ms. */
  startedAt: number;
  endsAt: number;
  /** Epoch ms donde el reloj se ve congelado. 0 = corriendo. */
  pausedAt: number;
  /** Enfoques cerrados del ciclo y cuantos tiene. */
  done: number;
  rounds: number;
  /** Los dos pasos del acento; cual se usa lo decide el esquema en que se dibuja. */
  tint: string;
  tintDark: string;
};

/**
 * El bloque de enfoque en la pantalla de bloqueo y en la pantalla de inicio.
 *
 * Es el hermano del `focus-activity`: la Live Activity aparece SOLO mientras hay un bloque corriendo,
 * y este se queda siempre — para poder mirar el reloj sin desbloquear, y para invitar a empezar cuando
 * no hay nada. Los dos usan el mismo truco: `Text(timerInterval:)`, que SwiftUI actualiza SOLO sin
 * despertar la app. Sin eso un widget de cronometro seria un numero congelado (WidgetKit da unos pocos
 * refrescos por hora, ni de lejos uno por segundo).
 *
 * **El aro se arma con un `ZStack` y no con los slots del `Gauge`.** En el renderer de widgets, `Gauge`
 * se pinta SIN propagar hijos (`DynamicView.swift`: no lleva el closure `updateChildren`), asi que su
 * `currentValueLabel` llegaria vacio. Poniendo el aro y el numero como HERMANOS dentro de un ZStack se
 * consigue lo mismo y ademas se controla la tipografia.
 *
 * El layout se serializa como fuente y se evalua suelto: NO captura nada de fuera. Todo — helpers,
 * constantes, colores — vive dentro de la funcion o llega por props.
 */
const FocusWidget = (props: FocusWidgetProps, environment: WidgetEnvironment) => {
  'widget';

  const family = environment.widgetFamily;
  const circular = family === 'accessoryCircular';
  const rectangular = family === 'accessoryRectangular';
  const inline = family === 'accessoryInline';

  /**
   * El color se decide por `widgetRenderingMode`, NO por la familia.
   *
   * La familia era un proxy — "si es de pantalla de bloqueo, monocromo" — y falla en un caso real: los
   * iconos TEÑIDOS de la pantalla de inicio (iOS 18+). Ahi la familia sigue siendo `systemSmall`, pero
   * el modo es 'accented' y iOS desatura lo que pintes: el acento salia lavado y sucio en vez de
   * dejarle mandar al sistema. 'fullColor' es el unico modo en que un color propio significa algo.
   *
   * El `?? 'fullColor'` es para iOS 15, donde el campo no llega: ahi solo existe pantalla de inicio a
   * todo color, asi que asumirlo es correcto.
   */
  const full = (environment.widgetRenderingMode ?? 'fullColor') === 'fullColor';
  const ink = full ? (environment.colorScheme === 'dark' ? props.tintDark : props.tint) : undefined;
  const paint = ink ? [foregroundColor(ink)] : [];

  /**
   * Reclama el ancho disponible y ancla a la izquierda. Reemplaza a `Spacer` en la pantalla de bloqueo:
   * un Spacer solo empuja si el padre tiene espacio SIN RESTRINGIR, y ahi el widget se pinta como
   * snapshot con presupuesto y no lo tiene. `Infinity` y no un numero grande: con propuesta acotada dan
   * lo mismo, y sin acotar `.infinity` cae al tamaño ideal en vez de tomarse el numero literal.
   */
  const fill = frame({ maxWidth: Infinity, alignment: 'leading' as const });

  /**
   * Pantalla siempre encendida (iPhone 14 Pro y posteriores): el sistema baja el brillo y pide que las
   * formas GRANDES Y MACIZAS se apaguen. El texto se queda como esta —bajarle el contraste es lo
   * contrario de lo que hace falta a un metro de distancia— y lo que cede es la decoracion.
   */
  const dim = environment.isLuminanceReduced ? 0.55 : 1;

  const paused = props.pausedAt > 0;
  // `lower <= upper` es requisito de TextView.swift; si no, cae al camino de texto plano y sale vacio.
  const range = { lower: new Date(props.startedAt), upper: new Date(props.endsAt) };
  const pauseTime = paused ? new Date(props.pausedAt) : undefined;

  /**
   * La cuenta atras. `monospacedDigit` no es pulido: los digitos cambian cada segundo y con figuras
   * proporcionales el '1' es mas angosto que el '8', asi que el reloj entero se movería.
   */
  const countdown = (size: number) => (
    <Text
      timerInterval={range}
      countsDown
      pauseTime={pauseTime}
      modifiers={[
        font({ size, weight: 'bold', design: 'rounded' }),
        monospacedDigit(),
        /**
         * `fixedSize` horizontal, y esto es LA pieza que faltaba.
         *
         * Un `Text(timerInterval:)` no se mide como un texto normal: reclama un marco mucho mas ancho
         * que sus digitos y centra el contenido dentro. Consecuencias medidas en la pantalla de bloqueo
         * real: el reloj nunca llegaba al canto derecho aunque el texto de al lado reclamara el ancho
         * con `maxWidth: Infinity`, y la fila entera se pasaba del ancho de la tarjeta — lo que hacia
         * que el sistema la centrara y el rotulo de arriba saliera CORTADO por la izquierda. Los dos
         * sintomas, un solo origen.
         *
         * `fixedSize` lo colapsa a su ancho real. El precio es que al pasar de '10:00' a '9:59' el
         * ancho cambia un caracter, una vez por bloque — contra un reloj descolocado todo el rato.
         */
        fixedSize({ horizontal: true }),
        /**
         * `lineLimit(1)` si, `minimumScaleFactor` NO.
         *
         * Lo intente con `minimumScaleFactor(0.6)` para que el reloj encogiera antes que recortarse, y
         * es peor: en un widget, un `Text` de tiempo con minimumScaleFactor se dibuja SIEMPRE en la
         * escala minima en vez de en la mayor que quepa. Es un bug de Apple abierto desde iOS 17 (hilos
         * del foro de developer.apple.com sobre `Text` con fecha relativa en widgets). El resultado fue
         * un reloj diminuto en las tres presentaciones.
         *
         * El sitio donde de verdad no cabia era el aro, y eso se arreglo quitandole el Gauge de debajo.
         */
        lineLimit(1),
        ...paint,
      ]}
    />
  );

  const glyph = (size: number) => (
    <Image
      systemName={paused ? 'pause.fill' : props.resting ? 'cup.and.saucer.fill' : 'timer'}
      size={size}
      color={ink}
      // El glifo es la unica forma maciza que queda aqui, asi que es lo que cede en la pantalla
      // siempre encendida. El reloj no se toca: es el dato por el que se mira esto de reojo.
      modifiers={[opacity(dim)]}
    />
  );

  // Tocar el widget abre el cronometro. Tres barras: el esquema es 'tdapp' y expo-router lee la ruta
  // del PATH, asi que 'tdapp://timer' dejaria 'timer' como host y la ruta vacia.
  const open = widgetURL('tdapp:///timer');

  // --- sin bloque: el widget invita, no se queda en blanco ---
  if (!props.live) {
    if (circular) {
      return (
        <ZStack modifiers={[open]}>
          <AccessoryWidgetBackground />
          <Image systemName="timer" size={22} color={ink} />
        </ZStack>
      );
    }
    if (inline) {
      return <Text modifiers={[open]}>Sin bloque</Text>;
    }
    return (
      <VStack spacing={rectangular ? 2 : 6} modifiers={[open]}>
        {glyph(rectangular ? 13 : 20)}
        <Text
          modifiers={[
            font({ size: rectangular ? 13 : 15, weight: 'semibold' }),
            lineLimit(1),
            ...paint,
          ]}>
          Empezar un bloque
        </Text>
      </VStack>
    );
  }

  // --- el aro de la pantalla de bloqueo ---
  if (circular) {
    return (
      <ZStack modifiers={[open]}>
        {/* El fondo traslucido del sistema: sin el, el reloj flota sobre el fondo de pantalla. */}
        <AccessoryWidgetBackground />
        {/*
          SIN Gauge, y es la unica forma de que el reloj se lea.

          Tenia un aro con el punteo del ciclo y el reloj encima. Es un bug conocido de Apple: en
          `accessoryCircular`, un `Gauge` reserva un hueco MINIMO para su etiqueta y recorta lo que le
          pongas dentro o encima — pasa incluso con dos caracteres. Con '24:42' se veia ':42' pegado a
          un disco de color, que es exactamente la captura que llego.

          Asi que el circulo hace UNA cosa: el reloj. El punteo del ciclo ya vive en el rectangular y en
          la pantalla de inicio, que es donde hay sitio para dos datos.
        */}
        {countdown(15)}
      </ZStack>
    );
  }

  // --- la fila de la pantalla de bloqueo ---
  if (rectangular) {
    /**
     * Filas PLANAS dentro de un solo VStack, sin stacks anidados. Anidar un VStack dentro de un HStack
     * se ve bien en un preview dentro de la app y desaparece en la pantalla de bloqueo real: el preview
     * propone un ancho comodo y iOS propone el suyo, y el anidamiento colapsa.
     */
    /**
     * `alignment="leading"` explicito: un VStack centra a sus hijos por default, asi que tres lineas de
     * anchos distintos quedaban centradas UNA SOBRE OTRA en vez de compartir el borde izquierdo — se
     * leia como si cada linea empezara donde le toco. Y `maxWidth: Infinity` reclama el ancho de la
     * baldosa: sin el, el bloque se encoge a su ancho ideal y el sistema lo centra dentro del widget.
     */
    return (
      <VStack alignment="leading" spacing={1} modifiers={[open, fill]}>
        <HStack spacing={4}>
          {glyph(12)}
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), lineLimit(1)]}>
            {paused ? 'En pausa' : props.phase}
          </Text>
        </HStack>
        {countdown(22)}
        <Text modifiers={[font({ size: 12 }), lineLimit(1)]}>
          {props.task || (props.resting ? 'Suelta el teléfono' : 'Enfoque libre')}
        </Text>
      </VStack>
    );
  }

  if (inline) {
    // Una sola linea junto a la hora del bloqueo: no cabe nada mas que el reloj.
    return (
      <HStack spacing={4} modifiers={[open]}>
        {glyph(12)}
        {countdown(13)}
      </HStack>
    );
  }

  // --- pantalla de inicio (systemSmall) ---
  return (
    <VStack spacing={6} modifiers={[open]}>
      <HStack spacing={5}>
        {glyph(12)}
        <Text
          modifiers={[
            font({ size: 11, weight: 'semibold' }),
            foregroundColor('secondary'),
            lineLimit(1),
          ]}>
          {paused ? 'EN PAUSA' : props.phase.toUpperCase()}
        </Text>
      </HStack>

      {countdown(32)}

      {/* lineLimit(1) es lo que evita que un titulo largo empuje al reloj: con el, el Text trunca en
          vez de exigir su ancho ideal. `layoutPriority` hace lo contrario y se come la fila. */}
      <Text modifiers={[font({ size: 13, weight: 'medium' }), lineLimit(2)]}>
        {props.task || (props.resting ? 'Suelta el teléfono' : 'Enfoque libre')}
      </Text>

      <Text modifiers={[font({ size: 11 }), foregroundColor('secondary')]}>
        {`${props.done}/${props.rounds} del ciclo`}
      </Text>
    </VStack>
  );
};

export default createWidget<FocusWidgetProps>('FocusWidget', FocusWidget);
