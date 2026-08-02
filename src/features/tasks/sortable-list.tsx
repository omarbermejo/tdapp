import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

import { Motion, Space, Touch, Type, useTheme, type AccentName } from '@/constants/theme';
import type { Task } from '@/features/auth/api';

import { TaskRow } from './task-row';
import type { TaskMutations } from './use-tasks';

/**
 * Las filas se apartan para hacer hueco a la que va en la mano.
 *
 * Muelle y no duracion: tienen que sentirse como que se APARTAN, no como que se teletransportan.
 * ζ≈0.9, casi sin rebote — con rebote la lista entera parece gelatina.
 */
const SETTLE = { damping: 20, stiffness: 260, mass: 0.7 } as const;

/** Lo que la fila levantada crece. Discreto: la levanta un dedo, no un salto. */
const LIFT = 1.03;

/** Alto de fila con el que se calcula el salto antes de que `onLayout` haya medido nada. */
const FALLBACK_ROW = 72;

/**
 * Ancho del asa. Con `hitSlop` llega a los 44 de `Touch.icon` sin gastarlos de ancho de fila.
 *
 * Se exporta porque las filas ya CERRADAS no llevan asa y tienen que alinearse con las que si: sin
 * ese sangrado la lista se lee como dos listas distintas en vez de una con un final.
 */
export const GRIP = 28;

const tick = () => {
  Haptics.selectionAsync().catch(() => {});
};

const thud = () => {
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
};

/**
 * Mueve el elemento `from` a la posicion `to`. Fuera de todo componente y sin mutar el original: el
 * resultado alimenta un updater de `setState`, que React puede ejecutar dos veces.
 */
export const moved = <T,>(list: T[], from: number, to: number): T[] => {
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
};

/**
 * Una lista de tareas que se reordena arrastrando desde el asa.
 *
 * **El asa vive FUERA del `ReanimatedSwipeable` de la fila**, y eso es lo que hace que funcione: el
 * Swipeable trae su propio `Gesture.Pan` con `activeOffsetX`, y dos Pan en los mismos 44pt hay que
 * coordinarlos a mano — con el problema de que `SwipeableMethods` es un handle imperativo y no un
 * `GestureRef`, asi que no hay a quien apuntar con `blocksExternalGesture`. Envolviendo la fila un
 * nivel mas arriba, los dos gestos nunca comparten subarbol y no hay nada que coordinar.
 *
 * Se construye a mano y no con una libreria porque ninguna de drag-and-drop soporta con garantias
 * reanimated 4 sobre RN 0.86. El musculo ya estaba en el repo: `dial-picker` hace un Pan con worklets
 * bastante mas dificil que este.
 *
 * **Solo emite el orden nuevo; no lo guarda.** Quien recibe `onReorder` es quien conoce el dia entero —
 * esta lista solo ve las pendientes, y guardar desde aqui borraria las cerradas del estado local.
 *
 * Sin autoscroll en los bordes: mientras se arrastra, la pantalla apaga su scroll (`onDragChange`), asi
 * que solo se reordena dentro de lo que se ve. Techo aceptado — un dia mas largo que la pantalla se
 * reordena en dos gestos.
 */
export function SortableTasks({
  tasks,
  accent,
  mutate,
  onReorder,
  onDragChange,
}: {
  tasks: Task[];
  accent?: AccentName;
  mutate: TaskMutations;
  /** El orden nuevo, ya movido. Vacio si el gesto no cambio nada. */
  onReorder: (next: Task[]) => void;
  /** Le dice a la pantalla que apague su scroll mientras el dedo esta abajo. */
  onDragChange: (dragging: boolean) => void;
}) {
  /**
   * Las alturas de cada fila, medidas.
   *
   * No son uniformes: un titulo de dos lineas mide 96pt contra 72. Se miden con `onLayout` a un estado
   * y un efecto las copia al shared value — escribir un shared value DESDE el handler es justo lo que
   * el compilador de React prohibe, y `onLayout` es un handler.
   */
  const [heights, setHeights] = useState<number[]>([]);
  const rowHeights = useSharedValue<number[]>([]);
  useEffect(() => {
    rowHeights.set(heights);
  }, [heights, rowHeights]);

  /** Que fila va en la mano (-1 = ninguna), cuanto se ha movido, y a que indice caeria. */
  const held = useSharedValue(-1);
  const shift = useSharedValue(0);
  const target = useSharedValue(-1);

  const measure = useCallback((index: number, height: number) => {
    setHeights((current) => {
      if (current[index] === height) return current;
      const next = [...current];
      next[index] = height;
      return next;
    });
  }, []);

  const commit = useCallback(
    (from: number, to: number) => {
      if (from === to) return;
      onReorder(moved(tasks, from, to));
    },
    [tasks, onReorder]
  );

  /** Mover una posicion sin arrastrar, para quien usa un lector de pantalla. */
  const nudge = useCallback(
    (index: number, delta: number) => {
      const to = index + delta;
      if (to < 0 || to >= tasks.length) return;
      tick();
      onReorder(moved(tasks, index, to));
    },
    [tasks, onReorder]
  );

  return (
    <View style={styles.list}>
      {tasks.map((task, index) => (
        <SortableRow
          key={task.id}
          task={task}
          index={index}
          total={tasks.length}
          accent={accent}
          mutate={mutate}
          held={held}
          shift={shift}
          target={target}
          rowHeights={rowHeights}
          onMeasure={measure}
          onCommit={commit}
          onDragChange={onDragChange}
          onNudge={nudge}
        />
      ))}
    </View>
  );
}

/** Componente aparte porque cada fila necesita sus propios shared values y su propio gesto. */
function SortableRow({
  task,
  index,
  total,
  accent,
  mutate,
  held,
  shift,
  target,
  rowHeights,
  onMeasure,
  onCommit,
  onDragChange,
  onNudge,
}: {
  task: Task;
  index: number;
  total: number;
  accent?: AccentName;
  mutate: TaskMutations;
  held: SharedValue<number>;
  shift: SharedValue<number>;
  target: SharedValue<number>;
  rowHeights: SharedValue<number[]>;
  onMeasure: (index: number, height: number) => void;
  onCommit: (from: number, to: number) => void;
  onDragChange: (dragging: boolean) => void;
  onNudge: (index: number, delta: number) => void;
}) {
  const t = useTheme();
  /**
   * El arrastre tambien vive en estado y no solo en el shared value: la fila tiene que APAGAR su swipe
   * mientras se arrastra, y `enabled` es una prop de React, no un estilo.
   */
  const [dragging, setDragging] = useState(false);

  /**
   * La crecida de la fila levantada, en su PROPIO shared value.
   *
   * No puede vivir dentro de `useAnimatedStyle` como `withTiming(LIFT)`: ese worklet lee `shift`, que
   * cambia en cada frame del arrastre, asi que la animacion se reiniciaria sesenta veces por segundo y
   * la escala no llegaria nunca. Disparada desde el gesto, ocurre una vez.
   */
  const lift = useSharedValue(1);

  const setDrag = useCallback(
    (on: boolean) => {
      setDragging(on);
      onDragChange(on);
    },
    [onDragChange]
  );

  /**
   * Vertical y solo vertical: 6pt de intencion arriba o abajo lo activan, y 12 en horizontal lo
   * cancelan para que un gesto lateral que empiece en el asa siga siendo del swipe de la fila.
   */
  const drag = Gesture.Pan()
    .activeOffsetY([-6, 6])
    .failOffsetX([-12, 12])
    .onStart(() => {
      held.set(index);
      shift.set(0);
      target.set(index);
      lift.set(withTiming(LIFT, { duration: Motion.pop }));
      runOnJS(setDrag)(true);
      runOnJS(thud)();
    })
    .onUpdate((event) => {
      shift.set(event.translationY);

      // A que indice caeria. El paso es el alto de ESTA fila mas el aire de la lista.
      const step = (rowHeights.get()[index] ?? FALLBACK_ROW) + Space.md;
      const next = Math.min(Math.max(index + Math.round(event.translationY / step), 0), total - 1);

      if (next !== target.get()) {
        target.set(next);
        runOnJS(tick)();
      }
    })
    .onEnd(() => {
      const to = target.get();
      // El viaje de vuelta y el aterrizaje del hueco son el mismo muelle: se resuelven juntos.
      shift.set(withSpring(0, SETTLE));
      lift.set(withTiming(1, { duration: Motion.pop }));
      held.set(-1);
      target.set(-1);
      runOnJS(thud)();
      runOnJS(setDrag)(false);
      runOnJS(onCommit)(index, to);
    });

  /**
   * El desplazamiento de ESTA fila.
   *
   * La que va en la mano sigue al dedo. Las demas se apartan un puesto —hacia arriba si la levantada
   * viene de abajo, hacia abajo si viene de arriba— y ese hueco es lo que hace legible donde va a caer.
   * El alto que se usa para apartarse es el de la fila LEVANTADA, no el propio: es el hueco que deja
   * ella.
   *
   * El `withSpring` de las que se apartan si puede vivir aqui: este worklet no lee `shift` en esa rama,
   * asi que reanimated no lo re-ejecuta en cada frame — solo cuando `target` cambia, o sea al cruzar
   * una fila, que es exactamente cuando el muelle tiene que arrancar.
   */
  const style = useAnimatedStyle(() => {
    const from = held.get();
    if (from === -1) return { transform: [{ translateY: 0 }, { scale: 1 }], zIndex: 0 };

    if (from === index) {
      return {
        transform: [{ translateY: shift.get() }, { scale: lift.get() }],
        // Encima de todas: si no, la fila levantada pasa por DEBAJO de la siguiente.
        zIndex: 10,
      };
    }

    const gap = (rowHeights.get()[from] ?? FALLBACK_ROW) + Space.md;
    const to = target.get();
    let offset = 0;
    // Bajo la levantada: las de en medio suben para dejar el hueco abajo.
    if (from < index && index <= to) offset = -gap;
    // Sobre la levantada: las de en medio bajan.
    else if (from > index && index >= to) offset = gap;

    return { transform: [{ translateY: withSpring(offset, SETTLE) }, { scale: 1 }], zIndex: 0 };
  });

  return (
    <Animated.View
      style={[styles.row, style]}
      onLayout={(event) => onMeasure(index, event.nativeEvent.layout.height)}>
      <GestureDetector gesture={drag}>
        {/*
          El asa. `adjustable` con acciones de subir y bajar no es opcional: quien usa VoiceOver no
          puede arrastrar, y sin esto el orden manual seria una funcion que solo existe para quien ve
          la pantalla.
        */}
        <View
          accessibilityRole="adjustable"
          accessibilityLabel={`Mover "${task.title}". Posición ${index + 1} de ${total}`}
          accessibilityActions={[
            { name: 'increment', label: 'Subir' },
            { name: 'decrement', label: 'Bajar' },
          ]}
          onAccessibilityAction={(event) => {
            if (event.nativeEvent.actionName === 'increment') onNudge(index, -1);
            if (event.nativeEvent.actionName === 'decrement') onNudge(index, 1);
          }}
          hitSlop={Space.md}
          style={styles.grip}>
          <SymbolView
            name={{ ios: 'line.3.horizontal', android: 'drag_handle', web: 'drag_handle' }}
            size={18}
            tintColor={t.textMuted}
            fallback={<Text style={[Type.label, { color: t.textMuted }]}>≡</Text>}
          />
        </View>
      </GestureDetector>

      <View style={styles.fill}>
        <TaskRow task={task} accent={accent} mutate={mutate} swipeEnabled={!dragging} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  list: { gap: Space.md },
  row: { flexDirection: 'row', alignItems: 'center' },
  grip: {
    width: GRIP,
    minHeight: Touch.icon,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fill: { flex: 1 },
});
