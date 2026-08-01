import { StyleSheet, Text, View } from 'react-native';

import { AVATAR_NAMES, Avatar3D, Avatar3DSize, type Avatar3DName } from '@/components/ui/avatar3d';
import { Radius, Type, useAccent, useTheme } from '@/constants/theme';
import type { User } from '@/features/auth/api';

/**
 * El nombre guardado, si esta version de la app tiene esa cara.
 *
 * El servidor valida la FORMA (`memoji-07`) pero no el catalogo: las imagenes son assets del bundle
 * y alla no hay ninguna, asi que puede devolver una cara de una version mas nueva — o de una que ya
 * se quito. Aqui se comprueba contra lo que de verdad existe y lo demas cae al mismo sitio que null.
 * Es la misma tolerancia con la que `useAccent` cae al acento por defecto.
 */
export const avatarOf = (value?: string | null): Avatar3DName | null =>
  value && (AVATAR_NAMES as string[]).includes(value) ? (value as Avatar3DName) : null;

/**
 * La cara de la persona, con su respaldo.
 *
 * El respaldo — el circulo con la inicial sobre el tinte de su acento — se escribe UNA sola vez, y
 * eso es todo el motivo de que este componente exista: sin el, cada sitio que pinte un avatar
 * tendria que acordarse de que `avatar` puede ser null, y el primero que lo olvide pinta un hueco.
 *
 * Vive en `features/profile` y no en `components/ui` porque conoce `User`; `Avatar3D`, que solo sabe
 * de imagenes, si es de `ui`.
 */
export function ProfileAvatar({ user, size = Avatar3DSize.md }: { user: User; size?: number }) {
  const t = useTheme();
  const accent = useAccent(user.accentColor);
  const name = avatarOf(user.avatar);

  if (name) return <Avatar3D name={name} size={size} />;

  return (
    <View
      style={[
        styles.initial,
        { width: size, height: size, backgroundColor: accent.soft },
      ]}>
      {/* El tamaño de la letra sale del circulo: la inicial ocupa siempre la misma proporcion. */}
      <Text style={[Type.section, { color: t.text, fontSize: size * 0.4, lineHeight: size * 0.5 }]}>
        {user.name.trim().charAt(0).toUpperCase()}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  initial: { borderRadius: Radius.pill, alignItems: 'center', justifyContent: 'center' },
});
