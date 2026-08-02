import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

import type { Workspace } from '@/features/auth/api';

import type { useWorkspaces } from './use-workspaces';
import { WorkspaceCard } from './workspace-card';

/** Proporcion del viewBox del sticker, para escalar por ancho sin deformarlo. */
const TANGLE_RATIO = 96 / 84;

/**
 * Los espacios de trabajo del inicio.
 *
 * **Este bloque NO se pinta dentro de un espacio activo**: ahi la pantalla entera ya habla de ese
 * espacio —el saludo lo nombra, el mapa de calor lo mide, la lista es la suya— y una rejilla con los
 * otros cinco al lado seria una invitacion a irse de donde acabas de entrar. Lo decide el inicio, no
 * este componente: quien sabe si hay espacio activo es la pantalla.
 *
 * **El "+" de anotar ya no vive aqui.** Vivio en esta cabecera y se mudo a la del inicio por eso
 * mismo: era la unica forma de crear una tarea desde Hoy (la barra de pestañas no tiene "+", y el
 * detalle de un espacio tampoco), asi que un bloque que desaparece la mitad del tiempo no puede
 * hospedarla. Arriba se pinta en los dos modos y sigue cayendo bajo el pulgar.
 */
export function Workspaces({
  workspaces: data,
  onActivate,
}: {
  workspaces: ReturnType<typeof useWorkspaces>;
  /** Entrar a un espacio. Lo resuelve la pantalla, que es quien tiene `setActiveSpace`. */
  onActivate: (workspace: Workspace) => void;
}) {
  const t = useTheme();
  const { workspaces, error } = data;

  return (
    <View style={styles.block}>
      {/* Sin fila: el "+" que vivia a la derecha se mudo a la cabecera de la pantalla. */}
      <View style={styles.title}>
        <Text style={[Type.section, { color: t.text }]}>Tus espacios</Text>
        {!!workspaces?.length && (
          <Text style={[Type.hint, { color: t.textMuted }]}>
            {workspaces.length === 1 ? '1 espacio' : `${workspaces.length} espacios`}
          </Text>
        )}
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

/**
 * El "+" de anotar. La accion mas repetida de la app, y por eso vive donde cae el pulgar.
 *
 * Exportado y montado por el INICIO, no por este bloque: "Tus espacios" desaparece dentro de un
 * espacio activo, y este boton es la unica forma de crear una tarea desde Hoy. Se queda aqui como
 * archivo porque es donde nacio y donde estan sus estilos, pero no lo pinta nadie de este modulo.
 */
export function PlusButton({ accent, onPress }: { accent?: AccentName; onPress: () => void }) {
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
  title: { gap: Space.xs },
  plus: {
    width: Touch.icon,
    height: Touch.icon,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
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
