import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

import type { Workspace } from '@/features/auth/api';

import type { useWorkspaces } from './use-workspaces';
import { WorkspaceCard } from './workspace-card';

/** Proporcion del viewBox del sticker, para escalar por ancho sin deformarlo. */
const TANGLE_RATIO = 96 / 84;

/**
 * Los espacios de trabajo del inicio, con el boton de anotar.
 *
 * **El "+" se pinta SIEMPRE**, con espacios, sin ellos, cargando y con error, y eso no es un detalle
 * de layout: aqui vivia el `BigButton "Anotar algo"` de la tarjeta del dia, que estaba fuera de su
 * cuerpo condicional justo para que ningun estado dejara la pantalla sin la unica forma de crear una
 * tarea. Al quitar esa tarjeta, esta cabecera hereda esa responsabilidad.
 *
 * El "+" ABRIA un panel con dos opciones —tarea nueva y espacio de trabajo— y ahora empuja directo a
 * anotar. Crear un espacio se mudo al selector de "¿En qué estás?", que se abre desde cualquier
 * pantalla: dejarlo tambien aqui serian dos caminos a la misma pantalla a un centimetro uno de otro, y
 * un menu de una sola opcion es un boton con un paso de mas.
 */
export function Workspaces({
  workspaces: data,
  accent,
  onActivate,
}: {
  workspaces: ReturnType<typeof useWorkspaces>;
  accent?: AccentName;
  /** Entrar a un espacio. Lo resuelve la pantalla, que es quien tiene `setActiveSpace`. */
  onActivate: (workspace: Workspace) => void;
}) {
  const t = useTheme();
  const { workspaces, error } = data;

  return (
    <View style={styles.block}>
      <View style={styles.header}>
        <View style={styles.title}>
          <Text style={[Type.section, { color: t.text }]}>Tus espacios</Text>
          {!!workspaces?.length && (
            <Text style={[Type.hint, { color: t.textMuted }]}>
              {workspaces.length === 1 ? '1 espacio' : `${workspaces.length} espacios`}
            </Text>
          )}
        </View>
        <PlusButton accent={accent} onPress={() => router.push('/new-task')} />
      </View>

      {/* `null` es "todavia no llego" y se pinta callado: un hueco vacio no dice nada falso. */}
      {workspaces?.length === 0 && <EmptyWorkspaces />}

      {!!workspaces?.length && (
        <View style={styles.grid}>
          {workspaces.map((workspace) => (
            <WorkspaceCard
              key={workspace.id}
              workspace={workspace}
              onActivate={() => onActivate(workspace)}
            />
          ))}
        </View>
      )}

      {/* Un fallo aqui no roba la pantalla: se dice en una linea y el resto del dia sigue. */}
      {!!error && <Text style={[Type.hint, styles.notice, { color: t.danger }]}>{error}</Text>}
    </View>
  );
}

/** El "+" de anotar. La accion mas repetida de la app, y por eso vive donde cae el pulgar. */
function PlusButton({ accent, onPress }: { accent?: AccentName; onPress: () => void }) {
  const t = useTheme();
  const tint = useAccent(accent);
  const press = usePressScale({ to: 0.92 });

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Anotar algo"
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.plus, { backgroundColor: tint.ink }]}>
        <SymbolView
          name={{ ios: 'plus', android: 'add', web: 'add' }}
          size={20}
          tintColor={t.onInk}
          fallback={<Text style={[Type.button, { color: t.onInk }]}>+</Text>}
        />
      </Pressable>
    </Animated.View>
  );
}

/**
 * Sin ningun espacio.
 *
 * El copy dice para que sirven con ejemplos concretos en vez de explicar el concepto: "agrupa lo que va
 * junto" no significa nada hasta que se lee "la tesis, la mudanza". Y no pide nada — el "+" de arriba
 * ya esta ahi, asi que un segundo boton aqui seria la misma accion dos veces.
 */
function EmptyWorkspaces() {
  const t = useTheme();

  return (
    <View style={[styles.empty, { backgroundColor: t.surface }]}>
      <Image
        source={require('@/assets/stickers/tangle.svg')}
        style={styles.sticker}
        contentFit="contain"
        accessible={false}
      />
      <Text style={[Type.section, { color: t.text }]}>Sin espacios todavía</Text>
      <Text style={[Type.body, styles.emptyLine, { color: t.textMuted }]}>
        Un espacio agrupa lo que va junto: la tesis, la mudanza, el trabajo.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.md },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: Space.md },
  title: { gap: Space.xs, flex: 1 },
  plus: {
    width: Touch.icon,
    height: Touch.icon,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** 45 grados: el mismo trazo se lee como cruz. Sin animar: el panel que baja ya cuenta el cambio. */
  turned: { transform: [{ rotate: '45deg' }] },
  /**
   * `alignSelf: flex-end` y `alignItems: stretch`: el panel mide lo que mide su opcion mas ancha —no la
   * pantalla— y las dos quedan del mismo ancho, que es lo que lo hace leerse como un menu y no como dos
   * botones sueltos. Pegado a la derecha, debajo del "+".
   */
  panel: { alignSelf: 'flex-end', alignItems: 'stretch', gap: Space.sm },
  optionTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    minHeight: Touch.chip,
    borderRadius: Radius.md,
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
  },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.md },
  empty: {
    borderRadius: Radius.lg,
    padding: Space.xl,
    gap: Space.sm,
    alignItems: 'center',
  },
  sticker: { width: 72, aspectRatio: TANGLE_RATIO },
  emptyLine: { textAlign: 'center' },
  notice: { paddingHorizontal: Space.xs },
});
