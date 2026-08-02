import { Image } from 'expo-image';
import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { Motion, Radius, Space, Type, useAccent, useTheme } from '@/constants/theme';

/** Lo que tarda el latido en ir y volver. Lento a proposito: esto no es un spinner. */
const BEAT = 900;

/**
 * La pantalla de arranque, cuando el splash del sistema ya se fue y la app todavia no puede pintar.
 *
 * Antes era un `ActivityIndicator` suelto sobre el papel, y el problema no era que fuera feo sino que
 * era un OBJETO DISTINTO: el splash nativo enseña la marca, y de golpe la marca desaparecia y salia
 * una rueda gris. Dos pantallas de espera seguidas que no se parecen entre si se leen como dos
 * esperas, aunque duren lo mismo.
 *
 * Aqui se repite la marca del splash y se le pone un latido. La continuidad es el punto: para el ojo
 * esto es el splash que sigue vivo, no una segunda pantalla.
 *
 * **Y casi nunca se ve.** El splash del sistema se mantiene hasta que hay sesion y fuentes, asi que
 * esto solo aparece si salta el tope de seguridad de cuatro segundos — o sea cuando algo va mal. Que
 * en ese caso diga algo, en vez de girar en silencio, es justo el momento en que mas importa.
 */
export function Booting({ slow }: { slow?: boolean }) {
  const t = useTheme();
  const tint = useAccent('olive');
  const still = useReducedMotion();

  const beat = useSharedValue(1);

  useEffect(() => {
    if (still) return;
    // .set() y no .value =: el compilador de React trata el shared value como inmutable.
    beat.set(
      withRepeat(
        withSequence(
          withTiming(1.06, { duration: BEAT / 2, easing: Easing.inOut(Easing.quad) }),
          withTiming(1, { duration: BEAT / 2, easing: Easing.inOut(Easing.quad) })
        ),
        -1,
        false
      )
    );
  }, [beat, still]);

  const pulse = useAnimatedStyle(() => ({ transform: [{ scale: beat.get() }] }));

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.View style={pulse}>
        <Image
          source={require('@/assets/brand/splash-mark.png')}
          style={styles.mark}
          contentFit="contain"
          accessible={false}
        />
      </Animated.View>

      {/*
        El aviso solo aparece si la espera se alarga, y con retraso propio. Enseñarlo desde el primer
        frame convertiria cualquier arranque normal en "algo va mal"; que salga solo cuando de verdad
        tarda es lo que lo hace informativo en vez de ruido.
      */}
      {slow && <SlowNote tint={tint.ink} muted={t.textMuted} />}
    </View>
  );
}

/** La linea de "esto esta tardando". Entra con su propio fundido para no aparecer de golpe. */
function SlowNote({ tint, muted }: { tint: string; muted: string }) {
  const show = useSharedValue(0);
  const still = useReducedMotion();

  useEffect(() => {
    show.set(still ? 1 : withDelay(200, withTiming(1, { duration: Motion.enter })));
  }, [show, still]);

  const style = useAnimatedStyle(() => ({
    opacity: show.get(),
    transform: [{ translateY: (1 - show.get()) * 8 }],
  }));

  return (
    <Animated.View style={[styles.note, style]}>
      <View style={[styles.dot, { backgroundColor: tint }]} />
      <Text style={[Type.hint, { color: muted }]}>Tarda más de lo normal. Revisa tu conexión.</Text>
    </Animated.View>
  );
}

/** El lado de la marca. El mismo que pinta el splash del sistema, para que no salte de tamaño. */
const MARK = 120;

const styles = StyleSheet.create({
  screen: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Space.breath },
  mark: { width: MARK, height: MARK },
  note: { flexDirection: 'row', alignItems: 'center', gap: Space.sm, paddingHorizontal: Space.xl },
  dot: { width: 6, height: 6, borderRadius: Radius.pill },
});
