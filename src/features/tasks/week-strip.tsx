import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

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

  return (
    <View style={styles.strip}>
      <View style={styles.head}>
        <Text style={[Type.section, { color: t.text }]}>
          {at ? upper(at.toLocaleDateString('es-MX', { weekday: 'long' })) : ''}
        </Text>
        {/* Type.micro ya va en mayusculas: 'julio' sale 'JULIO'. */}
        <Text style={[Type.micro, { color: t.textMuted }]}>
          {at ? at.toLocaleDateString('es-MX', { month: 'long' }) : ''}
        </Text>
      </View>

      <View style={styles.week}>
        {days.map((day) => (
          <Day
            key={localDate(day)}
            at={day}
            isToday={localDate(day) === today}
            tint={tint}
            onPickDay={onPickDay}
          />
        ))}
      </View>
    </View>
  );
}

/** Componente aparte porque cada dia necesita su propio shared value para el toque. */
function Day({
  at,
  isToday,
  tint,
  onPickDay,
}: {
  at: Date;
  isToday: boolean;
  tint: Accent;
  onPickDay?: (date: string) => void;
}) {
  const t = useTheme();
  const press = usePressScale({ to: 0.9 });

  const face = (
    <>
      <Text style={[Type.micro, { color: t.textMuted }]}>{initial(at)}</Text>
      <View style={[styles.dot, isToday && { backgroundColor: tint.soft }]}>
        <Text style={[Type.label, { color: isToday ? t.text : t.textMuted }]}>
          {String(at.getDate())}
        </Text>
      </View>
    </>
  );

  /*
    Sin onPickDay la tira solo informa: no recibe toques ni entra al arbol de accesibilidad,
    porque un calendario que parece tocable y no responde es peor que uno que claramente no lo es.
  */
  if (!onPickDay) {
    return (
      <View
        pointerEvents="none"
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={[styles.col, styles.cell]}>
        {face}
      </View>
    );
  }

  return (
    <Animated.View style={[styles.col, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={long(at)}
        onPress={() => onPickDay(localDate(at))}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
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
