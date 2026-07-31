import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useReducedMotion,
} from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { Choice, type Option } from '@/components/ui/choice';
import { Confetti } from '@/components/ui/confetti';
import { Bud } from '@/components/ui/stem';
import { Space, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { tasksApi } from '@/features/tasks/api';
import { useLocalToday } from '@/features/tasks/day';
import { accentForFocus } from '@/features/tasks/focus-accent';
import { useTasks } from '@/features/tasks/use-tasks';
import { armAlarm, disarmAlarm } from '@/features/timer/alarm';
import { DIAL, Dial, litTicks } from '@/features/timer/dial';
import { DialPicker } from '@/features/timer/dial-picker';
import { useFocusMode } from '@/features/timer/focus-mode';
import { hideBlock, showBlock } from '@/features/timer/outside';
import { ROUNDS, clock, usePomodoro, type Phase } from '@/features/timer/pomodoro';

import { TAB_DOCK } from './_layout';

/**
 * El cronómetro pomodoro.
 *
 * Es la pantalla que faltaba: el cronómetro vivía en el API (`POST /tasks/:id/timer`) desde el
 * principio, pero en la app solo existió como una tarjeta en el home que contaba hacia ARRIBA, y se
 * fue por eso — pasarse de los 25 minutos se leía como una app rota. Aquí cuenta hacia abajo, tiene
 * su propia pantalla y el bloque tiene final.
 *
 * La carátula es el único control: se gira para elegir los minutos y se queda para contarlos. Los
 * minutos no viven en un selector aparte porque la decisión y su resultado son el mismo objeto.
 *
 * Al arrancar, la pantalla entra en modo enfoque: la cápsula de pestañas se aparta y lo que queda se
 * centra. Un toque en el fondo la devuelve sin parar el bloque — enfocarse cincuenta minutos no
 * puede significar quedarse encerrado.
 *
 * Enganchar una tarea NO es decoración: arranca también el cronómetro del servidor, así que los
 * minutos se acumulan en `elapsedSeconds` y el widget ve el bloque en curso. Sin tarea el pomodoro
 * funciona igual — obligar a elegir una antes de empezar es justo la fricción que hace que nadie lo
 * use.
 */

/** Lo que cada bloque dice de sí mismo: la etiqueta de la carátula, la línea y el aviso del final. */
const PHASES: Record<Phase, { micro: string; line: string; alarm: string }> = {
  focus: {
    micro: 'Enfoque',
    line: 'Una cosa. Cuando suene, paras.',
    alarm: 'Bloque cerrado. Te toca descanso.',
  },
  short: {
    micro: 'Descanso corto',
    line: 'Levántate. No abras nada que engancha.',
    alarm: 'Descanso listo. ¿Otro bloque?',
  },
  long: {
    micro: 'Descanso largo',
    line: 'Cerraste el ciclo. Este te lo ganaste.',
    alarm: 'Descanso largo listo. Ciclo nuevo cuando quieras.',
  },
};

/** Sin tarea es una opción a la vista: un chip de selección única no se puede desmarcar. */
const NONE = '';

/**
 * El título de una tarea cabe en 120 caracteres y el chip no. Se recorta solo para la etiqueta: la
 * línea de debajo de la carátula sí lo dice entero, que es donde importa leerlo.
 */
const chipLabel = (title: string) => (title.length > 26 ? `${title.slice(0, 25)}…` : title);

/** 'termina 7:16' con el reloj del teléfono. Es lo que Android muestra en vez de una cuenta atrás. */
const endsAtLabel = (at: number) =>
  `termina ${new Date(at).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`;

/** El tramo del bloque en curso, para poder repintarlo fuera de la app al pausar. */
type Span = { startedAt: number; endsAt: number };

export default function TimerScreen() {
  const { user, token } = useAuth();
  const t = useTheme();
  const today = useLocalToday();
  // Las tareas de hoy son las que se pueden enfocar: enganchar la del jueves no significa nada.
  const day = useTasks(today);
  const focus = useFocusMode();
  /**
   * "Reducir movimiento" del sistema, leído con el hook de reanimated en vez de resolviendo
   * `AccessibilityInfo` en un efecto: es la API oficial, no parpadea el primer frame y sigue los
   * cambios en vivo. Las animaciones de layout ya lo respetan solas (`ReduceMotion.System` es su
   * default, ver `today-list.tsx`), así que esto es solo para no montarlas de más.
   */
  const still = useReducedMotion();

  /** Id de la tarea enganchada como texto (lo que maneja `Choice`). '' = sin tarea. */
  const [taskId, setTaskId] = useState(NONE);
  /**
   * Lo que el servidor contestó al cronómetro, cuando no fue lo esperado. El 409 es el caso real: el
   * API solo permite UN timer corriendo por usuario, así que si dejaste uno abierto en otro lado hay
   * que decirlo — el pomodoro local siguió corriendo igual.
   */
  const [note, setNote] = useState('');
  /** Sube uno por cada enfoque cerrado. Cambia la `key` del confeti, que así vuelve a llover. */
  const [party, setParty] = useState(0);
  /** El tramo vivo. `null` cuando no hay bloque corriendo ni pausado a medias. */
  const [span, setSpan] = useState<Span | null>(null);

  const tasks = day.tasks ?? [];
  /** Solo las pendientes se ofrecen: enfocar una que ya cerraste no significa nada. */
  const pending = tasks.filter((candidate) => candidate.status === 'pending');
  /**
   * La enganchada se busca entre TODAS las de hoy y no solo entre las pendientes: si se marca hecha
   * desde el home a media carrera, hay que seguir pudiendo apagar su cronómetro en el servidor.
   *
   * Si el id ya no existe (se borró, cambió de día) esto queda en `null` y todo lo de abajo se
   * comporta como "sin tarea" por sí solo. No hace falta un efecto que limpie el estado.
   */
  const task = tasks.find((candidate) => String(candidate.id) === taskId) ?? null;

  /**
   * El cronómetro del servidor, que es lo que hace que el bloque exista fuera de esta pantalla.
   * Nunca bloquea: si falla, el pomodoro sigue y la nota explica qué no se guardó. Perder los
   * minutos acumulados es malo; perder el bloque de enfoque por un error de red es peor.
   *
   * Sin `useCallback`: con el React Compiler encendido la memoización la pone él, y escribirla a
   * mano aquí es justo lo que no puede preservar (la identidad depende de `task`).
   */
  const serverTimer = async (id: number | null, action: 'start' | 'stop') => {
    if (!token || id === null) return;
    try {
      await tasksApi.timer(token, id, action);
      setNote('');
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        setNote('Ya tenías un cronómetro corriendo en otra tarea. Este bloque no se le sumó.');
      } else {
        setNote('El bloque corre, pero no pudimos guardarlo en tu tarea.');
      }
    }
  };

  /**
   * Cierre de bloque. `closed` es la fase que ACABA de terminar, no la que sigue.
   *
   * El confeti solo cae al cerrar un ENFOQUE: acabar un descanso no es un logro, y celebrarlo las
   * ocho veces del ciclo gastaría la celebración de las cuatro que sí valen.
   *
   * No va memoizado a mano y no importa: `usePomodoro` se protege con un contador de cierres, así
   * que aunque esta función cambie de identidad en cada render el aviso sale una vez por bloque.
   */
  const onFinish = (closed: Phase) => {
    disarmAlarm();
    hideBlock();
    setSpan(null);
    // Sale del modo enfoque: el bloque acabó y hay que poder ir a otra parte.
    focus.setHidden(false);
    if (closed !== 'focus') return;
    setParty((previous) => previous + 1);
    serverTimer(task?.id ?? null, 'stop');
    // El bloque acabó: el `elapsedSeconds` de la tarea cambió y la lista de hoy ya no es cierta.
    day.reload();
  };

  const pom = usePomodoro({ onFinish });

  /**
   * La tarea no se puede cambiar a media carrera: los minutos ya corriendo se le sumarían a la
   * equivocada. Al soltar el cronómetro se vuelve a poder elegir.
   */
  const locked = pom.running || !pom.fresh;
  /** La carátula se gira solo sobre un enfoque intacto. Corriendo es un reloj, no un control. */
  const editable = pom.fresh && pom.phase === 'focus';

  /** Al salir de la pantalla no queda ni aviso agendado ni actividad viva de un bloque huérfano. */
  useEffect(
    () => () => {
      disarmAlarm();
      hideBlock();
    },
    []
  );

  const fallback: AccentName = user?.accentColor ?? 'olive';
  /**
   * El color dice en qué bloque estás sin que haya que leer la etiqueta.
   *
   * En enfoque es el de la FAMILIA de la tarea (`accentForFocus`), así que el cronómetro se ve del
   * mismo color que esa tarea en el home. El descanso siempre es `clay`: en `focus-accent` los
   * cálidos son la familia de la vida (casa, salud, relaciones), y un descanso es exactamente eso.
   *
   * El hook va aquí arriba con los demás: debajo del guard de `user` sería un hook condicional.
   */
  const tint = useAccent(pom.phase === 'focus' ? accentForFocus(task?.focusArea, fallback) : 'clay');

  /** Lo que se manda a la Isla Dinámica y a la pantalla de bloqueo. */
  const paint = (tramo: Span, pausedAt: number) =>
    showBlock({
      phase: PHASES[pom.phase].micro,
      resting: pom.phase !== 'focus',
      task: pom.phase === 'focus' ? (task?.title ?? '') : '',
      startedAt: tramo.startedAt,
      endsAt: tramo.endsAt,
      pausedAt,
      tint: tint.solid,
      done: Math.min(pom.done, ROUNDS),
      rounds: ROUNDS,
      endsAtLabel: endsAtLabel(tramo.endsAt),
    });

  const begin = () => {
    /**
     * El tramo se calcula aquí y no se lee del hook: `pom.begin()` acaba de programar el estado y
     * todavía no se ha aplicado, así que `pom.endsAt` traería el del render anterior. Es la misma
     * aritmética que hace el hook por dentro, sobre el mismo reloj.
     */
    const startedAt = Date.now();
    const tramo = { startedAt, endsAt: startedAt + pom.leftMs };

    pom.begin();
    setSpan(tramo);
    // Segundos y no ms: el trigger de intervalo de expo-notifications los pide en segundos.
    armAlarm(Math.round(pom.leftMs / 1000), 'tdapp', PHASES[pom.phase].alarm);
    paint(tramo, 0);
    focus.setHidden(true);
    if (pom.phase === 'focus') serverTimer(task?.id ?? null, 'start');
  };

  const hold = () => {
    pom.pause();
    disarmAlarm();
    focus.setHidden(false);
    // Pausado se REPINTA en vez de quitarse: `pauseTime` clava el reloj y así queda claro que hay un
    // bloque a medias esperándote, en vez de que desaparezca como si no hubiera pasado nada.
    if (span) paint(span, Date.now());
    if (pom.phase === 'focus') serverTimer(task?.id ?? null, 'stop');
  };

  const leave = () => {
    disarmAlarm();
    hideBlock();
    setSpan(null);
    focus.setHidden(false);
  };

  const restart = () => {
    pom.reset();
    leave();
    if (pom.phase === 'focus') serverTimer(task?.id ?? null, 'stop');
  };

  const jump = () => {
    pom.skip();
    leave();
    if (pom.phase === 'focus') {
      serverTimer(task?.id ?? null, 'stop');
      day.reload();
    }
  };

  // El guard va DESPUÉS de los hooks: al cerrar sesión el user se vuelve null, y salir antes dejaría
  // a React con menos hooks que en el render anterior.
  if (!user) return null;

  const phase = PHASES[pom.phase];
  /**
   * Girando, las marcas encendidas son los minutos ELEGIDOS; corriendo, los que QUEDAN. Es la misma
   * frase en los dos casos, y por eso una vuelta del dial son 60 minutos y hay 60 marcas.
   */
  const lit = editable ? pom.focusMinutes : litTicks(pom.leftMs, pom.totalMs);
  const closed = Math.min(pom.done, ROUNDS);
  const animate = !still;

  const options: readonly Option[] = [
    ...pending.map((p) => ({ value: String(p.id), label: chipLabel(p.title) })),
    { value: NONE, label: 'Sin tarea' },
  ];

  const face = (
    <View
      accessible={!editable}
      accessibilityRole="progressbar"
      accessibilityLabel={`${phase.micro}, ${clock(pom.leftMs)} restantes`}
      accessibilityValue={{ min: 0, max: pom.totalMs, now: pom.totalMs - pom.leftMs }}
      style={styles.dialWrap}>
      <Dial lit={lit} color={tint.solid} track={t.sunken} />
      {/* La lectura va ENCIMA y no dentro del dial: el aro está memoizado por `lit`, y meterle los
          dígitos como hijos lo repintaría cuatro veces por segundo con sus 60 vistas. */}
      <View style={styles.readout} pointerEvents="none">
        <Text style={[Type.count, { color: t.text }]}>{clock(pom.leftMs)}</Text>
        <Micro>{phase.micro}</Micro>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]} edges={['top', 'bottom']}>
      {/*
        Tocar el fondo alterna la cápsula de pestañas SIN parar el bloque. Es la salida del modo
        enfoque: sin esto, un bloque de cincuenta minutos deja la app sin navegación hasta que acabe.
        Solo mientras corre — con el cronómetro quieto la barra ya está puesta y alternarla no
        significaría nada.
      */}
      <Pressable
        style={styles.screen}
        onPress={pom.running ? focus.toggle : undefined}
        // Sin rol ni etiqueta: para un lector de pantalla esto no es un botón, es el fondo. La
        // navegación por accesibilidad no depende de la barra visible.
        accessible={false}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            // En modo enfoque el contenido sobrante se va y lo que queda se centra en la pantalla.
            focus.hidden && styles.focused,
            // El hueco de la cápsula solo hace falta cuando la cápsula está.
            !focus.hidden && styles.docked,
          ]}
          showsVerticalScrollIndicator={false}>
          <Animated.View layout={animate ? LinearTransition : undefined} style={styles.stack}>
            {editable ? (
              <DialPicker minutes={pom.focusMinutes} onChange={pom.setFocusMinutes}>
                {face}
              </DialPicker>
            ) : (
              face
            )}

            {/* La línea dice CON QUÉ cuando hay tarea, y qué hacer con el bloque cuando no. El
                título entero vive aquí; en el chip iba recortado. */}
            <Text style={[Type.body, styles.line, { color: t.textMuted }]} numberOfLines={2}>
              {editable
                ? 'Gira la carátula para elegir cuánto.'
                : pom.phase === 'focus' && task
                  ? task.title
                  : phase.line}
            </Text>

            {/* El ciclo con los mismos brotes que el resto de la app: uno por enfoque cerrado. */}
            <View
              accessible
              accessibilityLabel={`${closed} de ${ROUNDS} enfoques cerrados`}
              style={styles.cycle}>
              {Array.from({ length: ROUNDS }, (_, i) => (
                <Bud key={i} on={i < closed} accent={fallback} />
              ))}
            </View>

            <View style={styles.actions}>
              <BigButton
                label={pom.running ? 'Pausar' : pom.fresh ? 'Empezar' : 'Reanudar'}
                accent={fallback}
                onPress={pom.running ? hold : begin}
              />
              {/* Saltar solo cuando el bloque está intacto: a media carrera lo que se quiere es
                  reiniciarlo, y dos salidas a la vez vuelven dos botones claros en cuatro dudosos. */}
              <BigButton
                label={pom.fresh ? 'Saltar este bloque' : 'Reiniciar'}
                variant="ghost"
                accent={fallback}
                onPress={pom.fresh ? jump : restart}
              />
            </View>
          </Animated.View>

          {/*
            La tarea se elige antes de empezar y desaparece en modo enfoque: es una decisión de
            arranque, no un control del cronómetro. Se desmonta de verdad (y no solo se oculta) para
            que el contenido se pueda centrar de una vez.
          */}
          {!locked && !focus.hidden && (
            <Animated.View
              entering={animate ? FadeIn.duration(200) : undefined}
              exiting={animate ? FadeOut.duration(140) : undefined}
              layout={animate ? LinearTransition : undefined}>
              <Card>
                {day.tasks === null && day.loading ? (
                  <>
                    <Micro>En qué</Micro>
                    <Text style={[Type.body, { color: t.textMuted }]}>Trayendo tu día…</Text>
                  </>
                ) : pending.length === 0 ? (
                  <>
                    <Micro>En qué</Micro>
                    {/* Un día sin pendientes no es un error: el pomodoro corre igual, solo que los
                        minutos no se le suman a nada. */}
                    <Text style={[Type.body, { color: t.textMuted }]}>
                      No te queda nada pendiente hoy. El cronómetro corre igual.
                    </Text>
                  </>
                ) : (
                  <Choice
                    label="En qué"
                    hint="Los minutos se le suman a esa tarea."
                    options={options}
                    value={taskId}
                    onChange={setTaskId}
                    accent={fallback}
                  />
                )}
              </Card>
            </Animated.View>
          )}

          {!!note && (
            <Text style={[Type.hint, { color: t.danger }]} accessibilityLiveRegion="polite">
              {note}
            </Text>
          )}
        </ScrollView>
      </Pressable>

      {/* Encima de todo y fuera del scroll: el confeti tiene que caer sobre la pantalla entera. La
          `key` es lo que lo vuelve a montar en cada enfoque cerrado. */}
      {party > 0 && <Confetti key={party} onDone={() => setParty(0)} />}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    gap: Space.xl,
  },
  // El aire sale de la geometría de la cápsula flotante, que vive en `_layout`.
  docked: { paddingBottom: TAB_DOCK },
  // flexGrow para que el contenedor llene el scroll aunque el contenido sea corto: sin eso no hay
  // espacio sobrante que repartir y `center` no centraría nada.
  focused: { flexGrow: 1, justifyContent: 'center', paddingBottom: Space.xl },
  // La carátula, su línea, el ciclo y los botones se mueven JUNTOS al centrarse. Sin este grupo,
  // cada uno animaría por su cuenta y el bloque se leería como cuatro cosas cayendo.
  stack: { gap: Space.xl, alignItems: 'stretch' },
  dialWrap: { width: DIAL, height: DIAL, alignSelf: 'center' },
  // Ocupa el dial entero y centra: así los dígitos quedan en el centro geométrico del aro y no
  // bailan al pasar de 4 a 5 caracteres.
  readout: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: DIAL,
    height: DIAL,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  line: { textAlign: 'center' },
  cycle: { flexDirection: 'row', justifyContent: 'center', gap: Space.md },
  actions: { gap: Space.sm },
});
