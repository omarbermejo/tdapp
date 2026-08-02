import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { Radius, Space, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import type { SpaceRef } from '@/features/workspaces/active-space';
import { usePressScale } from '@/hooks/use-press-scale';

/** Adonde van los dos: la hoja que pinta encima de cualquier pantalla. */
const openPicker = () => router.push('/spaces');

/**
 * En que espacio estas trabajando, y la puerta para cambiarlo.
 *
 * **Devuelve `null` sin espacio activo**, y esa es la mitad del diseño: en modo general la pantalla se
 * ve EXACTAMENTE como siempre — sin una pastilla que diga "Todo", que seria mobiliario permanente para
 * informar de que no pasa nada. La señal aparece solo cuando hay algo que señalar.
 *
 * El titular en Fraunces no se toca ni se vuelve tocable: dice el dia, y convertirlo en el boton de un
 * selector de espacios promete una cosa y hace otra.
 */
export function SpacePill({ space }: { space: SpaceRef | null }) {
  const t = useTheme();
  const tint = useAccent(space?.accent);
  const press = usePressScale({ to: 0.96 });

  if (!space) return null;

  return (
    <Animated.View style={[styles.slot, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Trabajando en ${space.name}`}
        accessibilityHint="Cambia de espacio"
        onPress={openPicker}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        // 40pt de alto quedan por debajo de `Touch.chip` (48) a proposito: en la cabecera convive con
        // un titular de 50pt de interlineado y a 48 dominaria las tres lineas. El hitSlop lo lleva a
        // 56 efectivos, por encima del minimo.
        hitSlop={Space.sm}
        style={[styles.pill, { backgroundColor: tint.soft }]}>
        <Icon3D name={space.icon as Icon3DName} size={Icon3DSize.md} />
        <Text style={[Type.label, { color: t.text }]} numberOfLines={1}>
          {space.name}
        </Text>
        {/* Un punto y no un chevron: el chevron promete una lista desplegable pegada, y lo que se
            abre es una hoja. El punto solo dice "esto es un estado en el que estas". */}
        <View style={[styles.dot, { backgroundColor: tint.ink }]} />
      </Pressable>
    </Animated.View>
  );
}

/**
 * El saludo, convertido en la puerta del selector — y en la señal del espacio.
 *
 * Existe porque `SpacePill` devuelve `null` sin espacio activo, y eso dejaba la hoja de "¿En qué
 * estás?" SIN NINGUNA forma de abrirse en modo general: ni crear un espacio ni unirse con un código
 * eran alcanzables desde una cuenta que todavía no tiene ninguno. Este es el trigger que siempre está.
 *
 * **Dentro de un espacio dice también cuál**: "Hola, Omar · 🎓 Tesis". Eso libera el hueco de debajo de
 * la fecha —donde vivía la pastilla— para las caras de quienes lo comparten, que es lo que de verdad
 * añade información una vez que ya sabes en qué espacio estás.
 *
 * El titular en Fraunces no se toca ni se vuelve tocable: dice el día, y convertirlo en el botón de un
 * selector de espacios promete una cosa y hace otra.
 */
export function GreetingSwitch({
  label,
  space,
  accent,
}: {
  label: string;
  /** El espacio activo, o `null` en modo general. */
  space?: SpaceRef | null;
  /** El acento de la PERSONA. Solo se usa en modo general; con espacio manda el suyo. */
  accent?: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(space?.accent ?? accent);
  const press = usePressScale({ to: 0.96 });

  return (
    <Animated.View style={[styles.slot, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={space ? `${label}. Trabajando en ${space.name}` : label}
        accessibilityHint="Elige un espacio de trabajo"
        onPress={openPicker}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        hitSlop={Space.sm}
        /**
         * En modo general `t.sunken`: esto no es un estado en el que estás, es solo un control, y
         * teñirlo prometería algo que no hay. Y no `t.surface` — en claro `surface` y `canvas` son el
         * MISMO papel (las cards se despegan por su sombra, no por su color) y un saludo con sombra
         * flotaría sobre el titular; `sunken` es el único token que se ve sin levantar nada.
         *
         * Dentro de un espacio sí se tiñe con SU acento: ahí la pastilla ya no es un control neutro,
         * es la señal de en qué estás trabajando, y el color es la mitad de esa señal.
         */
        style={[styles.greeting, { backgroundColor: space ? tint.soft : t.sunken }]}>
        <Text style={[Type.hint, { color: t.textMuted }]} numberOfLines={1}>
          {label}
        </Text>
        {space && (
          <>
            {/* Un punto medio y no un guion: separa sin parecer un rango ni una resta. */}
            <Text style={[Type.hint, { color: t.textMuted }]}>·</Text>
            {/* `sm` (24) y no `md`: contra un `Type.hint` de 14/20, un icono de 32 manda sobre el texto. */}
            <Icon3D name={space.icon as Icon3DName} size={Icon3DSize.sm} />
            <Text style={[Type.label, styles.spaceName, { color: t.text }]} numberOfLines={1}>
              {space.name}
            </Text>
          </>
        )}
        <View style={[styles.dot, { backgroundColor: tint.ink }]} />
      </Pressable>
    </Animated.View>
  );
}

const DOT = 6;

const styles = StyleSheet.create({
  // `flex-start`: la pastilla mide lo que mide su nombre, no el ancho de la pantalla.
  slot: { alignSelf: 'flex-start' },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
  },
  /**
   * Mas apretada que la pastilla del espacio: es un saludo, no un estado.
   *
   * El margen negativo iguala al relleno horizontal, asi que el TEXTO cae en la misma columna que el
   * titular y la fecha de debajo — sin el, el saludo aparecia indentado doce puntos y la cabecera se
   * leia torcida. El papel sobresale hacia la izquierda, que es lo que hace que se lea como una
   * pastilla que abraza al texto y no como un bloque desalineado.
   */
  greeting: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.sm,
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: Space.xs,
    marginLeft: -Space.md,
    // Con el nombre de un espacio largo dentro, la pastilla no puede empujar a la racha fuera.
    maxWidth: '100%',
  },
  // `shrink` y no `flex: 1`: la pastilla sigue midiendo su contenido, y solo el nombre cede al truncar.
  spaceName: { flexShrink: 1 },
  dot: { width: DOT, height: DOT, borderRadius: Radius.pill },
});
