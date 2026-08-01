import { Image, type ImageStyle } from 'expo-image';
import type { StyleProp } from 'react-native';

/**
 * Los avatares 3D del onboarding.
 *
 * GENERADO por `scripts/build-avatars.mjs` — no editar a mano. Salen de la lamina de Figma
 * (Free 3D Memoji Avatars Pack, Community) troceada por ese script.
 *
 * Van sin tintar, al reves que los de `icon3d.tsx`. Alli el color era cromo de marca y se horneaba
 * al verde; aqui el color ES el contenido, porque el tono de piel y el del pelo son justo lo que hace
 * que uno se elija sobre otro. Por eso tampoco llevan `tintColor` ni variante clara/oscura.
 *
 * Los nombres son posicionales, en el orden en que estan en la lamina. No hay nada que nombrar: son
 * caras, no conceptos, y numerarlas evita inventarles una identidad que el set no les da.
 */

const AVATARS = {
  'memoji-01': require('@/assets/avatars/memoji-01.webp'),
  'memoji-02': require('@/assets/avatars/memoji-02.webp'),
  'memoji-03': require('@/assets/avatars/memoji-03.webp'),
  'memoji-04': require('@/assets/avatars/memoji-04.webp'),
  'memoji-05': require('@/assets/avatars/memoji-05.webp'),
  'memoji-06': require('@/assets/avatars/memoji-06.webp'),
  'memoji-07': require('@/assets/avatars/memoji-07.webp'),
  'memoji-08': require('@/assets/avatars/memoji-08.webp'),
  'memoji-09': require('@/assets/avatars/memoji-09.webp'),
  'memoji-10': require('@/assets/avatars/memoji-10.webp'),
  'memoji-11': require('@/assets/avatars/memoji-11.webp'),
  'memoji-12': require('@/assets/avatars/memoji-12.webp'),
  'memoji-13': require('@/assets/avatars/memoji-13.webp'),
  'memoji-14': require('@/assets/avatars/memoji-14.webp'),
  'memoji-15': require('@/assets/avatars/memoji-15.webp'),
  'memoji-16': require('@/assets/avatars/memoji-16.webp'),
  'memoji-17': require('@/assets/avatars/memoji-17.webp'),
  'memoji-18': require('@/assets/avatars/memoji-18.webp'),
  'memoji-19': require('@/assets/avatars/memoji-19.webp'),
  'memoji-20': require('@/assets/avatars/memoji-20.webp'),
  'memoji-21': require('@/assets/avatars/memoji-21.webp'),
  'memoji-22': require('@/assets/avatars/memoji-22.webp'),
  'memoji-23': require('@/assets/avatars/memoji-23.webp'),
  'memoji-24': require('@/assets/avatars/memoji-24.webp'),
  'memoji-25': require('@/assets/avatars/memoji-25.webp'),
  'memoji-26': require('@/assets/avatars/memoji-26.webp'),
  'memoji-27': require('@/assets/avatars/memoji-27.webp'),
  'memoji-28': require('@/assets/avatars/memoji-28.webp'),
  'memoji-29': require('@/assets/avatars/memoji-29.webp'),
  'memoji-30': require('@/assets/avatars/memoji-30.webp'),
  'memoji-31': require('@/assets/avatars/memoji-31.webp'),
  'memoji-32': require('@/assets/avatars/memoji-32.webp'),
  'memoji-33': require('@/assets/avatars/memoji-33.webp'),
  'memoji-34': require('@/assets/avatars/memoji-34.webp'),
  'memoji-35': require('@/assets/avatars/memoji-35.webp'),
  'memoji-36': require('@/assets/avatars/memoji-36.webp'),
  'memoji-37': require('@/assets/avatars/memoji-37.webp'),
  'memoji-38': require('@/assets/avatars/memoji-38.webp'),
  'memoji-39': require('@/assets/avatars/memoji-39.webp'),
  'memoji-40': require('@/assets/avatars/memoji-40.webp'),
  'memoji-41': require('@/assets/avatars/memoji-41.webp'),
  'memoji-42': require('@/assets/avatars/memoji-42.webp'),
  'memoji-43': require('@/assets/avatars/memoji-43.webp'),
  'memoji-44': require('@/assets/avatars/memoji-44.webp'),
  'memoji-45': require('@/assets/avatars/memoji-45.webp'),
} as const;

export type Avatar3DName = keyof typeof AVATARS;

/** Todos, en el orden de la lamina. Es lo que pinta la cuadricula del onboarding. */
export const AVATAR_NAMES = Object.keys(AVATARS) as Avatar3DName[];

/**
 * Los tamaños del sistema. `sm` es el de una fila o un comentario, `md` el de la cabecera de
 * perfil, `lg` el de la celda del selector y `hero` el de la confirmacion en el onboarding.
 */
export const Avatar3DSize = { sm: 32, md: 44, lg: 72, hero: 128 } as const;

export function Avatar3D({
  name,
  size = Avatar3DSize.lg,
  style,
}: {
  name: Avatar3DName;
  size?: number;
  style?: StyleProp<ImageStyle>;
}) {
  return (
    <Image
      source={AVATARS[name]}
      style={[{ width: size, height: size }, style]}
      contentFit="contain"
      // Quien lo pinta sabe de quien es la cara; el archivo no. La etiqueta la pone el sitio de uso.
      accessible={false}
    />
  );
}
