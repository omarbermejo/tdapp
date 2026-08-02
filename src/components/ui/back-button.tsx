import { Pressable, StyleSheet, Text } from 'react-native';

import { Radius, Touch, Type, useShadow, useTheme } from '@/constants/theme';
import { goBackOrHome } from '@/features/nav/go-back';

/**
 * Circulo de papel con la flecha: el mismo gesto de volver en toda la pila de auth.
 *
 * `close` lo convierte en una cruz. Es para lo que se presenta como HOJA (nueva tarea): una flecha
 * hacia la izquierda promete "vuelvo a lo anterior" y una hoja no vuelve, se cierra hacia abajo —
 * prometer el gesto equivocado es peor que no dar ninguna pista.
 */
export function BackButton({ onPress, close }: { onPress?: () => void; close?: boolean }) {
  const t = useTheme();
  const shadow = useShadow();

  return (
    <Pressable
      onPress={onPress ?? goBackOrHome}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={close ? 'Cerrar' : 'Atrás'}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: t.surface },
        shadow,
        pressed && styles.pressed,
      ]}>
      <Text style={[Type.section, { color: t.text }]}>{close ? '✕' : '←'}</Text>
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
