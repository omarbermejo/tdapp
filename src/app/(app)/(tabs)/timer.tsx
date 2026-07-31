import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeInDown,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { Choice, type Option } from '@/components/ui/choice';
import { Confetti } from '@/components/ui/confetti';
import { Bud } from '@/components/ui/stem';
import {
  Motion,
  Space,
  Type,
  accentInks,
  accentOnDark,
  useAccent,
  useTheme,
  type AccentName,
} from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { tasksApi } from '@/features/tasks/api';
import { useLocalToday } from '@/features/tasks/day';
import { accentForFocus } from '@/features/tasks/focus-accent';
import { useTasks } from '@/features/tasks/use-tasks';
import { armAlarm, disarmAlarm, forgetAlarm } from '@/features/timer/alarm';
import { cheer, coolCheer, warmCheer } from '@/features/timer/cheer';
import { DIAL, Dial, litTicks } from '@/features/timer/dial';
import { DialPicker } from '@/features/timer/dial-picker';
import { useFocusMode } from '@/features/timer/focus-mode';
import { clearFocusWidget } from '@/features/widgets/sync-focus';
import { adoptBlock, hideBlock, showBlock } from '@/features/timer/outside';
import { ROUNDS, clock, usePomodoro, type Phase } from '@/features/timer/pomodoro';
import { useScreenPadding } from '@/hooks/use-screen-padding';

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
 * El latido de la lectura cuando cae un minuto. Muelle local y no un token, por la misma razón que
 * los demás muelles de la app: lo que hace falta aquí es un rebote MÍNIMO —el número no se celebra,
 * se acusa— y por eso es más rígido y menos pesado que el `POP` de marcar una tarea.
 */
const BEAT = { damping: 14, stiffness: 340, mass: 0.5 } as const;

/**
 * El escalón de la cascada de entrada. Es el `Motion.step` de la casa por dos: aquí son cuatro
 * bloques grandes y no siete puntos, y con 30ms la cascada no se lee como cascada.
 */
const CASCADE = Motion.step * 2;

/**
 * El título de una tarea cabe en 120 caracteres y el chip no. Se recorta solo para la etiqueta: la
 * línea de debajo de la carátula sí lo dice entero, que es donde importa leerlo.
 */
const chipLabel = (title: string) => (title.length > 26 ? `${title.slice(0, 25)}…` : title);

/** 'termina 7:16' con el reloj del teléfono. Es lo que Android muestra en vez de una cuenta atrás. */
const endsAtLabel = (at: number) =>
  `termina ${new Date(at).toLocaleTimeString('es-MX', { hour: 'numeric', minute: '2-digit' })}`;

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
  /**
   * El aire va en el contenido, no en un SafeAreaView: así el scroll pasa por debajo de la barra de
   * estado en vez de cortarse contra ella. Ver `use-screen-padding`.
   *
   * En modo enfoque el hueco de abajo es solo el borde del teléfono: la cápsula se aparta, así que
   * reservarle sitio dejaría el bloque descentrado hacia arriba justo cuando se quiere centrado.
   */
  const pad = useScreenPadding(focus.hidden ? Space.xl : TAB_DOCK);

  /**
   * La tarea elegida a mano. `null` = "no he tocado nada", y entonces manda la del bloque recuperado.
   *
   * Se deriva en vez de copiarse con un efecto (es el mismo patrón que `picked` en el home): un efecto
   * que hiciera `setTaskId(restored)` sería un setState dentro de un efecto, y encima pisaría la
   * elección de la persona si la rehidratación llegara tarde.
   */
  const [picked, setPicked] = useState<string | null>(null);
  /**
   * Lo que el servidor contestó al cronómetro, cuando no fue lo esperado. El 409 es el caso real: el
   * API solo permite UN timer corriendo por usuario, así que si dejaste uno abierto en otro lado hay
   * que decirlo — el pomodoro local siguió corriendo igual.
   */
  const [note, setNote] = useState('');
  /** Sube uno por cada enfoque cerrado. Cambia la `key` del confeti, que así vuelve a llover. */
  const [party, setParty] = useState(0);
  /** La isla ya se reconcilió con lo recuperado. Sin esto se repetiría en cada render. */
  const reconciled = useRef(false);
  /**
   * El latido de la lectura. Vive aquí arriba con los demás hooks: el `useEffect` que lo dispara
   * depende del minuto, y un hook dentro de una rama reventaría al cambiar de estado la pantalla.
   */
  const beat = useSharedValue(1);
  const beatStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));

  const tasks = day.tasks ?? [];
  /** Solo las pendientes se ofrecen: enfocar una que ya cerraste no significa nada. */
  const pending = tasks.filter((candidate) => candidate.status === 'pending');

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
  const onFinish = (closed: Phase, done: number, silent: boolean) => {
    // `forget` y NO `disarm`: el aviso esta agendado para este mismo instante y cancelarlo aqui
    // seria una carrera contra el sistema que puede dejar el bloque sin sonar.
    forgetAlarm();
    hideBlock();
    // Sale del modo enfoque: el bloque acabó y hay que poder ir a otra parte.
    focus.setHidden(false);

    /**
     * Sonido y vibración en TODO cierre, también al acabar un descanso: el aviso de "ya" es lo que
     * hace que el bloque sirva con el teléfono boca abajo, y volver a trabajar también hay que
     * saberlo. Lo que cambia es el peso: el cuarto enfoque cierra el ciclo entero y ahí suena la
     * versión larga.
     */
    if (!silent) cheer(closed === 'focus' && done >= ROUNDS ? 'cycle' : 'block');

    // El confeti sí es solo del enfoque: acabar un descanso no es un logro que celebrar.
    if (closed !== 'focus') return;
    setParty((previous) => previous + 1);
    serverTimer(task?.id ?? null, 'stop');
    // El bloque acabó: el `elapsedSeconds` de la tarea cambió y la lista de hoy ya no es cierta.
    day.reload();
  };

  const pom = usePomodoro({ onFinish });

  /**
   * `picked` manda; si nadie eligió nada, la tarea es la del bloque que se recuperó del almacén. Así el
   * enganche sobrevive a que la app muera sin necesidad de un efecto que copie estado.
   */
  const taskId = picked ?? (pom.restoredTaskId != null ? String(pom.restoredTaskId) : NONE);
  /**
   * La enganchada se busca entre TODAS las de hoy y no solo entre las pendientes: si se marca hecha
   * desde el home a media carrera, hay que seguir pudiendo apagar su cronómetro en el servidor.
   *
   * Si el id ya no existe (se borró, cambió de día) esto queda en `null` y todo lo de abajo se comporta
   * como "sin tarea" por sí solo. No hace falta un efecto que limpie el estado.
   */
  const task = tasks.find((candidate) => String(candidate.id) === taskId) ?? null;

  /** Elegir tarea: se registra en el cronómetro para que viaje con el bloque al almacén. */
  const choose = (value: string) => {
    setPicked(value);
    pom.attach(value ? Number(value) : null);
  };

  /**
   * La tarea no se puede cambiar a media carrera: los minutos ya corriendo se le sumarían a la
   * equivocada. Al soltar el cronómetro se vuelve a poder elegir.
   */
  const locked = pom.running || !pom.fresh;
  /** La carátula se gira solo sobre un enfoque intacto. Corriendo es un reloj, no un control. */
  const editable = pom.fresh && pom.phase === 'focus';

  /**
   * La sesión de audio y los sonidos se preparan al entrar: crearlos en el momento del cero hace que
   * el sonido llegue medio segundo tarde, y un aviso que suena después del cero se siente roto.
   *
   * Al salir no queda nada suelto: ni aviso agendado, ni actividad viva de un bloque huérfano, ni
   * players abiertos, ni vibraciones en vuelo.
   */
  useEffect(() => {
    warmCheer();
    return () => {
      disarmAlarm();
      hideBlock();
      coolCheer();
    };
  }, []);

  /**
   * El minuto que se está viendo. Es la ÚNICA cosa de la lectura que cambia despacio: los segundos
   * bajan cuatro veces por segundo y no se pueden acusar de nada, pero un minuto que CAE es un
   * evento — el mismo argumento por el que la carátula son marcas que se apagan y no un arco que se
   * acorta un pelo por segundo.
   */
  const minute = Math.ceil(pom.leftMs / 60_000);

  /**
   * El latido cuando cae un minuto: el único momento en que el número hace algo por su cuenta.
   *
   * Solo corriendo. Girando la carátula el minuto cambia con el dedo, y ahí el latido competiría con
   * el gesto; en pausa no cae ninguno. Y `.set()` en vez de `.value =` porque el React Compiler trata
   * el shared value como inmutable — es la misma nota que hay en `streak-card`.
   */
  useEffect(() => {
    if (still || !pom.running) return;
    beat.set(withSequence(withTiming(1.03, { duration: Motion.exit / 2 }), withSpring(1, BEAT)));
  }, [minute, still, pom.running, beat]);

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
  const accent: AccentName = pom.phase === 'focus' ? accentForFocus(task?.focusArea, fallback) : 'clay';
  const tint = useAccent(accent);

  /**
   * Lo que se manda a la Isla Dinámica y a la pantalla de bloqueo.
   *
   * El tramo se deriva del largo NOMINAL del bloque (`endsAt - totalMs`) y no del instante en que se
   * tocó Empezar: así la barra de progreso muestra cuánto lleva el BLOQUE y no cuánto lleva desde que
   * volviste a la app. El reloj sale igual, porque `Text(timerInterval:)` cuenta hasta el extremo alto.
   */
  const blockFor = (endsAt: number, pausedAt: number) => ({
    phase: PHASES[pom.phase].micro,
    resting: pom.phase !== 'focus',
    task: pom.phase === 'focus' ? (task?.title ?? '') : '',
    startedAt: endsAt - pom.totalMs,
    endsAt,
    pausedAt,
    /**
     * El MISMO acento pero resuelto para fondo oscuro, no `tint.solid`. La Live Activity siempre se
     * pinta sobre negro (pantalla de bloqueo e Isla) en los dos esquemas, así que el paso que sirve
     * en la app no es el que se lee allá: en modo claro, olive daba 2.2:1 y la cuenta desaparecía.
     */
    tint: accentOnDark(accent),
    /**
     * Y el paso de fondo CLARO, que solo usa el widget de la pantalla de inicio: ahí el material sí
     * sigue al esquema del sistema de verdad, así que ese sí se puede resolver por `colorScheme`.
     */
    tintOnLight: accentInks(accent).light,
    done: Math.min(pom.done, ROUNDS),
    rounds: ROUNDS,
    endsAtLabel: endsAtLabel(endsAt),
  });

  const paint = (endsAt: number, pausedAt: number) => showBlock(blockFor(endsAt, pausedAt));

  /**
   * Reconcilia la isla con el bloque recuperado, UNA sola vez por montaje.
   *
   * Es la otra mitad del arreglo del bug: sin esto, la Live Activity de la sesión anterior se quedaba
   * viva y huérfana, y a la siguiente vuelta se abría otra encima. Se acumulaban hasta pasar el límite
   * de iOS, y de ahí en adelante no aparecía ninguna. `adoptBlock` adopta la que ya está si hay bloque
   * que representar, y si no, la cierra.
   *
   * El ref es lo que lo deja correr una sola vez: sin él, cada tick del segundo volvería a reconciliar.
   */
  useEffect(() => {
    if (!pom.ready || reconciled.current) return;
    reconciled.current = true;

    if (pom.endsAt === null) {
      adoptBlock(null);
      // El widget no se borra, se queda invitando: es una baldosa fija en la pantalla de inicio y
      // dejarla en blanco sería peor que darle un uso. La Live Activity sí desaparece.
      clearFocusWidget({ tint: accentInks(accent).light, tintDark: accentOnDark(accent) });
      return;
    }

    // Con bloque vivo, `showBlock` (dentro de adoptBlock) empuja la isla Y el widget de una vez, así que
    // el widget también sobrevive a que la app se cierre.
    adoptBlock(blockFor(pom.endsAt, 0));
  });

  const begin = () => {
    /**
     * El tramo se calcula aquí y no se lee del hook: `pom.begin()` acaba de programar el estado y
     * todavía no se ha aplicado, así que `pom.endsAt` traería el del render anterior. Es la misma
     * aritmética que hace el hook por dentro, sobre el mismo reloj.
     */
    const endsAt = Date.now() + pom.leftMs;

    pom.begin();
    // La tarea se registra al empezar y no solo al elegirla: un bloque que arranca sin haber tocado los
    // chips lleva la del bloque recuperado, y esa también tiene que quedar guardada.
    pom.attach(task?.id ?? null);
    // Segundos y no ms: el trigger de intervalo de expo-notifications los pide en segundos.
    armAlarm(Math.round(pom.leftMs / 1000), 'tdapp', PHASES[pom.phase].alarm);
    paint(endsAt, 0);
    focus.setHidden(true);
    if (pom.phase === 'focus') serverTimer(task?.id ?? null, 'start');
  };

  const hold = () => {
    // Se lee ANTES de pausar: `pom.pause()` pone `endsAt` en null, y este es el dato que la actividad
    // necesita para saber dónde clavar el reloj.
    const endsAt = pom.endsAt;
    pom.pause();
    disarmAlarm();
    focus.setHidden(false);
    // Pausado se REPINTA en vez de quitarse: `pauseTime` clava el reloj y así queda claro que hay un
    // bloque a medias esperándote, en vez de que desaparezca como si no hubiera pasado nada.
    if (endsAt !== null) paint(endsAt, Date.now());
    if (pom.phase === 'focus') serverTimer(task?.id ?? null, 'stop');
  };

  const leave = () => {
    disarmAlarm();
    hideBlock();
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
        {/* El latido: 1.03 y nada más. La lectura ya es de 64pt en un dial de 264, así que un pulso
            grande la haría chocar contra las marcas — lo que hace falta es que se NOTE, no que salte. */}
        <Animated.Text style={[Type.count, beatStyle, { color: t.text }]}>
          {clock(pom.leftMs)}
        </Animated.Text>
        <Micro>{phase.micro}</Micro>
      </View>
    </View>
  );

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
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
            { paddingTop: pad.top, paddingBottom: pad.bottom },
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

            {/*
              La línea, el ciclo y los botones entran en CASCADA, y la carátula no: ella ya está
              cuando la pantalla abre, porque es el objeto de la pantalla. Los tres de abajo llegan
              detrás con 60ms entre cada uno, que es lo que convierte "todo apareció" en "esto se
              armó". Es el mismo idioma que la tira de la semana y los puntos de la racha, solo que
              aquí son cuatro bloques grandes y no siete piezas.

              `animate &&` en vez de dejar que reanimated lo decida: con "reducir movimiento" puesto
              no se monta ni la animación.
            */}
            {/* La línea dice CON QUÉ cuando hay tarea, y qué hacer con el bloque cuando no. El
                título entero vive aquí; en el chip iba recortado. */}
            <Animated.Text
              entering={animate ? FadeInDown.duration(Motion.enter).delay(CASCADE) : undefined}
              style={[Type.body, styles.line, { color: t.textMuted }]}
              numberOfLines={2}>
              {editable
                ? 'Gira la carátula para elegir cuánto.'
                : pom.phase === 'focus' && task
                  ? task.title
                  : phase.line}
            </Animated.Text>

            {/* El ciclo con los mismos brotes que el resto de la app: uno por enfoque cerrado. */}
            <Animated.View
              entering={animate ? FadeInDown.duration(Motion.enter).delay(CASCADE * 2) : undefined}
              accessible
              accessibilityLabel={`${closed} de ${ROUNDS} enfoques cerrados`}
              style={styles.cycle}>
              {Array.from({ length: ROUNDS }, (_, i) => (
                <Bud key={i} on={i < closed} accent={fallback} />
              ))}
            </Animated.View>

            <Animated.View
              entering={animate ? FadeInDown.duration(Motion.enter).delay(CASCADE * 3) : undefined}
              style={styles.actions}>
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
            </Animated.View>
          </Animated.View>

          {/*
            La tarea se elige antes de empezar y desaparece en modo enfoque: es una decisión de
            arranque, no un control del cronómetro. Se desmonta de verdad (y no solo se oculta) para
            que el contenido se pueda centrar de una vez.
          */}
          {!locked && !focus.hidden && (
            <Animated.View
              entering={animate ? FadeIn.duration(Motion.enter) : undefined}
              exiting={animate ? FadeOut.duration(Motion.exit) : undefined}
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
                    onChange={choose}
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
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    // El vertical lo pone `useScreenPadding`: sale de los insets del telefono y del modo enfoque.
    gap: Space.xl,
  },
  // flexGrow para que el contenedor llene el scroll aunque el contenido sea corto: sin eso no hay
  // espacio sobrante que repartir y `center` no centraría nada.
  focused: { flexGrow: 1, justifyContent: 'center' },
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
