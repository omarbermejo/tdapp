import { Capsule, HStack, Image, ProgressView, Spacer, Text, VStack } from '@expo/ui/swift-ui';
import {
  font,
  foregroundColor,
  frame,
  kerning,
  lineLimit,
  monospacedDigit,
  multilineTextAlignment,
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
 *
 * Se EXPORTA con nombre solo para el banco de pruebas (`app/la-preview.tsx`). En runtime esto no es
 * una funcion: el directive `'widget'` la sustituye por un string con su propio codigo fuente (ver
 * `babel-preset-expo/plugins/widgets-plugin`), y el preview lo rearma con `new Function` para pintar
 * las mismas secciones dentro de la app. Nada mas debe importarlo — quien quiera la actividad usa el
 * default.
 */
export const FocusActivity = (props: FocusActivityProps, _environment: LiveActivityEnvironment) => {
  'widget';

  /**
   * TODOS los tamaños, en un solo lugar. Vive DENTRO de la funcion y no como constante del modulo
   * porque el layout se serializa a string: una constante de fuera no se captura y llegaria
   * `undefined` al proceso de la extension.
   *
   * Esta junto para poder afinarlo sin buscar: cambiar un numero aqui y recargar Metro basta, no
   * hace falta recompilar nada.
   *
   * La Isla la dimensiona su CONTENIDO: cada region pide un ancho y el sistema arma la capsula
   * alrededor del hueco de la camara. Por eso los `*Clock` de aqui no son cosmetica — son lo que
   * decide el ancho de la capsula compacta, y sin ellos la cuenta atras pide el maximo (120.67pt por
   * region) y la Isla se queda estirada de lado a lado. Ver el comentario de `countdown`.
   *
   * De alto, la expandida crece con cada fila que le pongas, asi que se queda en tres bandas (icono,
   * reloj, barra) y no cuatro: la tarea y el ciclo solo viven en el banner, que es el que tiene sitio.
   */
  const S = {
    compactGlyph: 13,
    compactCount: 13,
    /**
     * La caja del reloj en la capsula compacta. 42 es '60:00' a 13pt bold rounded con cifras de ancho
     * fijo (~36pt) mas aire: el peor caso, porque un bloque no pasa de una vuelta del dial.
     *
     * Con esto la capsula queda en ~190pt —el icono, el hueco de la camara y el reloj— en vez de los
     * 367 que pedia antes.
     */
    compactClock: 42,
    /**
     * La minima es un GLIFO y no una cuenta atras: ver la seccion `minimal` de abajo. 15 y no 13
     * porque aqui el icono es lo unico que hay, y en un circulo de ~24pt un glifo de 13 se ve
     * perdido en el centro.
     */
    minimalGlyph: 15,
    islandGlyph: 14,
    /**
     * 20 y no 18: en la Isla expandida el reloj es el UNICO dato grande, y con el rotulo de 11 al
     * lado la diferencia de dos puntos es la que hace que se lea primero. '60:00' a 20pt bold
     * rounded con cifras de ancho fijo son ~62pt, y la region trailing de la expandida da mas.
     */
    islandCount: 20,
    /**
     * La caja del reloj en la Isla expandida: '60:00' a 20pt son ~55pt. Lo que sobra del ancho se lo
     * queda la region de la izquierda, que es la que tenia el rotulo recortado.
     */
    islandClock: 62,
    bannerCount: 28,
    /**
     * 86 cubre el peor caso del banner: '60:00' a 28pt bold rounded con `monospacedDigit` son cuatro
     * digitos de ~17pt mas el dos puntos, ~77pt. El resto es aire para que nunca trunque.
     */
    bannerClock: 86,
    /** El micro-rotulo de la fase. `Type.micro` es 12; aqui baja a 11 porque compite con menos. */
    micro: 11,
    /** La tarea. Va en su propia fila, encima del reloj. */
    line: 15,
    tick: { width: 3, height: 9 },
    /** El aire entre filas del banner y de la Isla expandida. */
    gap: 6,
    /**
     * La sangria de las filas del banner. 14 no es un gusto: el radio de la tarjeta del sistema son
     * ~22pt, asi que a 8pt del borde de arriba la curva todavia entra 5pt — con menos sangria, la
     * esquina se come la primera letra del rotulo.
     */
    edge: 14,
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

  /**
   * Lo mismo en UNA palabra, para la Isla expandida.
   *
   * La region leading de la expandida es angosta —comparte el ancho con el hueco de la camara y con
   * el reloj de la derecha— y 'DESCANSO CORTO' a 11pt en mayusculas con interletraje no cabe: salia
   * 'DESCANSO COR…', que es exactamente lo que hace que la isla se lea como algo roto. Y no se
   * arregla bajando la fuente: el rotulo es lo que se lee de reojo.
   *
   * La version larga se queda en el banner, que si tiene ancho. Aqui basta con de que FAMILIA es el
   * bloque —trabajo o descanso—, y eso es una palabra. Cuanto dura ese descanso no cambia nada de lo
   * que estas haciendo, que es no mirar el telefono.
   */
  const islandLabel = paused ? 'En pausa' : resting ? 'Descanso' : 'Enfoque';

  /**
   * La cuenta atras. Es el unico dato que de verdad importa, asi que se repite en cada seccion.
   *
   * **Va SIEMPRE dentro de una caja de ancho fijo, y esa es la causa raiz de la Isla gigante.**
   *
   * `Text(timerInterval:)` no se puede medir: SwiftUI no sabe cuanto va a ocupar un texto que cambia
   * solo, asi que en vez de pedir un ancho ideal se queda con TODO el que le propongan. En el banner
   * no se nota (la tarjeta tiene un ancho fijo), pero las regiones de la Isla se dimensionan por
   * contenido — y el log del sistema lo dice con numeros: `compactLeading` y `compactTrailing` son
   * `width=Dynamic<0.00, 120.67>` con una obstruccion de 125.33 en medio, o sea que una capsula que
   * pide el maximo mide 120.67·2 + 125.33 = 366.67pt. Exactamente lo que medía: la cuenta atras se
   * comia el ancho entero y la capsula no se encogia nunca. Con dos `<Text>` planos en las mismas
   * regiones, la misma capsula medía 155pt.
   *
   * Y explicaba tambien lo de la expandida: ahi el reloj le robaba el ancho al rotulo de la
   * izquierda, que es por lo que 'DESCANSO CORTO' se recortaba.
   *
   * La caja va en un `<HStack>` envolvente y NO en el `<Text>`: en este renderer los modifiers de un
   * `<Text>` se aplican DOS veces (`UIBaseView.swift:21` y otra vez `TextView.swift:42`), y un
   * `frame` duplicado sobre un texto que ya reclama el peor caso es la causa de los cuatro crashes de
   * layout que costo entender. En un `HStack` se aplica una vez y usa la rama `frame(width:height:)`,
   * que es la que Apple usa en su propio ejemplo de ActivityKit para acotar un timer.
   *
   * `box` es el ancho de esa caja: el peor caso del reloj a ese tamaño, con un poco de aire. Un bloque
   * no pasa de 60 minutos (una vuelta del dial), asi que el texto mas largo es '60:00'.
   */
  const countdown = (size: number, box: number) => (
    <HStack modifiers={[frame({ width: box, alignment: 'trailing' as const })]}>
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
           * El `alignment` del `frame` que acota el reloj NO mueve sus digitos: SwiftUI lo ignora en un
           * `Text(timerInterval:)` y un DTS de Apple lo reconoce sin arreglo (foro 758531). Quien los
           * pega al canto derecho de su caja es esto.
           */
          multilineTextAlignment('trailing'),
          /**
           * Una linea SIEMPRE: si el reloj no cabe, que recorte y no que se parta. Un texto de dos
           * lineas en la Isla compacta la engorda de ALTO, y ahi no hay alto que dar.
           *
           * Es de los pocos modifiers que se pueden poner en un `<Text>` aqui: es idempotente, asi que
           * sobrevive a que este renderer los aplique dos veces.
           */
          lineLimit(1),
          foregroundColor(ink),
        ]}
      />
    </HStack>
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
  /** El mismo rotulo con dos textos distintos: el largo en el banner, el de una palabra en la Isla. */
  const micro = (text: string) => <Text modifiers={microStyle}>{text}</Text>;


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

  /** La sangria de las filas del banner, en un solo sitio. Ver el comentario del banner. */
  const edge = padding({ horizontal: S.edge });

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
       * El aire: vertical en el VStack, horizontal en cada FILA. La diferencia no es de estilo, es la
       * unica forma que funciona — y explica el bug que llevaba dos intentos.
       *
       * Un `padding({ horizontal })` AQUI, en el contenedor, se pasa del ancho de la tarjeta: la barra
       * de progreso es golosa (un `ProgressView` se come todo el ancho que le propongan), asi que el
       * VStack ya pide el ancho entero y el padding le suma 8pt por fuera. El sistema entonces centra
       * el bloque y se come lo que sobra por los dos lados: de ahi el rotulo CORTADO por la izquierda.
       *
       * Puesto en la fila, el mismo padding es gratis: la fila recibe el ancho de la tarjeta como
       * propuesta y mete su contenido HACIA DENTRO, sin pedir mas. Y sigue habiendo aire, que es lo que
       * faltaba: sin nada de horizontal, el contenido queda a ras del canto y la ESQUINA REDONDEADA de
       * la tarjeta se come la primera letra de 'ENFOQUE' — medido en la pantalla de bloqueo del
       * simulador con iOS 26. El sistema no mete margen propio aqui, al contrario de lo que suponia la
       * version anterior.
       *
       * El vertical sube de 2 a 8 por lo mismo: la primera fila caia dentro de la curva de la esquina.
       */
      <VStack alignment="leading" spacing={S.gap} modifiers={[padding({ vertical: 8 })]}>
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
          El punteo del ciclo va PEGADO al rotulo, sin Spacer que lo exilie al canto derecho: se lee
          como una unidad ("ENFOQUE, dos de cuatro"). Y de paso esta fila no pide ancho de mas, que es
          justo lo que la de abajo si hace.
        */}
        <HStack spacing={7} modifiers={[edge]}>
          {micro(label)}
          {cycle}
        </HStack>

        {/*
          La fila "tarea ....... reloj", que vuelve porque por fin se sabe por que crasheaba.

          La causa NO era `frame` ni `fixedSize` en si: es que en el renderer de widgets los modifiers
          de un `<Text>` se aplican DOS VECES. `UIBaseView.swift:21` los aplica, y `TextView.swift:42`
          los vuelve a aplicar sobre el mismo array. Verificado con grep: `applyModifiers` solo aparece
          en TextView (y en la ruta in-app), asi que HStack, VStack, Capsule y Circle lo hacen UNA vez.
          Por eso `frame(S.tick)` en el punteo nunca crasheo y en el reloj si.

          Con el modifier duplicado, `frame(maxWidth:)` se convertia en dos marcos flexibles anidados
          sobre un hijo que ya reclama un ancho de peor caso -> propuesta no finita ->
          `LayoutSubview.place(at:)` -> `_assertionFailure`. Y explica que el tope finito de 400 tambien
          matara: es la misma rama `frame(minWidth:idealWidth:maxWidth:)`, no el numero.

          LA REGLA: ningun modifier de layout sobre un `<Text>`. Si hace falta geometria, va en un
          `<HStack>` de un solo hijo. Ahi se aplica una vez y usa la rama `frame(width:height:)`, que es
          la que Apple usa en su propio ejemplo de ActivityKit para acotar un timer text.

          `minLength={0}` en el Spacer: sin el, `SpacerView.swift` pasa `nil` y eso significa el
          espaciado del sistema (~8pt) como MINIMO OBLIGATORIO, que se suma al ancho pedido. Era la
          otra mitad del recorte de `ENFOQUE` por la izquierda.
        */}
        <HStack spacing={8} modifiers={[edge]}>
          <Text modifiers={[font({ size: S.line, weight: 'semibold' }), lineLimit(1)]}>{line}</Text>
          <Spacer minLength={0} />
          {countdown(S.bannerCount, S.bannerClock)}
        </HStack>

        {/*
          La barra tambien va sangrada, y por eso lleva su propio HStack: el padding no se le puede
          poner al `ProgressView` sin tocar su geometria (ver su comentario), y en un HStack de un solo
          hijo se aplica una vez y no la convierte en "ocupo mi ancho ideal" — sigue golosa, solo que
          dentro de la sangria.
        */}
        <HStack modifiers={[edge]}>{bar}</HStack>
      </VStack>
    ),

    /** Isla compacta: icono a la izquierda, reloj a la derecha. Es la convencion del sistema. */
    compactLeading: glyph(S.compactGlyph),
    compactTrailing: countdown(S.compactCount, S.compactClock),

    /**
     * La forma minima —cuando otra actividad comparte la Isla— es el GLIFO, no el reloj.
     *
     * Tenia la cuenta atras y era el sitio mas roto de todo esto: la minima es un CIRCULO de unos
     * 24pt y 'm:ss' son cinco caracteres. No es que se vieran chicos, es que iOS recorta lo que no
     * cabe, asi que quedaba un tajo de digitos ('24:' o ':59') dentro de un circulo — el mismo
     * sintoma que ya habia costado quitar el Gauge del widget circular. Apple lo dice explicito para
     * esta presentacion: un glifo o un par de caracteres, no un dato.
     *
     * No se pierde nada: la minima solo aparece con DOS actividades vivas, y ahi su trabajo es decir
     * QUE te espera, no cuanto falta. Un toque la expande y el reloj esta ahi.
     */
    minimal: glyph(S.minimalGlyph),

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
        {micro(islandLabel)}
      </HStack>
    ),
    expandedTrailing: countdown(S.islandCount, S.islandClock),
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
