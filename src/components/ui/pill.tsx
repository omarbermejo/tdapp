import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * Una decisión como pastilla: arriba lo que es, abajo lo que vale AHORA.
 *
 * Mostrar el valor en vez de las opciones es lo que deja una pantalla de cinco decisiones en cinco
 * líneas: para leerla no hay que abrir ninguna, y para cambiar una se abre solo esa.
 *
 * Vivía dentro de `new-task.tsx`, que fue donde se resolvió el patrón. Se promovió al montar el perfil
 * — la segunda pantalla con el mismo problema — porque dos copias de esto se desincronizan a la
 * primera. Las tres props nuevas (`bg`, `wide`, `dot`) son opcionales y sus defaults reproducen
 * exactamente el comportamiento que `new-task` ya tenía.
 */
export function Pill({
  label,
  value,
  active,
  accent,
  onPress,
  bg = 'surface',
  wide,
  dot,
}: {
  label: string;
  value: string;
  active: boolean;
  accent?: AccentName;
  onPress: () => void;
  /**
   * El relleno en reposo. `surface` sobre canvas (el caso de `new-task`); `sunken` cuando la pastilla
   * vive DENTRO de una `Card`, porque ahí `surface` sobre `surface` borra el escalón de luz y la señal
   * de que se puede tocar queda colgando de un hairline. `theme.ts` define `sunken` literalmente como
   * el relleno de "chips sin seleccionar".
   */
  bg?: 'surface' | 'sunken';
  /** Ocupa la fila entera. Para un valor que enumera cosas y no cabe a media fila. */
  wide?: boolean;
  /** Muestra de color antes del valor: es el único `solid` decorativo que se permite aquí. */
  dot?: string;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const press = usePressScale({ to: 0.96 });

  return (
    <Animated.View style={[styles.slot, wide && styles.wide, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: active }}
        // El label lleva las dos partes: por separado, un lector diría "Focos" y luego un valor
        // suelto sin dueño.
        accessibilityLabel={`${label}: ${value}`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.pill,
          { backgroundColor: bg === 'sunken' ? t.sunken : t.surface, borderColor: t.line },
          active && { backgroundColor: tint.soft, borderColor: tint.ink },
        ]}>
        <Text style={[Type.micro, { color: t.textMuted }]}>{label}</Text>
        <View style={styles.value}>
          {!!dot && <View style={[styles.dot, { backgroundColor: dot }]} />}
          {/*
            Dos líneas y no una: con texto grande, un valor que enumera ("Estudio · Salud · Dinero")
            se elidía, y una pastilla cuyo argumento entero es "dice su valor" mostrando "Estudio…" es
            peor que la fila de solo lectura que vino a reemplazar.
          */}
          <Text style={[Type.label, styles.label, { color: t.text }]} numberOfLines={2}>
            {value}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const DOT = 14;

const styles = StyleSheet.create({
  /**
   * Mosaico: cada pastilla mide lo que mide su texto (`basis auto`) y el sobrante de la fila se
   * reparte entre las que hay (`flexGrow`). Es la misma pieza que usa `choice.tsx` para que una
   * rejilla no quede con el borde derecho irregular.
   */
  slot: { flexGrow: 1, flexBasis: 'auto' },
  wide: { flexBasis: '100%' },
  pill: {
    minHeight: Touch.chip,
    gap: 2,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.sm,
    borderRadius: Radius.md,
    borderWidth: 1,
    justifyContent: 'center',
  },
  value: { flexDirection: 'row', alignItems: 'center', gap: Space.sm },
  // flexShrink para que el texto ceda ante la muestra de color en vez de empujarla fuera.
  label: { flexShrink: 1 },
  dot: { width: DOT, height: DOT, borderRadius: Radius.pill },
});
