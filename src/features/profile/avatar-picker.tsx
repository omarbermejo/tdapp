import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  interpolateColor,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { AVATAR_NAMES, Avatar3D, type Avatar3DName } from '@/components/ui/avatar3d';
import { Micro } from '@/components/ui/card';
import { FormError } from '@/components/ui/form-error';
import {
  Motion,
  Radius,
  Space,
  Type,
  useAccent,
  useTheme,
  type Accent,
} from '@/constants/theme';
import { ApiError, type User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { usePressScale } from '@/hooks/use-press-scale';

import { avatarOf } from './avatar';

/**
 * Cuatro por fila, y el ancho sale del hueco disponible en vez de un tamaño en puntos.
 *
 * Con celdas fijas de `Avatar3DSize.lg` solo entraban tres — la tarjeta se come 48pt de padding — y
 * cuarenta y cinco caras en tres columnas son quince filas de scroll para una decision de un toque.
 * A cuatro, la celda cae a unos 64pt: sigue muy por encima del objetivo tactil minimo y la cara se
 * reconoce igual.
 */
const COLUMNS = 4;
const BASIS = `${100 / COLUMNS - 2}%` as const;

/**
 * Una cara elegible.
 *
 * El borde se queda en 2pt siempre y solo cambia de color, como en `Choice`: animar el grosor movia
 * el contenido un pixel en cada toque.
 */
function Face({
  on,
  tint,
  onPress,
  label,
  children,
}: {
  on: boolean;
  tint: Accent;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const t = useTheme();
  const press = usePressScale({ to: 0.94 });
  const chosen = useSharedValue(on ? 1 : 0);

  useEffect(() => {
    // .set() y no .value =: el compilador de React trata el shared value como inmutable.
    chosen.set(withSpring(on ? 1 : 0, Motion.confirm));
  }, [chosen, on]);

  const skin = useAnimatedStyle(
    () => ({
      backgroundColor: interpolateColor(chosen.get(), [0, 1], [t.sunken, tint.soft]),
      borderColor: interpolateColor(chosen.get(), [0, 1], ['transparent', tint.ink]),
    }),
    [t.sunken, tint.soft, tint.ink]
  );

  return (
    <Animated.View style={[styles.slot, press.style]}>
      <Animated.View style={[styles.cell, skin]}>
        <Pressable
          accessibilityRole="radio"
          accessibilityState={{ checked: on }}
          accessibilityLabel={label}
          onPress={onPress}
          onPressIn={press.onPressIn}
          onPressOut={press.onPressOut}
          style={styles.touch}>
          {children}
        </Pressable>
      </Animated.View>
    </Animated.View>
  );
}

/**
 * Elegir cara.
 *
 * Guarda AL TOQUE y sin boton: `updateProfile` es optimista, asi que la confirmacion es que la cara
 * de la cabecera cambia en el mismo frame — un "Guardar" debajo pediria confirmar algo que ya se
 * esta viendo. Es el mismo criterio con el que el color y la energia se guardan al tocarlos.
 *
 * Rejilla con `flexWrap` y no una `FlatList`: son 45 celdas dentro de un ScrollView que ya existe, y
 * anidar una lista vertical dentro de otra rompe el scroll y la virtualizacion no gana nada a esta
 * escala.
 */
export function AvatarPicker({ user }: { user: User }) {
  const { updateProfile } = useAuth();
  const t = useTheme();
  const tint = useAccent(user.accentColor);
  const [problem, setProblem] = useState('');

  const current = avatarOf(user.avatar);

  const choose = async (avatar: Avatar3DName | null) => {
    setProblem('');
    try {
      await updateProfile({ avatar });
    } catch (e) {
      setProblem(e instanceof ApiError ? e.message : 'No se guardó. Se quedó como estaba.');
    }
  };

  return (
    <View style={styles.block}>
      <Micro>Tu cara</Micro>
      <Text style={[Type.hint, { color: t.textMuted }]}>
        Toca la que quieras. Se guarda sola.
      </Text>

      <View style={styles.grid}>
        {/*
          "Sin cara" va PRIMERO y no al final: quitarse la foto tiene que ser tan facil de encontrar
          como ponersela, y buscarla al fondo de cuarenta y cinco caras no lo es.
        */}
        <Face on={!current} tint={tint} onPress={() => choose(null)} label="Sin foto, usar mi inicial">
          <Text style={[Type.section, { color: t.textMuted }]}>
            {user.name.trim().charAt(0).toUpperCase()}
          </Text>
        </Face>

        {AVATAR_NAMES.map((name, i) => (
          <Face
            key={name}
            on={current === name}
            tint={tint}
            onPress={() => choose(name)}
            label={`Avatar ${i + 1}`}>
            {/* En proporcion y no en puntos: la celda ya no mide lo mismo en todos los telefonos. */}
            <Avatar3D name={name} style={styles.face} />
          </Face>
        ))}
      </View>

      <FormError message={problem} />
    </View>
  );
}

const styles = StyleSheet.create({
  block: { gap: Space.sm },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm, paddingTop: Space.xs },
  // El hueco manda el ancho y `aspectRatio` iguala el alto: la rejilla se adapta sola de un SE a un
  // Max sin un solo tamaño escrito a mano. Sin `flexGrow`: con el, las dos celdas sobrantes de la
  // ultima fila se repartian todo el ancho y salian del doble de grandes que el resto.
  slot: { flexBasis: BASIS, aspectRatio: 1 },
  cell: {
    flex: 1,
    borderRadius: Radius.md,
    borderWidth: 2,
    overflow: 'hidden',
  },
  touch: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Deja un margen dentro de la celda para que el borde de elegido no toque el pelo.
  face: { width: '86%', height: '86%' },
});
