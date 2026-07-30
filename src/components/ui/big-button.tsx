import { ActivityIndicator, Pressable, StyleSheet, Text, type ViewStyle } from 'react-native';

import { Accents, Radius, Shadow, Theme, Touch, Type, type AccentName } from '@/constants/theme';

type Props = {
  label: string;
  onPress: () => void;
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
  accent = 'olive',
  variant = 'primary',
  loading,
  disabled,
  style,
}: Props) {
  const tint = Accents[accent].solid;
  const primary = variant === 'primary';
  const blocked = disabled || loading;
  const color = primary ? Theme.onDark : tint;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: !!loading }}
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.base,
        primary && styles.primary,
        variant === 'outline' && styles.outline,
        variant === 'ghost' && styles.ghost,
        blocked && styles.blocked,
        pressed && !blocked && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <Text style={[Type.button, { color }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: Touch.button,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  primary: { backgroundColor: Theme.ink, ...Shadow.card },
  outline: {
    backgroundColor: Theme.surface,
    borderWidth: 1,
    borderColor: Theme.line,
    ...Shadow.card,
  },
  ghost: { minHeight: Touch.icon, backgroundColor: 'transparent' },
  pressed: { opacity: 0.9, transform: [{ scale: 0.985 }] },
  blocked: { opacity: 0.4 },
});
