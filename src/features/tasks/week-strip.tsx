import * as Haptics from 'expo-haptics';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  interpolateColor,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Radius, Space, Touch, Type, useAccent, useTheme, type Accent, type AccentName } from '@/constants/theme';
import { localDate } from '@/features/tasks/api';
import { dayLabel } from '@/features/tasks/day';
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

/** Corto y con un pelin de rebote: el aro de hoy aterriza, no crece. */
const LAND = { damping: 15, stiffness: 320 };

/** El relleno viaja sin rebote: al ir y venir entre dias, un muelle aqui se siente nervioso. */
const TRAVEL = { duration: Motion.enter, easing: Easing.out(Easing.cubic) } as const;

/**
 * Siete columnas a `flex: 1`, asi que cada una mide exactamente un septimo de la fila. Con eso
 * el relleno se puede colocar en porcentajes y no hay que medir nada en JS.
 */
const SLOT = '14.2857%';

/**
 * El encabezado de semana del home: que dia esta viendo el usuario y donde cae en su semana.
 *
 * Es CONTROLADA: ni ancla el reloj ni guarda el dia elegido. Tocar un dia no navega a la agenda,
 * cambia el dia de la pantalla que la contiene, asi que el elegido y hoy son dos cosas distintas
 * y llevan dos señales distintas: el elegido lleva el relleno del acento y hoy lleva el aro. Casi
 * siempre coinciden (relleno con aro); cuando no, se sigue viendo donde estas parado y donde
 * estas mirando.
 */
export function WeekStrip({
  today,
  selected,
  onPickDay,
  accent,
}: {
  today: string;
  selected: string;
  onPickDay: (date: string) => void;
  accent?: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  /**
   * El hook de reanimated, que es el mismo que usan `day-card`, `confetti` y `use-press-scale`.
   *
   * Lo que gana contra `AccessibilityInfo.isReduceMotionEnabled()` es que resuelve SINCRONO —lee una
   * constante que el nativo inyecta al arrancar— asi que no hay un primer frame en el que todavia no
   * se sabe si se puede animar, y no hace falta un estado que arranque en null.
   *
   * Lo que NO hace, y conviene saberlo antes de confiarse: no es reactivo. Su propio JSDoc dice que
   * cambiar la bandera del sistema no re-renderiza nada, porque devuelve el valor que habia AL
   * ARRANCAR la app. Encender "reducir movimiento" con la app abierta no se nota hasta reabrirla.
   * Es aceptable —nadie cambia ese ajuste a media sesion— pero si algun dia hace falta en vivo, el
   * camino es `AccessibilityInfo.addEventListener('reduceMotionChanged')`, no este hook.
   */
  const reduced = useReducedMotion();

  // La semana que se pinta es la del dia elegido, no la de hoy: si el elegido cayera en otra
  // semana, la tira tiene que estar mostrandolo o el usuario no ve donde esta parado.
  // Sin dia no se pinta ningun numero: seria una fecha inventada. Las dos filas reservan su
  // alto para que el primer frame no empuje la lista de tareas.
  const days = selected ? weekOf(selected) : [];
  const index = days.findIndex((day) => localDate(day) === selected);

  // El encabezado no se puede animar al montar (nace vacio, dentro del hueco reservado), asi
  // que su fundido lo dispara la llegada del dia, un frame antes que la primera columna.
  const headIn = useSharedValue(0);
  const at = useSharedValue(0);
  const land = useSharedValue(reduced ? 1 : 0.8);
  const placed = useSharedValue(false);

  useEffect(() => {
    if (!selected) return;
    headIn.value = reduced ? 1 : withTiming(1, { duration: FADE });
  }, [selected, reduced, headIn]);

  useEffect(() => {
    if (index < 0) return;
    // Ya hay relleno en pantalla: no vuelve a nacer en el dia nuevo, viaja hasta el.
    if (placed.value) {
      at.value = reduced ? index : withTiming(index, TRAVEL);
      return;
    }
    placed.value = true;
    at.value = index;
    land.value = reduced ? 1 : withDelay(index * STAGGER, withSpring(1, LAND));
  }, [index, reduced, at, land, placed]);

  const head = useAnimatedStyle(() => ({ opacity: headIn.value }));
  // translateX en porcentaje es del ancho del propio riel, que ya es un septimo de la fila:
  // la columna i esta a i veces su propio ancho.
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: `${at.value * 100}%` }] }));
  const fill = useAnimatedStyle(() => ({ transform: [{ scale: land.value }] }));

  return (
    <View style={styles.strip}>
      <Animated.View style={[styles.head, head]}>
        <Text style={[Type.section, { color: t.text }]}>{dayLabel(selected, today)}</Text>
        {/* Type.micro ya va en mayusculas: 'julio' sale 'JULIO'. */}
        <Text style={[Type.micro, { color: t.textMuted }]}>
          {selected ? parse(selected).toLocaleDateString('es-MX', { month: 'long' }) : ''}
        </Text>
      </Animated.View>

      <View style={styles.week}>
        {days.length > 0 && (
          <Animated.View
            pointerEvents="none"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
            style={[styles.slot, slide]}>
            {/* Letra fantasma: le copia el ritmo vertical a las celdas para que el relleno caiga
                exactamente sobre el numero, sin medir alturas. */}
            <Text style={[Type.micro, styles.ghost]}>L</Text>
            <Animated.View style={[styles.dot, { backgroundColor: tint.soft }, fill]} />
          </Animated.View>
        )}

        {days.map((day, i) => (
          <Day
            key={localDate(day)}
            at={day}
            index={i}
            isToday={localDate(day) === today}
            isSelected={localDate(day) === selected}
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
  isSelected,
  reduced,
  tint,
  onPickDay,
}: {
  at: Date;
  index: number;
  isToday: boolean;
  isSelected: boolean;
  reduced: boolean;
  tint: Accent;
  onPickDay: (date: string) => void;
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
    // El aro de hoy llega con su columna, no antes: la tira sigue leyendose de izquierda a derecha.
    if (isToday) land.value = withDelay(index * STAGGER, withSpring(1, LAND));
  }, [reduced, index, isToday, enter, land]);

  /*
    La opacidad viaja en su propio estilo porque `press.style` escribe `transform`: en un array
    de estilos la ultima clave gana, y mezclar las dos en un solo objeto borraria la escala.
  */
  const column = useAnimatedStyle(() => ({ opacity: enter.value }));
  const ring = useAnimatedStyle(() => ({ transform: [{ scale: land.value }] }));

  // El numero se tiñe mientras el dedo esta abajo: en un objetivo de 34pt la escala sola se
  // pierde debajo del pulgar. El elegido ya nace en tinta, encima de su relleno.
  const base = isSelected ? tint.ink : isToday ? t.text : t.textMuted;
  // base y tint entran en las dependencias: al cambiar el esquema el worklet tiene que releerlos.
  const number = useAnimatedStyle(
    () => ({ color: interpolateColor(heldAt.value, [0, 1], [base, tint.ink]) }),
    [base, tint.ink],
  );

  return (
    <Animated.View style={[styles.col, column, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${long(at)}${isToday ? ', hoy' : ''}`}
        accessibilityHint="Muestra las tareas de este día"
        accessibilityState={{ selected: isSelected }}
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
        <Text style={[Type.micro, { color: t.textMuted }]}>{initial(at)}</Text>
        <Animated.View
          style={[
            styles.dot,
            ring,
            // Hoy es el aro, el relleno es el elegido. Sin fondo propio, porque el relleno que
            // pasa por debajo es el que viaja: si la celda tambien lo pintara, no viajaria nada.
            isToday && { borderWidth: 2, borderColor: tint.ink },
          ]}>
          <Animated.Text style={[Type.label, number]}>{String(at.getDate())}</Animated.Text>
        </Animated.View>
      </Pressable>
    </Animated.View>
  );
}

/** Circulo del dia: mismo ancho que alto, porque con Radius.pill un rectangulo saldria pastilla. */
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
  // El riel del relleno: fuera del flujo, con la misma caja que una celda.
  slot: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: SLOT,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Space.xs,
  },
  ghost: { opacity: 0 },
  dot: {
    width: DOT,
    height: DOT,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
