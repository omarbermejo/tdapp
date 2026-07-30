import { Pressable, StyleSheet, Text, View } from 'react-native';

import { Accents, Radius, Space, Theme, Touch, Type, type AccentName } from '@/constants/theme';

export type Option = { value: string; label: string; emoji?: string };

type Props = {
  label: string;
  options: readonly Option[];
  /** string = seleccion unica, string[] = multiple */
  value: string | string[];
  onChange: (value: any) => void;
  accent?: AccentName;
  max?: number;
  hint?: string;
};

/**
 * Opciones como pastillas de papel con hairline. La seleccionada se tine con el
 * acento suave, nunca con un bloque saturado; el emoji queda dentro del chip
 * porque es el ancla visual que hace reconocible la opcion de un vistazo.
 */
export function Choice({ label, options, value, onChange, accent = 'olive', max, hint }: Props) {
  const tint = Accents[accent];
  const multi = Array.isArray(value);
  const isOn = (v: string) => (multi ? (value as string[]).includes(v) : value === v);

  const toggle = (v: string) => {
    if (!multi) return onChange(v);
    const current = value as string[];
    if (current.includes(v)) return onChange(current.filter((x) => x !== v));
    if (max && current.length >= max) return;
    onChange([...current, v]);
  };

  return (
    <View style={styles.wrap}>
      <Text style={[Type.micro, styles.label]}>{label}</Text>
      {!!hint && <Text style={[Type.hint, styles.hint]}>{hint}</Text>}
      <View style={styles.row}>
        {options.map((option) => {
          const on = isOn(option.value);
          return (
            <Pressable
              key={option.value}
              accessibilityRole={multi ? 'checkbox' : 'radio'}
              accessibilityState={{ checked: on }}
              onPress={() => toggle(option.value)}
              style={({ pressed }) => [
                styles.chip,
                on && { backgroundColor: tint.soft, borderColor: tint.solid, borderWidth: 1.5 },
                pressed && styles.pressed,
              ]}>
              {!!option.emoji && <Text style={styles.emoji}>{option.emoji}</Text>}
              <Text style={[Type.label, styles.chipLabel]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: Space.sm },
  label: { color: Theme.textMuted },
  hint: { color: Theme.textMuted },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  chip: {
    minHeight: Touch.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
    borderWidth: 1,
    borderColor: Theme.line,
    backgroundColor: Theme.surface,
  },
  chipLabel: { color: Theme.text },
  emoji: { fontSize: 20 },
  pressed: { opacity: 0.9, transform: [{ scale: 0.98 }] },
});
