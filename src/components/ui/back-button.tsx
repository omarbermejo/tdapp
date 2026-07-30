import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius, Shadow, Theme, Touch, Type } from '@/constants/theme';

/** Circulo de papel con la flecha: el mismo gesto de volver en toda la pila de auth. */
export function BackButton({ onPress }: { onPress?: () => void }) {
  return (
    <Pressable
      onPress={onPress ?? (() => router.back())}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Atrás"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={[Type.section, styles.glyph]}>←</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: Touch.icon,
    height: Touch.icon,
    borderRadius: Radius.pill,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.card,
  },
  glyph: { color: Theme.text },
  pressed: { opacity: 0.9 },
});
