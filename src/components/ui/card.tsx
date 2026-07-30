import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Radius, Space, Type, useAccent, useShadow, useTheme, type AccentName } from '@/constants/theme';

/** Papel sobre papel: la tarjeta se levanta con luz y una sombra mínima, nunca con borde grueso. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const t = useTheme();
  const shadow = useShadow();
  return <View style={[styles.card, { backgroundColor: t.surface }, shadow, style]}>{children}</View>;
}

/**
 * Título de bloque con subtítulo.
 * Es lo que ordena la pantalla: secciones separadas por aire, no por cajas.
 */
export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  const t = useTheme();
  return (
    <View style={styles.header}>
      <Text style={[Type.section, { color: t.text }]}>{title}</Text>
      {!!hint && <Text style={[Type.hint, { color: t.textMuted }]}>{hint}</Text>}
    </View>
  );
}

/** Chip de categoría: tinte suave del acento y texto en tinta oscura para que se lea siempre. */
export function Tag({ label, accent = 'olive' }: { label: string; accent?: AccentName }) {
  const t = useTheme();
  const tint = useAccent(accent);
  return (
    <View style={[styles.tag, { backgroundColor: tint.soft }]}>
      <Text style={[Type.hint, styles.tagLabel, { color: t.text }]}>{label}</Text>
    </View>
  );
}

/** Micro-label en mayúsculas para etiquetar un dato dentro de una tarjeta. */
export function Micro({ children }: { children: ReactNode }) {
  const t = useTheme();
  return <Text style={[Type.micro, { color: t.textMuted }]}>{children}</Text>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.lg,
    padding: Space.xl,
    gap: Space.md,
  },
  header: { gap: Space.xs },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  tagLabel: { fontWeight: '600' },
});
