import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType, type ViewStyle } from 'react-native';
import Animated from 'react-native-reanimated';

import { Radius, Space, Theme, Touch, Type, accentOf, type AccentName } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

export type Option = {
  value: string;
  label: string;
  /** Sticker recoloreado a la paleta (assets/stickers/chips). */
  icon?: ImageSourcePropType;
  /** Para elegir un color: la muestra ES la opcion, no hace falta icono. */
  swatch?: string;
};

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
 * Cuadricula de dos columnas con tarjetas del MISMO ancho.
 *
 * Antes eran pastillas que se ajustaban al texto, asi que cada fila quedaba despareja y la
 * lista se leia como un monton de globos de tamanos distintos. Con dos columnas fijas la
 * vista se ordena sola y la ultima opcion impar se queda a media fila, que se lee como
 * intencion. La seleccionada se tine con el acento suave y su borde en ink: el tinte solo no
 * se distingue del papel.
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
      <View style={styles.grid}>
        {options.map((option) => (
          <Card
            key={option.value}
            option={option}
            on={isOn(option.value)}
            multi={multi}
            selectedStyle={{ backgroundColor: tint.soft, borderColor: tint.ink, borderWidth: 2 }}
            onPress={() => toggle(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** Componente aparte porque cada tarjeta necesita su propio shared value para la animacion. */
function Card({
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
  const press = usePressScale({ to: 0.96 });

  return (
    <Animated.View style={[styles.slot, press.style]}>
      <Pressable
        accessibilityRole={multi ? 'checkbox' : 'radio'}
        accessibilityState={{ checked: on }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.card, on && selectedStyle]}>
        {!!option.icon && (
          <Image source={option.icon} style={styles.icon} contentFit="contain" accessible={false} />
        )}
        {!!option.swatch && <View style={[styles.swatch, { backgroundColor: option.swatch }]} />}
        <Text style={[Type.label, styles.cardLabel]}>{option.label}</Text>
      </Pressable>
    </Animated.View>
  );
}

const MARK = 26;

const styles = StyleSheet.create({
  wrap: { gap: Space.sm },
  label: { color: Theme.textMuted },
  hint: { color: Theme.textMuted },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  // 48% + el gap cabe hasta en 320pt de ancho, y sin flexGrow la fila impar no se estira.
  slot: { flexBasis: '48%' },
  card: {
    flex: 1,
    minHeight: Touch.chip + Space.xl,
    gap: Space.sm,
    padding: Space.md,
    justifyContent: 'center',
    // Radius.md y no pill: dejaron de ser pastillas, ahora son tarjetas.
    borderRadius: Radius.md,
    borderWidth: 1,
    borderColor: Theme.line,
    backgroundColor: Theme.surface,
  },
  icon: { width: MARK, height: MARK },
  swatch: { width: MARK, height: MARK, borderRadius: Radius.pill },
  cardLabel: { color: Theme.text },
});
