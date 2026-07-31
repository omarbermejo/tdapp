import * as Haptics from 'expo-haptics';
import { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';

/** Corto y seco: el boton responde antes de que sueltes el dedo. */
const SNAPPY = { damping: 20, stiffness: 400 };

/**
 * Hunde el elemento al presionarlo y da un golpe haptico.
 * Para TDAH la respuesta inmediata es la mitad del efecto: confirma que el toque
 * registro sin obligarte a leer nada.
 */
export function usePressScale({
  to = 0.96,
  haptic = Haptics.ImpactFeedbackStyle.Light,
}: { to?: number; haptic?: Haptics.ImpactFeedbackStyle } = {}) {
  const scale = useSharedValue(1);
  // .get()/.set() y no .value: el compilador de React trata el shared value como inmutable, y era
  // el lint que otros dos archivos ya arrastraban en sus comentarios.
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return {
    style,
    onPressIn: () => {
      scale.set(withSpring(to, SNAPPY));
      // En web no hay motor haptico; el catch evita ensuciar la consola.
      Haptics.impactAsync(haptic).catch(() => {});
    },
    onPressOut: () => {
      scale.set(withSpring(1, SNAPPY));
    },
  };
}
