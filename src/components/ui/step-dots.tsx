import { StyleSheet, View } from 'react-native';

import { Accents, Radius, Space, Theme, type AccentName } from '@/constants/theme';

/** Barra segmentada: ver cuanto falta en trozos concretos evita abandonar a media forma. */
export function StepDots({
  total,
  current,
  accent = 'olive',
}: {
  total: number;
  current: number;
  accent?: AccentName;
}) {
  return (
    <View style={styles.row} accessibilityLabel={`Paso ${current + 1} de ${total}`}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[
            styles.segment,
            // ink y no solid: clay o leaf contra la pista dan menos de 3:1 y el progreso desaparece.
            { backgroundColor: i <= current ? Accents[accent].ink : Theme.sunken },
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: Space.xs },
  segment: { flex: 1, height: 8, borderRadius: Radius.pill },
});
