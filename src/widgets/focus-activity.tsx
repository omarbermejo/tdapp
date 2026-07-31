import { Capsule, HStack, Image, ProgressView, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundColor,
  frame,
  fixedSize,
  kerning,
  lineLimit,
  monospacedDigit,
  opacity,
  padding,
  textCase,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets';

/**
 * Props planas y primitivas: `LiveActivityFactory.start()` hace `JSON.stringify(props)`, asi que
 * un `Date` llegaria al otro lado como cadena y `timerInterval` lo rechazaria. Las fechas viajan
 * como epoch en milisegundos y se rearman aqui.
 *
 * El color tambien viaja como prop en vez de importarse de `constants/theme`: este archivo se
 * bundlea para el proceso de la extension, y `theme.ts` arrastra `useColorScheme` de react-native.
 * La regla de "ningun hex fuera de theme.ts" se respeta igual — los hex salen de `accentInks()` en
 * la app y cruzan como dato.
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
  /**
   * Hex del acento de la fase, ya resuelto para fondo OSCURO por `accentOnDark()` en la app.
   *
   * Es el unico paso que sirve aqui: la pantalla de bloqueo y la Isla son negras en los DOS
   * esquemas del sistema. Y no se puede decidir en la extension leyendo `environment.colorScheme`,
   * que fue el intento anterior: ese valor reporta el esquema del SISTEMA, asi que en modo claro
   * dice 'light' mientras dibuja sobre negro — el acento oscuro caia a 2.2:1 y la cuenta atras
   * desaparecia. Quien pinta no puede preguntar de que color es su fondo, asi que llega decidido.
   */
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
 * Y es tambien el TECHO del diseño: los unicos dos elementos que se repintan solos son
 * `Text(timerInterval:)` y `ProgressView(timerInterval:)`. Todo lo demas (la fase, la tarea, el
 * punteo del ciclo) se queda congelado en el valor del ultimo update, asi que nada de lo que se
 * dibuje aqui puede depender del segundo. Por eso el ciclo son puntos y no un aro que se vacia.
 *
 * `pauseTime` es la otra mitad: al pausar se manda el instante en que se pauso y el reloj se queda
 * clavado ahi en vez de seguir corriendo o desaparecer.
 *
 * Sin colores de fondo: la Live Activity hereda el material del sistema y pintarle un fondo propio
 * la saca del look de la pantalla de bloqueo — y en la Isla, Apple lo dice explicito: es un lienzo
 * de vistas en primer plano, no una tarjeta. El unico color es el acento, y solo en la cuenta, el
 * icono y el punteo, igual que en la app, donde el color dice de que familia es el bloque.
 */
const FocusActivity = (props: FocusActivityProps, _environment: LiveActivityEnvironment) => {
  'widget';

  /**
   * TODOS los tamaños, en un solo lugar. Vive DENTRO de la funcion y no como constante del modulo
   * porque el layout se serializa a string: una constante de fuera no se captura y llegaria
   * `undefined` al proceso de la extension.
   *
   * Esta junto para poder afinarlo sin buscar: cambiar un numero aqui y recargar Metro basta, no
   * hace falta recompilar nada.
   *
   * La Isla la dimensiona el SISTEMA a partir de lo que le metes, no hay un ancho que fijar: la
   * capsula compacta crece con el cuerpo de la cuenta atras, y la expandida crece de alto con cada
   * fila que le pongas. Asi que hacerla mas chica es exactamente esto — numeros mas chicos y menos
   * filas. La compacta baja de 15 a 13 y la expandida se queda en tres bandas (icono, reloj, barra)
   * en vez de cuatro: la tarea y el ciclo solo viven en el banner, que es el que tiene sitio.
   */
  const S = {
    compactGlyph: 13,
    compactCount: 13,
    minimalCount: 12,
    islandGlyph: 14,
    islandCount: 18,
    bannerCount: 28,
    /** El micro-rotulo de la fase. `Type.micro` es 12; aqui baja a 11 porque compite con menos. */
    micro: 11,
    /** La tarea. A 15 contra 28 la jerarquia se lee sin que el numero aplaste la fila. */
    line: 15,
    tick: { width: 3, height: 9 },
    /** El aire entre filas del banner y de la Isla expandida. */
    gap: 6,
  };

  // `lower <= upper` es requisito de TextView.swift: sin eso cae al camino de texto plano y se
  // veria el `props.text` vacio. La app nunca manda un bloque invertido, pero el guard es barato.
  const range = { lower: new Date(props.startedAt), upper: new Date(props.endsAt) };
  const paused = props.pausedAt > 0;
  // undefined y no 0: `pauseTime` opcional significa "corriendo", y un Date(0) seria 1970.
  const pauseTime = paused ? new Date(props.pausedAt) : undefined;
  const resting = props.resting;

  /** Ya viene resuelto para fondo oscuro, que es el unico que hay aqui. Ver el comentario de `tint`. */
  const ink = props.tint;

  /** Lo que dice EN QUE estabas: es justo el dato que se pierde al soltar el telefono. */
  const line = props.task || (resting ? 'Suelta el teléfono' : 'Enfoque libre');

  /**
   * En pausa, la pausa GANA a la fase. Un reloj congelado sin nada que lo diga se lee como una app
   * rota — el mismo diagnostico que saco del home la tarjeta que contaba hacia arriba. Y lo que
   * estabas haciendo lo sigue diciendo la linea de abajo, asi que no se pierde nada por decirlo.
   */
  const label = paused ? 'En pausa' : props.phase;

  /** La cuenta atras. Es el unico dato que de verdad importa, asi que se repite en cada seccion. */
  const countdown = (size: number) => (
    <Text
      timerInterval={range}
      countsDown
      pauseTime={pauseTime}
      modifiers={[
        font({ size, weight: 'bold', design: 'rounded' }),
        /**
         * Cifras de ancho fijo, y no es pulido: los digitos cambian cada segundo y con figuras
         * proporcionales el '1' es mas angosto que el '8', asi que el reloj entero se mueve al
         * pasar de 10:00 a 09:59. En la Isla es peor que un temblor — la capsula se REDIMENSIONA
         * en cada tick. Es la misma razon del `tabular-nums` de `Type.count` en la app.
         */
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
        foregroundColor(ink),
      ]}
    />
  );

  /**
   * El glifo de la fase. `timer` mientras enfocas, `cup.and.saucer` en el descanso y `pause` en
   * pausa: en la Isla compacta no cabe una palabra, y el icono dice en que estas de un vistazo.
   */
  const glyph = (size: number) => (
    <Image
      systemName={paused ? 'pause.fill' : resting ? 'cup.and.saucer.fill' : 'timer'}
      size={size}
      color={ink}
    />
  );

  /**
   * El micro-rotulo de la app, con los mismos numeros que `Type.micro`: 12pt, semibold, mayusculas
   * y 0.9 de interletraje. El kerning no es adorno — en mayusculas el espaciado por default aprieta
   * las palabras hasta volverlas un bloque, y esta es justo la linea que se lee de reojo.
   *
   * `textCase` y no `.toUpperCase()`: la que sabe de acentos y de locale es la plataforma.
   */
  const microStyle = [
    font({ size: S.micro, weight: 'semibold' }),
    textCase('uppercase'),
    kerning(0.9),
    foregroundColor('secondary'),
    // La region leading de la Isla expandida es angosta: 'DESCANSO CORTO' se recorta antes de
    // partirse en dos lineas y desalinear la fila entera.
    lineLimit(1),
  ];
  const micro = <Text modifiers={microStyle}>{label}</Text>;

  /**
   * Reclama todo el ancho disponible y ancla el contenido a la izquierda. Es el reemplazo de `Spacer`
   * en todo este archivo — ver el comentario del banner.
   *
   * `Infinity` y no un numero grande: con una propuesta de ancho acotada las dos hacen lo mismo, pero
   * si la propuesta llega SIN acotar (que es justo el caso que rompia el Spacer) un 10000 se tomaria
   * literal y `.infinity` cae al tamaño ideal, que es lo que se quiere.
   */
  const fill = frame({ maxWidth: Infinity, alignment: 'leading' as const });

  /**
   * El ciclo como marcas y no como '2/4': un numero hay que LEERLO, y cuatro marcas se cuentan de
   * reojo con el telefono en la mesa, que es exactamente la postura para la que existe esto.
   *
   * Son capsulas verticales y no circulos, con las proporciones de la caratula (`TICK_W: 4`,
   * `TICK_LEN: 16` en `dial.tsx`): cuatro circulos de 6pt atenuados al 0.3 se leen como puntos
   * SUSPENSIVOS, no como un ciclo — probado, y era lo que ensuciaba la esquina del banner. Una
   * marca vertical no se puede confundir con nada, y encima es el idioma que la app ya usa para
   * contar el tiempo.
   *
   * El pendiente va macizo y translucido en vez de hueco como el brote de la app: a 3pt de ancho,
   * un aro con trazo deja de ser una forma y se vuelve una mancha gris.
   *
   * Y solo aparece cuando hay algo que contar. Con el ciclo intacto eran cuatro marcas apagadas en
   * la esquina diciendo nada — ruido en el sitio donde la mirada aterriza primero. Asi el primer
   * enfoque cerrado tambien se GANA algo visible, que es la mitad del punto del ciclo.
   */
  const cycle =
    props.done > 0 ? (
      <HStack spacing={3}>
        {Array.from({ length: props.rounds }, (_, i) => (
          <Capsule
            key={i}
            modifiers={[frame(S.tick), foregroundColor(ink), opacity(i < props.done ? 1 : 0.3)]}
          />
        ))}
      </HStack>
    ) : null;

  /**
   * La barra: el mismo dato que la cuenta pero sin numeros, que es la version que sirve de reojo.
   *
   * NADA de `frame` aqui, y es la leccion mas cara de este archivo. `ProgressView(timerInterval:)`
   * pinta ADEMAS su propia cuenta atras debajo de la barra, asi que el mismo numero salia dos veces;
   * lo intente recortando con `frame({ height, alignment: 'top' }) + clipped()` y el resultado fue
   * que se descuadro el BANNER ENTERO: un `frame` de alto fijo convierte el ProgressView de "lleno
   * el ancho disponible" a "ocupo mi ancho ideal", y en cuanto la fila mas ancha del VStack deja de
   * pedir el ancho del contenedor, los `Spacer` de las otras filas no tienen nada que repartir. En
   * la pantalla de bloqueo real se veia el rotulo cortado por la izquierda, el reloj sin alinearse a
   * la derecha y la barra pintandose por fuera de la tarjeta.
   *
   * La etiqueta se apaga por COLOR, que no toca el layout: `tint` pinta la barra y `foregroundColor`
   * el texto, asi que un foreground transparente la borra y deja la barra con su color. Si algun dia
   * @expo/ui expone el init de cuatro closures (`currentValueLabel: { EmptyView() }`), ese es el
   * arreglo de verdad y esto se va.
   *
   * En pausa la barra deja de ser un `timerInterval`: `ProgressView` NO acepta `pauseTime` (solo
   * `Text` lo hace), asi que la viva seguia vaciandose mientras el numero de al lado estaba
   * congelado — dos versiones distintas del mismo bloque en la misma tarjeta. Se cambia por una
   * fija en la fraccion donde se paro, y translucida: eso es lo que dice "esto no corre".
   */
  const total = Math.max(1, props.endsAt - props.startedAt);
  const left = Math.min(total, Math.max(0, props.endsAt - props.pausedAt));
  /**
   * `tint` pinta la BARRA y `foregroundColor` el TEXTO — son dos canales distintos, y de ahi sale el
   * truco: con el foreground transparente desaparece la cuenta atras automatica (y su `.secondary`,
   * que en SwiftUI se deriva del foreground) sin tocar el color de la barra ni su geometria.
   */
  const barPaint = [tint(ink), foregroundColor('rgba(0,0,0,0)')];

  const bar = paused ? (
    <ProgressView value={left / total} modifiers={[...barPaint, opacity(0.45)]} />
  ) : (
    <ProgressView timerInterval={range} countsDown modifiers={barPaint} />
  );

  return {
    /**
     * Pantalla de bloqueo y centro de notificaciones. Es la unica seccion con sitio para decir EN
     * QUE estabas, asi que es la unica que lo dice: dos filas y la barra, de lo general a lo
     * concreto — donde estoy (fase), en que (la tarea) y cuanto falta (la cuenta y la barra).
     *
     * La jerarquia la carga el tamaño y no las cajas: 30 contra 14. La primera version puso el
     * numero a 38 y la tarea a 15, y la tarjeta se veia apretada — el numero no necesita crecer
     * para ganar, le basta con que lo de al lado no le pelee.
     */
    banner: (
      /**
       * El padding es propio y no del sistema: medido en el simulador, el banner de la pantalla de
       * bloqueo deja el contenido a ras del canto y el punteo del ciclo salia cortado por la derecha.
       */
      <VStack alignment="leading" spacing={S.gap} modifiers={[padding({ horizontal: 4, vertical: 2 }), fill]}>
        {/*
          Tres filas HERMANAS y ningun stack anidado.

          Lo intente agrupando el rotulo y la tarea en un VStack dentro del HStack del reloj, para
          que el numero se midiera contra el bloque de texto entero. Se veia mejor en el banco de
          pruebas y en la pantalla de bloqueo REAL desaparecieron las dos lineas de texto: quedo el
          numero pegado a la izquierda y la barra, nada mas. El banco le propone a SwiftUI un ancho
          fijo y comodo; iOS propone el suyo, y ahi el anidamiento colapsaba. No se arregla a ciegas
          — se vuelve a la forma plana, que es la unica verificada contra el sistema.

          Lo que SI se queda de aquel intento es sacar el glifo: al lado de la palabra 'ENFOQUE' era
          redundante, y empujaba el rotulo a la derecha dejando tres sangrias distintas. Sin el, el
          rotulo, la tarea y la barra arrancan en la misma x. El glifo se gana su sitio en la Isla,
          donde no cabe una palabra.
        */}
        {/*
          `fill` en vez de `<Spacer />`, y no es estilo: un Spacer solo empuja si el padre tiene
          espacio SIN RESTRINGIR, y en el render de la pantalla de bloqueo eso no existe (se pinta como
          snapshot con presupuesto). Con Spacer el reparto colapsaba al ancho ideal del contenido, la
          tarjeta lo centraba, y el resultado era el rotulo cortado por la izquierda y el reloj sin
          llegar al canto derecho. La forma que aguanta es reclamar el ancho explicitamente.
        */}
        <HStack spacing={7}>
          <Text modifiers={[...microStyle, fill]}>{label}</Text>
          {cycle}
        </HStack>

        <HStack spacing={10}>
          {/*
            Una linea, y es lo que sostiene la fila: con `lineLimit(1)` un Text se TRUNCA en vez de
            exigir su ancho ideal, asi que el reloj de al lado nunca se queda sin sitio. Era lo que
            faltaba de verdad — el `layoutPriority` que le puse al reloj para lo mismo era el que se
            comia la fila completa en el ancho real de iOS.
          */}
          <Text modifiers={[font({ size: S.line, weight: 'semibold' }), lineLimit(1), fill]}>
            {line}
          </Text>
          {countdown(S.bannerCount)}
        </HStack>

        {bar}
      </VStack>
    ),

    /** Isla compacta: icono a la izquierda, reloj a la derecha. Es la convencion del sistema. */
    compactLeading: glyph(S.compactGlyph),
    compactTrailing: countdown(S.compactCount),

    /** La forma minima (con otra actividad al lado): solo el reloj, sin icono que lo estorbe. */
    minimal: countdown(S.minimalCount),

    /**
     * Isla expandida al tocarla: tres bandas y nada mas — el icono con la fase, el reloj y la barra.
     *
     * NO repite la tarea ni el ciclo. Los tenia, y era lo que hacia la isla enorme: cada fila que le
     * pones al `expandedBottom` la estira hacia abajo, y la expandida se abre sobre la pantalla que
     * estas usando. La version larga de la historia es el banner, que aparece cuando el telefono ya
     * esta en la mesa; la isla se mira de paso y solo tiene que contestar "cuanto falta".
     */
    expandedLeading: (
      <HStack spacing={6}>
        {glyph(S.islandGlyph)}
        {micro}
      </HStack>
    ),
    expandedTrailing: countdown(S.islandCount),
    expandedBottom: bar,
  };
};

/**
 * El nombre NO tiene que declararse en app.json: el plugin mete un `WidgetLiveActivity()` generico
 * en la extension que despacha por `context.state.name`, y este constructor guarda el layout en el
 * almacen compartido bajo ese nombre (ver LiveActivityFactory.swift). Lo que SI hace falta es que
 * este modulo se importe en la app antes de arrancar la actividad, y de eso se encarga
 * `features/timer/outside.ts`.
 */
export default createLiveActivity('FocusActivity', FocusActivity);
