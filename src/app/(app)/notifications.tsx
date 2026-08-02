import { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { BigButton } from '@/components/ui/big-button';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatusVeil, useScrollVeil } from '@/components/ui/status-veil';
import { JoinRequests } from '@/features/workspaces/join-requests';
import { RESHAPE, Space, Type, useTheme } from '@/constants/theme';
import { useActivity } from '@/features/activity/activity-context';
import { EmptyActivity, EventRow } from '@/features/activity/event-row';
import { useAuth } from '@/features/auth/auth-context';
import { useScreenPadding } from '@/hooks/use-screen-padding';

/** A cuantos px del final se pide la siguiente pagina. Antes de tocar fondo, para que no se note. */
const NEAR_END = 320;

/**
 * Novedades: que ha pasado con tus tareas.
 *
 * Pantalla del Stack y no una pestaña, asi que **la capsula de pestañas no se pinta sin hacer nada**:
 * el `tabBar` solo existe dentro del navegador de `(tabs)`, y esto se monta encima. De ahi que el
 * aire de abajo salga de `Space.breath` y NO de `TAB_DOCK` — reservarle su hueco a una barra que no
 * existe dejaria un agujero al final del scroll.
 *
 * Abrirla marca todo como visto. No hay boton de "marcar leido" a proposito: si ya lo estas mirando,
 * pedirte que ademas lo confirmes es trabajo inventado.
 */
export default function NotificationsScreen() {
  const { user } = useAuth();
  const t = useTheme();
  const veil = useScrollVeil();
  const { events, loading, error, next, reload, more, markRead } = useActivity();
  const pad = useScreenPadding(Space.breath);

  /**
   * Se marca al ENTRAR y no al salir: el globo tiene que apagarse mientras miras, no despues. Corre
   * una sola vez por visita porque `markRead` se sale solo cuando no hay nada sin leer.
   */
  useEffect(() => {
    markRead();
  }, [markRead]);

  // El guard va DESPUES de todos los hooks: al cerrar sesion el user se vuelve null.
  if (!user) return null;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.ScrollView
        {...veil.scrollProps}
        onScroll={veil.scrollProps.onScroll}
        onMomentumScrollEnd={(e) => {
          const { contentOffset, contentSize, layoutMeasurement } = e.nativeEvent;
          const left = contentSize.height - contentOffset.y - layoutMeasurement.height;
          if (left < NEAR_END) more();
        }}
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader back title="Novedades" />

        {loading && !events.length && (
          <Text style={[Type.body, { color: t.textMuted }]}>Trayendo lo que pasó…</Text>
        )}

        {/* Un fallo con la lista ya en pantalla no borra la pantalla: se avisa y se sigue leyendo. */}
        {!!error && !events.length && (
          <View style={styles.message}>
            <Text style={[Type.body, { color: t.textMuted }]}>{error}</Text>
            <BigButton
              label="Reintentar"
              variant="ghost"
              accent={user.accentColor}
              onPress={reload}
            />
          </View>
        )}

        {!loading && !error && !events.length && <EmptyActivity />}

        {/*
          `layout` para que una novedad que llega en vivo empuje a las de abajo en vez de aparecer de
          golpe. Lineal y no muelle: un rebote aqui sacude la lista entera.
        */}
        {/*
          Quien pide entrar va ARRIBA del feed y en su propia tarjeta: no es una novedad que leer,
          es algo que espera una respuesta tuya. Mezclarla con "cerraste tres cosas" la enterraria.
          Se pinta sola o no se pinta.
        */}
        <JoinRequests />

        <Animated.View layout={RESHAPE} style={styles.list}>
          {events.map((event) => (
            <EventRow key={event.id} event={event} accent={user.accentColor} />
          ))}
        </Animated.View>

        {!!next && <Text style={[Type.hint, styles.more, { color: t.textMuted }]}>Cargando más…</Text>}
      </Animated.ScrollView>

      <StatusVeil scrollY={veil.scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Space.xl, gap: Space.lg },
  list: { gap: Space.xs },
  message: { gap: Space.md, paddingVertical: Space.md },
  more: { textAlign: 'center', paddingVertical: Space.md },
});
