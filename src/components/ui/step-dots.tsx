import { StyleSheet, View } from 'react-native';

import { Accents, Space, Theme, type AccentName } from '@/constants/theme';

import { BUD, Bud } from './stem';

/**
 * El mismo tallo, acostado: un riel con un brote por paso. Un solo idioma de progreso en toda
 * la app en vez de barritas arriba y brotes a la izquierda.
 */
export function StepDots({
  total,
  current,
  accent = 'olive',
}: {
  total: number;
  current: number;
  accent?: AccentName;
}) {
  const done = total > 1 ? Math.min(Math.max(current, 0), total - 1) / (total - 1) : 1;

  return (
    <View style={styles.row} accessibilityLabel={`Paso ${current + 1} de ${total}`}>
      {/* El riel vive entre los centros de los brotes, no de borde a borde. */}
      <View pointerEvents="none" style={styles.rail}>
        <View style={styles.pending} />
        <View style={[styles.done, { width: `${done * 100}%`, backgroundColor: Accents[accent].ink }]} />
      </View>
      {Array.from({ length: total }, (_, i) => (
        <Bud key={i} on={i <= current} accent={accent} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: BUD,
    gap: Space.sm,
  },
  rail: {
    position: 'absolute',
    left: BUD / 2,
    right: BUD / 2,
    top: BUD / 2 - 1,
    height: 2,
  },
  pending: { flex: 1, backgroundColor: Theme.line },
  done: { position: 'absolute', left: 0, top: 0, bottom: 0 },
});
