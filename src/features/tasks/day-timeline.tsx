import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Radius, Space, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import type { Task } from '@/features/auth/api';

import { accentForFocus } from './focus-accent';
import { TaskRow } from './task-row';

/** Ancho de la columna de horas: '09:00' en 15pt cabe aqui. */
const HOUR_W = 46;
const RAIL = 3;
/** Separacion entre la columna de horas y el riel. */
const GUTTER = Space.md;

/**
 * Puntos por minuto del hueco entre dos tareas.
 *
 * Es lo que arregla lo que se sentia rigido: en una lista, 90 minutos y 10 minutos miden
 * igual, asi que la pantalla decia el ORDEN pero no el tiempo. Con esto una manana libre se
 * ve libre y tres cosas encimadas se ven encimadas.
 *
 * 0.4 sale de la pantalla, no de la teoria: una hora da 24pt (se nota) y las 9 horas entre
 * una tarea de la manana y una de la noche darian 216pt, que ya es scroll de mas. De ahi el
 * techo — a partir de dos horas el hueco deja de crecer y solo dice "aqui hay mucho".
 */
const PPM = 0.4;
const GAP_MIN = Space.sm;
const GAP_MAX = 116;

/** Minutos desde medianoche. */
const minutesOf = (iso: string) => {
  const at = new Date(iso);
  return at.getHours() * 60 + at.getMinutes();
};

const gapHeight = (from: number, to: number) =>
  Math.min(GAP_MAX, Math.max(GAP_MIN, (to - from) * PPM));

const hourLabel = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit', hour12: false })
    : '—';

const clockLabel = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

type Props = {
  tasks: Task[];
  /** Acento del usuario: el default de las tareas sin foco. */
  fallback: AccentName;
  /** Solo en hoy se pinta la marca de ahora. */
  isToday: boolean;
  /** Minutos desde medianoche; el padre lo mueve cada minuto. */
  minutes: number;
  reload: () => Promise<void> | void;
};

/**
 * El dia como franja de tiempo.
 *
 * El riel no es un adorno que une tarjetas: es el dia. Cada tarea lo tine con el color de su
 * familia, asi que la columna izquierda contesta de un vistazo la pregunta que importa —
 * "¿mi dia es todo trabajo?" — sin leer un solo titulo.
 */
export function DayTimeline({ tasks, fallback, isToday, minutes, reload }: Props) {
  return (
    <View>
      {tasks.map((task, i) => {
        const previous = tasks[i - 1];
        const at = task.dueAt ? minutesOf(task.dueAt) : null;
        const before = previous?.dueAt ? minutesOf(previous.dueAt) : null;

        return (
          <View key={task.id}>
            {/* El hueco solo existe entre dos tareas con hora: sin hora no hay distancia que medir. */}
            {before !== null && at !== null && (
              <Gap
                height={gapHeight(before, at)}
                // La marca cae DENTRO del hueco, en la fraccion exacta que ya transcurrio.
                now={isToday && minutes > before && minutes <= at ? (minutes - before) / (at - before) : null}
                minutes={minutes}
                fallback={fallback}
              />
            )}
            {i === 0 && isToday && at !== null && minutes <= at && (
              <Gap height={GAP_MIN} now={1} minutes={minutes} fallback={fallback} />
            )}

            <Slot task={task} fallback={fallback} reload={reload} index={i} />
          </View>
        );
      })}

      {/* Todas las horas del dia ya pasaron: la marca cierra la franja. */}
      {isToday && tasks.length > 0 && lastPassed(tasks, minutes) && (
        <Gap height={GAP_MIN} now={0} minutes={minutes} fallback={fallback} />
      )}
    </View>
  );
}

/** True cuando ninguna tarea con hora queda por venir. */
const lastPassed = (tasks: Task[], minutes: number) =>
  !tasks.some((task) => task.dueAt && minutesOf(task.dueAt) > minutes);

/** Una tarea: hora, tramo de riel con su color, y la fila de siempre. */
function Slot({
  task,
  fallback,
  reload,
  index,
}: {
  task: Task;
  fallback: AccentName;
  reload: () => Promise<void> | void;
  index: number;
}) {
  const t = useTheme();
  const accent = accentForFocus(task.focusArea, fallback);
  const tint = useAccent(accent);
  const done = task.status === 'done';

  return (
    <Animated.View
      // Escalonada y lenta: Tiimo lo dice explicito — el movimiento guia la atencion, no la
      // exige. 70ms entre filas alcanza para leer el orden en que aparecen sin que se sienta lento.
      entering={FadeInDown.delay(index * 70).duration(420)}
      style={styles.row}>
      <Text style={[Type.label, styles.hour, { color: task.dueAt ? t.text : t.textMuted }]}>
        {hourLabel(task.dueAt)}
      </Text>

      {/*
        El tramo de riel de esta tarea. Lo hecho baja a `soft` y no a `sunken`: apagarlo del
        todo borraba la franja de color entera en un dia ya trabajado, que es justo cuando
        sirve para leer en que se fue el dia. Se apaga, no se va.
      */}
      <View style={styles.railSlot}>
        <View style={[styles.segment, { backgroundColor: done ? tint.soft : tint.solid }]} />
      </View>

      <View style={styles.body}>
        <TaskRow task={task} accent={accent} reload={reload} showTime={false} />
      </View>
    </Animated.View>
  );
}

/**
 * El aire entre dos tareas, alto en proporcion al tiempo. Si ahora cae aqui, la marca se
 * pinta en su fraccion: ver cuanto del hueco ya se fue es lo que hace sentir el dia pasar.
 */
function Gap({
  height,
  now,
  minutes,
  fallback,
}: {
  height: number;
  now: number | null;
  minutes: number;
  fallback: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(fallback);
  const pulse = useSharedValue(1);

  useEffect(() => {
    if (now === null) return;
    // Late y lento: es un signo de vida, no una alarma. 1.4s por lado no llama la atencion.
    pulse.value = withRepeat(withTiming(1.6, { duration: 1400 }), -1, true);
  }, [now, pulse]);

  const dot = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={[styles.gap, { height }]}>
      <View style={[styles.gapRail, { backgroundColor: t.line }]} />
      {now !== null && (
        <View
          style={[styles.nowRow, { top: Math.max(0, Math.min(height - 1, height * now - 0.5)) }]}
          accessibilityLabel={`Ahora, ${clockLabel(minutes)}`}>
          <Text style={[Type.hint, styles.nowHour, { color: tint.ink }]}>{clockLabel(minutes)}</Text>
          <Animated.View style={[styles.nowDot, { backgroundColor: tint.ink }, dot]} />
          <View style={[styles.nowLine, { backgroundColor: tint.ink }]} />
        </View>
      )}
    </View>
  );
}

const DOT = 6;
/** Centro de la columna del riel, para alinear el punto y la linea. */
const RAIL_X = HOUR_W + GUTTER;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center' },
  hour: { width: HOUR_W, textAlign: 'right' },
  railSlot: { width: GUTTER * 2, alignItems: 'center', alignSelf: 'stretch' },
  // Alto completo de la fila: el tramo mide lo que dura visualmente la tarjeta.
  segment: { width: RAIL, flex: 1, borderRadius: Radius.pill, marginVertical: Space.xs },
  body: { flex: 1 },

  gap: { position: 'relative' },
  gapRail: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: RAIL_X - 1,
    width: 2,
  },
  nowRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowHour: { width: HOUR_W, textAlign: 'right' },
  nowDot: {
    width: DOT,
    height: DOT,
    borderRadius: Radius.pill,
    marginLeft: GUTTER - DOT / 2,
  },
  nowLine: { flex: 1, height: 1, marginLeft: GUTTER - DOT / 2 },
});
