import { StyleSheet, View } from 'react-native';

import { AccentName, Accents, Brand } from '@/constants/brand';

/** Barra de progreso gruesa: saber cuanto falta evita el abandono a media forma. */
export function StepDots({
  total,
  current,
  accent = 'electric',
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
          style={[styles.bar, { backgroundColor: i <= current ? Accents[accent] : Brand.inkLine }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8 },
  bar: { flex: 1, height: 10, borderRadius: 5 },
});
