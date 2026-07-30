import { Pressable, StyleSheet, Text, View } from 'react-native';

import { AccentName, Accents, Brand, Radius, Touch, Type, onAccent } from '@/constants/brand';

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
 * Opciones como pastillas grandes con emoji. Elegir de una lista visual cuesta
 * mucho menos que escribir, y el emoji da un ancla para reconocerla de un vistazo.
 */
export function Choice({ label, options, value, onChange, accent = 'electric', max, hint }: Props) {
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
      <Text style={[Type.label, styles.label]}>{label}</Text>
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
                on && { backgroundColor: Accents[accent], borderColor: Accents[accent] },
                pressed && styles.pressed,
              ]}>
              {!!option.emoji && <Text style={styles.emoji}>{option.emoji}</Text>}
              <Text style={[Type.label, { color: on ? onAccent(accent) : Brand.text }]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 10 },
  label: { color: Brand.text },
  hint: { color: Brand.textMute, marginTop: -6 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    minHeight: Touch.chip,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: Radius.pill,
    borderWidth: 3,
    borderColor: Brand.inkLine,
    backgroundColor: Brand.inkSoft,
  },
  emoji: { fontSize: 22 },
  pressed: { transform: [{ scale: 0.96 }] },
});
