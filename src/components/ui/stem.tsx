import { Children, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { Radius, Space, useAccent, useTheme, type AccentName } from '@/constants/theme';

export const BUD = 12;
/**
 * El tallo entra SIEMPRE a esta x (padding de pantalla + esto = 30pt).
 * Por eso al navegar la linea de la pantalla que sale y la de la que entra coinciden
 * y el tallo no salta.
 */
const STEM_LEFT = BUD / 2 - 1;

/** El circulo del brote: hueco mientras falte, macizo cuando ya florecio. */
export function Bud({ on, accent }: { on?: boolean; accent?: AccentName }) {
  const t = useTheme();
  // useAccent y no ACCENTS[accent]: el acento puede venir de la base con un nombre viejo,
  // y un color que no existe no debe tumbar la pantalla.
  const ink = useAccent(accent).ink;

  return (
    <View
      pointerEvents="none"
      style={[
        styles.bud,
        // textMuted y no line: el brote pendiente es informacion, y line da 1.2:1 sobre el papel.
        { borderColor: t.textMuted, backgroundColor: t.canvas },
        on && { borderColor: ink, backgroundColor: ink },
      ]}
    />
  );
}

/**
 * Rama vertical con un brote por hijo. El formulario crece mientras se llena en vez de
 * ser una pila de cajas sueltas, y de paso el brote es feedback real de progreso.
 *
 * `filled` lo calcula el padre (hay valor, difiere del default, lo que aplique).
 */
export function Stem({
  children,
  filled,
  accent,
}: {
  children: ReactNode;
  filled: boolean[];
  accent?: AccentName;
}) {
  const t = useTheme();

  return (
    <View style={styles.stem}>
      <View pointerEvents="none" style={[styles.line, { backgroundColor: t.line }]} />
      {Children.toArray(children).map((child, i) => (
        <View key={i} style={styles.branch}>
          <Bud on={filled[i]} accent={accent} />
          <View style={styles.body}>{child}</View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stem: { gap: Space.lg },
  line: {
    position: 'absolute',
    left: STEM_LEFT,
    // Arranca en el centro del primer brote y sigue hasta abajo: el tallo no se corta.
    top: BUD / 2 + 2,
    bottom: 0,
    width: 2,
  },
  branch: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  body: { flex: 1 },
  bud: {
    width: BUD,
    height: BUD,
    marginTop: 2,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
});
