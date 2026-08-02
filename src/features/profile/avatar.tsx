import { StyleSheet, Text, View } from 'react-native';

import { AVATAR_NAMES, Avatar3D, Avatar3DSize, type Avatar3DName } from '@/components/ui/avatar3d';
import { Radius, Type, useAccent, useTheme } from '@/constants/theme';
import type { AccentName } from '@/constants/theme';

/**
 * Lo minimo para pintar una cara. `User` y `Member` lo cumplen los dos, y por eso el prop es esto y no
 * `User`: la lista de miembros de un espacio trae `toPublicMember` —id, nombre, avatar y acento— y
 * pedirle un `User` entero obligaria a inventarle un correo y una fecha de nacimiento que no tiene.
 */
type Face = { name: string; avatar?: string | null; accentColor: AccentName };

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
export function ProfileAvatar({
  user,
  size = Avatar3DSize.md,
  bg,
}: {
  user: Face;
  size?: number;
  /**
   * El relleno del respaldo, cuando `accent.soft` no vale.
   *
   * Existe por un sitio concreto: la pestaña de Perfil de la barra. Ahi el resaltado de la pestaña
   * activa YA es `accent.soft`, asi que una inicial sobre ese mismo tinte desaparece justo cuando
   * esta seleccionada. Es un parche de contraste, no una perilla de estilo — por eso no acepta el
   * acento entero, solo el color de fondo.
   */
  bg?: string;
}) {
  const t = useTheme();
  const accent = useAccent(user.accentColor);
  const name = avatarOf(user.avatar);

  if (name) return <Avatar3D name={name} size={size} />;

  return (
    <View
      style={[
        styles.initial,
        { width: size, height: size, backgroundColor: bg ?? accent.soft },
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
