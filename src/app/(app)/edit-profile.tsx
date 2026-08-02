import { StyleSheet, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { Card } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatusVeil, useScrollVeil } from '@/components/ui/status-veil';
import { Space, useTheme } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { AvatarPicker } from '@/features/profile/avatar-picker';
import { ProfileFields } from '@/features/profile/profile-fields';
import { useAvatars } from '@/features/profile/use-avatars';
import { useLocalToday } from '@/features/tasks/day';
import { useScreenPadding } from '@/hooks/use-screen-padding';

/**
 * Editar perfil: la cara y las seis respuestas del onboarding.
 *
 * No hay boton de guardar en ninguna parte, y es la misma decision en las dos mitades: `updateProfile`
 * mergea por campo y es optimista, asi que la confirmacion de cada cambio es verlo puesto. Un
 * "Guardar" al final pediria confirmar algo que ya esta hecho — y convertiria una correccion de tres
 * segundos en un formulario.
 *
 * Por eso tambien es un push y no una hoja: sin borrador que descartar, el gesto de arrastrar hacia
 * abajo no significaria "cancelar" nada, y ademas pelearia con el scroll de la rejilla de caras.
 */
export default function EditProfileScreen() {
  const { user } = useAuth();
  const t = useTheme();
  const veil = useScrollVeil();
  const today = useLocalToday();
  const avatars = useAvatars(today);
  // `Space.breath` y no `TAB_DOCK`: fuera de las pestañas la capsula flotante no se pinta.
  const pad = useScreenPadding(Space.breath);

  // El guard va DESPUES de los hooks: ver el mismo comentario en el perfil.
  if (!user) return null;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.ScrollView
        {...veil.scrollProps}
        contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
        showsVerticalScrollIndicator={false}>
        <ScreenHeader back title="Editar perfil" />

        <Card>
          <AvatarPicker user={user} avatars={avatars} />
        </Card>

        <ProfileFields user={user} />
      </Animated.ScrollView>

      <StatusVeil scrollY={veil.scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Space.xl, gap: Space.xl },
});
