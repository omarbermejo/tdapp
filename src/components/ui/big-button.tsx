import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { AccentName, Accents, Brand, Radius, Touch, Type, onAccent } from '@/constants/brand';

type Props = {
  label: string;
  onPress: () => void;
  accent?: AccentName;
  variant?: 'solid' | 'outline' | 'ghost';
  loading?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

/**
 * Boton grande con borde inferior grueso: se hunde al presionar.
 * La respuesta tactil inmediata importa mas que la elegancia aqui.
 */
export function BigButton({
  label,
  onPress,
  accent = 'electric',
  variant = 'solid',
  loading,
  disabled,
  style,
}: Props) {
  const color = Accents[accent];
  const solid = variant === 'solid';
  const blocked = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!blocked, busy: !!loading }}
      onPress={onPress}
      disabled={blocked}
      style={({ pressed }) => [
        styles.base,
        solid && { backgroundColor: color, borderBottomColor: Brand.shadow },
        variant === 'outline' && { borderColor: color, borderWidth: 3, borderBottomWidth: 6 },
        variant === 'ghost' && styles.ghost,
        blocked && styles.blocked,
        pressed && !blocked && styles.pressed,
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={solid ? onAccent(accent) : color} />
      ) : (
        <Text style={[Type.button, { color: solid ? onAccent(accent) : color }]}>{label}</Text>
      )}
      {variant === 'ghost' && <View style={[styles.underline, { backgroundColor: color }]} />}
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
    borderBottomWidth: 6,
    borderBottomColor: 'transparent',
  },
  ghost: { minHeight: 48, borderBottomWidth: 0 },
  underline: { height: 3, width: '42%', borderRadius: 3, marginTop: 2 },
  pressed: { transform: [{ translateY: 4 }], borderBottomWidth: 2, opacity: 0.92 },
  blocked: { opacity: 0.45 },
});
