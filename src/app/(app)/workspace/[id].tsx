import { useLocalSearchParams } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOut } from 'react-native-reanimated';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { Card, Micro, SectionHeader } from '@/components/ui/card';
import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { ProgressRing } from '@/components/ui/progress-ring';
import { Motion, RESHAPE, Space, Type, useAccent, useTheme } from '@/constants/theme';
import { FOCUS_AREAS } from '@/features/auth/options';
import { WORKSPACE_HEAT } from '@/features/stats/grid';
import { HeatMap } from '@/features/stats/heat-map';
import { useStats } from '@/features/stats/use-stats';
import { useLocalToday } from '@/features/tasks/day';
import { TaskRow } from '@/features/tasks/task-row';
import { useWorkspaceTasks } from '@/features/tasks/use-tasks';
import { useWorkspace } from '@/features/workspaces/use-workspace';
import { SpaceActions } from '@/features/workspaces/space-actions';
import { useScreenPadding } from '@/hooks/use-screen-padding';
import { StatusVeil, useScrollVeil } from '@/components/ui/status-veil';
import { goBackOrHome } from '@/features/nav/go-back';

const ROW_EXIT = FadeOut.duration(Motion.exit);
const rowEntering = (index: number) =>
  FadeInDown.delay(Math.min(index, 6) * Motion.step).duration(Motion.enter);

const focusLabel = (value: string | null) =>
  value ? (FOCUS_AREAS.find((o) => o.value === value)?.label ?? value) : 'Sin foco';

/** 'N h M min' desde minutos. Un total en minutos crudos deja de decir nada pasadas dos horas. */
const hours = (minutes: number) => {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
};

/**
 * Un espacio de trabajo por dentro: su progreso, su carga en el tiempo, en que se reparte y todo lo
 * que hay dentro.
 *
 * Es un PUSH de tarjeta y no una hoja, al reves que crear: no es un parentesis de tres segundos, es un
 * destino donde se entra a mirar y a trabajar un rato — el mismo argumento con el que Ajustes y Editar
 * perfil son push.
 *
 * Todo lo que pinta sale de piezas que ya existian: el mapa de calor es el MISMO componente del inicio
 * con `workspaceId` en su hook, el anillo es el de la card, y las filas son las de siempre. Lo unico
 * nuevo aqui es el reparto por foco.
 *
 * Los colaboradores todavia no estan, y no es un olvido: hoy el API es de un solo usuario —cada consulta
 * lleva `WHERE user_id = ?`— asi que compartir un espacio cambia la propiedad de cada tarea, los
 * permisos de todos los endpoints y a quien le cuenta la racha. Es su propio trabajo.
 */
export default function WorkspaceScreen() {
  const t = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const workspaceId = Number(id);

  const space = useWorkspace(workspaceId);
  const list = useWorkspaceTasks(workspaceId);
  const today = useLocalToday();
  const stats = useStats(today, { days: WORKSPACE_HEAT.days, workspaceId });

  const veil = useScrollVeil();

  const pad = useScreenPadding(Space.xxl);
  // El acento del espacio manda en toda la pantalla: es lo que la ata a la card de la que vino.
  const accent = space.workspace?.accent;
  const tint = useAccent(accent);

  const tasks = list.tasks ?? [];
  const pending = tasks.filter((task) => task.status === 'pending');
  const done = tasks.filter((task) => task.status === 'done');

  /** El reparto por foco, de mas a menos. Es lo mas cercano a "por quien" mientras no haya gente. */
  const byFocus = [...new Map(
    tasks.reduce<[string, number][]>((acc, task) => {
      const key = task.focusArea ?? '';
      const found = acc.find(([k]) => k === key);
      if (found) found[1] += 1;
      else acc.push([key, 1]);
      return acc;
    }, [])
  )].sort((a, b) => b[1] - a[1]);

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.ScrollView
        {...veil.scrollProps}
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        showsVerticalScrollIndicator={false}>
        {/* Flecha y no cruz: esto es un push, se vuelve atras. */}
        <BackButton />

        {space.missing ? (
          /*
            Un 404 dice que el espacio ya no esta y ofrece VOLVER, no reintentar: reintentar algo que
            se borro es una promesa que no se puede cumplir.
          */
          <View style={styles.gone}>
            <Text style={[Type.title, { color: t.text }]}>Este espacio ya no existe</Text>
            <Text style={[Type.body, { color: t.textMuted }]}>
              Se borró, y sus tareas siguen donde estaban. No se perdió nada.
            </Text>
            <BigButton label="Volver" variant="outline" onPress={goBackOrHome} />
          </View>
        ) : (
          <>
            <View style={styles.head}>
              <Icon3D
                name={(space.workspace?.icon ?? 'work') as Icon3DName}
                size={Icon3DSize.hero}
              />
              <Text style={[Type.display, styles.name, { color: t.text }]} numberOfLines={2}>
                {space.workspace?.name ?? ''}
              </Text>
            </View>

            {/*
              El anillo grande con el reparto al lado. `hero` (88) es el techo de la escala y aqui se
              justifica: es el dato de la pantalla, no un adorno de una card de media fila.
            */}
            <Card>
              <Micro>Cómo va</Micro>
              <View style={styles.progress}>
                <ProgressRing
                  done={space.workspace?.done ?? 0}
                  total={space.workspace?.total ?? 0}
                  accent={accent}
                  size={Icon3DSize.hero}
                  stroke={8}
                />
                <View style={styles.numbers}>
                  <Text style={[Type.metric, { color: t.text }]}>
                    {space.workspace?.done ?? 0} de {space.workspace?.total ?? 0}
                  </Text>
                  <Text style={[Type.body, { color: t.textMuted }]}>
                    {line(space.workspace?.total ?? 0, space.workspace?.done ?? 0)}
                  </Text>
                </View>
              </View>
            </Card>

            <View style={styles.block}>
              <SectionHeader
                title="Su trimestre"
                hint={
                  stats.stats
                    ? `${stats.stats.totals.done} cerradas · ${hours(stats.stats.totals.minutes)}`
                    : undefined
                }
              />
              {/* El MISMO mapa del inicio, acotado a este espacio por su hook. */}
              <HeatMap stats={stats} today={today} accent={accent} spec={WORKSPACE_HEAT} />
            </View>

            {byFocus.length > 0 && (
              <View style={styles.block}>
                <SectionHeader title="En qué se reparte" />
                <Card>
                  {byFocus.map(([focus, count]) => (
                    <View key={focus} style={styles.split}>
                      <Text style={[Type.label, styles.splitLabel, { color: t.text }]} numberOfLines={1}>
                        {focusLabel(focus || null)}
                      </Text>
                      {/*
                        Una barra proporcional al mayor: comparar es el punto, no el valor absoluto.

                        El riel va en `soft` y no en `sunken`: con el riel neutro, un acento oscuro como
                        `forest` dejaba la fila entera leyendose como verde-casi-negro sobre beige, o sea
                        sin color. Con el riel en el tinte claro del acento, la barra y su fondo son la
                        misma familia y el color del espacio se ve de verdad.
                      */}
                      <View style={[styles.track, { backgroundColor: tint.soft }]}>
                        <View
                          style={[
                            styles.bar,
                            { backgroundColor: tint.solid, width: `${(count / byFocus[0][1]) * 100}%` },
                          ]}
                        />
                      </View>
                      <Text style={[Type.label, styles.splitCount, { color: t.textMuted }]}>{count}</Text>
                    </View>
                  ))}
                </Card>
              </View>
            )}

            <View style={styles.block}>
              <SectionHeader
                title="Todo lo que hay dentro"
                hint={tasks.length ? `${pending.length} sin cerrar` : undefined}
              />

              {list.loading && !list.tasks && (
                <Text style={[Type.body, { color: t.textMuted }]}>Trayendo las tareas…</Text>
              )}

              {!!list.error && !list.tasks && (
                <>
                  <Text style={[Type.body, { color: t.textMuted }]}>{list.error}</Text>
                  <BigButton label="Reintentar" variant="ghost" onPress={list.reload} />
                </>
              )}

              {!!list.tasks && tasks.length === 0 && (
                <Text style={[Type.body, { color: t.textMuted }]}>
                  Todavía no hay nada aquí. Lo que anotes en este espacio sale en esta lista.
                </Text>
              )}

              {/* Pendientes primero y las cerradas al final, como en el dia. Con dia y sin hora: aqui
                  se mezclan fechas, asi que de que dia es importa mas que a que hora. */}
              {[...pending, ...done].map((task, i) => (
                <Animated.View
                  key={task.id}
                  layout={RESHAPE}
                  entering={rowEntering(i)}
                  exiting={ROW_EXIT}>
                  <TaskRow task={task} accent={accent} mutate={list} showDay showTime={false} />
                </Animated.View>
              ))}
            </View>
            {/*
              Lo que se puede HACER con el espacio, al final y solo si lo administras: invitar,
              corregirlo y borrarlo. Va despues de los datos por la misma razon que "Salir" va al
              final de Ajustes — primero lo que vienes a mirar, luego lo que puedes cambiar.
            */}
            {space.workspace && <SpaceActions workspace={space.workspace} />}
          </>
        )}
      </Animated.ScrollView>

      <StatusVeil scrollY={veil.scrollY} />
    </View>
  );
}

/** La linea que acompaña al numero, y que NUNCA repite el numero. El tono de `day-card`. */
const line = (total: number, done: number) => {
  if (total === 0) return 'Sin tareas todavía. Anota una y este espacio arranca.';
  const left = total - done;
  if (left === 0) return 'Espacio cerrado. Ya no debes nada aquí.';
  if (done === 0) return 'Nada cerrado todavía. Empieza por la más chica.';
  return left === 1 ? 'Falta una.' : `Faltan ${left}.`;
};

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Space.xl, gap: Space.xl },
  // El icono y el nombre son UNA cosa: respiran por dentro, no con el gap de la pantalla.
  head: { gap: Space.sm },
  name: { marginTop: Space.xs },
  block: { gap: Space.md },
  progress: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  numbers: { flex: 1, gap: Space.xs },
  split: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  // Ancho fijo para que las barras arranquen todas en la misma vertical y se puedan comparar.
  splitLabel: { width: 92 },
  track: { flex: 1, height: 10, borderRadius: 999, overflow: 'hidden' },
  bar: { height: '100%', borderRadius: 999 },
  splitCount: { minWidth: 24, textAlign: 'right', fontVariant: ['tabular-nums'] },
  gone: { gap: Space.md, paddingTop: Space.breath },
});
