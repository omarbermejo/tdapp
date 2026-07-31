import * as Haptics from 'expo-haptics';
import { useAnimatedStyle, useReducedMotion, useSharedValue, withSpring } from 'react-native-reanimated';

/** Corto y seco: el boton responde antes de que sueltes el dedo. */
const SNAPPY = { damping: 20, stiffness: 400 };

/**
 * Hunde el elemento al presionarlo y da un golpe haptico.
 * Para TDAH la respuesta inmediata es la mitad del efecto: confirma que el toque
 * registro sin obligarte a leer nada.
 *
 * **Con "reducir movimiento" encendido se va el hundido pero NO el haptico**, y esa asimetria es el
 * punto: quien enciende esa bandera pide que la pantalla deje de moverse, no que el telefono deje de
 * contestarle. El golpe en el dedo es justo la confirmacion que el docstring de arriba defiende, y
 * es la unica que queda cuando no hay animacion. Quitar las dos dejaria el boton mudo.
 *
 * Este hook lo usa cada pressable de la app, asi que es el sitio donde la bandera rinde mas.
 */
export function usePressScale({
  to = 0.96,
  haptic = Haptics.ImpactFeedbackStyle.Light,
}: { to?: number; haptic?: Haptics.ImpactFeedbackStyle } = {}) {
  const scale = useSharedValue(1);
  /**
   * El de reanimated y no `AccessibilityInfo.isReduceMotionEnabled()`: este resuelve SINCRONO (lee
   * una constante que el nativo inyecta al arrancar), asi que no hay un primer frame en el que
   * todavia no se sabe si se puede animar. Es el mismo hook en toda la app, a proposito.
   */
  const reduced = useReducedMotion();
  // .get()/.set() y no .value: el compilador de React trata el shared value como inmutable, y era
  // el lint que otros dos archivos ya arrastraban en sus comentarios.
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));

  return {
    style,
    onPressIn: () => {
      if (!reduced) scale.set(withSpring(to, SNAPPY));
      // En web no hay motor haptico; el catch evita ensuciar la consola.
      Haptics.impactAsync(haptic).catch(() => {});
    },
    onPressOut: () => {
      if (!reduced) scale.set(withSpring(1, SNAPPY));
    },
  };
}
