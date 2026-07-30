import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useCallback, useRef, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import ReanimatedSwipeable, {
  SwipeDirection,
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import { runOnJS, useAnimatedReaction, type SharedValue } from 'react-native-reanimated';

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
 */
function SwipeFace({
  progress,
  label,
  background,
  color,
}: {
  progress: SharedValue<number>;
  label: string;
  background: string;
  color: string;
}) {
  useAnimatedReaction(
    () => progress.value >= COMMIT,
    (crossed, previous) => {
      // Solo el cruce hacia afuera: al regresar no hay nada que confirmar.
      if (crossed && previous === false) runOnJS(tick)();
    }
  );

  return (
    <View style={[styles.action, { backgroundColor: background }]}>
      <Text style={[Type.label, { color }]}>{label}</Text>
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
        <SwipeFace progress={progress} label="Hecha" background={tint.soft} color={t.text} />
      )}
      renderRightActions={(progress) => (
        <SwipeFace progress={progress} label="Borrar" background={t.danger} color={t.onInk} />
      )}
      leftThreshold={ACTION * COMMIT}
      rightThreshold={ACTION * COMMIT}
      overshootLeft={false}
      overshootRight={false}
      dragOffsetFromLeftEdge={DRAG_OFFSET}
      dragOffsetFromRightEdge={DRAG_OFFSET}
      animationOptions={SPRING}
      onSwipeableOpen={onOpen}>
      <View style={[styles.row, { backgroundColor: t.sunken }, busy && styles.busy]}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: done, disabled: busy }}
          accessibilityLabel={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
          disabled={busy}
          onPress={toggle}
          hitSlop={Space.sm}
          style={styles.check}>
          <View
            style={[
              styles.circle,
              // `line` sobre `sunken` da 1.11:1 y el borde desaparece; `textMuted` da 5.0:1 en
              // claro y 6.0:1 en oscuro, que es lo que hace que se lea como casilla y no como
              // adorno. Relleno en `tint.ink` con el glifo en `onInk`: ink es el unico paso que
              // pasa AA y como invierte su luz entre esquemas el check contrasta en los dos.
              done
                ? { backgroundColor: tint.ink }
                : { borderColor: t.textMuted, borderWidth: 2 },
            ]}>
            {done && (
              <SymbolView
                name={{ ios: 'checkmark', android: 'check', web: 'check' }}
                size={14}
                tintColor={t.onInk}
                fallback={<Text style={[Type.hint, { color: t.onInk }]}>✓</Text>}
              />
            )}
          </View>
        </Pressable>

        <View style={styles.text}>
          <Text
            style={[
              Type.body,
              styles.title,
              { color: done ? t.textMuted : t.text },
              done && styles.struck,
            ]}
            numberOfLines={2}>
            {task.title}
          </Text>
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
    gap: Space.sm,
    paddingVertical: Space.md,
    // La casilla ya trae 10pt de aire propio dentro de su area tactil de 44: con Space.xs el
    // circulo queda a 14 del borde, casi simetrico con los 16 de la derecha.
    paddingLeft: Space.xs,
    paddingRight: Space.lg,
    borderRadius: Radius.md,
  },
  busy: { opacity: 0.5 },
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
  },
  text: { flex: 1, gap: Space.xs },
  // El titulo es lo primero que se lee y ahora es lo unico que el usuario ve de su dia: medio
  // paso mas de peso que el resto del cuerpo lo separa de la meta gris de abajo.
  title: { fontWeight: '600' },
  struck: { textDecorationLine: 'line-through' },
  // Ancho fijo: de ahi sale cuanto se revela. La altura la estira el contenedor del panel
  // (es un absoluteFill), y un flexGrow aqui creceria a lo ANCHO y se comeria la medida.
  action: { width: ACTION, alignItems: 'center', justifyContent: 'center' },
});
