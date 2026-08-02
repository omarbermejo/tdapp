import { router } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, StyleSheet, Text, View } from "react-native";
import Animated from "react-native-reanimated";

import { ScreenGuard } from "@/components/ui/screen-guard";
import { GreetingSwitch } from "@/components/ui/space-pill";
import { StatusVeil, useScrollVeil } from "@/components/ui/status-veil";
import { Space, Type, useTheme } from "@/constants/theme";
import { NotificationBell } from "@/features/activity/notification-bell";
import { useAuth } from "@/features/auth/auth-context";
import { QUARTER_HEAT, WORKSPACE_HEAT } from "@/features/stats/grid";
import { HeatMap } from "@/features/stats/heat-map";
import { useStats } from "@/features/stats/use-stats";
import { StreakFlame } from "@/features/streak/streak-flame";
import { useStreak } from "@/features/streak/use-streak";
import { BacklogList } from "@/features/tasks/backlog-list";
import { useLocalToday } from "@/features/tasks/day";
import { NextUp } from "@/features/tasks/next-up";
import { TodayList } from "@/features/tasks/today-list";
import { useBacklog, useTasks } from "@/features/tasks/use-tasks";
import { WeekStrip } from "@/features/tasks/week-strip";
import { useActiveSpace } from "@/features/workspaces/active-space";
import { SpaceMembers } from "@/features/workspaces/space-members";
import { useWorkspaces } from "@/features/workspaces/use-workspaces";
import { PlusButton, Workspaces } from "@/features/workspaces/workspaces";
import { useScreenPadding } from "@/hooks/use-screen-padding";

import { TAB_DOCK } from "./_layout";

/** Solo el nombre de pila: "Hola, Omar Bermejo Osuna" no es como te llama nadie. */
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/**
 * El titulo: el dia de la semana con mayuscula, en la serif.
 *
 * Se construye con numeros y no con `new Date(iso)`: parsear 'YYYY-MM-DD' lo trata como UTC y al
 * oeste de Greenwich devuelve el dia anterior.
 */
const weekday = (date: string) => {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  const label = new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    weekday: "long",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
};

/** '31 de julio'. Debajo del titulo, en la voz de los controles. */
const longDate = (date: string) => {
  if (!date) return "";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("es-MX", {
    day: "numeric",
    month: "long",
  });
};

/**
 * HOY. El tablero de la app.
 *
 * El orden de arriba a abajo es una frase, y se lee de lo mas cercano a lo mas lejano:
 *
 *   quien eres y donde estas      el saludo (que dice el espacio), el dia en serif, la racha, el "+"
 *   con quien estas               las caras de quienes comparten el espacio — solo dentro de uno
 *   donde caes en la semana       la tira, que es el CONTROL del dia
 *   cuanto has cargado            el mapa del trimestre
 *   en que estas trabajando       los espacios — solo en modo general
 *   que toca AHORA                lo que sigue
 *   que se te quedo atras         el backlog
 *   que falta                     la lista, que se puede reordenar arrastrando
 *
 * **Hubo una FRONTERA aqui y ya no la hay.** La tira vivia a media pantalla y separaba lo que habla de
 * siempre (arriba) de lo que habla del dia elegido (abajo). Ahora la tira abre la pantalla, asi que el
 * control queda por ENCIMA de dos bloques que no le obedecen — el mapa y los espacios hablan de
 * siempre. Es un precio consciente: el control del dia es lo primero que se busca, y lo que lo hace
 * legible es que la lista de abajo rotula su propio dia. `NextUp` sigue a `selected` igual que la
 * lista, que es lo coherente ahora que el control esta arriba del todo.
 *
 * **Dos modos, y la diferencia es que se calla.** Dentro de un espacio activo el mapa de calor cuenta
 * SOLO ese espacio (y el de todos sus miembros, no solo el tuyo — ver `spanning` en el API) y el bloque
 * "Tus espacios" no se pinta: la pantalla entera ya habla de un espacio, y una rejilla con los otros
 * cinco al lado seria una invitacion a irse de donde acabas de entrar. En modo general no hay caras y
 * la rejilla vuelve.
 *
 * **El "+" de anotar vive en la cabecera y no en los espacios.** Estuvo alli, y se mudo cuando ese
 * bloque paso a desaparecer dentro de un espacio: es la unica forma de crear una tarea desde Hoy —la
 * barra de abajo es solo para navegar y el detalle de un espacio no tiene ninguna— asi que no puede
 * hospedarla un bloque condicional.
 *
 * La tira de la semana estuvo aqui, se fue, y volvio. Se fue porque entonces esta pantalla y Planear
 * eran la MISMA pantalla dos veces: las dos llamaban a `useTasks` con un dia elegido y pintaban las
 * mismas filas. Ya no lo son — aqui hay un mapa de tres meses, los espacios y la racha, y alla hay un
 * riel de horas que aqui no esta. Y la tira NO navega a Planear: esa agenda solo construye catorce dias
 * hacia adelante, asi que no puede mostrar el lunes de esta semana.
 */
export default function HomeScreen() {
  const { user, setActiveSpace } = useAuth();
  const t = useTheme();
  const today = useLocalToday();
  /** El espacio activo acota `useTasks` y `useBacklog` por dentro; aqui ademas acota el mapa. */
  const space = useActiveSpace();

  /**
   * Que mapa se pinta. Misma geometria —17 semanas, dia de la semana por fila— y distinto TOPE.
   *
   * `QUARTER_HEAT` llena una celda con seis cosas, que es lo que hace un dia lleno mirando la cuenta
   * entera. Dentro de un solo proyecto dos tareas en un dia YA es un dia dedicado a el, asi que con el
   * tope en seis el mapa del espacio se veria casi en blanco aunque hubiera trabajo todos los dias.
   * `WORKSPACE_HEAT` es literalmente `{ ...QUARTER_HEAT, cap: 2 }`, asi que el alto no cambia y la
   * pantalla no salta al entrar o salir de un espacio.
   */
  const heat = space ? WORKSPACE_HEAT : QUARTER_HEAT;

  /**
   * El dia que se esta mirando. En `useState` y no en la ruta, al reves que `calendar.tsx`: alli el dia
   * sobrevive a navegar porque la pestaña ya esta montada y se llega con `?date=`; aqui Hoy es siempre
   * el default y nadie enlaza a "el inicio viendo el jueves".
   */
  const [selected, setSelected] = useState("");
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
   *
   * Va ACOTADA al espacio activo, que es lo que hace que el mapa hable de donde estas. `space?.id`
   * entra en la llave de cache de `useStats`, asi que cambiar de espacio repinta solo. Del lado del
   * API, con espacio la consulta cuenta el espacio ENTERO —el trabajo de todos sus miembros— y no solo
   * tu parte: es lo mismo que ya cuentan el anillo de su card y la lista de abajo.
   */
  const stats = useStats(today, { days: heat.days, workspaceId: space?.id });

  /** El mapa fecha -> cuantas agendadas, para la tira. `planned` cae en `done` si el API es viejo. */
  const load = useMemo(
    () =>
      new Map(
        stats.stats?.byDay.map((d) => [d.date, d.planned ?? d.done]) ?? [],
      ),
    [stats.stats],
  );

  /** Mientras una fila se arrastra, el scroll de la pantalla se apaga o pelea con el gesto. */
  const [dragging, setDragging] = useState(false);

  /** Estado del pull-to-refresh */
  const [refreshing, setRefreshing] = useState(false);

  /** Función para recargar todos los datos cuando hace pull-to-refresh */
  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([
        day.reload?.(),
        backlog.reload?.(),
        workspaces.reload?.(),
        streak.reload?.(),
        stats.reload?.(),
      ]);
    } finally {
      setRefreshing(false);
    }
  };

  // El air e va en el CONTENIDO y no en un SafeAreaView: así el scroll pasa por debajo de la barra de
  // estado en vez de cortarse contra ella. Ver `use-screen-padding`.
  const veil = useScrollVeil();
  const pad = useScreenPadding(TAB_DOCK);

  // El guard va DESPUES de los hooks: al cerrar sesion el user se vuelve null, y salir antes
  // dejaba a React con menos hooks que en el render anterior.
  if (!user) return <ScreenGuard />;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.ScrollView
        {...veil.scrollProps}
        contentContainerStyle={[
          styles.content,
          { paddingTop: pad.top, paddingBottom: pad.bottom },
        ]}
        scrollEnabled={!dragging}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        <View style={styles.head}>
          <View style={styles.greeting}>
            {/*
              El saludo ES la puerta del selector, y por eso es un boton y no una linea de texto.
              Sin esto, una cuenta en modo general no tendria ningun sitio desde el que crear un espacio
              ni unirse con un codigo. Y dentro de un espacio dice CUAL: por eso el hueco de abajo, donde
              vivia la pastilla, queda libre para las caras.
            */}
            <GreetingSwitch
              label={`Hola, ${firstName(user.name)}`}
              space={space}
              accent={user.accentColor}
            />
            {/* El unico sitio de la app con serif, junto con los numeros de la tira. Ver `Type`. */}
            <Text style={[Type.day, { color: t.text }]} numberOfLines={1}>
              {weekday(today)}
            </Text>
            <Text
              style={[Type.label, { color: t.textMuted }]}
              numberOfLines={1}
            >
              {longDate(today)}
            </Text>
            {/*
              Con quien lo compartes. Va DEBAJO de las tres lineas y no entre ellas: el saludo, el dia
              y la fecha son UNA unidad ("quien eres y que dia es") y meterle algo en medio la parte.

              Devuelve null en modo general y tambien en un espacio donde estas solo: una cara suelta
              —la tuya— no informa de nada.
            */}
            <SpaceMembers space={space} />
          </View>

          {/*
            Arriba a la derecha: la racha es lo primero que alguien abre la app a comprobar, y el "+"
            es lo que mas veces toca. Van juntos en la esquina del pulgar.

            DOS FILAS y no tres piezas en columna ni en fila. En columna serian 156pt de alto contra
            los 100 de ahora, y empujarian a los miembros del espacio rompiendo la unidad de tres
            lineas del saludo. En fila robarian ~150pt de ancho al `flex: 1` del titulo, y `Type.day`
            es serif de una sola linea: "Miercoles" empieza a truncarse en pantallas de 393pt.

            Asi son 100pt exactos, el alto de hoy sin mover un punto. Y separa lo que hay que separar:
            arriba lo que se COMPRUEBA (como vas, que paso) y abajo lo unico que CREA — que es lo que
            deja al "+" como el unico relleno solido de la pantalla.
          */}
          <View style={styles.tools}>
            <View style={styles.status}>
              <StreakFlame streak={streak.streak} accent={user.accentColor} />
              <NotificationBell accent={space?.accent ?? user.accentColor} />
            </View>
            <PlusButton
              accent={space?.accent ?? user.accentColor}
              onPress={() => router.push("/new-task-steps")}
            />
          </View>
        </View>

        {/* El control del dia abre la pantalla. Sin papel debajo: ver el comentario de `WeekStrip`. */}
        <WeekStrip
          today={today}
          selected={selected || today}
          onPickDay={setSelected}
          accent={space?.accent ?? user.accentColor}
          counts={load}
        />

        <HeatMap
          stats={stats}
          today={today}
          accent={space?.accent ?? user.accentColor}
          spec={heat}
        />

        {/* Dentro de un espacio no se pinta: la pantalla entera ya habla de el. */}
        {!space && (
          <Workspaces
            workspaces={workspaces}
            onActivate={(picked) =>
              void setActiveSpace({
                id: picked.id,
                name: picked.name,
                icon: picked.icon,
                accent: picked.accent,
                tag: picked.tag ?? null,
              })
            }
          />
        )}

        <NextUp day={day} />

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
  head: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: Space.md,
  },
  // La racha y el "+", en columna: los dos miden 44 y apilados caben sin robarle ancho al saludo.
  tools: { alignItems: "flex-end", gap: Space.md },
  status: { flexDirection: "row", alignItems: "center", gap: Space.sm },
  // El encabezado respira por dentro y no con el `gap` del scroll: las tres lineas son UNA cosa.
  greeting: { flex: 1, gap: Space.xs },
});
