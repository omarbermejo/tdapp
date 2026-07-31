import { AccessoryWidgetBackground, Gauge, HStack, Image, Text, VStack, ZStack } from '@expo/ui/swift-ui';
import { font, foregroundColor, lineLimit, monospacedDigit, widgetURL } from '@expo/ui/swift-ui/modifiers';
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
  const lock = circular || rectangular || inline;

  /**
   * En la pantalla de bloqueo el sistema pinta todo de un blanco monocromo (`widgetRenderingMode`
   * 'vibrant') y un color propio se ve sucio o se ignora. Ahi se deja el color del sistema; en la
   * pantalla de inicio manda el acento, y cual de los dos pasos depende del esquema en que se dibuje.
   */
  const ink = lock ? undefined : environment.colorScheme === 'dark' ? props.tintDark : props.tint;
  const paint = ink ? [foregroundColor(ink)] : [];

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
      modifiers={[font({ size, weight: 'bold', design: 'rounded' }), monospacedDigit(), ...paint]}
    />
  );

  const glyph = (size: number) => (
    <Image
      systemName={paused ? 'pause.fill' : props.resting ? 'cup.and.saucer.fill' : 'timer'}
      size={size}
      color={ink}
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
        {/* El fondo traslucido del sistema: sin el, el aro flota sobre el fondo de pantalla. */}
        <AccessoryWidgetBackground />
        {/*
          El Gauge es la unica forma de un arco de progreso aqui: no existe
          progressViewStyle('accessoryCircular') en @expo/ui (solo automatic/linear/circular), y el
          estilo por defecto de un Gauge en accessoryCircular YA es el aro que pinta el sistema.
        */}
        <Gauge value={props.done} min={0} max={props.rounds} />
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
    return (
      <VStack spacing={1} modifiers={[open]}>
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
