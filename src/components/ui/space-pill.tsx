import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Radius, Space, Type, useAccent, useTheme } from '@/constants/theme';
import type { SpaceRef } from '@/features/workspaces/active-space';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * En que espacio estas trabajando, y la puerta para cambiarlo.
 *
 * **Devuelve `null` sin espacio activo**, y esa es la mitad del diseño: en modo general la pantalla se
 * ve EXACTAMENTE como siempre — sin una pastilla que diga "Todo", que seria mobiliario permanente para
 * informar de que no pasa nada. La señal aparece solo cuando hay algo que señalar.
 *
 * El titular en Fraunces no se toca ni se vuelve tocable: dice el dia, y convertirlo en el boton de un
 * selector de espacios promete una cosa y hace otra.
 */
export function SpacePill({ space }: { space: SpaceRef | null }) {
  const t = useTheme();
  const tint = useAccent(space?.accent);
  const press = usePressScale({ to: 0.96 });

  if (!space) return null;

  return (
    <Animated.View style={[styles.slot, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Trabajando en ${space.name}`}
        accessibilityHint="Cambia de espacio"
        onPress={() => router.push('/spaces')}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        // 40pt de alto quedan por debajo de `Touch.chip` (48) a proposito: en la cabecera convive con
        // un titular de 50pt de interlineado y a 48 dominaria las tres lineas. El hitSlop lo lleva a
        // 56 efectivos, por encima del minimo.
        hitSlop={Space.sm}
        style={[styles.pill, { backgroundColor: tint.soft }]}>
        <Icon3D name={space.icon as Icon3DName} size={Icon3DSize.md} />
        <Text style={[Type.label, { color: t.text }]} numberOfLines={1}>
          {space.name}
        </Text>
        {/* Un punto y no un chevron: el chevron promete una lista desplegable pegada, y lo que se
            abre es una hoja. El punto solo dice "esto es un estado en el que estas". */}
        <View style={[styles.dot, { backgroundColor: tint.ink }]} />
      </Pressable>
    </Animated.View>
  );
}

const DOT = 6;

const styles = StyleSheet.create({
  // `flex-start`: la pastilla mide lo que mide su nombre, no el ancho de la pantalla.
  slot: { alignSelf: 'flex-start' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  dot: { width: DOT, height: DOT, borderRadius: Radius.pill },
});
