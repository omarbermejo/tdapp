import { Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { Radius, Space, Theme, Touch, Type, accentOf, type AccentName } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

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
  const tint = accentOf(accent);
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
        {options.map((option) => (
          <Chip
            key={option.value}
            option={option}
            on={isOn(option.value)}
            multi={multi}
            // El indicador de estado es el borde en ink (>=3:1 contra el papel);
            // el tinte solo acompaña, porque soft contra surface no se distingue.
            selectedStyle={{ backgroundColor: tint.soft, borderColor: tint.ink, borderWidth: 2 }}
            onPress={() => toggle(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** Componente aparte porque cada chip necesita su propio shared value para la animacion. */
function Chip({
  option,
  on,
  multi,
  selectedStyle,
  onPress,
}: {
  option: Option;
  on: boolean;
  multi: boolean;
  selectedStyle: ViewStyle;
  onPress: () => void;
}) {
  const press = usePressScale({ to: 0.94 });

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole={multi ? 'checkbox' : 'radio'}
        accessibilityState={{ checked: on }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.chip, on && selectedStyle]}>
        {!!option.emoji && <Text style={styles.emoji}>{option.emoji}</Text>}
        <Text style={[Type.label, styles.chipLabel]}>{option.label}</Text>
      </Pressable>
    </Animated.View>
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
});
