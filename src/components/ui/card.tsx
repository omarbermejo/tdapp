import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Accents, Radius, Shadow, Space, Theme, Type, type AccentName } from '@/constants/theme';

/** Papel sobre papel: la tarjeta se levanta con luz y una sombra mínima, nunca con borde grueso. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * Título de bloque con subtítulo.
 * Es lo que ordena la pantalla: secciones separadas por aire, no por cajas.
 */
export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={styles.header}>
      <Text style={[Type.section, styles.title]}>{title}</Text>
      {!!hint && <Text style={[Type.hint, styles.hint]}>{hint}</Text>}
    </View>
  );
}

/** Chip de categoría: tinte suave del acento y texto en tinta oscura para que se lea siempre. */
export function Tag({ label, accent = 'olive' }: { label: string; accent?: AccentName }) {
  return (
    <View style={[styles.tag, { backgroundColor: Accents[accent].soft }]}>
      <Text style={[Type.hint, styles.tagLabel]}>{label}</Text>
    </View>
  );
}

/** Micro-label en mayúsculas para etiquetar un dato dentro de una tarjeta. */
export function Micro({ children }: { children: ReactNode }) {
  return <Text style={[Type.micro, styles.micro]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Theme.surface,
    borderRadius: Radius.lg,
    padding: Space.xl,
    gap: Space.md,
    ...Shadow.card,
  },
  header: { gap: Space.xs },
  title: { color: Theme.text },
  hint: { color: Theme.textMuted },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  tagLabel: { color: Theme.text, fontWeight: '600' },
  micro: { color: Theme.textMuted },
});
