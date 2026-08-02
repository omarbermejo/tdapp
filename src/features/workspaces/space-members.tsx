import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Avatar3DSize } from '@/components/ui/avatar3d';
import { Radius, Space, Type, useTheme } from '@/constants/theme';
import type { Member } from '@/features/auth/api';
import { ProfileAvatar } from '@/features/profile/avatar';
import type { SpaceRef } from '@/features/workspaces/active-space';
import { usePressScale } from '@/hooks/use-press-scale';

import { useMembers } from './use-members';

/** Una cara. `sm` (32) es el piso donde un memoji todavia se reconoce. */
const FACE = Avatar3DSize.sm;

/**
 * El anillo que separa una cara de la de atras.
 *
 * No es un borde: es un recorte falso del papel de detras, asi que se pinta con el color del FONDO de
 * la pantalla y no con `t.line`. Un hairline de verdad ahi dibujaria la silueta de cada cabeza.
 */
const RING = 2;
const OUTER = FACE + RING * 2;

/** Cuantas caras antes del "+N". Cuatro cubren el caso real y no empujan a la racha. */
const SHOWN = 4;

/**
 * Quien mas esta en este espacio, como pila de caras solapadas a la mitad.
 *
 * Ocupa el sitio donde vivia la pastilla del espacio en el inicio. Puede porque el NOMBRE del espacio
 * se mudo al saludo de arriba: aqui ya no hace falta repetirlo, y lo que queda por decir de un espacio
 * compartido es con quien lo compartes.
 *
 * **Con una sola persona no se pinta nada.** Tu propia cara sola, en el hueco donde antes estaba el
 * nombre del espacio, no informa de nada — un espacio de una persona no tiene colaboradores que
 * enseñar, y el saludo ya dice en cual estas.
 *
 * Toca y abre el DETALLE del espacio, no el selector: el selector ya vive en el saludo, un centimetro
 * mas arriba, y dos disparadores de la misma hoja pegados serian el mismo boton dos veces. El detalle
 * es ademas donde de verdad se ve el reparto por persona.
 */
export function SpaceMembers({ space }: { space: SpaceRef | null }) {
  const members = useMembers(space?.id);
  const press = usePressScale({ to: 0.96 });

  // Despues de los hooks. Una sola persona es un espacio sin nadie con quien compartirlo.
  if (!space || members.length < 2) return null;

  const shown = members.slice(0, SHOWN);
  const rest = members.length - shown.length;

  return (
    <Animated.View style={[styles.slot, press.style]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={label(members)}
        accessibilityHint="Abre el espacio"
        onPress={() => router.push(`/workspace/${space.id}`)}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        hitSlop={Space.sm}
        style={styles.row}>
        {shown.map((person, i) => (
          <Face
            key={person.id}
            person={person}
            // La primera cara queda ENCIMA de la segunda y asi hacia atras. Al reves —el orden natural
            // de pintado en React Native— la pila se lee de derecha a izquierda y el ojo empieza por
            // la ultima persona que entro.
            depth={shown.length - i}
            first={i === 0}
          />
        ))}
        {rest > 0 && <More count={rest} />}
      </Pressable>
    </Animated.View>
  );
}

/** "Ana, Beto y 3 más". Es la unica etiqueta: las caras van con `accessible={false}`. */
const label = (members: Member[]) => {
  const names = members.slice(0, 2).map((m) => m.name.trim().split(/\s+/)[0]);
  const rest = members.length - names.length;
  const quienes = names.join(', ');
  return rest > 0 ? `${quienes} y ${rest} más` : `${quienes}. Están en este espacio`;
};

/** Aparte porque cada cara necesita su propio `useTheme` para el anillo. */
function Face({ person, depth, first }: { person: Member; depth: number; first: boolean }) {
  const t = useTheme();

  return (
    <View
      style={[
        styles.face,
        { backgroundColor: t.canvas, zIndex: depth },
        // Solo desde la segunda: la primera arranca en su sitio o la pila nace corrida hacia dentro.
        !first && styles.tucked,
      ]}>
      {/*
        `t.sunken` como respaldo y no el acento de la persona, que es lo que `ProfileAvatar` pinta por
        su cuenta: en una pila, dos personas con el mismo acento darian dos circulos del mismo color y
        la inicial seria lo unico que las distingue. Aqui lo que separa es el anillo, no el relleno.
      */}
      <View style={[styles.crop, { backgroundColor: t.sunken }]}>
        <ProfileAvatar user={person} size={FACE} />
      </View>
    </View>
  );
}

/** Los que no caben. Mismo diametro que una cara para que la pila no cambie de altura. */
function More({ count }: { count: number }) {
  const t = useTheme();

  return (
    <View style={[styles.face, styles.tucked, { backgroundColor: t.canvas, zIndex: 0 }]}>
      <View style={[styles.crop, styles.more, { backgroundColor: t.sunken }]}>
        <Text style={[Type.micro, styles.moreLabel, { color: t.textMuted }]}>+{count}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  slot: { alignSelf: 'flex-start' },
  row: { flexDirection: 'row', alignItems: 'center' },
  face: {
    width: OUTER,
    height: OUTER,
    borderRadius: Radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /**
   * Cada cara tapa EXACTAMENTE media cara de la de atras.
   *
   * Se mide sobre la cara y no sobre la caja: `-OUTER / 2` parece lo mismo y no lo es, porque la caja
   * lleva el anillo de dos puntos por lado. Con eso quedaba visible algo mas de la mitad y la pila se
   * leia floja. Lo que hay que restar es el ancho de la caja menos media cara.
   */
  tucked: { marginLeft: -(OUTER - FACE / 2) },
  crop: {
    width: FACE,
    height: FACE,
    borderRadius: Radius.pill,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  more: { alignItems: 'center', justifyContent: 'center' },
  moreLabel: { letterSpacing: 0 },
});
