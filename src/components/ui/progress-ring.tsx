import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  useAnimatedProps,
  useReducedMotion,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';

import { Type, useAccent, useTheme, type AccentName } from '@/constants/theme';

/**
 * Un arco de progreso de verdad, con `react-native-svg`.
 *
 * Durante mucho tiempo el repo dio por hecho que no habia SVG —lo dicen los comentarios de
 * `day-card.tsx` y `dial.tsx`, y por eso el dial son 60 vistas rotadas y la barra del dia son
 * segmentos— pero `react-native-svg` SI esta instalado como dependencia de `lucide-react-native`, y
 * expone `Svg` y `Circle`. Aqui si conviene un arco: es UNA curva continua leyendose de un vistazo, no
 * sesenta marcas que se apagan de una en una.
 *
 * Sesenta vistas rotadas por card, con dos cards por fila, serian ciento veinte vistas solo para
 * decir un porcentaje.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/** ζ≈1: el arco llega y se queda. Es el mismo muelle que la barra segmentada que reemplaza. */
const GROW = { damping: 22, stiffness: 200, mass: 0.6 } as const;

/**
 * El anillo. `done` de `total`, con el porcentaje dentro.
 *
 * Sin `total` no pinta un `0%`: pinta el riel vacio. Es la misma regla que `day-card` (no imprime
 * "0 de 0") y que `streak.ts` (con racha cero baja de metrica a titulo en vez de escribir un cero):
 * un cero grande se lee como reproche, y un espacio recien creado no ha fallado en nada.
 */
export function ProgressRing({
  done,
  total,
  accent,
  size = 44,
  stroke = 4,
}: {
  done: number;
  total: number;
  accent?: AccentName;
  size?: number;
  stroke?: number;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const reduced = useReducedMotion();

  const ratio = total > 0 ? Math.min(done / total, 1) : 0;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  const grown = useSharedValue(reduced ? ratio : 0);

  useEffect(() => {
    grown.set(reduced ? ratio : withSpring(ratio, GROW));
  }, [ratio, reduced, grown]);

  /**
   * `strokeDashoffset` y no la longitud del trazo: el guion mide la circunferencia entera y lo que se
   * anima es cuanto de el se esconde, asi que el arco crece desde su origen sin recalcular geometria.
   */
  const arc = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - grown.get()),
  }));

  return (
    <View style={[styles.wrap, { width: size, height: size }]}>
      {/*
        El Svg va EN EL FLUJO con su tamaño repetido en el estilo, no en `position: absolute`.
        Absoluto y sin insets, su lienzo se estiraba al ancho del padre y tapaba la card entera — las
        props `width`/`height` dimensionan el viewport del dibujo, no la vista que lo contiene.

        -90 grados: el arco arranca a las 12 y no a las 3, que es donde el ojo espera un progreso.
      */}
      <Svg width={size} height={size} style={{ width: size, height: size }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={t.sunken}
          strokeWidth={stroke}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={tint.solid}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          animatedProps={arc}
          originX={size / 2}
          originY={size / 2}
          rotation={-90}
        />
      </Svg>
      {total > 0 && (
        <Text style={[Type.micro, styles.label, { color: t.textMuted }]} numberOfLines={1}>
          {Math.round(ratio * 100)}%
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  // `overflow: hidden` acota el lienzo del SVG a los puntos que dice medir, pase lo que pase.
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  /**
   * El numero va ENCIMA del arco, centrado en la misma caja. Es el absoluto que si tiene sentido: el
   * texto no debe empujar al dibujo ni al reves.
   *
   * Sin el `letterSpacing` heredado de `micro`: a este tamaño el 1.1 descentra el numero de su anillo.
   */
  label: { position: 'absolute', letterSpacing: 0 },
});
