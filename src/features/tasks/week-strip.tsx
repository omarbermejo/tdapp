import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import {
  Radius,
  Space,
  Touch,
  Type,
  useAccent,
  useTheme,
  type Accent,
  type AccentName,
} from '@/constants/theme';
import { localDate } from '@/features/tasks/api';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * Fecha local desde 'YYYY-MM-DD'. `new Date('2026-07-30')` seria medianoche UTC y en America
 * corre el dia hacia atras; con el constructor de tres numeros no hay zona de por medio.
 */
const parse = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Los siete dias de la semana en curso, de lunes a domingo.
 *
 * `getDay()` devuelve 0 el domingo, asi que el desplazamiento al lunes es `(getDay() + 6) % 7`.
 * El constructor normaliza el desborde de mes y de año solo, igual que setDate.
 */
const weekOf = (date: string) => {
  const at = parse(date);
  const monday = at.getDate() - ((at.getDay() + 6) % 7);
  return Array.from({ length: 7 }, (_, i) => new Date(at.getFullYear(), at.getMonth(), monday + i));
};

const upper = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

const long = (at: Date) =>
  at.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long' });

/** es-MX devuelve 'lun.' con punto; de ahi sale la inicial: L M M J V S D. */
const initial = (at: Date) =>
  upper(at.toLocaleDateString('es-MX', { weekday: 'short' }).replace('.', '')).charAt(0);

/** La tira se arma de lunes a domingo: 30ms por columna, 180ms de fundido cada una. */
const STAGGER = 30;
const FADE = 180;

/** Corto y con un pelin de rebote: el circulo de hoy aterriza, no crece. */
const LAND = { damping: 15, stiffness: 320 };

/**
 * El encabezado de semana del home: en que dia vive el usuario y donde cae dentro de su semana.
 *
 * Es la UNICA parte del home que dice la fecha, asi que se responde sola: el nombre del dia
 * grande, el mes al lado y los siete numeros debajo con hoy marcado.
 */
export function WeekStrip({
  accent,
  onPickDay,
}: {
  accent?: AccentName;
  onPickDay?: (date: string) => void;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  /*
    reanimated ya envuelve AccessibilityInfo.isReduceMotionEnabled() y escucha sus cambios:
    leerlo con un hook evita el frame en blanco de resolver una promesa en un efecto.
  */
  const reduced = useReducedMotion();

  /**
   * El reloj se lee en el efecto y nunca al pintar: la fecha en el render es impura. El
   * intervalo esta porque la app abierta pasada la medianoche seguiria marcando hoy en el dia
   * de ayer; el updater devuelve el MISMO valor cuando no cambio, asi que despues del primer
   * anclaje no provoca renders.
   */
  const [today, setToday] = useState('');
  useEffect(() => {
    const tick = () => setToday((prev) => (prev === localDate() ? prev : localDate()));
    tick();
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, []);

  // Sin dia anclado no se pinta ningun numero: seria una fecha inventada. Las dos filas
  // reservan su alto para que el primer frame no empuje la lista de tareas.
  const at = today ? parse(today) : null;
  const days = today ? weekOf(today) : [];

  // El encabezado no se puede animar al montar (nace vacio, dentro del hueco reservado), asi
  // que su fundido lo dispara la llegada del dia, un frame antes que la primera columna.
  const headIn = useSharedValue(0);
  useEffect(() => {
    if (!today) return;
    headIn.value = reduced ? 1 : withTiming(1, { duration: FADE });
  }, [today, reduced, headIn]);
  const head = useAnimatedStyle(() => ({ opacity: headIn.value }));

  return (
    <View style={styles.strip}>
      <Animated.View style={[styles.head, head]}>
        <Text style={[Type.section, { color: t.text }]}>
          {at ? upper(at.toLocaleDateString('es-MX', { weekday: 'long' })) : ''}
        </Text>
        {/* Type.micro ya va en mayusculas: 'julio' sale 'JULIO'. */}
        <Text style={[Type.micro, { color: t.textMuted }]}>
          {at ? at.toLocaleDateString('es-MX', { month: 'long' }) : ''}
        </Text>
      </Animated.View>

      <View style={styles.week}>
        {days.map((day, i) => (
          <Day
            key={localDate(day)}
            at={day}
            index={i}
            isToday={localDate(day) === today}
            reduced={reduced}
            tint={tint}
            onPickDay={onPickDay}
          />
        ))}
      </View>
    </View>
  );
}

/** Componente aparte porque cada dia necesita sus propios shared values. */
function Day({
  at,
  index,
  isToday,
  reduced,
  tint,
  onPickDay,
}: {
  at: Date;
  index: number;
  isToday: boolean;
  reduced: boolean;
  tint: Accent;
  onPickDay?: (date: string) => void;
}) {
  const t = useTheme();
  // Soft y no el Light por omision: el golpe de bajada solo acompaña, el que confirma la
  // eleccion es el selectionAsync de onPress.
  const press = usePressScale({ to: 0.9, haptic: Haptics.ImpactFeedbackStyle.Soft });

  const enter = useSharedValue(reduced ? 1 : 0);
  const land = useSharedValue(isToday && !reduced ? 0.8 : 1);

  // El dedo abajo se guarda en estado y no se escribe al shared value desde el handler: el
  // compilador de React solo acepta mutarlos dentro de un efecto.
  const [held, setHeld] = useState(false);
  const heldAt = useSharedValue(0);
  useEffect(() => {
    heldAt.value = withTiming(held ? 1 : 0, { duration: held ? 120 : 180 });
  }, [held, heldAt]);

  useEffect(() => {
    if (reduced) {
      enter.value = 1;
      land.value = 1;
      return;
    }
    enter.value = withDelay(index * STAGGER, withTiming(1, { duration: FADE }));
    // El circulo de hoy llega con su columna, no antes: la tira sigue leyendose de izquierda a derecha.
    if (isToday) land.value = withDelay(index * STAGGER, withSpring(1, LAND));
  }, [reduced, index, isToday, enter, land]);

  /*
    La opacidad viaja en su propio estilo porque `press.style` escribe `transform`: en un array
    de estilos la ultima clave gana, y mezclar las dos en un solo objeto borraria la escala.
  */
  const column = useAnimatedStyle(() => ({ opacity: enter.value }));
  const circle = useAnimatedStyle(() => ({ transform: [{ scale: land.value }] }));

  // El numero se tiñe mientras el dedo esta abajo: en un objetivo de 34pt la escala sola se
  // pierde debajo del pulgar.
  const base = isToday ? t.text : t.textMuted;
  // base y tint entran en las dependencias: al cambiar el esquema el worklet tiene que releerlos.
  const number = useAnimatedStyle(
    () => ({ color: interpolateColor(heldAt.value, [0, 1], [base, tint.ink]) }),
    [base, tint.ink],
  );

  const face = (
    <>
      <Text style={[Type.micro, { color: t.textMuted }]}>{initial(at)}</Text>
      <Animated.View
        style={[
          styles.dot,
          circle,
          // Unica señal extra de hoy: el aro de tinta del acento. El relleno `soft` solo no
          // separa nada sobre papel blanco, y con dos señales mas la tira dejaria de estar tranquila.
          isToday && { backgroundColor: tint.soft, borderWidth: 1, borderColor: tint.ink },
        ]}>
        <Animated.Text style={[Type.label, number]}>{String(at.getDate())}</Animated.Text>
      </Animated.View>
    </>
  );

  /*
    Sin onPickDay la tira solo informa: no recibe toques ni entra al arbol de accesibilidad,
    porque un calendario que parece tocable y no responde es peor que uno que claramente no lo es.
  */
  if (!onPickDay) {
    return (
      <Animated.View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.col, styles.cell, column]}>
        {face}
      </Animated.View>
    );
  }

  return (
    <Animated.View style={[styles.col, column, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={long(at)}
        onPress={() => {
          // En web no hay motor haptico; el catch evita ensuciar la consola.
          Haptics.selectionAsync().catch(() => {});
          onPickDay(localDate(at));
        }}
        onPressIn={() => {
          press.onPressIn();
          setHeld(true);
        }}
        onPressOut={() => {
          press.onPressOut();
          setHeld(false);
        }}
        style={styles.cell}>
        {face}
      </Pressable>
    </Animated.View>
  );
}

/** Circulo de hoy: mismo ancho que alto, porque con Radius.pill un rectangulo saldria pastilla. */
const DOT = 34;

const styles = StyleSheet.create({
  strip: { gap: Space.md },
  // Baseline y no centro: el mes es una micro-etiqueta que se apoya en la linea del nombre del dia.
  head: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: Space.sm,
    minHeight: Type.section.lineHeight,
  },
  week: { flexDirection: 'row', minHeight: Touch.icon },
  // Sin ancho fijo: siete columnas a flex reparten el ancho del telefono que sea, sin scroll.
  col: { flex: 1 },
  cell: { minHeight: Touch.icon, alignItems: 'center', justifyContent: 'center', gap: Space.xs },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
