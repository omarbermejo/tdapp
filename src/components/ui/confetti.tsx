import { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { Radius, useAccent } from '@/constants/theme';

/**
 * ponytail: confeti a mano con reanimated en vez de una libreria. Son 40 lineas y ademas
 * ninguna libreria cae en la paleta: todas traen su propio neon, que es justo lo que se
 * lleva anos sacando de esta app. Techo: no rebota ni colisiona, solo cae y gira.
 */
const PIECES = 28;
const FALL_MS = 2200;
/** Un color por acento del catalogo, resueltos en el esquema actual. */
function useConfettiColors() {
  // Los hooks no van en un bucle, y son cinco fijos: se llaman uno por uno a proposito.
  const [forest, olive, leaf, clay, copper] = [
    useAccent('forest').solid,
    useAccent('olive').solid,
    useAccent('leaf').solid,
    useAccent('clay').solid,
    useAccent('copper').solid,
  ];
  return [olive, clay, copper, leaf, forest];
}

/** Sin Math.random en el render: una semilla fija da la misma lluvia siempre y no reordena. */
const piece = (i: number, colors: string[]) => {
  const spread = (i * 37) % 100; // 37 es primo con 100: reparte sin repetir columnas
  return {
    left: `${spread}%` as const,
    color: colors[i % colors.length],
    size: 6 + ((i * 7) % 6),
    delay: (i % 7) * 90,
    drift: ((i % 5) - 2) * 18,
    spins: 1 + (i % 3),
  };
};

function Piece({ index, height, onLast }: { index: number; height: number; onLast?: () => void }) {
  const { left, color, size, delay, drift, spins } = piece(index, useConfettiColors());
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      // El callback corre en el hilo de UI: sin runOnJS, llamar al aviso revienta.
      withTiming(1, { duration: FALL_MS, easing: Easing.in(Easing.quad) }, (done) => {
        if (done && onLast) runOnJS(onLast)();
      })
    );
  }, [delay, onLast, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: progress.value > 0.85 ? (1 - progress.value) / 0.15 : 1,
    transform: [
      { translateY: progress.value * (height + 60) },
      { translateX: progress.value * drift },
      { rotate: `${progress.value * spins * 360}deg` },
    ],
  }));

  return (
    <Animated.View
      style={[
        styles.piece,
        { left, width: size, height: size * 1.6, backgroundColor: color },
        style,
      ]}
    />
  );
}

/** Llueve una vez y avisa al terminar. Se respeta "reducir movimiento": ahi no se pinta nada. */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const { height } = useWindowDimensions();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((reduce) => setAllowed(!reduce))
      .catch(() => setAllowed(true));
  }, []);

  useEffect(() => {
    // Si no hay animacion, el aviso de fin igual tiene que llegar o el que espera se cuelga.
    if (allowed === false && onDone) onDone();
  }, [allowed, onDone]);

  if (!allowed) return null;

  return (
    <Animated.View pointerEvents="none" style={styles.layer}>
      {Array.from({ length: PIECES }, (_, i) => (
        <Piece key={i} index={i} height={height} onLast={i === PIECES - 1 ? onDone : undefined} />
      ))}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  layer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  piece: { position: 'absolute', top: -40, borderRadius: Radius.sm },
});
