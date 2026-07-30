import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';

import { Accents, Radius, Shadow, Space, Theme, Touch, Type, type AccentName } from '@/constants/theme';

/** Papel sobre papel: la tarjeta se levanta con luz y una sombra mínima, nunca con borde grueso. */
export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/**
 * Título de bloque con subtítulo y acción de texto a la derecha.
 * Es lo que ordena la pantalla: secciones separadas por aire, no por cajas.
 */
export function SectionHeader({
  title,
  hint,
  actionLabel,
  onAction,
}: {
  title: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerText}>
        <Text style={[Type.section, styles.title]}>{title}</Text>
        {!!hint && <Text style={[Type.hint, styles.hint]}>{hint}</Text>}
      </View>
      {!!actionLabel && !!onAction && (
        <Pressable onPress={onAction} hitSlop={12} accessibilityRole="button">
          <Text style={[Type.label, styles.action]}>{actionLabel} ›</Text>
        </Pressable>
      )}
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
  header: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: Space.md,
    minHeight: Touch.icon,
  },
  headerText: { flex: 1, gap: 2 },
  title: { color: Theme.text },
  hint: { color: Theme.textMuted },
  action: { color: Theme.textMuted },
  tag: {
    alignSelf: 'flex-start',
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: 5,
  },
  tagLabel: { color: Theme.text, fontWeight: '600' },
  micro: { color: Theme.textMuted },
});
