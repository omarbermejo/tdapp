import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState, type ComponentProps } from 'react';
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

import { Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import type { Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { FOCUS_AREAS } from '@/features/auth/options';

import { tasksApi } from './api';
import { accentForFocus } from './focus-accent';

/** Ancho del panel que se revela detras de la fila. */
const ACTION = 104;

/**
 * Fraccion del panel que hay que arrastrar para que la accion cuente. El mismo numero manda
 * el umbral del gesto Y el haptico, para que lo que sientes sea exactamente lo que va a pasar.
 */
const COMMIT = 0.72;

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
const POP = { mass: 0.6, damping: 12, stiffness: 380 } as const;

/** El cruce del relleno. Corto a proposito: acompaña al haptico, no lo hace esperar. */
const CROSS = { duration: 180 } as const;

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
      armed.value = withSpring(crossed ? 1 : 0, POP);
      // Solo el cruce hacia afuera: al regresar no hay nada que confirmar.
      if (crossed) runOnJS(tick)();
    }
  );

  const content = useAnimatedStyle(() => {
    // Sin overshoot el progreso no pasa de 1, pero se acota igual: un clamp de mas nunca
    // rompio nada y un NaN en un transform deja el panel invisible.
    const p = Math.min(Math.max(progress.value, 0), 1);
    return {
      // Aparece en el primer tercio: antes de eso la rendija es mas angosta que el glifo.
      opacity: Math.min(1, p / 0.35),
      transform: [
        { translateX: direction * (1 - p) * (ACTION / 2) },
        { scale: 0.82 + p * 0.18 + armed.value * 0.1 },
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
 * ponytail: no hay optimistic update — se espera al servidor y se recarga el dia entero. Con
 * pocas tareas el viaje se nota menos que el riesgo de pintar un estado que el API rechazo
 * (el 409 del cronometro es real). Techo: si la lista crece o la red empieza a doler, hay que
 * mover el estado a un cache de verdad y ahi si pintar antes de confirmar.
 */
export function TaskRow({
  task,
  accent,
  reload,
  showTime = true,
}: {
  task: Task;
  accent?: AccentName;
  reload: () => Promise<void> | void;
  /** El calendario ya pinta la hora en su columna: ahi la fila no la repite. */
  showTime?: boolean;
}) {
  const t = useTheme();
  // El tinte sale de la familia del foco, no del acento del usuario: asi un dia entero de
  // trabajo se lee verde de un vistazo. Sin foco cae en el acento del usuario, y sin acento
  // en el mismo default que `useAccent`.
  const tint = useAccent(accentForFocus(task.focusArea, accent ?? 'olive'));
  const { token } = useAuth();
  const swipe = useRef<SwipeableMethods | null>(null);
  const [busy, setBusy] = useState(false);

  const done = task.status === 'done';

  // Un solo progreso manda el relleno, el borde, el glifo y el color del titulo: asi las cuatro
  // cosas cruzan juntas y no se ven como cuatro cambios. Arranca en su valor final para que las
  // tareas ya hechas no se animen al montar la lista.
  const mark = useSharedValue(done ? 1 : 0);
  const pop = useSharedValue(1);
  const dim = useSharedValue(1);
  // El estado anterior en un ref: el efecto tambien corre al montar y ahi no hay nada que animar.
  const wasDone = useRef(done);

  useEffect(() => {
    if (wasDone.current === done) return;
    wasDone.current = done;
    mark.value = withTiming(done ? 1 : 0, CROSS);
    pop.value = withSequence(withTiming(1.16, { duration: 90 }), withSpring(1, POP));
  }, [done, mark, pop]);

  useEffect(() => {
    // La espera del servidor ya no es un corte a opacidad 0.5: se apaga y se prende.
    dim.value = withTiming(busy ? 0.55 : 1, { duration: 150 });
  }, [busy, dim]);

  const rowStyle = useAnimatedStyle(() => ({ opacity: dim.value }));

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

  // `textDecorationLine` no se puede animar, asi que el tachado sigue siendo instantaneo; lo que
  // cruza es el color, que es el cambio que ocupa toda la linea.
  const titleStyle = useAnimatedStyle(() => ({
    color: interpolateColor(mark.value, [0, 1], [t.text, t.textMuted]),
  }));

  const toggle = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      await tasksApi.update(token, task.id, { status: done ? 'pending' : 'done' });
      await reload();
    } catch {
      Alert.alert('No pudimos guardarla', 'Inténtalo otra vez.');
    } finally {
      // Siempre, tambien tras un fallo: si `busy` se queda pegado la fila queda muerta al gesto.
      setBusy(false);
    }
  }, [token, task.id, done, reload]);

  const remove = useCallback(async () => {
    if (!token) return;
    setBusy(true);
    try {
      await tasksApi.remove(token, task.id);
      await reload();
    } catch {
      Alert.alert('No pudimos borrarla', 'Inténtalo otra vez.');
    } finally {
      setBusy(false);
    }
  }, [token, task.id, reload]);

  const confirmRemove = useCallback(() => {
    // Borrar no se deshace, asi que se pregunta. Es la unica friccion a proposito de la fila.
    Alert.alert('¿Borrar esta tarea?', task.title, [
      { text: 'Dejarla', style: 'cancel' },
      { text: 'Borrar', style: 'destructive', onPress: remove },
    ]);
  }, [task.title, remove]);

  const onCheck = useCallback(() => {
    // El mismo golpe que el gesto: la casilla y el swipe hacen lo mismo y tienen que sentirse
    // igual. Y es la respuesta inmediata al toque, porque el relleno espera al servidor.
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
      enabled={!busy}
      // El cuerpo de la fila: `surface` sobre el canvas blanco da 1.02:1 y se lee como texto
      // flotando sin caja. Y una sombra como la de Card no sirve aqui, porque el `overflow:
      // 'hidden'` que el panel necesita para recortarse tambien recorta la sombra del propio
      // layer en iOS. Asi que el peso viene de dos señales y en cada esquema manda una:
      // `sunken` (1.14:1 en claro, 1.27:1 en oscuro) y el hairline de `line` (1.26:1 sobre
      // blanco, donde el relleno casi no se ve).
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
      onSwipeableOpen={onOpen}>
      <Animated.View style={[styles.row, { backgroundColor: t.sunken }, rowStyle]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: busy }}
          accessibilityLabel={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
          disabled={busy}
          onPress={onCheck}
          hitSlop={Space.sm}
          style={styles.check}>
          {/* `line` sobre `sunken` da 1.11:1 y el borde desaparece; `textMuted` da 5.0:1 en claro
              y 6.0:1 en oscuro, que es lo que hace que se lea como casilla y no como adorno.
              Relleno en `tint.ink` con el glifo en `onInk`: ink es el unico paso que pasa AA y
              como invierte su luz entre esquemas el check contrasta en los dos. */}
          <Animated.View style={[styles.circle, circleStyle]}>
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

        <View style={styles.text}>
          <Animated.Text
            style={[Type.body, styles.title, titleStyle, done && styles.struck]}
            numberOfLines={2}>
            {task.title}
          </Animated.Text>
          <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
            {[
              `${task.suggestedMinutes} min`,
              focusLabel(task.focusArea),
              showTime ? timeLabel(task.dueAt) : null,
            ]
              .filter(Boolean)
              .join(' · ')}
          </Text>
        </View>
      </Animated.View>
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
    gap: Space.sm,
    paddingVertical: Space.md,
    // La casilla ya trae 10pt de aire propio dentro de su area tactil de 44: con Space.xs el
    // circulo queda a 14 del borde, casi simetrico con los 16 de la derecha.
    paddingLeft: Space.xs,
    paddingRight: Space.lg,
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
