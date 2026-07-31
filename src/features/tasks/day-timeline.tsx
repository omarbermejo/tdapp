import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Radius, Space, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
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
 * Bajo a proposito. La primera version usaba 0.4 con techo de 116pt y produjo el problema
 * opuesto al que arreglaba: una tarde sin nada dejaba medio pantallazo de vacio muerto, sin
 * ritmo. Ahora la estructura del dia la cargan las franjas y el hueco solo insinua la
 * distancia, no la representa a escala.
 */
const PPM = 0.22;
const GAP_MIN = Space.sm;
const GAP_MAX = 56;

/** Desde este hueco vale la pena decir cuanto es: menos de 45 min no es "tiempo libre". */
const LABEL_FROM = 45;

/** Las tres franjas del dia. Los limites son los del catalogo peakEnergy del backend. */
const BANDS = [
  { key: 'morning', label: 'Mañana', until: 12 * 60 },
  { key: 'afternoon', label: 'Tarde', until: 18 * 60 },
  { key: 'night', label: 'Noche', until: 24 * 60 },
] as const;

/** Minutos desde medianoche. */
const minutesOf = (iso: string) => {
  const at = new Date(iso);
  return at.getHours() * 60 + at.getMinutes();
};

const bandOf = (minutes: number) => BANDS.find((band) => minutes < band.until) ?? BANDS[2];

const gapHeight = (span: number) => Math.min(GAP_MAX, Math.max(GAP_MIN, span * PPM));

/** '1 h 30' · '2 h' · '50 min'. Sin ceros de relleno: es una etiqueta, no un reloj. */
const spanLabel = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} min`;
  return rest ? `${hours} h ${rest}` : `${hours} h`;
};

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
  /** Su mejor franja, del onboarding. Se marca en el encabezado. */
  peakEnergy?: string;
  /** Solo en hoy se pinta la marca de ahora. */
  isToday: boolean;
  /** Minutos desde medianoche; el padre lo mueve cada minuto. */
  minutes: number;
  reload: () => Promise<void> | void;
};

/**
 * El dia por franjas.
 *
 * Tercera version, y las dos anteriores explican esta. Una lista dice el ORDEN pero no el
 * tiempo. Huecos a escala dicen el tiempo pero dejan vacios sin ritmo. Manana, tarde y noche
 * como secciones dan la estructura, y dentro de cada una el hueco insinua la distancia.
 *
 * Las franjas son las mismas del catalogo `peakEnergy`, asi que la que la persona eligio en
 * el onboarding se marca aqui: el dato que dio se le devuelve convertido en orientacion, en
 * vez de quedar guardado en un perfil que no vuelve a ver.
 *
 * El riel lo tine cada tarea con el color de su familia: la columna izquierda contesta
 * "¿mi dia es todo trabajo?" sin leer un solo titulo.
 */
export function DayTimeline({ tasks, fallback, peakEnergy, isToday, minutes, reload }: Props) {
  const timed = tasks.filter((task) => task.dueAt);
  const untimed = tasks.filter((task) => !task.dueAt);

  // El escalonado de la entrada tiene que ser continuo de una franja a la siguiente, asi que
  // el orden se resuelve una vez sobre la lista completa. Un contador que se fuera sumando
  // dentro del map seria mutacion durante el render, y con React Compiler eso es un error.
  const order = new Map(tasks.map((task, i) => [task.id, i]));

  return (
    <View style={styles.day}>
      {BANDS.map((band) => {
        const inBand = timed.filter((task) => bandOf(minutesOf(task.dueAt!)).key === band.key);
        if (!inBand.length) return null;

        return (
          <Band
            key={band.key}
            label={band.label}
            isPeak={peakEnergy === band.key}
            tasks={inBand}
            fallback={fallback}
            isToday={isToday}
            minutes={minutes}
            reload={reload}
            order={order}
          />
        );
      })}

      {/* Sin hora: no viven en ninguna franja, asi que van al final con su propio titulo. */}
      {untimed.length > 0 && (
        <Band
          label="Sin hora"
          tasks={untimed}
          fallback={fallback}
          isToday={false}
          minutes={minutes}
          reload={reload}
          order={order}
        />
      )}
    </View>
  );
}

/** Una franja: titulo, sus tareas y los huecos entre ellas. */
function Band({
  label,
  isPeak,
  tasks,
  fallback,
  isToday,
  minutes,
  reload,
  order,
}: {
  label: string;
  isPeak?: boolean;
  tasks: Task[];
  fallback: AccentName;
  isToday: boolean;
  minutes: number;
  reload: () => Promise<void> | void;
  order: Map<number, number>;
}) {
  const t = useTheme();
  const tint = useAccent(fallback);

  return (
    <View>
      <View style={styles.bandHead}>
        <Text style={[Type.micro, { color: t.textMuted }]}>{label}</Text>
        {/* Su mejor momento, en su color: es lo unico que se resalta del encabezado. */}
        {isPeak && <Text style={[Type.micro, { color: tint.ink }]}>· Tu mejor momento</Text>}
      </View>

      {tasks.map((task, i) => {
        const previous = tasks[i - 1];
        const at = task.dueAt ? minutesOf(task.dueAt) : null;
        const before = previous?.dueAt ? minutesOf(previous.dueAt) : null;
        const inGap = before !== null && at !== null && isToday && minutes > before && minutes <= at;

        return (
          <View key={task.id}>
            {before !== null && at !== null && (
              <Gap
                span={at - before}
                now={inGap ? (minutes - before) / (at - before) : null}
                minutes={minutes}
                fallback={fallback}
              />
            )}
            <Slot task={task} fallback={fallback} reload={reload} index={order.get(task.id) ?? i} />
          </View>
        );
      })}
    </View>
  );
}

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
      // exige. 70ms entre filas alcanza para leer el orden sin que se sienta lento.
      entering={FadeInDown.delay(index * Motion.step).duration(Motion.enter)}
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
 * El aire entre dos tareas.
 *
 * Desde 45 minutos dice cuanto es. Un hueco rotulado deja de ser ausencia y pasa a ser un
 * dato: "2 h libre" es algo que se puede usar; medio pantallazo en blanco no dice nada.
 */
function Gap({
  span,
  now,
  minutes,
  fallback,
}: {
  span: number;
  now: number | null;
  minutes: number;
  fallback: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(fallback);
  const pulse = useSharedValue(1);
  const height = gapHeight(span);

  useEffect(() => {
    if (now === null) return;
    // Lento: es un signo de vida, no una alarma. 1.4s por lado no llama la atencion.
    pulse.value = withRepeat(withTiming(1.6, { duration: Motion.pulse }), -1, true);
  }, [now, pulse]);

  const dot = useAnimatedStyle(() => ({ transform: [{ scale: pulse.value }] }));

  return (
    <View style={[styles.gap, { height }]}>
      <View style={[styles.gapRail, { backgroundColor: t.line }]} />

      {span >= LABEL_FROM && now === null && (
        <Text style={[Type.hint, styles.gapLabel, { color: t.textMuted }]}>
          {spanLabel(span)} libre
        </Text>
      )}

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
/** Centro de la columna del riel, para alinear el punto, la linea y el rotulo. */
const RAIL_X = HOUR_W + GUTTER;

const styles = StyleSheet.create({
  day: { gap: Space.xl },
  // El titulo se alinea con las tarjetas, no con la columna de horas.
  bandHead: {
    flexDirection: 'row',
    gap: Space.xs,
    paddingLeft: RAIL_X + GUTTER,
    paddingBottom: Space.sm,
  },

  row: { flexDirection: 'row', alignItems: 'center' },
  hour: { width: HOUR_W, textAlign: 'right' },
  railSlot: { width: GUTTER * 2, alignItems: 'center', alignSelf: 'stretch' },
  segment: { width: RAIL, flex: 1, borderRadius: Radius.pill, marginVertical: Space.xs },
  body: { flex: 1 },

  gap: { position: 'relative', justifyContent: 'center' },
  gapRail: { position: 'absolute', top: 0, bottom: 0, left: RAIL_X - 1, width: 2 },
  gapLabel: { paddingLeft: RAIL_X + GUTTER },

  nowRow: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  nowHour: { width: HOUR_W, textAlign: 'right' },
  nowDot: { width: DOT, height: DOT, borderRadius: Radius.pill, marginLeft: GUTTER - DOT / 2 },
  nowLine: { flex: 1, height: 1, marginLeft: GUTTER - DOT / 2 },
});
