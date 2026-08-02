import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { AccentPicker } from '@/components/ui/accent-picker';
import { Card, Micro } from '@/components/ui/card';
import { ScreenHeader } from '@/components/ui/screen-header';
import { StatusVeil, useScrollVeil } from '@/components/ui/status-veil';
import { Space, Type, useTheme, type AccentName } from '@/constants/theme';
import { useAuth } from '@/features/auth/auth-context';
import { AvatarPicker } from '@/features/profile/avatar-picker';
import { useAvatars } from '@/features/profile/use-avatars';
import { useLocalToday } from '@/features/tasks/day';
import { useScreenPadding } from '@/hooks/use-screen-padding';

/**
 * Cómo te ves: la cara y el color. Nada más.
 *
 * Antes esto era "Editar perfil" y hospedaba además el acordeón de cinco paneles del onboarding —
 * a qué hora te avisa, cuándo rindes, tus focos, tu fecha de nacimiento. Eso se fue a Ajustes,
 * porque dice cómo se COMPORTA la app, no cómo se ve.
 *
 * Los dos que se quedan son la misma decisión física, y por eso tienen que estar a la vista a la
 * vez: el respaldo del avatar se pinta con `accent.soft` y el aro de la cara elegida con `tint.ink`
 * (ver `avatar-picker`), así que **elegir el color repinta la rejilla de caras que tienes delante**.
 * Vivían a cuatrocientos píxeles de scroll una de otra.
 *
 * La cara va primero: el lápiz sobre la persona promete una cara, y meterla debajo del color sería
 * un cebo. El color va segundo porque su confirmación es que la pantalla ENTERA se repinta — no
 * necesita estar en el viewport para que se note.
 *
 * No hay botón de guardar: `updateProfile` mergea por campo y es optimista, así que la confirmación
 * de cada cambio es verlo puesto. Por eso también es un push y no una hoja — sin borrador que
 * descartar, arrastrar hacia abajo no significaría "cancelar" nada.
 */
export default function EditProfileScreen() {
  const { user, updateProfile } = useAuth();
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
      {/*
        El teclado del campo hex tapaba la seccion entera del color, que es el ultimo bloque de la
        pantalla. El KAV envuelve SOLO al scroll y el velo se queda FUERA: la regla de AGENTS.md pide
        que el velo no sea hijo del scroll —para que no se vaya con la pagina— y eso se cumple igual,
        porque `styles.veil` es absolute contra esta raiz y el KAV encogiendose por debajo no lo mueve.
      */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.screen}>
        <Animated.ScrollView
          {...veil.scrollProps}
          contentContainerStyle={[styles.content, { paddingTop: pad.top, paddingBottom: pad.bottom }]}
          /*
            El primer toque tiene que ELEGIR el color, no solo cerrar el teclado: sin esto, pasar de
            un hex tecleado a una muestra del catalogo cuesta dos toques.
          */
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          showsVerticalScrollIndicator={false}>
          <ScreenHeader back title="Cómo te ves" />

          <Card>
            <Micro>Tu cara</Micro>
            <AvatarPicker user={user} avatars={avatars} />
          </Card>

          <Card>
            <Micro>Tu color</Micro>
            <Text style={[Type.hint, { color: t.textMuted }]}>
              Pinta la app entera, y también tu inicial.
            </Text>
            <AccentPicker
              value={user.accentColor}
              onChange={(value: AccentName) => void updateProfile({ accentColor: value })}
            />
          </Card>
        </Animated.ScrollView>
      </KeyboardAvoidingView>

      <StatusVeil scrollY={veil.scrollY} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Space.xl, gap: Space.xl },
});
