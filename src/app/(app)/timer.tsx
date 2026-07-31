import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { Choice, type Option } from '@/components/ui/choice';
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
import { FOCUS_MINUTES, ROUNDS, clock, usePomodoro, type Phase } from '@/features/timer/pomodoro';

import { TAB_DOCK } from './_layout';

/**
 * El cronómetro pomodoro.
 *
 * Es la pantalla que faltaba: el cronómetro vivía en el API (`POST /tasks/:id/timer`) desde el
 * principio, pero en la app solo existió como una tarjeta en el home que contaba hacia ARRIBA, y
 * se fue por eso — pasarse de los 25 minutos se leía como una app rota. Aquí cuenta hacia abajo,
 * tiene su propia pantalla y el bloque tiene final.
 *
 * Tres cosas y en este orden: la carátula (cuánto queda), el ciclo (cuántos enfoques llevas) y con
 * qué (la tarea). Nada más. Un cronómetro con ajustes arriba deja de ser un cronómetro.
 *
 * Enganchar una tarea NO es decoración: arranca también el cronómetro del servidor, así que los
 * minutos se acumulan en `elapsedSeconds` y el widget y la Live Activity ven el bloque en curso sin
 * que esta pantalla les cuente nada. Sin tarea el pomodoro funciona igual — obligar a elegir una
 * antes de poder empezar es justo la friccion que hace que nadie lo use.
 */

/** Lo que cada bloque dice de sí mismo: la etiqueta de la carátula y la línea de debajo. */
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

/** Los tres largos son los de `sizeMinutes` del API; la etiqueta dice el número, que ES la decisión. */
const LENGTHS: readonly Option[] = FOCUS_MINUTES.map((m) => ({
  value: String(m),
  label: `${m} min`,
}));

/** Sin tarea es una opción a la vista: un chip de selección única no se puede desmarcar. */
const NONE = '';

/**
 * El título de una tarea cabe en 120 caracteres y el chip no. Se recorta solo para la etiqueta:
 * la línea de debajo de la carátula sí lo dice entero, que es donde importa leerlo.
 */
const chipLabel = (title: string) => (title.length > 26 ? `${title.slice(0, 25)}…` : title);

export default function TimerScreen() {
  const { user, token } = useAuth();
  const t = useTheme();
  const today = useLocalToday();
  // Las tareas de hoy son las que se pueden enfocar: enganchar la del jueves no significa nada.
  const day = useTasks(today);

  /** Id de la tarea enganchada como texto (lo que maneja `Choice`). '' = sin tarea. */
  const [taskId, setTaskId] = useState(NONE);
  /**
   * Lo que el servidor contestó al cronómetro, cuando no fue lo esperado. El 409 es el caso real:
   * el API solo permite UN timer corriendo por usuario, así que si dejaste uno abierto en otro
   * lado hay que decirlo — el pomodoro local siguió corriendo igual.
   */
  const [note, setNote] = useState('');

  const tasks = day.tasks ?? [];
  /** Solo las pendientes se ofrecen: enfocar una que ya cerraste no significa nada. */
  const pending = tasks.filter((candidate) => candidate.status === 'pending');
  /**
   * La enganchada se busca entre TODAS las de hoy y no solo entre las pendientes: si se marca hecha
   * desde el home a media carrera, hay que seguir pudiendo apagar su cronómetro en el servidor.
   *
   * Si el id ya no existe (se borró, cambió de día) esto queda en `null` y todo lo de abajo se
   * comporta como "sin tarea" por sí solo — el chip deja de verse elegido y las llamadas al
   * servidor se vuelven no-ops. No hace falta un efecto que limpie el estado.
   */
  const task = tasks.find((candidate) => String(candidate.id) === taskId) ?? null;

  /**
   * El cronómetro del servidor, que es lo que hace que el bloque exista fuera de esta pantalla.
   * Nunca bloquea: si falla, el pomodoro sigue y la nota explica qué no se guardó. Perder los
   * minutos acumulados es malo; perder el bloque de enfoque por un error de red es peor.
   *
   * Sin `useCallback`: con el React Compiler encendido la memoización la pone él, y escribirla a
   * mano aquí es justo lo que no puede preservar (la identidad depende de `task`, que cambia con
   * cada recarga del día).
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
   * Solo el enfoque apaga el cronómetro del servidor: un descanso nunca lo arrancó. El aviso se
   * cancela porque si la app estaba al frente ya no hace falta, y si estaba al fondo ya sonó.
   *
   * No va memoizado a mano y no importa: `usePomodoro` se protege con un contador de cierres, así
   * que aunque esta función cambie de identidad en cada render el aviso sale una vez por bloque.
   */
  const onFinish = (closed: Phase) => {
    disarmAlarm();
    if (closed !== 'focus') return;
    serverTimer(task?.id ?? null, 'stop');
    // El bloque acabó: el `elapsedSeconds` de la tarea cambió y la lista de hoy ya no es cierta.
    day.reload();
  };

  const pom = usePomodoro({ onFinish });

  /**
   * La tarea y el largo no se pueden cambiar a media carrera: los minutos ya corriendo se le
   * sumarían a la tarea equivocada, y reescribir el bloque deja el dial mintiendo. Al soltar el
   * cronómetro se vuelve a poder elegir.
   */
  const locked = pom.running || !pom.fresh;

  /** Al salir de la pantalla no queda un aviso agendado de un bloque que ya nadie está mirando. */
  useEffect(() => () => void disarmAlarm(), []);

  const fallback: AccentName = user?.accentColor ?? 'olive';
  /**
   * El color dice en qué bloque estás sin que haya que leer la etiqueta.
   *
   * En enfoque es el de la FAMILIA de la tarea (`accentForFocus`), así que el cronómetro se ve del
   * mismo color que esa tarea en el home. El descanso siempre es `clay`: en `focus-accent` los
   * cálidos son la familia de la vida (casa, salud, relaciones), y un descanso es exactamente eso.
   *
   * El hook va aquí arriba con los demás: debajo del guard de `user` sería un hook condicional, y
   * al cerrar sesión React se quedaría con dos cuentas distintas.
   */
  const tint = useAccent(
    pom.phase === 'focus' ? accentForFocus(task?.focusArea, fallback) : 'clay'
  );

  const begin = () => {
    pom.begin();
    // Segundos y no ms: el trigger de intervalo de expo-notifications los pide en segundos.
    armAlarm(Math.round(pom.leftMs / 1000), 'tdapp', PHASES[pom.phase].alarm);
    if (pom.phase === 'focus') serverTimer(task?.id ?? null, 'start');
  };

  const hold = () => {
    pom.pause();
    disarmAlarm();
    if (pom.phase === 'focus') serverTimer(task?.id ?? null, 'stop');
  };

  const restart = () => {
    pom.reset();
    disarmAlarm();
    if (pom.phase === 'focus') serverTimer(task?.id ?? null, 'stop');
  };

  const jump = () => {
    pom.skip();
    disarmAlarm();
    if (pom.phase === 'focus') {
      serverTimer(task?.id ?? null, 'stop');
      day.reload();
    }
  };

  // El guard va DESPUÉS de los hooks: al cerrar sesión el user se vuelve null, y salir antes
  // dejaría a React con menos hooks que en el render anterior.
  if (!user) return null;

  const phase = PHASES[pom.phase];
  const lit = litTicks(pom.leftMs, pom.totalMs);
  // Enfoques cerrados del ciclo. Durante el primero todavía no hay ninguno, y así se lee.
  const closed = Math.min(pom.done, ROUNDS);

  const options: readonly Option[] = [
    ...pending.map((p) => ({ value: String(p.id), label: chipLabel(p.title) })),
    { value: NONE, label: 'Sin tarea' },
  ];

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View
          accessible
          accessibilityRole="progressbar"
          accessibilityLabel={`${phase.micro}, ${clock(pom.leftMs)} restantes`}
          accessibilityValue={{ min: 0, max: pom.totalMs, now: pom.totalMs - pom.leftMs }}
          style={styles.dialWrap}>
          <Dial lit={lit} color={tint.solid} track={t.sunken} />
          {/* La lectura va ENCIMA y no dentro del dial: el aro está memoizado por `lit`, y meterle
              los dígitos como hijos lo repintaría cuatro veces por segundo con sus 60 vistas. */}
          <View style={styles.readout} pointerEvents="none">
            <Text style={[Type.count, { color: t.text }]}>{clock(pom.leftMs)}</Text>
            <Micro>{phase.micro}</Micro>
          </View>
        </View>

        {/* La línea de debajo dice CON QUÉ cuando hay tarea, y qué hacer con el bloque cuando no.
            El título entero vive aquí; en el chip iba recortado. */}
        <Text style={[Type.body, styles.line, { color: t.textMuted }]} numberOfLines={2}>
          {pom.phase === 'focus' && task ? task.title : phase.line}
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
              reiniciarlo, y dos salidas a la vez convierten dos botones claros en cuatro dudosos. */}
          <BigButton
            label={pom.fresh ? 'Saltar este bloque' : 'Reiniciar'}
            variant="ghost"
            accent={fallback}
            onPress={pom.fresh ? jump : restart}
          />
        </View>

        {/* Los ajustes van DEBAJO de los botones y desaparecen en cuanto el bloque arranca: son
            decisiones de antes de empezar, no controles del cronómetro. */}
        {!locked && (
          <View style={styles.settings}>
            {pom.phase === 'focus' && (
              <Card>
                <Choice
                  label="Cuánto enfocas"
                  options={LENGTHS}
                  value={String(pom.focusMinutes)}
                  onChange={(value: string) => pom.setFocusMinutes(Number(value))}
                  accent={fallback}
                />
              </Card>
            )}

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
          </View>
        )}

        {!!note && (
          <Text style={[Type.hint, { color: t.danger }]} accessibilityLiveRegion="polite">
            {note}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    // El aire sale de la geometría de la cápsula flotante, que vive en `_layout`.
    paddingBottom: TAB_DOCK,
    gap: Space.xl,
    alignItems: 'stretch',
  },
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
  settings: { gap: Space.md },
});
