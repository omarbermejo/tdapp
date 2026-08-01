import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { Micro } from '@/components/ui/card';
import {
  Radius,
  Space,
  Touch,
  Type,
  useAccent,
  useScheme,
  useTheme,
  type Accent,
} from '@/constants/theme';
import type { Task } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { localDate } from '@/features/tasks/api';
import { DayTimeline } from '@/features/tasks/day-timeline';
import { useTasks } from '@/features/tasks/use-tasks';
import { usePressScale } from '@/hooks/use-press-scale';

import { useScreenPadding } from '@/hooks/use-screen-padding';

import { TAB_DOCK } from './_layout';

/** Dos semanas hacia adelante. Mas que eso ya no es "que viene", es un archivo. */
const DAYS = 14;

/**
 * Fecha local desde 'YYYY-MM-DD'. `new Date('2026-07-30')` la leeria como medianoche UTC y en
 * America corre el dia hacia atras; con el constructor de tres numeros no hay zona de por medio.
 */
const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** `date` mas `offset` dias. setDate normaliza el desborde de mes y de año solo. */
const shift = (date: string, offset: number) => {
  const at = parse(date);
  at.setDate(at.getDate() + offset);
  return at;
};

const long = (at: Date) =>
  at.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** Por hora y las sin hora al final: lo que no esta puesto en el dia no manda en el orden. */
const byTime = (a: Task, b: Task) => {
  if (a.dueAt && b.dueAt) return Date.parse(a.dueAt) - Date.parse(b.dueAt);
  if (a.dueAt) return -1;
  if (b.dueAt) return 1;
  return 0;
};

/**
 * La agenda: que viene y en que dia. No es la pantalla de "que hago ahora" — esa es el home,
 * con una sola tarea al frente. Aqui si se puede ver la lista, porque venir a verla es la
 * intencion y no una distraccion que aparece al abrir la app.
 */
export default function CalendarScreen() {
  const { user } = useAuth();
  const t = useTheme();
  const scheme = useScheme();
  const tint = useAccent(user?.accentColor);

  /**
   * Los controles (titulo y tira de dias) flotan SOBRE la lista, no arriba de ella: asi el
   * contenido pasa por debajo y hay algo que desenfocar. Sin scroll el blur no se pinta —
   * sobre el canvas limpio seria una banda gris sin razon; aparece cuando algo pasa detras.
   */
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // La altura real de los controles: define cuanto aire necesita la lista para no nacer tapada.
  const [headHeight, setHeadHeight] = useState(0);
  const veil = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [0, VEIL_AT], [0, 1], 'clamp'),
  }));

  /**
   * El reloj se lee en el efecto y nunca al pintar: la fecha en el render es impura. El
   * intervalo esta porque una agenda abierta pasada la medianoche seguiria marcando "Hoy" en
   * el dia de ayer; el updater devuelve el mismo valor cuando no cambio, asi que despues del
   * primer anclaje no provoca renders.
   */
  const [today, setToday] = useState('');
  // Minutos desde medianoche. Vive aqui y no en el render por lo mismo: leer el reloj al
  // pintar es impuro, y ademas la marca tiene que moverse sola mientras la pantalla esta abierta.
  const [minutes, setMinutes] = useState(0);
  useEffect(() => {
    const tick = () => {
      setToday((prev) => (prev === localDate() ? prev : localDate()));
      const at = new Date();
      setMinutes(at.getHours() * 60 + at.getMinutes());
    };
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  /**
   * El dia elegido vive en la ruta, no en un useState.
   *
   * La tira de la semana del home empuja `?date=` para que tocar el viernes alla caiga en el
   * viernes aca, y esta pantalla es una PESTAÑA: ya esta montada, asi que un `useState(date)`
   * solo leeria el parametro la primera vez y el segundo toque desde el home no moveria nada.
   * Con la ruta como estado hay UNA fuente de verdad para las dos tiras.
   *
   * Sin parametro el dia es hoy, asi que al cruzar la medianoche la vista se reancla sola.
   */
  const { date } = useLocalSearchParams<{ date?: string }>();
  const selected = date || today;

  // El objeto entero se guarda además de desestructurarlo: el riel se lo pasa tal cual a las filas
  // como `mutate`, porque el hook ya cumple `TaskMutations` (pintar ya, quitar ya, traer la verdad).
  const day = useTasks(selected);
  const { tasks, error, loading, reload } = day;

  // El aire va en el contenido, no en un SafeAreaView: ver `use-screen-padding`.
  const pad = useScreenPadding(TAB_DOCK);

  const days = today ? Array.from({ length: DAYS }, (_, i) => shift(today, i)) : [];
  const sorted = tasks ? [...tasks].sort(byTime) : [];
  const tomorrow = today ? localDate(shift(today, 1)) : '';
  // El `!selected` va primero: sin dia todavia, '' === '' diria "Hoy" bajo un titulo vacio.
  const relative = !selected ? '' : selected === today ? 'Hoy' : selected === tomorrow ? 'Mañana' : '';
  const isViewingToday = !!today && selected === today;

  // El guard va DESPUES de todos los hooks: al cerrar sesion el user se vuelve null y salir
  // antes dejaria a React con menos hooks que en el render anterior.
  if (!user) return null;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      {/* Va PRIMERO en el arbol para quedar debajo de los controles flotantes. */}
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.content,
          { paddingTop: headHeight, paddingBottom: pad.bottom },
        ]}
        showsVerticalScrollIndicator={false}>
        {loading && (
          <View style={styles.message}>
            <Micro>{relative || 'Agenda'}</Micro>
            <Text style={[Type.body, { color: t.textMuted }]}>Trayendo ese día…</Text>
          </View>
        )}

        {!loading && !!error && !tasks && (
          <View style={styles.message}>
            <Micro>{relative || 'Agenda'}</Micro>
            <Text style={[Type.body, { color: t.textMuted }]}>{error}</Text>
            <BigButton
              label="Reintentar"
              variant="ghost"
              accent={user.accentColor}
              onPress={reload}
            />
          </View>
        )}

        {!loading && !!tasks && sorted.length === 0 && (
          /*
            Sin tarjeta a proposito: una caja de `surface` sobre el canvas leia como dos fondos
            encimados. Un mensaje no es contenido, es la pantalla hablando — va sobre el papel.
          */
          <View style={styles.message}>
            {/* La ilustracion hace que un dia vacio se sienta como espacio, no como falta. */}
            <Image
              source={require('@/assets/stickers/bubble.svg')}
              style={styles.empty}
              contentFit="contain"
              accessible={false}
            />
            <Text style={[Type.section, { color: t.text }]}>Nada agendado.</Text>
            <Text style={[Type.body, { color: t.textMuted }]}>
              Un día en blanco no es un día perdido. Si algo va aquí, ponlo.
            </Text>
            <BigButton
              label="Agendar algo"
              accent={user.accentColor}
              onPress={() => router.push('/new-task')}
            />
          </View>
        )}

        {sorted.length > 0 && (
          <>
            {/*
              El tiempo se ve: las horas a la izquierda y un riel que las une. Una lista pelada
              dice el orden; el riel dice que todo eso pasa en el MISMO dia. Corre de arriba a
              abajo a proposito — el riel es el dia, no la union entre dos tarjetas.
            */}
            <DayTimeline
              tasks={sorted}
              fallback={user.accentColor}
              peakEnergy={user.peakEnergy}
              isToday={isViewingToday}
              minutes={minutes}
              mutate={day}
            />
          </>
        )}

        {/* Un fallo con la lista ya en pantalla no borra la pantalla: se avisa y se sigue leyendo. */}
        {!!error && !!tasks && (
          <Text style={[Type.hint, styles.notice, { color: t.danger }]}>{error}</Text>
        )}
      </Animated.ScrollView>

      {/*
        Los controles flotan encima. `pointerEvents` no se toca: la tira de dias se sigue
        arrastrando, y lo unico que hay a su alrededor es aire del propio encabezado.
      */}
      <View
        style={styles.controls}
        onLayout={(e) => setHeadHeight(e.nativeEvent.layout.height)}>
        {/*
          El velo va detras del contenido del encabezado y se revela con el scroll: el blur
          separa los controles de lo que corre por debajo, y el filo de abajo dice donde
          termina la barra ahora que ya no comparte fondo con la lista.
        */}
        <Animated.View style={[StyleSheet.absoluteFill, veil]} pointerEvents="none">
          <BlurView
            intensity={40}
            tint={scheme === 'dark' ? 'dark' : 'light'}
            style={StyleSheet.absoluteFill}
          />
          <View style={[styles.edge, { backgroundColor: t.line }]} />
        </Animated.View>

        {/* El hueco del notch le toca al encabezado: es lo unico pegado al borde de arriba. */}
        <View style={[styles.head, { paddingTop: pad.top }]}>
          <Micro>{relative || 'Que viene'}</Micro>
          <Text style={[Type.display, { color: t.text }]} numberOfLines={2}>
            {selected ? upper(long(parse(selected))) : ''}
          </Text>
        </View>

        {/* Fuera del padding de la pantalla: la tira se corta en el borde y eso invita a arrastrarla. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.strip}>
          {days.map((at) => {
            const day = localDate(at);
            return (
              <Day
                key={day}
                at={at}
                on={day === selected}
                isToday={day === today}
                tint={tint}
                onPress={() => router.setParams({ date: day })}
              />
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

/** Componente aparte porque cada dia necesita su propio shared value para el toque. */
function Day({
  at,
  on,
  isToday,
  tint,
  onPress,
}: {
  at: Date;
  on: boolean;
  isToday: boolean;
  tint: Accent;
  onPress: () => void;
}) {
  const t = useTheme();
  const press = usePressScale({ to: 0.94 });
  // es-MX devuelve 'lun.' con punto; en una tira de tres letras el punto es ruido.
  const name = at.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '');

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={long(at)}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.cell,
          { backgroundColor: on ? tint.soft : t.surface, borderColor: on ? tint.ink : t.line },
        ]}>
        <Text style={[Type.micro, { color: on ? t.text : t.textMuted }]}>{name}</Text>
        <Text style={[Type.section, { color: t.text }]}>{String(at.getDate())}</Text>
        {/*
          Hoy se marca con el punto y el dia elegido con el relleno: pueden no ser el mismo. El
          hueco se reserva siempre y solo se pinta el punto cuando toca, para que la celda de hoy
          no mida distinto que las demas.
        */}
        <View style={styles.slot}>
          {isToday && <View style={[styles.mark, { backgroundColor: tint.ink }]} />}
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Grosor del riel y del punto de hoy: la linea del dia, no un borde de caja. */
const RAIL = 2;
const MARK = 5;

/** A cuantos px de scroll el velo ya esta del todo. Corto: tiene que responder al primer gesto. */
const VEIL_AT = 24;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  controls: { position: 'absolute', top: 0, left: 0, right: 0 },
  // Un pelo, no un borde: separa la barra de la lista sin dibujar una caja.
  edge: { position: 'absolute', bottom: 0, left: 0, right: 0, height: StyleSheet.hairlineWidth },
  // El paddingTop lo pone `useScreenPadding`: es el unico elemento pegado al borde de arriba.
  head: { paddingHorizontal: Space.xl, gap: Space.xs },
  strip: {
    flexDirection: 'row',
    gap: Space.sm,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.lg,
  },
  // La celda del dia es un objetivo tactil: mide lo que mide un boton.
  cell: {
    width: Touch.button,
    borderRadius: Radius.md,
    borderWidth: RAIL,
    alignItems: 'center',
    gap: Space.xs,
    paddingVertical: Space.md,
  },
  slot: { height: MARK },
  mark: { width: MARK, height: MARK, borderRadius: Radius.pill },
  content: {
    paddingHorizontal: Space.xl,
    // El aire de abajo lo pone `useScreenPadding` con la geometria de la pastilla flotante.
    gap: Space.lg,
  },
  // El mismo aire interior que traia Card, para que el contenido no cambie de sitio.
  message: { gap: Space.md, paddingVertical: Space.md },
  notice: { paddingHorizontal: Space.xs },
  empty: { width: '48%', aspectRatio: 1, alignSelf: 'center' },
});
