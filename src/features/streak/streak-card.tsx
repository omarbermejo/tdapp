import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { Card, Micro } from '@/components/ui/card';
import { Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { weekdayInitial } from '@/features/tasks/day';

import { bestLine, clemencyLine, headlineOf, levelsOf, weekLabel, type DayLevel } from './streak';
import type { useStreak } from './use-streak';

/** El punto entra escalonado, como la tira de la semana del home. Cortito: son siete. */
const STEP_MS = 30;
const ENTER = { duration: 220, easing: Easing.out(Easing.cubic) } as const;
const DOT = 14;

/**
 * Un día de la semana.
 *
 * **No es `Bud`.** `Bud` cablea `backgroundColor: t.canvas` para el hueco apagado, así que dentro de
 * una `Card` (que es `surface`) en modo oscuro imprimiría un disco negro sobre gris — un agujero, no
 * un día pendiente. Y solo tiene dos estados cuando aquí hacen falta cuatro.
 *
 * Los cuatro se distinguen por FORMA y no solo por color: macizo cuando cerraste, aro cuando no. Así
 * se leen sin depender de ver bien el color, y un sábado que todavía no llega no se confunde con un
 * martes que pasó en blanco.
 */
function Dot({
  level,
  index,
  tint,
  animate,
}: {
  level: DayLevel;
  index: number;
  tint: { solid: string; soft: string; ink: string };
  animate: boolean;
}) {
  const t = useTheme();
  const enter = useSharedValue(animate ? 0 : 1);
  // El relleno se anima aparte de la entrada: cerrar una tarea desde el home y volver aquí tiñe el
  // punto de hoy, y eso tiene que verse pasar.
  const fill = useSharedValue(level === 'closed' ? 1 : 0);

  useEffect(() => {
    if (!animate) return;
    // .set() y no .value =: el compilador de React trata el shared value como inmutable.
    enter.set(withDelay(index * STEP_MS, withTiming(1, ENTER)));
  }, [animate, index, enter]);

  useEffect(() => {
    fill.set(animate ? withTiming(level === 'closed' ? 1 : 0, { duration: 240 }) : level === 'closed' ? 1 : 0);
  }, [level, animate, fill]);

  /** El aro pendiente va en `textMuted` y no en `line`: `line` da 1.2:1 sobre el papel y desaparece. */
  const ring = level === 'missed' ? t.textMuted : t.line;

  const style = useAnimatedStyle(
    () => ({
      opacity: enter.get(),
      transform: [{ scale: 0.7 + 0.3 * enter.get() }],
      backgroundColor: interpolateColor(
        fill.get(),
        [0, 1],
        [level === 'today' ? tint.soft : 'transparent', tint.solid]
      ),
      borderColor: level === 'today' ? tint.ink : ring,
    }),
    [level, tint.soft, tint.solid, tint.ink, ring]
  );

  return <Animated.View style={[styles.dot, style]} />;
}

/**
 * La racha y la semana: el único dato de esta pantalla que cambia solo.
 *
 * Es lo que le da una razón a abrir la pestaña más de una vez. Y el tono importa tanto como el número:
 * la racha del API está diseñada para no castigar (el día de hoy no cuenta hasta que cierras algo,
 * pero tampoco la rompe), así que la tarjeta lo dice en vez de dejar que el usuario lo deduzca.
 */
export function StreakCard({
  streak: day,
  accent,
}: {
  streak: ReturnType<typeof useStreak>;
  accent: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const still = useReducedMotion();
  const { streak, loading, error, reload } = day;

  if (loading && !streak) {
    return (
      <Card>
        <Micro>Tu racha</Micro>
        <Text style={[Type.body, { color: t.textMuted }]}>Trayendo tu racha…</Text>
      </Card>
    );
  }

  if (!streak) {
    return (
      <Card>
        <Micro>Tu racha</Micro>
        <Text style={[Type.body, { color: t.textMuted }]}>{error || 'No pudimos traer tu racha'}</Text>
        <BigButton label="Reintentar" variant="ghost" accent={accent} onPress={reload} />
      </Card>
    );
  }

  const levels = levelsOf(streak);
  const clemency = clemencyLine(streak);
  const empty = streak.days === 0;

  return (
    <Card>
      <Micro>Tu racha</Micro>

      {/*
        `metric` y no `display`: es un número DENTRO de una tarjeta, que es justo el caso que la
        `DayCard` ya resolvió. Y en cero no se pinta un 0 — un cero en tamaño de métrica se lee como un
        reproche, así que ahí baja a `section` y lo dice con palabras.
      */}
      <Text style={[empty ? Type.section : Type.metric, { color: t.text }]}>
        {headlineOf(streak.days)}
      </Text>

      {/* Nunca repite el número que ya está arriba: dice lo que ese número no dice. */}
      <Text style={[Type.body, { color: t.textMuted }]}>
        {bestLine(streak.days, streak.best)}
      </Text>

      <View style={styles.week}>
        <Micro>Esta semana</Micro>
        {/*
          La fila entera es UN nodo accesible: siete puntos sueltos no dicen nada a un lector de
          pantalla, y leerlos uno por uno sería ruido.
        */}
        <View accessible accessibilityLabel={weekLabel(streak)} style={styles.row}>
          {streak.week.map((entry, i) => (
            <View key={entry.date} style={styles.column}>
              <Dot level={levels[i]} index={i} tint={tint} animate={!still} />
              <Text style={[Type.micro, { color: t.textMuted }]}>{weekdayInitial(entry.date)}</Text>
            </View>
          ))}
        </View>
      </View>

      {/* Condicional: permanente se vuelve mobiliario y deja de leerse. */}
      {!!clemency && <Text style={[Type.hint, { color: t.textMuted }]}>{clemency}</Text>}
    </Card>
  );
}

const styles = StyleSheet.create({
  week: { gap: Space.sm },
  row: { flexDirection: 'row' },
  // Siete columnas de ancho igual, como la tira del home: así las iniciales quedan bajo su punto.
  column: { flex: 1, alignItems: 'center', gap: Space.xs, minHeight: Touch.icon },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
});
