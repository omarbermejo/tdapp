import * as Haptics from 'expo-haptics';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useSyncExternalStore } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import {
  cyclePreference,
  getPreference,
  subscribe,
  type Preference,
} from '@/constants/scheme-store';
import { Radius, Touch, Type, useTheme } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * Cada estado con SU icono, y por eso el ciclo no es adivinanza.
 *
 * `circle.lefthalf.filled` es el glifo que Apple usa para "automático" en sus propios ajustes de
 * apariencia, así que no hay que enseñarlo. `short` es el respaldo si el símbolo no carga: dos letras
 * valen más que un hueco.
 */
const FACES: Record<Preference, { ios: SFSymbol; android: AndroidSymbol; label: string; short: string }> =
  {
    system: {
      ios: 'circle.lefthalf.filled',
      android: 'brightness_auto',
      label: 'Tema: automático',
      short: 'AU',
    },
    light: { ios: 'sun.max', android: 'light_mode', label: 'Tema: claro', short: 'CL' },
    dark: { ios: 'moon', android: 'dark_mode', label: 'Tema: oscuro', short: 'OS' },
  };

/** Lo que dice el lector de pantalla del siguiente toque, para que no sea una sorpresa. */
const NEXT: Record<Preference, string> = {
  system: 'Cambia a claro',
  light: 'Cambia a oscuro',
  dark: 'Sigue al sistema',
};

/**
 * El interruptor de claro/oscuro.
 *
 * Cicla tres estados y no dos: con un interruptor de dos posiciones, salir de "seguir al sistema" sería
 * un viaje sin vuelta, y ese es justo el estado que respeta lo que el teléfono ya sabe — el oscuro por
 * horario, por ejemplo. Tres toques dan la vuelta completa.
 *
 * Lee el store con `useSyncExternalStore` y no por props: así el icono y el resto de la app cambian en
 * el mismo render, sin que nadie tenga que pasar el estado hacia abajo.
 */
export function SchemeToggle() {
  const t = useTheme();
  const preference = useSyncExternalStore(subscribe, getPreference, getPreference);
  const press = usePressScale({ to: 0.9, haptic: Haptics.ImpactFeedbackStyle.Light });

  const face = FACES[preference];

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={face.label}
        accessibilityHint={NEXT[preference]}
        onPress={cyclePreference}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        // `sunken` y no `surface`: en el perfil este botón vive sobre el canvas, y el escalón hacia
        // abajo es lo que lo separa sin pedirle un borde.
        style={[styles.button, { backgroundColor: t.sunken }]}>
        <View style={styles.glyph}>
          <SymbolView
            name={{ ios: face.ios, android: face.android, web: face.android }}
            size={20}
            tintColor={t.text}
            fallback={<Text style={[Type.micro, { color: t.text }]}>{face.short}</Text>}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Los 44pt del HIG: es un objetivo táctil, aunque el glifo mida 20.
  button: {
    width: Touch.icon,
    height: Touch.icon,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: { alignItems: 'center', justifyContent: 'center' },
});
