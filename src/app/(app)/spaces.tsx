import { router } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown, FadeOut, FadeOutDown } from 'react-native-reanimated';

import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { ProgressRing } from '@/components/ui/progress-ring';
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
import type { Workspace } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { useActiveSpace } from '@/features/workspaces/active-space';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';
import { usePressScale } from '@/hooks/use-press-scale';
import { useScreenPadding } from '@/hooks/use-screen-padding';
import { goBackOrHome } from '@/features/nav/go-back';

/** Las filas salen escalonadas, como el panel del "+". Tope a 6: una lista larga no puede tardar. */
const rowIn = (index: number) =>
  FadeInDown.delay(Math.min(index, 6) * Motion.step).duration(Motion.enter);
const ROW_OUT = FadeOutDown.duration(Motion.exit);

/** El fondo se oscurece aparte de la hoja: dos capas con dos tiempos se leen como una que sube. */
const VEIL_IN = FadeIn.duration(Motion.enter);
const VEIL_OUT = FadeOut.duration(Motion.exit);

/** El icono del modo general. `home-chrome` es la casa en verde, la misma de la pestaña de Hoy. */
const ALL_ICON: Icon3DName = 'home-chrome';

/**
 * El selector de espacio, encima de la pantalla que sea.
 *
 * Es una ruta con `presentation: 'transparentModal'`, y no un componente dentro del layout de
 * pestañas, porque tiene que poder abrirse desde CUALQUIER sitio — las cuatro pestañas, pero tambien
 * el detalle de un espacio o la pantalla de anotar. Es el unico mecanismo del repo que pinta sobre lo
 * que haya sin que cada pantalla tenga que montarlo.
 *
 * El usuario pidio "dos opciones". Aqui hay dos opciones **y la lista de espacios**, y esa desviacion
 * es a proposito: un selector de espacios que no deje elegir un espacio no es un selector. Las dos
 * acciones siguen ahi, al final, que es donde va lo que se hace una vez cada mucho.
 */
export default function SpacesScreen() {
  const t = useTheme();
  const { user, setActiveSpace } = useAuth();
  const active = useActiveSpace();
  const { workspaces } = useWorkspaces();
  const shadow = useShadow('floating');
  const pad = useScreenPadding(Space.xxl);

  const close = () => goBackOrHome();

  /** Entrar a un espacio: se activa y se cierra. La repintada de la pantalla de atras ES el acuse. */
  const enter = (space: Workspace | null) => {
    void setActiveSpace(
      space && {
        id: space.id,
        name: space.name,
        icon: space.icon,
        accent: space.accent,
        tag: space.tag ?? null,
      }
    );
    close();
  };

  if (!user) return null;

  return (
    <View style={styles.screen}>
      {/*
        El velo. Es tambien el boton de cerrar: tocar fuera cierra, que es lo que cualquiera intenta
        antes de buscar una X. `accessibilityLabel` porque para un lector de pantalla un fondo tocable
        sin nombre es un boton misterioso que ocupa la pantalla entera.
      */}
      <Animated.View entering={VEIL_IN} exiting={VEIL_OUT} style={styles.veil}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={close}
          style={[styles.veilTouch, { backgroundColor: t.scrim }]}
        />
      </Animated.View>

      <Animated.View
        entering={FadeInDown.duration(Motion.enter)}
        exiting={ROW_OUT}
        style={[styles.sheet, { backgroundColor: t.surface }, shadow]}>
        {/* El asa: dice "esto se arrastra" sin escribirlo. */}
        <View style={[styles.grabber, { backgroundColor: t.line }]} />

        <Text style={[Type.section, styles.title, { color: t.text }]}>¿En qué estás?</Text>

        {/*
          El aire de abajo va en el CONTENIDO del scroll y no en la hoja: puesto en la hoja, con la
          lista llena se comia el sitio de la ultima fila en vez de dejarla pasar por encima del
          indicador de inicio.
        */}
        <ScrollView
          contentContainerStyle={{ paddingBottom: pad.bottom }}
          showsVerticalScrollIndicator={false}
          style={styles.list}>
          <SpaceRow
            icon={ALL_ICON}
            name="Todo"
            hint="Tu día completo, como siempre"
            accent={user.accentColor}
            on={!active}
            index={0}
            onPress={() => enter(null)}
          />

          {workspaces?.map((space, i) => (
            <SpaceRow
              key={space.id}
              icon={space.icon as Icon3DName}
              name={space.name}
              hint={space.total === 0 ? 'Sin tareas todavía' : `${space.done} de ${space.total}`}
              accent={space.accent}
              on={active?.id === space.id}
              index={i + 1}
              done={space.done}
              total={space.total}
              onPress={() => enter(space)}
            />
          ))}

          <View style={[styles.rule, { backgroundColor: t.line }]} />

          <Action
            icon="work"
            label="Crear un espacio"
            accent={user.accentColor}
            index={(workspaces?.length ?? 0) + 1}
            onPress={() => {
              close();
              router.push('/new-workspace');
            }}
          />
          <Action
            icon="relationships"
            label="Unirme con un código"
            accent={user.accentColor}
            index={(workspaces?.length ?? 0) + 2}
            onPress={() => {
              close();
              router.push('/join-workspace');
            }}
          />
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** Un espacio de la lista. Componente aparte porque cada fila necesita su propio `useAccent`. */
function SpaceRow({
  icon,
  name,
  hint,
  accent,
  on,
  index,
  done,
  total,
  onPress,
}: {
  icon: Icon3DName;
  name: string;
  hint: string;
  accent: AccentName;
  on: boolean;
  index: number;
  done?: number;
  total?: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const tint = useAccent(accent);
  const press = usePressScale({ to: 0.98 });

  return (
    <Animated.View entering={rowIn(index)} style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`${name}. ${hint}`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        // El elegido se tiñe: es la misma doble señal de la tira de la semana, relleno para "aqui
        // estas" y nada para el resto.
        style={[styles.row, on && { backgroundColor: tint.soft }]}>
        <Icon3D name={icon} size={Icon3DSize.lg} />
        <View style={styles.rowText}>
          <Text style={[Type.label, { color: t.text }]} numberOfLines={1}>
            {name}
          </Text>
          <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
            {hint}
          </Text>
        </View>
        {/* El anillo solo donde significa algo: "Todo" no tiene un progreso que enseñar. */}
        {total !== undefined && total > 0 && (
          <ProgressRing done={done ?? 0} total={total} accent={accent} size={32} stroke={3} />
        )}
      </Pressable>
    </Animated.View>
  );
}

/** Crear o unirse. Van al final: es lo que se hace una vez cada mucho. */
function Action({
  icon,
  label,
  accent,
  index,
  onPress,
}: {
  icon: Icon3DName;
  label: string;
  accent: AccentName;
  index: number;
  onPress: () => void;
}) {
  const t = useTheme();
  const press = usePressScale({ to: 0.98 });

  return (
    <Animated.View entering={rowIn(index)} style={press.style}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.row}>
        <Icon3D name={icon} size={Icon3DSize.md} />
        <Text style={[Type.label, styles.rowText, { color: t.text }]} numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

const GRABBER = 36;

const styles = StyleSheet.create({
  // La hoja se pega abajo: sale del pulgar, no del centro de la pantalla.
  screen: { flex: 1, justifyContent: 'flex-end' },
  veil: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 },
  // El color sale de `t.scrim`, que ya existe en los tokens y cambia con el esquema: en claro es un
  // verde oscuro translucido y en oscuro un negro mas denso. Ningun hex fuera de theme.ts.
  veilTouch: { flex: 1 },
  sheet: {
    borderTopLeftRadius: Radius.xxl,
    borderTopRightRadius: Radius.xxl,
    paddingTop: Space.md,
    paddingHorizontal: Space.lg,
    // Tope al 80%: con muchos espacios la hoja no puede tapar la pantalla entera, o deja de leerse
    // como algo que esta ENCIMA de donde estabas.
    maxHeight: '80%',
  },
  grabber: { alignSelf: 'center', width: GRABBER, height: 4, borderRadius: Radius.pill },
  title: { paddingHorizontal: Space.sm, paddingTop: Space.md, paddingBottom: Space.sm },
  /**
   * `flexShrink: 1` NO es redundante, y su ausencia era un bug de verdad.
   *
   * En React Native el `flexShrink` por defecto es 0, asi que este `ScrollView` se medía a la altura
   * ENTERA de su contenido y se pasaba del `maxHeight: 80%` de la hoja. La hoja lo recortaba con su
   * borde redondeado, y como el scroll creia que cabia entero tampoco se podia desplazar: con ocho
   * espacios, "Unirme con un código" quedaba cortado y fuera de alcance.
   *
   * `flexGrow: 0` se queda: sin el, con dos espacios la lista estiraria la hoja hasta el 80% y dejaria
   * un hueco vacio debajo de las filas.
   */
  list: { flexGrow: 0, flexShrink: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: Touch.button,
    borderRadius: Radius.md,
    paddingHorizontal: Space.sm,
    paddingVertical: Space.sm,
  },
  rowText: { flex: 1, gap: 2 },
  rule: { height: 1, marginVertical: Space.sm, marginHorizontal: Space.sm },
});
