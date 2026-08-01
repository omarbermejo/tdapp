import { Image } from 'expo-image';
import { SymbolView } from 'expo-symbols';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutDown } from 'react-native-reanimated';

import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Motion, Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { usePressScale } from '@/hooks/use-press-scale';

import type { useWorkspaces } from './use-workspaces';
import { WorkspaceCard } from './workspace-card';

/**
 * Las opciones SALEN del boton, escalonadas.
 *
 * Cada una entra 30ms despues de la anterior, asi que la lista se despliega de arriba a abajo desde el
 * "+" en vez de aparecer entera de golpe — es lo que hace que se lean como opciones DE ese boton y no
 * como un bloque nuevo en la pantalla. `FadeOutDown` y no Up al cerrar: simetrico a la entrada, la
 * misma pareja que usan los paneles del perfil.
 */
const optionIn = (index: number) => FadeInDown.delay(index * Motion.step).duration(Motion.enter);
const OUT = FadeOutDown.duration(Motion.exit);

/** Proporcion del viewBox del sticker, para escalar por ancho sin deformarlo. */
const TANGLE_RATIO = 96 / 84;

/**
 * Las dos cosas que se pueden crear desde aqui.
 *
 * `light` (la bombilla) para la tarea y no `check`: lo que se anota es una idea, no algo ya hecho —
 * la palomita es el final del camino y ponerla en el boton de crear cuenta la historia al reves.
 *
 * Sin linea de descripcion. La tenian ("Algo que hay que hacer", "Para agrupar lo que va junto") y se
 * fue: con dos opciones y un icono que ya dice de que va cada una, el subtitulo solo servia para que
 * el panel ocupara el ancho entero de la pantalla — y un menu de dos cosas que abarca todo se lee como
 * una seccion nueva, no como las opciones del boton que acabas de tocar.
 */
const CREATE = [
  { icon: 'light', label: 'Tarea nueva', to: '/new-task' },
  { icon: 'work', label: 'Espacio de trabajo', to: '/new-workspace' },
] as const satisfies readonly { icon: Icon3DName; label: string; to: string }[];

/**
 * Los espacios de trabajo del inicio, con el boton que abre las dos formas de crear.
 *
 * **El "+" se pinta SIEMPRE**, con espacios, sin ellos, cargando y con error, y eso no es un detalle
 * de layout: aqui vivia el `BigButton "Anotar algo"` de la tarjeta del dia, que estaba fuera de su
 * cuerpo condicional justo para que ningun estado dejara la pantalla sin la unica forma de crear una
 * tarea. Al quitar esa tarjeta, esta cabecera hereda esa responsabilidad.
 */
export function Workspaces({
  workspaces: data,
  accent,
}: {
  workspaces: ReturnType<typeof useWorkspaces>;
  accent?: AccentName;
}) {
  const t = useTheme();
  const { workspaces, error } = data;
  const [open, setOpen] = useState(false);

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
        <PlusButton open={open} accent={accent} onPress={() => setOpen(!open)} />
      </View>

      {/*
        Pegado a la derecha y del ancho de su contenido, no de la pantalla: nace debajo del "+" y en su
        misma columna, que es lo que lo ata visualmente al boton que lo abrio.
      */}
      {open && (
        <View style={styles.panel}>
          {CREATE.map((option, i) => (
            <CreateOption
              key={option.to}
              option={option}
              index={i}
              accent={accent}
              onPress={() => {
                // Se cierra antes de navegar: al volver, el panel abierto detras seria un resto.
                setOpen(false);
                router.push(option.to);
              }}
            />
          ))}
        </View>
      )}

      {/* `null` es "todavia no llego" y se pinta callado: un hueco vacio no dice nada falso. */}
      {workspaces?.length === 0 && <EmptyWorkspaces />}

      {!!workspaces?.length && (
        <View style={styles.grid}>
          {workspaces.map((workspace) => (
            <WorkspaceCard key={workspace.id} workspace={workspace} />
          ))}
        </View>
      )}

      {/* Un fallo aqui no roba la pantalla: se dice en una linea y el resto del dia sigue. */}
      {!!error && <Text style={[Type.hint, styles.notice, { color: t.danger }]}>{error}</Text>}
    </View>
  );
}

/**
 * El "+". Gira 45 grados al abrirse, asi que se convierte en la cruz de cerrar sin cambiar de glifo:
 * un icono que se transforma dice "esto que abri se cierra aqui" mejor que dos iconos distintos.
 */
function PlusButton({
  open,
  accent,
  onPress,
}: {
  open: boolean;
  accent?: AccentName;
  onPress: () => void;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const press = usePressScale({ to: 0.92 });

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={open ? 'Cerrar' : 'Crear algo nuevo'}
        accessibilityState={{ expanded: open }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.plus, { backgroundColor: tint.ink }]}>
        <View style={open ? styles.turned : undefined}>
          <SymbolView
            name={{ ios: 'plus', android: 'add', web: 'add' }}
            size={20}
            tintColor={t.onInk}
            fallback={<Text style={[Type.button, { color: t.onInk }]}>+</Text>}
          />
        </View>
      </Pressable>
    </Animated.View>
  );
}

/** Una de las dos opciones del panel. El icono 3D a `md` (32), el piso donde todavia se lee. */
function CreateOption({
  option,
  index,
  accent,
  onPress,
}: {
  option: (typeof CREATE)[number];
  index: number;
  accent?: AccentName;
  onPress: () => void;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const press = usePressScale({ to: 0.96 });

  return (
    <Animated.View entering={optionIn(index)} exiting={OUT} style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={option.label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[styles.optionTouch, { backgroundColor: tint.soft }]}>
        <Icon3D name={option.icon} size={Icon3DSize.md} />
        <Text style={[Type.label, { color: t.text }]} numberOfLines={1}>
          {option.label}
        </Text>
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
