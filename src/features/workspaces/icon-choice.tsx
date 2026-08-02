import { Pressable, StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Micro } from '@/components/ui/card';
import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Radius, Space, Touch, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * La rejilla de iconos de un espacio.
 *
 * Vivia dentro de `new-workspace` y salio de ahi cuando la pantalla de detalle tambien tuvo que
 * dejar cambiarlo: dos copias de doce iconos y su seleccion es exactamente el tipo de duplicado que
 * se desincroniza en cuanto alguien añade el trece.
 *
 * No usa `Choice` aunque se le parezca: `Choice` pinta un icono de LINEA de Lucide junto a una
 * etiqueta de texto, y aqui el icono ES la opcion — un render 3D de 32pt con la palabra "Trabajo" al
 * lado seria decir lo mismo dos veces, y con doce opciones eso son doce filas en vez de dos.
 */
const ICONS: readonly Icon3DName[] = [
  'work',
  'academic',
  'home',
  'health',
  'money',
  'relationships',
  'creativity',
  'leaf',
  'light',
  'lightning',
  'trophy',
  'moon',
];

export function IconChoice({
  value,
  onChange,
  accent,
}: {
  value: Icon3DName;
  onChange: (icon: Icon3DName) => void;
  accent: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(accent);

  return (
    <View style={styles.icons}>
      <Micro>Icono</Micro>
      <View style={styles.iconGrid}>
        {ICONS.map((name) => {
          const on = name === value;
          return (
            <View
              key={name}
              // El borde vive siempre y solo cambia de color: animar el grosor movia el icono un
              // pixel en cada toque. Es la misma regla que `choice.tsx`.
              style={[
                styles.iconSlot,
                { backgroundColor: on ? tint.soft : t.surface, borderColor: on ? tint.ink : t.line },
              ]}>
              <IconOption name={name} on={on} onPress={() => onChange(name)} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Aparte para que cada opcion tenga sus propios shared values, como el `Card` de `choice.tsx`. */
function IconOption({ name, on, onPress }: { name: Icon3DName; on: boolean; onPress: () => void }) {
  const press = usePressScale({ to: 0.9 });
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={name}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.iconTouch}>
        <Icon3D name={name} size={Icon3DSize.md} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  icons: { gap: Space.sm },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  iconSlot: { borderRadius: Radius.md, borderWidth: 2 },
  iconTouch: {
    width: Touch.chip,
    height: Touch.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
