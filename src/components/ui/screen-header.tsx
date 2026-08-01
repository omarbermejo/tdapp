import { router } from 'expo-router';
import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Radius, Space, Touch, Type, useShadow, useTheme } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

import { BackButton } from './back-button';

/**
 * El encabezado de una pantalla que se lee: un titulo grande y, opcionalmente, acciones a la derecha.
 *
 * Vive aqui y no copiado en cada pantalla porque TRES lo usan a la vez (perfil, ajustes y editar
 * perfil), y es exactamente el argumento que ya obligo a promover `Pill`: dos copias de esto se
 * desincronizan a la primera.
 *
 * Lo que NO absorbe, a proposito:
 * - El titular del home. Es serif (`Type.day`) y es el unico sitio de la app con serif; meterlo aqui
 *   invitaria a usar la excepcion en cualquier parte.
 * - El encabezado del calendario. Ese flota con blur porque la tira de dias tiene que quedarse fija
 *   mientras la lista corre por debajo; aqui no hay nada que fijar, y pagar un onLayout mas un shared
 *   value por una separacion que no hace falta seria copiar la forma sin la razon.
 *
 * Va DENTRO del scroll, como cualquier otro contenido: el titulo se va con la pagina.
 */
export function ScreenHeader({
  title,
  back,
  actions,
}: {
  title: string;
  /** La flecha de volver. Solo en pantallas de la pila, nunca en una pestaña. */
  back?: boolean;
  actions?: React.ReactNode;
}) {
  const t = useTheme();

  return (
    <View style={styles.header}>
      {/*
        Con salida de emergencia: estas pantallas se pueden abrir por enlace directo (una
        notificacion, un `openurl`) y entonces NO hay pila detras — `router.back()` no hace nada y el
        boton se queda muerto. El perfil es el sitio del que cuelgan las dos, asi que es el destino
        honesto cuando no hay a donde volver.
      */}
      {back && (
        <BackButton onPress={() => (router.canGoBack() ? router.back() : router.replace('/profile'))} />
      )}
      {/* `flex: 1` empuja las acciones al borde y deja que el titulo largo parta en dos lineas. */}
      <Text style={[Type.display, styles.title, { color: t.text }]} numberOfLines={2}>
        {title}
      </Text>
      {!!actions && <View style={styles.actions}>{actions}</View>}
    </View>
  );
}

/**
 * Un boton de icono del encabezado: el mismo circulo de papel que `BackButton`.
 *
 * `label` no es opcional y no es adorno: sin texto visible, un icono suelto no existe para un lector
 * de pantalla. Y el icono se recibe como componente en vez de como nombre para que cada pantalla
 * importe el suyo por archivo — el barril de lucide mete 1756 modulos para usar uno.
 */
export function HeaderAction({
  icon: Icon,
  label,
  onPress,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
}) {
  const t = useTheme();
  const shadow = useShadow();
  const press = usePressScale({ to: 0.92 });

  return (
    <Animated.View style={press.style}>
      <Pressable
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[styles.action, { backgroundColor: t.surface }, shadow]}>
        <Icon size={20} color={t.text} strokeWidth={2} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // `flex-end` y no `center`: con un titulo de dos lineas los botones se quedan abajo, alineados con
  // la ultima linea del texto, en vez de flotar a media altura del bloque.
  header: { flexDirection: 'row', alignItems: 'flex-end', gap: Space.md },
  title: { flex: 1 },
  actions: { flexDirection: 'row', gap: Space.sm },
  action: {
    width: Touch.icon,
    height: Touch.icon,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
