import * as Haptics from 'expo-haptics';
import { SymbolView } from 'expo-symbols';
import { useEffect, type ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type ViewStyle } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
} from 'react-native-reanimated';

import {
  Motion,
  Radius,
  Space,
  Touch,
  Type,
  useAccent,
  useShadow,
  useTheme,
  type AccentName,
} from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

type Props = {
  label: string;
  onPress: () => void;
  /** Marca a la izquierda de la etiqueta (logo del proveedor). */
  icon?: ReactNode;
  /** Tiñe el texto de `outline` y `ghost`. `primary` siempre va con la tinta de la marca. */
  accent?: AccentName;
  variant?: 'primary' | 'outline' | 'ghost';
  loading?: boolean;
  /**
   * La accion ya salio bien. El boton deja de aceptar toques y se vuelve la confirmacion:
   * palomita, un pop que se pasa un pelo y el golpe haptico de exito.
   *
   * Vive en el boton y no en la pantalla porque el boton ES donde se toco: confirmar en otro
   * sitio obliga a buscar la respuesta, y con TDAH la respuesta inmediata es la mitad del efecto.
   */
  success?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
};

/** El pop de la confirmacion: se pasa un pelo y vuelve. Blando a proposito — es un "listo". */


/**
 * Un solo boton solido por pantalla (`primary`); el resto son papel con hairline
 * o texto pelado. La jerarquia la carga el peso visual, no un color saturado.
 *
 * En oscuro el primario se invierte (relleno claro, texto oscuro): un boton oscuro
 * sobre canvas oscuro deja de ser el ancla de la pantalla. Eso vive en los tokens
 * `ink`/`onInk`, aqui no hay condicional de esquema.
 */
export function BigButton({
  label,
  onPress,
  icon,
  accent = 'olive',
  variant = 'primary',
  loading,
  success,
  disabled,
  style,
}: Props) {
  const t = useTheme();
  const shadow = useShadow();
  // El hook va SIEMPRE, aunque el primario no use su valor: dentro del ternario se llamaba
  // solo en unas variantes, y un boton que cambia de variant en su lugar (Empezar/Pausar)
  // dejaba a React con dos cuentas de hooks distintas y reventaba en el siguiente.
  const accentInk = useAccent(accent).ink;
  const primary = variant === 'primary';
  // La confirmacion tambien bloquea: dos toques seguidos crearian la cosa dos veces.
  const blocked = disabled || loading || success;
  // ink, no solid: los acentos medios sobre papel no llegan a 4.5:1 en 17pt.
  const color = primary ? t.onInk : accentInk;
  // El primario es la accion importante de la pantalla: golpe medio, no ligero.
  const press = usePressScale(
    primary ? { to: 0.97, haptic: Haptics.ImpactFeedbackStyle.Medium } : { to: 0.97 }
  );

  // Shared value propio y no el de `usePressScale`: el hundido del toque ya termino cuando
  // llega la respuesta del servidor, y mezclar los dos en la misma escala se pisa.
  const pop = useSharedValue(1);
  const popStyle = useAnimatedStyle(() => ({ transform: [{ scale: pop.get() }] }));

  useEffect(() => {
    if (!success) return;
    // Crece y vuelve: un pop que solo crece deja el boton grande y se lee como un bug.
    pop.set(withSequence(withSpring(1.06, Motion.confirm), withSpring(1, Motion.confirm)));
    // El haptico de exito es otro patron que el del toque: tres golpes cortos, no uno.
    // En web no hay motor, y el catch evita ensuciar la consola (igual que en usePressScale).
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  }, [success, pop]);

  return (
    // El pop reemplaza al hundido y no se suma: con `success` el boton ya esta bloqueado,
    // asi que `press.style` esta apagado y las dos escalas nunca coinciden en el array.
    <Animated.View style={[!blocked && press.style, success && popStyle, style]}>
      <Pressable
        accessibilityRole="button"
        // Con la palomita no queda texto que leer, asi que el nombre lo pone esto.
        accessibilityLabel={success ? `${label}: listo` : undefined}
        accessibilityState={{ disabled: !!blocked, busy: !!loading }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        disabled={blocked}
        style={({ pressed }) => [
          styles.base,
          primary && [{ backgroundColor: t.ink }, shadow],
          variant === 'outline' && [
            styles.outline,
            { backgroundColor: t.surface, borderColor: t.line },
            shadow,
          ],
          variant === 'ghost' && styles.ghost,
          // La confirmacion NO se apaga: un boton al 40% se lee como deshabilitado, y esto
          // es lo contrario — es la unica cosa que hay que mirar en ese momento.
          blocked && !success && styles.blocked,
          pressed && primary && !blocked && { backgroundColor: t.inkPressed },
        ]}>
        {success ? (
          <SymbolView
            name={{ ios: 'checkmark', android: 'check', web: 'check' }}
            size={26}
            tintColor={color}
            // Sin el simbolo la palomita sigue siendo una palomita: el glifo de texto basta.
            fallback={<Text style={[Type.button, { color }]}>✓</Text>}
          />
        ) : loading ? (
          <ActivityIndicator color={color} />
        ) : (
          <View style={styles.content}>
            {icon}
            <Text style={[Type.button, { color }]}>{label}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: Touch.button,
    borderRadius: Radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Space.xl,
  },
  content: { flexDirection: 'row', alignItems: 'center', gap: Space.md },
  outline: { borderWidth: 1 },
  ghost: { minHeight: Touch.icon, backgroundColor: 'transparent' },
  blocked: { opacity: 0.4 },
});
