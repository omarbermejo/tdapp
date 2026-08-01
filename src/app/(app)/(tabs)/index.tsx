import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Space, Type, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { QUARTER_HEAT } from '@/features/stats/grid';
import { HeatMap } from '@/features/stats/heat-map';
import { useStats } from '@/features/stats/use-stats';
import { StreakFlame } from '@/features/streak/streak-flame';
import { useStreak } from '@/features/streak/use-streak';
import { BacklogList } from '@/features/tasks/backlog-list';
import { useLocalToday } from '@/features/tasks/day';
import { NextUp } from '@/features/tasks/next-up';
import { TodayList } from '@/features/tasks/today-list';
import { useBacklog, useTasks } from '@/features/tasks/use-tasks';
import { WeekStrip } from '@/features/tasks/week-strip';
import { Workspaces } from '@/features/workspaces/workspaces';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';
import { SpacePill } from '@/components/ui/space-pill';
import { useActiveSpace } from '@/features/workspaces/active-space';
import { useScreenPadding } from '@/hooks/use-screen-padding';
import { StatusVeil, useScrollVeil } from '@/components/ui/status-veil';

import { TAB_DOCK } from './_layout';

/** Solo el nombre de pila: "Hola, Omar Bermejo Osuna" no es como te llama nadie. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * El titulo: el dia de la semana con mayuscula, en la serif.
 *
 * Se construye con numeros y no con `new Date(iso)`: parsear 'YYYY-MM-DD' lo trata como UTC y al
 * oeste de Greenwich devuelve el dia anterior.
 */
const weekday = (date: string) => {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString('es-MX', { weekday: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** '31 de julio'. Debajo del titulo, en la voz de los controles. */
const longDate = (date: string) => {
  if (!date) return '';
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('es-MX', { day: 'numeric', month: 'long' });
};

/**
 * HOY. El tablero de la app.
 *
 * El orden de arriba a abajo es una frase, y tiene una FRONTERA a la mitad:
 *
 *   quien eres y como vas         el saludo, el dia en serif, y la racha
 *   cuanto has cargado            el mapa del trimestre
 *   en que estas trabajando       los espacios, con el "+" que crea
 *   que toca AHORA                lo que sigue
 *   ─────────────────────────     de aqui abajo se habla del dia que ESTAS MIRANDO
 *   donde estas en la semana      la tira, que es el control del dia
 *   que se te quedo atras         el backlog
 *   que falta                     la lista, que se puede reordenar arrastrando
 *
 * Esa frontera es la regla que mantiene la pantalla honesta: todo lo de arriba habla de siempre o de
 * ahora y NO sigue a `selected`. `NextUp` esta arriba justo por eso — "que sigue" es siempre sobre
 * ahora, y debajo de la tira se quedaria mintiendo en cuanto tocas el jueves.
 *
 * La tira de la semana estuvo aqui, se fue, y volvio. Se fue porque entonces esta pantalla y Planear
 * eran la MISMA pantalla dos veces: las dos llamaban a `useTasks` con un dia elegido y pintaban las
 * mismas filas. Ya no lo son — aqui hay un mapa de tres meses, los espacios y la racha, y alla hay un
 * riel de horas que aqui no esta. Y la tira NO navega a Planear: esa agenda solo construye catorce dias
 * hacia adelante, asi que no puede mostrar el lunes de esta semana.
 *
 * Anotar vive en el "+" de los espacios y no flotando: la barra de abajo es solo para navegar. Ese
 * boton se pinta en TODOS los estados de la seccion (cargando, error, vacio), que es la promesa que
 * heredó de la tarjeta del dia que estuvo aqui.
 */
export default function HomeScreen() {
  const { user, setActiveSpace } = useAuth();
  const t = useTheme();
  const today = useLocalToday();
  /** El espacio activo acota `useTasks` y `useBacklog` por dentro; aqui solo se pinta. */
  const space = useActiveSpace();

  /**
   * El dia que se esta mirando. En `useState` y no en la ruta, al reves que `calendar.tsx`: alli el dia
   * sobrevive a navegar porque la pestaña ya esta montada y se llega con `?date=`; aqui Hoy es siempre
   * el default y nadie enlaza a "el inicio viendo el jueves".
   */
  const [selected, setSelected] = useState('');
  const day = useTasks(selected || today);
  const backlog = useBacklog(today);
  const workspaces = useWorkspaces();
  const streak = useStreak(today);

  /**
   * Una sola peticion de stats para DOS consumidores: el mapa la pinta entera y la tira saca de ella el
   * punto de densidad de cada dia. Elevada aqui a proposito — un `useStats` dentro de cada uno serian
   * dos `GET /me/stats` de 119 dias en cada foco de la pantalla.
   *
   * ponytail: con cinco hooks, volver a esta pestaña dispara cinco peticiones. Todas son consultas
   * indexadas y pequeñas y van en paralelo, asi que se acepta — pero es el techo real de la pantalla.
   * El siguiente paso seria un `/me/home` que devuelva dia + backlog + stats + espacios + racha junto.
   */
  const stats = useStats(today, { days: QUARTER_HEAT.days });

  /** El mapa fecha -> cuantas agendadas, para la tira. `planned` cae en `done` si el API es viejo. */
  const load = useMemo(
    () => new Map(stats.stats?.byDay.map((d) => [d.date, d.planned ?? d.done]) ?? []),
    [stats.stats]
  );

  /** Mientras una fila se arrastra, el scroll de la pantalla se apaga o pelea con el gesto. */
  const [dragging, setDragging] = useState(false);

  // El aire va en el CONTENIDO y no en un SafeAreaView: así el scroll pasa por debajo de la barra de
  // estado en vez de cortarse contra ella. Ver `use-screen-padding`.
  const veil = useScrollVeil();
  const pad = useScreenPadding(TAB_DOCK);

  // El guard va DESPUES de los hooks: al cerrar sesion el user se vuelve null, y salir antes
  // dejaba a React con menos hooks que en el render anterior.
  if (!user) return null;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.ScrollView
        {...veil.scrollProps}
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        scrollEnabled={!dragging}
        showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <View style={styles.greeting}>
            <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
              Hola, {firstName(user.name)}
            </Text>
            {/* El unico sitio de la app con serif, junto con los numeros de la tira. Ver `Type`. */}
            <Text style={[Type.day, { color: t.text }]} numberOfLines={1}>
              {weekday(today)}
            </Text>
            <Text style={[Type.label, { color: t.textMuted }]} numberOfLines={1}>
              {longDate(today)}
            </Text>
            {/*
              La pastilla va DEBAJO de las tres lineas y no entre ellas: el saludo, el dia y la fecha
              son UNA unidad ("quien eres y que dia es") y meterle algo en medio la parte. Aqui es lo
              ultimo que se lee antes de caer al contenido, que es justo donde se declara su ALCANCE.

              Se pinta sola cuando hay espacio activo, y devuelve null cuando no: en modo general la
              cabecera se ve EXACTAMENTE como siempre.
            */}
            <SpacePill space={space} />
          </View>
          {/* Arriba a la derecha: es lo primero que alguien abre la app a comprobar. */}
          <StreakFlame streak={streak.streak} accent={user.accentColor} />
        </View>

        <HeatMap stats={stats} today={today} accent={user.accentColor} spec={QUARTER_HEAT} />

        <Workspaces
          workspaces={workspaces}
          accent={user.accentColor}
          onActivate={(space) =>
            void setActiveSpace({
              id: space.id,
              name: space.name,
              icon: space.icon,
              accent: space.accent,
              tag: space.tag ?? null,
            })
          }
        />

        <NextUp day={day} />

        {/* La frontera: de aqui abajo, el dia que estas mirando. */}
        <WeekStrip
          today={today}
          selected={selected || today}
          onPickDay={setSelected}
          accent={user.accentColor}
          counts={load}
        />

        <BacklogList backlog={backlog} />

        <TodayList
          day={day}
          today={today}
          selected={selected || today}
          onDragChange={setDragging}
        />
      </Animated.ScrollView>

      <StatusVeil scrollY={veil.scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: {
    paddingHorizontal: Space.xl,
    // El vertical lo pone `useScreenPadding`: depende de los insets del telefono, que no son estaticos.
    gap: Space.xl,
  },
  /**
   * `flex-start` y no `center`: la insignia se alinea con el saludo, arriba, en vez de flotar a media
   * altura de un titular de 50pt de interlineado.
   */
  head: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: Space.md },
  // El encabezado respira por dentro y no con el `gap` del scroll: las tres lineas son UNA cosa.
  greeting: { flex: 1, gap: Space.xs },
});
