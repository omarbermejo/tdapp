import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, type ComponentProps } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  interpolateColor,
  runOnJS,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { AREA_ICON, Icon3D, Icon3DSize, SIZE_ICON } from '@/components/ui/icon3d';
import { Motion, Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import type { Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { FOCUS_AREAS } from '@/features/auth/options';

import { tasksApi } from './api';
import { accentForFocus } from './focus-accent';
import type { TaskMutations } from './use-tasks';

/**
 * Ancho del panel que se revela detras de la fila.
 *
 * Bajo de 104 a 88: el panel solo carga un glifo de 22 y una palabra de `micro`, y con 104 habia que
 * arrastrar 75pt para confirmar — la mitad del pulgar de alguien con el telefono en una mano.
 */
const ACTION = 88;

/**
 * Fraccion del panel que hay que arrastrar para que la accion cuente. El mismo numero manda
 * el umbral del gesto Y el haptico, para que lo que sientes sea exactamente lo que va a pasar.
 *
 * Baja de 0.72 a 0.6: con 88pt de panel son 53pt de viaje, asi que la accion se confirma antes de que
 * el brazo se estire. Las dos acciones son reversibles (marcar se desmarca, borrar pregunta), asi que
 * un umbral generoso no cuesta nada.
 */
const COMMIT = 0.6;

/**
 * Intencion horizontal antes de que la fila se mueva.
 *
 * Estaba en 24 para que el gesto no le robara el scroll vertical a la lista, pero el umbral solo
 * mide X (`activeOffsetX`), asi que un arrastre vertical nunca lo alcanza por alto que este: los
 * 24 no protegian el scroll, solo se comian el primer tercio del swipe y lo dejaban inerte.
 * 12 son los 10 de fabrica mas un margen para el temblor horizontal de un scroll en diagonal.
 */
const DRAG_OFFSET = 12;

/**
 * El resorte con el que la fila viaja al abrirse.
 *
 * El de fabrica de Swipeable (mass 2, damping 1000, stiffness 700) esta sobreamortiguado ~13x y
 * tarda mas de un segundo en asentarse. Importa mas de lo que parece: la libreria dispara
 * `onSwipeableOpen` en el callback del resorte, o sea que la accion no ocurre hasta que ese
 * viaje termina — sueltas el dedo y no pasa nada durante un segundo. Este llega en ~250ms.
 *
 * Fuera del render porque `animationOptions` entra en las dependencias de la animacion.
 */
const SPRING = { mass: 1, damping: 24, stiffness: 320 } as const;

/** El rebote de la casilla al marcar: sube seco y el resorte lo devuelve. */


/** El cruce del relleno. Corto a proposito: acompaña al haptico, no lo hace esperar. */
const CROSS = { duration: Motion.exit } as const;

const tick = () => {
  Haptics.selectionAsync().catch(() => {});
};

const thud = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

const focusLabel = (value: string | null) =>
  value ? (FOCUS_AREAS.find((o) => o.value === value)?.label ?? value) : null;

/** Solo la hora agendada, nunca la actual: leer el reloj en el render es impuro. */
const timeLabel = (iso: string | null) =>
  iso ? new Date(iso).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' }) : null;

/**
 * El dia de una tarea que NO es del dia que se esta viendo: '28 jul', o 'Sin fecha'.
 *
 * Se construye con numeros y no con `new Date(iso)`: parsear 'YYYY-MM-DD' lo trata como UTC y al
 * oeste de Greenwich devuelve el dia anterior. Es el mismo cuidado que en `day.ts`.
 */
const dayStamp = (dueDate: string | null) => {
  if (!dueDate) return 'Sin fecha';
  const [y, m, d] = dueDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
};

/**
 * El icono de la fila: el del area, y si no tiene, el del tamaño.
 *
 * Nunca queda sin icono. Una fila sin ancla en una lista donde las demas si la tienen deja un
 * hueco que se lee como error, y el tamaño es un dato que TODA tarea tiene.
 */
const rowIcon = (task: Task) => AREA_ICON[task.focusArea ?? ''] ?? SIZE_ICON[task.size] ?? 'clock';

/**
 * El panel de detras. Vive en su propio componente porque necesita hooks de reanimated y
 * `renderLeftActions` es una funcion que se llama en cada frame: unos hooks ahi dentro serian
 * hooks condicionales.
 *
 * El contenido se mantiene centrado en la parte REVELADA, no en el panel completo. Antes
 * estaba fijo en el centro de los 104pt, asi que durante casi todo el arrastre lo que se veia
 * era una etiqueta cortada por la mitad — eso era lo que se veia mal, no el gesto.
 */
function SwipeFace({
  progress,
  direction,
  label,
  glyph,
  background,
  color,
}: {
  progress: SharedValue<number>;
  /** -1 panel izquierdo, +1 derecho: de que lado se revela. */
  direction: -1 | 1;
  label: string;
  /** El tipo sale del propio SymbolView: los nombres de SF Symbols son literales, no strings. */
  glyph: ComponentProps<typeof SymbolView>['name'];
  background: string;
  color: string;
}) {
  // Se anima desde el hilo de UI y no desde `progress` directo para que el cruce del umbral
  // tenga su propio resorte: el salto es la confirmacion visual de lo que el haptico dice.
  const armed = useSharedValue(0);

  useAnimatedReaction(
    () => progress.value >= COMMIT,
    (crossed, previous) => {
      if (crossed === previous) return;
      armed.value = withSpring(crossed ? 1 : 0, Motion.confirm);
      // Solo el cruce hacia afuera: al regresar no hay nada que confirmar.
      if (crossed) runOnJS(tick)();
    }
  );

  /*
    El movimiento del panel, afinado a la baja. Los tres numeros de antes juntos hacian que un swipe
    se leyera como un zoom: el contenido entraba de golpe, recorria 52pt y crecia un 34%.

    - `p / 0.5` en vez de `/ 0.35`: el glifo aparece a mitad de la rendija y no de golpe con ella
      apenas abierta.
    - `ACTION * 0.28` (≈25pt) en vez de `ACTION / 2` (52pt): el contenido sigue centrandose en lo
      REVELADO —que es lo que arreglaba la etiqueta cortada— pero sin cruzar media pantalla.
    - `0.94 + p*0.06 + armed*0.04` (tope 1.04) en vez de `0.82 + p*0.18 + armed*0.1` (tope 1.10): un 10%
      de recorrido de escala se lee como respuesta; un 34% se lee como que algo se acerca a la camara.
  */
  const content = useAnimatedStyle(() => {
    // Sin overshoot el progreso no pasa de 1, pero se acota igual: un clamp de mas nunca
    // rompio nada y un NaN en un transform deja el panel invisible.
    const p = Math.min(Math.max(progress.value, 0), 1);
    return {
      opacity: Math.min(1, p / 0.5),
      transform: [
        { translateX: direction * (1 - p) * (ACTION * 0.28) },
        { scale: 0.94 + p * 0.06 + armed.value * 0.04 },
      ],
    };
  });

  return (
    <View style={[styles.action, { backgroundColor: background }]}>
      <Animated.View style={[styles.actionContent, content]}>
        <SymbolView
          name={glyph}
          size={22}
          tintColor={color}
          fallback={<Text style={[Type.label, { color }]}>{label}</Text>}
        />
        {/* El glifo dice la accion de un vistazo; la palabra la confirma para quien no lo lea. */}
        <Text style={[Type.micro, { color }]} numberOfLines={1}>
          {label}
        </Text>
      </Animated.View>
    </View>
  );
}

/**
 * Una tarea del dia: circulo para marcarla y gesto para las dos acciones de siempre.
 *
 * Derecha marca hecha, izquierda borra. El circulo hace lo mismo que el gesto porque un
 * gesto que nadie descubre no existe, y desmarcar cuesta lo mismo que marcar: equivocarse
 * no puede castigar.
 *
 * **Pinta antes de confirmar.** Antes esperaba al servidor y recargaba el dia entero: tachar una
 * tarea tardaba un viaje de red y mientras la fila se quedaba al 55% de opacidad. En la interaccion
 * mas frecuente de la app eso es justo la friccion que hace que no se use.
 *
 * Ahora el cambio se pinta YA con `mutate.patch`, que devuelve su propio deshacer, y la peticion va
 * detras. Si el servidor rechaza, se deshace y se avisa. Es lo que el comentario viejo dejaba como
 * techo, y ya se cruzo: el riesgo real no era pintar de mas, era que marcar se sintiera lento.
 */
export function TaskRow({
  task,
  accent,
  mutate,
  showTime = true,
  showDay = false,
  swipeEnabled = true,
}: {
  task: Task;
  accent?: AccentName;
  /** Pintar ya, quitar ya, y traer la verdad. Ver `TaskMutations` en `use-tasks`. */
  mutate: TaskMutations;
  /**
   * Apagar el gesto lateral. Lo usa la lista mientras se ARRASTRA una fila para reordenar: el asa vive
   * fuera de este componente justo para no compartir subarbol con el Pan del Swipeable, y apagarlo
   * durante el arrastre cierra el ultimo caso — el diagonal, donde un pulgar que sube tambien se
   * mueve de lado y el swipeable podria quedarse el gesto a medio viaje.
   */
  swipeEnabled?: boolean;
  /** El calendario ya pinta la hora en su columna: ahi la fila no la repite. */
  showTime?: boolean;
  /**
   * Cuando la fila NO pertenece al dia que se esta viendo hay que decir de cuando es. Lo usa el
   * backlog, que mezcla dias distintos y tareas sin fecha en una sola lista.
   */
  showDay?: boolean;
}) {
  const t = useTheme();
  // El tinte sale de la familia del foco, no del acento del usuario: asi un dia entero de
  // trabajo se lee verde de un vistazo. Sin foco cae en el acento del usuario, y sin acento
  // en el mismo default que `useAccent`.
  const tint = useAccent(accentForFocus(task.focusArea, accent ?? 'olive'));
  const { token } = useAuth();
  const swipe = useRef<SwipeableMethods | null>(null);
  /**
   * Guarda contra el doble toque. Es un ref y NO estado a proposito: no tiene que repintar nada —
   * con optimismo la fila ya se ve cambiada — y un estado aqui devolveria el parpadeo que se acaba
   * de quitar.
   */
  const sending = useRef(false);

  const done = task.status === 'done';

  // Un solo progreso manda el relleno, el borde, el glifo y el color del titulo: asi las cuatro
  // cosas cruzan juntas y no se ven como cuatro cambios. Arranca en su valor final para que las
  // tareas ya hechas no se animen al montar la lista.
  const mark = useSharedValue(done ? 1 : 0);
  const pop = useSharedValue(1);
  // El estado anterior en un ref: el efecto tambien corre al montar y ahi no hay nada que animar.
  const wasDone = useRef(done);

  useEffect(() => {
    if (wasDone.current === done) return;
    wasDone.current = done;
    mark.value = withTiming(done ? 1 : 0, CROSS);
    // 1.10 y no 1.16: en un circulo de 24pt un 16% son casi 4pt de salto, que en una lista de doce
    // filas se lee como un tic nervioso. 1.10 sigue acusando el toque sin brincar.
    pop.value = withSequence(withTiming(1.1, { duration: Motion.pop }), withSpring(1, Motion.confirm));
  }, [done, mark, pop]);

  // De `sunken` (el propio fondo de la fila, o sea "vacio") a `ink`, y el borde con el. En hecha
  // el borde queda del mismo color que el relleno: se lee como el circulo lleno de siempre.
  const circleStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(mark.value, [0, 1], [t.sunken, tint.ink]),
    borderColor: interpolateColor(mark.value, [0, 1], [t.textMuted, tint.ink]),
    transform: [{ scale: pop.value }],
  }));

  const glyphStyle = useAnimatedStyle(() => ({
    opacity: mark.value,
    // Entra creciendo desde el centro; sin esto el check aparece seco a tamaño final.
    transform: [{ scale: 0.6 + mark.value * 0.4 }],
  }));

  // El icono se apaga con el titulo. No desaparece: lo cerrado sigue siendo tuyo y se ve, solo que
  // ya no compite. 0.45 es donde deja de leerse como activo sin volverse invisible.
  const iconStyle = useAnimatedStyle(() => ({ opacity: 1 - mark.value * 0.55 }));

  // `textDecorationLine` no se puede animar, asi que el tachado sigue siendo instantaneo; lo que
  // cruza es el color, que es el cambio que ocupa toda la linea.
  const titleStyle = useAnimatedStyle(() => ({
    color: interpolateColor(mark.value, [0, 1], [t.text, t.textMuted]),
  }));

  const toggle = useCallback(() => {
    if (!token || sending.current) return;
    sending.current = true;
    const status = done ? 'pending' : 'done';
    // El cambio se ve AQUI, antes de que salga la peticion. `undo` restaura la tarea tal cual estaba.
    const undo = mutate.patch(task, { status });

    void (async () => {
      try {
        await tasksApi.update(token, task.id, { status });
      } catch {
        undo();
        Alert.alert('No pudimos guardarla', 'Inténtalo otra vez.');
      } finally {
        sending.current = false;
      }
    })();
  }, [token, task, done, mutate]);

  const remove = useCallback(() => {
    if (!token) return;
    // La fila se va en el mismo frame del toque. Borrar ya paso por un Alert, asi que aqui no hay
    // nada mas que preguntar.
    mutate.drop(task);

    void (async () => {
      try {
        await tasksApi.remove(token, task.id);
      } catch {
        // Sin deshacer propio: reinsertar en su sitio exacto necesitaria recordar el indice, y
        // `reload` trae la verdad entera — que es lo correcto cuando ya no sabemos que paso.
        await mutate.reload();
        Alert.alert('No pudimos borrarla', 'Inténtalo otra vez.');
      }
    })();
  }, [token, task, mutate]);

  const confirmRemove = useCallback(() => {
    // Borrar no se deshace, asi que se pregunta. Es la unica friccion a proposito de la fila.
    Alert.alert('¿Borrar esta tarea?', task.title, [
      { text: 'Dejarla', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: remove },
    ]);
  }, [task.title, remove]);

  const onCheck = useCallback(() => {
    // El mismo golpe que el gesto: la casilla y el swipe hacen lo mismo y tienen que sentirse igual.
    thud();
    void toggle();
  }, [toggle]);

  const onOpen = useCallback(
    (direction: SwipeDirection) => {
      thud();
      // La fila regresa a su sitio antes de la accion: el gesto se siente resuelto aunque la
      // respuesta del servidor tarde, y si el Alert se cancela no queda una fila abierta.
      swipe.current?.close();
      if (direction === SwipeDirection.RIGHT) void toggle();
      else confirmRemove();
    },
    [toggle, confirmRemove]
  );

  return (
    <ReanimatedSwipeable
      ref={swipe}
      // La fila NO se puede levantar con sombra: el `overflow: 'hidden'` que el panel del swipe
      // necesita para recortarse tambien recorta la sombra del propio layer en iOS.
      //
      // Asi que con el papel de vuelta en blanco le queda UNA señal: el hairline de `line`, que es
      // calido y por eso se ve sobre blanco. Es poco a proposito — una lista de doce cajas con
      // borde pesa mas que la lista misma — y es el limite: si la fila necesitara separarse mas,
      // el camino es `sunken` de relleno, no un borde mas grueso.
      containerStyle={[styles.container, { borderColor: t.line }]}
      // Arrastrar hacia la derecha revela el panel de la IZQUIERDA. De ahi el cruce.
      renderLeftActions={(progress) => (
        <SwipeFace
          progress={progress}
          direction={-1}
          label={done ? 'Pendiente' : 'Hecha'}
          glyph={
            done
              ? { ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' }
              : { ios: 'checkmark', android: 'check', web: 'check' }
          }
          background={tint.soft}
          color={t.text}
        />
      )}
      renderRightActions={(progress) => (
        <SwipeFace
          progress={progress}
          direction={1}
          label="Borrar"
          glyph={{ ios: 'trash', android: 'delete', web: 'delete' }}
          background={t.danger}
          color={t.onInk}
        />
      )}
      leftThreshold={ACTION * COMMIT}
      rightThreshold={ACTION * COMMIT}
      overshootLeft={false}
      overshootRight={false}
      dragOffsetFromLeftEdge={DRAG_OFFSET}
      dragOffsetFromRightEdge={DRAG_OFFSET}
      animationOptions={SPRING}
      enabled={swipeEnabled}
      onSwipeableOpen={onOpen}>
      <View style={[styles.row, { backgroundColor: t.surface }]}>
        {/* El ancla de la fila. Es lo que hace escaneable una lista larga: el area se reconoce por
            forma y color antes de leer una sola palabra, que es exactamente lo que hacen Tiimo con
            su emoji en circulo y las dos referencias de Dribbble con su cuadro tintado. Se apaga
            junto con el titulo al cerrar la tarea. */}
        <Animated.View style={iconStyle}>
          <Icon3D name={rowIcon(task)} size={Icon3DSize.md} />
        </Animated.View>

        <View style={styles.text}>
          <Animated.Text
            style={[Type.body, styles.title, titleStyle, done && styles.struck]}
            numberOfLines={2}>
            {task.title}
          </Animated.Text>
          <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
            {[
              showDay ? dayStamp(task.dueDate) : null,
              `${task.suggestedMinutes} min`,
              focusLabel(task.focusArea),
              showTime ? timeLabel(task.dueAt) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>

        {/* La casilla va al riel DERECHO. Es el patron de Tiimo y de Abode, y el argumento es de
            pulgar: en un telefono la mano llega antes a la derecha que a la izquierda, y ahi no
            compite con el icono por ser lo primero que se mira. */}
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done }}
          accessibilityLabel={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
          onPress={onCheck}
          hitSlop={Space.sm}
          style={styles.check}>
          {/* Sin marcar es un borde PUNTEADO: es la misma regla que el resto de la app usa para
              "esto te espera" (ver `dashed` en theme.ts), y de paso separa la casilla vacia de
              cualquier otro circulo. Al marcar el borde se vuelve solido y del color del relleno.
              Relleno en `tint.ink` con el glifo en `onInk`: ink es el unico paso que pasa AA y
              como invierte su luz entre esquemas el check contrasta en los dos. */}
          <Animated.View style={[styles.circle, done ? styles.solid : styles.pending, circleStyle]}>
            {/* Montado siempre, no `done && ...`: un glifo que aparece no puede crecer. */}
            <Animated.View style={glyphStyle}>
              <SymbolView
                name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                size={14}
                tintColor={t.onInk}
                fallback={<Text style={[Type.hint, { color: t.onInk }]}>✓</Text>}
              />
            </Animated.View>
          </Animated.View>
        </Pressable>
      </View>
    </ReanimatedSwipeable>
  );
}

const CIRCLE = 24;

const styles = StyleSheet.create({
  // `overflow` ya lo trae el estilo interno de Swipeable; se repite aqui para que el recorte no
  // dependa de un detalle de la libreria, y con el mismo radio que la fila para que el panel no
  // asome por las esquinas.
  container: { borderRadius: Radius.md, borderWidth: 1, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    paddingVertical: Space.md,
    // A la izquierda menos aire que a la derecha: la casilla trae 10pt propios dentro de su area
    // tactil de 44, asi que con Space.sm los dos extremos quedan opticamente a la misma distancia.
    paddingLeft: Space.lg,
    paddingRight: Space.sm,
    borderRadius: Radius.md,
  },
  check: {
    width: Touch.icon,
    height: Touch.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: CIRCLE,
    height: CIRCLE,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    // El borde vive SIEMPRE (antes solo en pendiente): es lo que se puede cruzar de color en vez
    // de aparecer y desaparecer. En hecha queda del color del relleno y no se distingue.
    borderWidth: 2,
  },
  /**
   * `borderStyle` no se puede animar, asi que el punteado no cruza: cambia de golpe al marcar. Es
   * justo el momento en que el relleno tambien salta, asi que se lee como UN cambio y no como dos.
   */
  pending: { borderStyle: 'dashed' },
  solid: { borderStyle: 'solid' },
  text: { flex: 1, gap: Space.xs },
  // El titulo es lo primero que se lee y ahora es lo unico que el usuario ve de su dia: medio
  // paso mas de peso que el resto del cuerpo lo separa de la meta gris de abajo.
  title: { fontWeight: '600' },
  struck: { textDecorationLine: 'line-through' },
  // Ancho fijo: de ahi sale cuanto se revela. La altura la estira el contenedor del panel
  // (es un absoluteFill), y un flexGrow aqui creceria a lo ANCHO y se comeria la medida.
  action: { width: ACTION, alignItems: 'center', justifyContent: 'center' },
  actionContent: { alignItems: 'center', gap: Space.xs },
});
