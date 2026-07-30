import * as Haptics from 'expo-haptics';
import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { Radius, Shadow, Space, Theme, Touch, Type, accentOf, type AccentName } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

type Props = {
  label: string;
  onPress: () => void;
  /** Marca a la izquierda de la etiqueta (logo del proveedor). */
  icon?: ReactNode;
  /** Tiñe el texto de `outline` y `ghost`. `primary` siempre va con la tinta de la marca. */
  accent?: AccentName;
  variant?: 'primary' | 'outline' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * Un solo boton oscuro por pantalla (`primary`); el resto son papel con hairline
 * o texto pelado. La jerarquia la carga el peso visual, no un color saturado.
 */
export function BigButton({
  label,
  onPress,
  icon,
  accent = 'olive',
  variant = 'primary',
  loading,
  disabled,
  style,
}: Props) {
  const primary = variant === 'primary';
  const blocked = disabled || loading;
  // ink, no solid: los acentos medios sobre papel no llegan a 4.5:1 en 17pt.
  const color = primary ? Theme.onDark : accentOf(accent).ink;
  // El primario es la accion importante de la pantalla: golpe medio, no ligero.
  const press = usePressScale(
    primary ? { to: 0.97, haptic: Haptics.ImpactFeedbackStyle.Medium } : { to: 0.97 }
  );

  return (
    <Animated.View style={[!blocked && press.style, style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ disabled: !!blocked, busy: !!loading }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={blocked}
        style={({ pressed }) => [
          styles.base,
          primary && styles.primary,
          variant === 'outline' && styles.outline,
          variant === 'ghost' && styles.ghost,
          blocked && styles.blocked,
          pressed && primary && !blocked && styles.primaryPressed,
        ]}>
        {loading ? (
          <ActivityIndicator color={color} />
        ) : (
          <View style={styles.content}>
            {icon}
            <Text style={[Type.button, { color }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: Touch.button,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  primary: { backgroundColor: Theme.ink, ...Shadow.card },
  primaryPressed: { backgroundColor: Theme.inkPressed },
  outline: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.line,
    ...Shadow.card,
  },
  ghost: { minHeight: Touch.icon, backgroundColor: 'transparent' },
  blocked: { opacity: 0.4 },
});
