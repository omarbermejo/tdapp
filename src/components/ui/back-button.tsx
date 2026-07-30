import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius, Touch, Type, useShadow, useTheme } from '@/constants/theme';

/** Circulo de papel con la flecha: el mismo gesto de volver en toda la pila de auth. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  const t = useTheme();
  const shadow = useShadow();

  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Atrás"
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: t.surface },
        shadow,
        pressed && styles.pressed,
      ]}>
      <Text style={[Type.section, { color: t.text }]}>←</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: Touch.icon,
    height: Touch.icon,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.9 },
});
