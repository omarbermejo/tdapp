import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import * as Haptics from 'expo-haptics';
import { Tabs, type BottomTabBarProps } from 'expo-router/js-tabs';
import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Radius, Space, Touch, Type, useAccent, useScheme, useShadow, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { CaptureSheet } from '@/features/tasks/capture';
import { usePressScale } from '@/hooks/use-press-scale';

/**
 * Constante del build, no del render: el vidrio liquido depende de la version de iOS con la que
 * arranco la app y no cambia mientras corre. Por eso se lee a nivel de modulo — no es un hook.
 *
 * Importa porque el fallback de `GlassView` es un `View` PELADO: fuera de iOS 26 (y en Android
 * y web) no pinta desenfoque ni relleno. Asi que la barra se rellena con `t.surface` + sombra
 * cuando esto es false, y va sin relleno cuando es true para que el vidrio se vea.
 */
const GLASS = isLiquidGlassAvailable();

type Tab = {
  /** Nombre de archivo dentro de (app). */
  name: string;
  label: string;
  ios: SFSymbol;
  android: AndroidSymbol;
  /** Solo si el simbolo no carga: tres letras valen mas que un hueco. */
  short: string;
};

/**
 * La lista ES la barra: el orden lo pone esto y no el sistema de archivos, y cualquier ruta
 * del grupo que no este aqui (new-task) no sale en la barra ni la lleva encima.
 */
const TABS: Tab[] = [
  { name: 'index', label: 'Hoy', ios: 'sun.max', android: 'wb_sunny', short: 'Hoy' },
  { name: 'calendar', label: 'Calendario', ios: 'calendar', android: 'calendar_month', short: 'Cal' },
  { name: 'profile', label: 'Perfil', ios: 'person', android: 'person', short: 'Yo' },
];

/**
 * Aire que cada pantalla del grupo deja al final de su scroll para que la pastilla no tape
 * la ultima cosa. Sale de la geometria de la barra, asi que vive aqui y se importa: cuatro
 * copias del mismo calculo se desincronizan en cuanto la barra cambie de alto.
 *
 * Se lee: alto del control (`slot`) + el padding de la pastilla arriba y abajo + lo que la
 * pastilla despega del borde + un respiro. Si cambias `bar` o `dock`, recalcula esto.
 */
export const TAB_DOCK = Touch.icon + Space.xs * 2 + Space.md + Space.xl;

/**
 * Pastilla flotante de vidrio, no barra pegada al borde.
 *
 * Lleva CUATRO cosas: las tres pestañas a la izquierda y el + de anotar a la derecha. El + no
 * es una pestaña — no navega, abre la hoja de captura que vive en el layout — y es el unico con
 * relleno solido: la forma tiene que decir que hace algo distinto antes de que leas el glifo.
 */
function FloatingTabs({
  state,
  navigation,
  insets,
  onCapture,
}: BottomTabBarProps & { onCapture: () => void }) {
  const t = useTheme();
  const scheme = useScheme();
  const shadow = useShadow();
  const { user } = useAuth();
  const accent = useAccent(user?.accentColor);
  const press = usePressScale({ to: 0.94, haptic: Haptics.ImpactFeedbackStyle.Medium });

  // El guard va DESPUES de los hooks: en una ruta sin pestaña la barra no se pinta.
  const current = state.routes[state.index]?.name;
  if (!TABS.some((tab) => tab.name === current)) return null;

  return (
    <View style={[styles.dock, { paddingBottom: insets.bottom + Space.md }]} pointerEvents="box-none">
      <GlassView
        glassEffectStyle="regular"
        // No 'auto': la app tiene su propio interruptor de tema, y auto seguiria al del sistema
        // hasta aclarar el vidrio mientras el resto de la app sigue oscuro.
        colorScheme={scheme}
        style={[styles.bar, !GLASS && { backgroundColor: t.surface }, !GLASS && shadow]}>
        <View style={styles.tabs}>
          {TABS.map((tab) => {
            // Una pestaña sin archivo todavia simplemente no aparece, en vez de tirar la app.
            const route = state.routes.find((r) => r.name === tab.name);
            if (!route) return null;

            const focused = route.name === current;
            const tint = focused ? t.text : t.textMuted;

            return (
              <Pressable
                key={tab.name}
                accessibilityRole="tab"
                accessibilityLabel={tab.label}
                accessibilityState={{ selected: focused }}
                onPress={() => {
                  const event = navigation.emit({
                    type: 'tabPress',
                    target: route.key,
                    canPreventDefault: true,
                  });
                  if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
                }}
                style={[styles.slot, focused && { backgroundColor: accent.soft }]}>
                <SymbolView
                  name={{ ios: tab.ios, android: tab.android, web: tab.android }}
                  size={24}
                  tintColor={tint}
                  fallback={<Text style={[Type.micro, { color: tint }]}>{tab.short}</Text>}
                />
              </Pressable>
            );
          })}
        </View>

        <Animated.View style={press.style}>
          <Pressable
            // Boton y no pestaña: no cambia de ruta, abre una hoja. Anunciarlo como tab le
            // prometeria a VoiceOver un destino que no existe.
            accessibilityRole="button"
            accessibilityLabel="Anotar algo"
            onPress={onCapture}
            onPressIn={press.onPressIn}
            onPressOut={press.onPressOut}
            // accent.ink, no accent.solid: solid es decorativo y aqui va un glifo encima. ink es
            // el unico paso que pasa AA, y como invierte su luz entre esquemas el + en onInk
            // contrasta en los dos.
            style={[styles.slot, { backgroundColor: accent.ink }]}>
            <SymbolView
              name={{ ios: 'plus', android: 'add', web: 'add' }}
              size={24}
              tintColor={t.onInk}
              fallback={<Text style={[Type.section, { color: t.onInk }]}>+</Text>}
            />
          </Pressable>
        </Animated.View>
      </GlassView>
    </View>
  );
}

export default function AppLayout() {
  const t = useTheme();
  const { user } = useAuth();
  // El estado vive aqui y la hoja se monta FUERA del <Tabs>: asi queda encima de la barra, y
  // anotar existe desde las tres pestañas en vez de solo desde Hoy.
  const [capturing, setCapturing] = useState(false);

  return (
    <>
      <Tabs
        tabBar={(props) => <FloatingTabs {...props} onCapture={() => setCapturing(true)} />}
        screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: t.canvas } }}
      />
      <CaptureSheet open={capturing} onClose={() => setCapturing(false)} accent={user?.accentColor} />
    </>
  );
}

const styles = StyleSheet.create({
  // Absoluta: no le quita alto a la pantalla, flota encima.
  dock: {
    position: 'absolute',
    left: Space.xl,
    right: Space.xl,
    bottom: 0,
  },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    // Las pestañas a un lado y el + al otro: el hueco de en medio los separa en dos roles
    // distintos sin necesidad de pintar una linea.
    justifyContent: 'space-between',
    padding: Space.xs,
    borderRadius: Radius.pill,
  },
  tabs: {
    flexDirection: 'row',
    gap: Space.xs,
  },
  slot: {
    width: Touch.icon,
    height: Touch.icon,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
