import { Image } from 'expo-image';
import { useEffect } from 'react';
import { Pressable, StyleSheet, Text, View, type ImageSourcePropType } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import {
  Radius,
  Space,
  Touch,
  Type,
  useAccent,
  useTheme,
  type Accent,
  type AccentName,
} from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

export type Option = {
  value: string;
  label: string;
  /** Sticker recoloreado a la paleta (assets/stickers/chips). */
  icon?: ImageSourcePropType;
  /** Para elegir un color: la muestra ES la opcion, no hace falta icono. Es el NOMBRE
   *  del acento, porque el hex depende del esquema y las opciones son datos estaticos. */
  swatch?: AccentName;
};

type Props = {
  /** Opcional: en el onboarding conversacional la pregunta ya es la burbuja de arriba. */
  label?: string;
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
  const theme = useTheme();
  const tint = useAccent(accent);
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
      {!!label && <Text style={[Type.micro, { color: theme.textMuted }]}>{label}</Text>}
      {!!hint && <Text style={[Type.hint, { color: theme.textMuted }]}>{hint}</Text>}
      <View style={styles.grid}>
        {options.map((option) => (
          <Card
            key={option.value}
            option={option}
            on={isOn(option.value)}
            multi={multi}
            tint={tint}
            onPress={() => toggle(option.value)}
          />
        ))}
      </View>
    </View>
  );
}

/** Un muelle con algo de rebote: al quedar elegida la tarjeta da un empujoncito, no un salto. */
const BOUNCY = { damping: 12, stiffness: 220 };

/** Componente aparte porque cada tarjeta necesita sus propios shared values. */
function Card({
  option,
  on,
  multi,
  tint,
  onPress,
}: {
  option: Option;
  on: boolean;
  multi: boolean;
  tint: Accent;
  onPress: () => void;
}) {
  const t = useTheme();
  const swatch = useAccent(option.swatch);
  const press = usePressScale({ to: 0.96 });
  const chosen = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    chosen.value = withSpring(on ? 1 : 0, BOUNCY);
  }, [chosen, on]);

  // El borde se queda en 2pt siempre y solo cambia de color: animar el grosor movia el
  // contenido un pixel en cada toque.
  const skin = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(chosen.value, [0, 1], [t.surface, tint.soft]),
    borderColor: interpolateColor(chosen.value, [0, 1], [t.line, tint.ink]),
    transform: [{ scale: 1 + chosen.value * 0.03 }],
    // t entra en las dependencias: al cambiar el esquema el worklet tiene que releerlo.
  }), [t.surface, t.line, tint.soft, tint.ink]);

  return (
    <Animated.View style={[styles.slot, press.style]}>
      <Animated.View style={[styles.card, skin]}>
        <Pressable
          accessibilityRole={multi ? 'checkbox' : 'radio'}
          accessibilityState={{ checked: on }}
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={styles.touch}>
          {!!option.icon && (
            <Image source={option.icon} style={styles.icon} contentFit="contain" accessible={false} />
          )}
          {!!option.swatch && <View style={[styles.swatch, { backgroundColor: swatch.solid }]} />}
          <Text style={[Type.label, { color: t.text }]}>{option.label}</Text>
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

const MARK = 22;

const styles = StyleSheet.create({
  wrap: { gap: Space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  /**
   * Mosaico: cada chip mide lo que mide su texto (basis auto) y el sobrante de la fila se
   * reparte entre los que hay (flexGrow). Salen tamanos distintos SIN borde derecho
   * irregular, que es lo que hacia que una lista de pastillas se leyera como un desorden.
   */
  slot: { flexGrow: 1, flexBasis: 'auto' },
  card: {
    minHeight: Touch.chip,
    borderRadius: Radius.md,
    borderWidth: 2,
  },
  touch: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
  },
  icon: { width: MARK, height: MARK },
  swatch: { width: MARK, height: MARK, borderRadius: Radius.pill },
});
