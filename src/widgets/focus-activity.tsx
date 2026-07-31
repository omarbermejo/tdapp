import { HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import { font, foregroundColor, lineLimit, padding, tint } from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

/**
 * Props planas y primitivas: `LiveActivityFactory.start()` hace `JSON.stringify(props)`, asi que
 * un `Date` llegaria al otro lado como cadena y `timerInterval` lo rechazaria. Las fechas viajan
 * como epoch en milisegundos y se rearman aqui.
 *
 * El color tambien viaja como prop en vez de importarse de `constants/theme`: este archivo se
 * bundlea para el proceso de la extension, y `theme.ts` arrastra `useColorScheme` de react-native.
 * La regla de "ningun hex fuera de theme.ts" se respeta igual — el hex sale de `useAccent()` en la
 * app y cruza como dato.
 */
export type FocusActivityProps = {
  /** 'Enfoque' · 'Descanso corto' · 'Descanso largo'. Ya formateado por la app. */
  phase: string;
  /**
   * Si el bloque es un descanso. Viaja como booleano en vez de deducirse comparando `phase` con
   * 'Enfoque': el layout no debe depender de la ortografia de una etiqueta que se puede reescribir.
   */
  resting: boolean;
  /** Titulo de la tarea enganchada. '' cuando el bloque no tiene tarea. */
  task: string;
  /** Epoch ms en que arranco el bloque: el extremo bajo de la cuenta. */
  startedAt: number;
  /** Epoch ms en que termina: el extremo alto. */
  endsAt: number;
  /** Epoch ms donde el reloj se ve congelado. 0 = corriendo. */
  pausedAt: number;
  /** Hex del acento de la fase, resuelto en la app contra el esquema actual. */
  tint: string;
  /** Enfoques cerrados del ciclo, para el punteo del banner. */
  done: number;
  /** Cuantos enfoques tiene el ciclo. Viaja para no duplicar la constante en dos procesos. */
  rounds: number;
};

/**
 * El bloque de enfoque en la Isla Dinamica y en la pantalla de bloqueo.
 *
 * La clave de todo es `Text timerInterval`: SwiftUI pinta la cuenta atras y la ACTUALIZA SOLO, sin
 * que la app despierte ni una vez. Es lo que hace que esto sea viable — refrescar un reloj por
 * push cada segundo seria imposible (iOS limita las actualizaciones de una Live Activity) y con la
 * app suspendida no hay JS que lo haga. Aqui se manda el rango una vez al arrancar el bloque y el
 * sistema se encarga; la app solo vuelve a hablar cuando el bloque cambia de estado (pausa, salto,
 * fin).
 *
 * `pauseTime` es la otra mitad: al pausar se manda el instante en que se pauso y el reloj se queda
 * clavado ahi en vez de seguir corriendo o desaparecer.
 *
 * Sin colores de fondo: la Live Activity hereda el material del sistema y pintarle un fondo propio
 * la saca del look de la pantalla de bloqueo. El unico color es el acento, y solo en la cuenta y en
 * el icono — igual que en la app, donde el color dice de que familia es el bloque.
 */
const FocusActivity = (props: FocusActivityProps, _environment: LiveActivityEnvironment) => {
  'widget';

  // `lower <= upper` es requisito de TextView.swift: sin eso cae al camino de texto plano y se
  // veria el `props.text` vacio. La app nunca manda un bloque invertido, pero el guard es barato.
  const range = { lower: new Date(props.startedAt), upper: new Date(props.endsAt) };
  // undefined y no 0: `pauseTime` opcional significa "corriendo", y un Date(0) seria 1970.
  const pauseTime = props.pausedAt > 0 ? new Date(props.pausedAt) : undefined;
  const resting = props.resting;

  /** La cuenta atras. Es el unico dato que de verdad importa, asi que se repite en cada seccion. */
  const countdown = (size: number) => (
    <Text
      timerInterval={range}
      countsDown
      pauseTime={pauseTime}
      modifiers={[
        font({ size, weight: 'bold', design: 'rounded' }),
        foregroundColor(props.tint),
      ]}
    />
  );

  /**
   * El glifo de la fase. `timer` mientras enfocas y `cup.and.saucer` en el descanso: en la Isla
   * compacta no cabe una palabra, y el icono dice en que estas de un vistazo.
   */
  const glyph = (size: number) => (
    <Image systemName={resting ? 'cup.and.saucer.fill' : 'timer'} size={size} color={props.tint} />
  );

  return {
    /**
     * Pantalla de bloqueo y centro de notificaciones. Es la unica seccion con espacio para decir
     * EN QUE estabas, que es justo el dato que se pierde al soltar el telefono.
     */
    banner: (
      /**
       * El padding es propio y no del sistema: medido en el simulador, el banner de la pantalla de
       * bloqueo deja el contenido a ras del canto y el punteo del ciclo salia cortado por la derecha.
       */
      <VStack spacing={8} modifiers={[padding({ horizontal: 4, vertical: 2 })]}>
        <HStack spacing={6}>
          {glyph(13)}
          <Text
            modifiers={[font({ size: 12, weight: 'semibold' }), foregroundColor('secondary')]}>
            {props.phase.toUpperCase()}
          </Text>
          <Spacer />
          {/* El punteo del ciclo con texto y no con formas: en el banner una fila de circulos
              compite con la cuenta, y '2/4' ocupa la mitad. */}
          <Text modifiers={[font({ size: 12, weight: 'semibold' }), foregroundColor('secondary')]}>
            {`${props.done}/${props.rounds}`}
          </Text>
        </HStack>

        <HStack>
          <Text
            modifiers={[font({ size: 17, weight: 'semibold' }), lineLimit(2)]}>
            {props.task || (resting ? 'Suelta el telefono' : 'Enfoque libre')}
          </Text>
          <Spacer />
          {countdown(34)}
        </HStack>

        {/* Se vacia sola por el mismo timerInterval: dos lenguajes para el mismo dato, y el que
            se lee sin numeros es el que sirve de reojo. */}
        {/* `tint` y no `foregroundColor`: SwiftUI colorea la barra de un ProgressView con el tinte,
            y el foreground se lo pasa por alto — se veia con el azul del sistema. */}
        <ProgressView timerInterval={range} countsDown modifiers={[tint(props.tint)]} />
      </VStack>
    ),

    /** Isla compacta: icono a la izquierda, reloj a la derecha. Es la convencion del sistema. */
    compactLeading: glyph(15),
    compactTrailing: countdown(15),

    /** La forma minima (con otra actividad al lado): solo el reloj, sin icono que lo estorbe. */
    minimal: countdown(13),

    /** Isla expandida al tocarla: lo mismo que el banner pero reordenado a las cuatro regiones. */
    expandedLeading: (
      <HStack spacing={6}>
        {glyph(15)}
        <Text modifiers={[font({ size: 13, weight: 'semibold' }), foregroundColor('secondary')]}>
          {props.phase}
        </Text>
      </HStack>
    ),
    expandedTrailing: countdown(19),
    expandedBottom: (
      <VStack spacing={6}>
        <Text modifiers={[font({ size: 15, weight: 'semibold' }), lineLimit(1)]}>
          {props.task || (resting ? 'Suelta el telefono' : 'Enfoque libre')}
        </Text>
        {/* `tint` y no `foregroundColor`: SwiftUI colorea la barra de un ProgressView con el tinte,
            y el foreground se lo pasa por alto — se veia con el azul del sistema. */}
        <ProgressView timerInterval={range} countsDown modifiers={[tint(props.tint)]} />
      </VStack>
    ),
  };
};

/**
 * El nombre NO tiene que declararse en app.json: el plugin mete un `WidgetLiveActivity()` generico
 * en la extension que despacha por `context.state.name`, y este constructor guarda el layout en el
 * almacen compartido bajo ese nombre (ver LiveActivityFactory.swift). Lo que SI hace falta es que
 * este modulo se importe en la app antes de arrancar la actividad, y de eso se encarga
 * `features/timer/live-activity.ts`.
 */
export default createLiveActivity('FocusActivity', FocusActivity);
