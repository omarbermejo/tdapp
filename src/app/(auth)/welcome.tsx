import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { Space, Type, useAccent, useTheme } from '@/constants/theme';
import { FormError } from '@/components/ui/form-error';
import { AppleButton } from '@/features/auth/apple-button';
import { useGoogleSignIn } from '@/features/auth/use-google-sign-in';

/** Proporcion del viewBox del sticker: escala por ancho sin deformarse. */
const STICKER_RATIO = 139 / 129;

/**
 * Entrada de la app. El ritmo es el del diseño de referencia:
 * marca arriba, titular pegado a ella, el hueco lo llena la ilustracion,
 * y las acciones ancladas abajo con un solo boton oscuro.
 */
export default function WelcomeScreen() {
  const t = useTheme();
  const olive = useAccent();
  const google = useGoogleSignIn();

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]}>
      <View style={styles.hero}>
        <Text style={[Type.display, { color: t.text }]}>Tu cabeza va rápido.</Text>
        <Text style={[Type.display, { color: olive.ink }]}>Aquí no se pierde.</Text>
        <Text style={[Type.body, { color: t.textMuted, marginTop: Space.md }]}>
          Tareas cortas, recordatorios que sí funcionan y cero formularios eternos.
        </Text>
      </View>

      {/* Sin la ilustracion aqui la pantalla se parte en dos: titular arriba, botones abajo, vacio en medio. */}
      <View style={styles.stage}>
        <Image
          source={require('@/assets/stickers/tangle.svg')}
          style={styles.sticker}
          contentFit="contain"
          accessible={false}
        />
      </View>

      <View style={styles.actions}>
        <BigButton label="Crear mi cuenta" onPress={() => router.push('/register')} />
        {/* Un solo boton para Google: si el correo es nuevo crea la cuenta, si ya existe entra. */}
        {google.available && (
          <BigButton
            label="Continuar con Google"
            variant="outline"
            loading={google.loading}
            onPress={google.signIn}
            icon={
              <Image
                source={require('@/assets/icons/google.svg')}
                style={styles.providerIcon}
                contentFit="contain"
                accessible={false}
              />
            }
          />
        )}
        <AppleButton />

        {/* Los errores de proveedor van juntos y debajo de ambos botones: entre uno y otro
            parecian pertenecer al de abajo y empujaban la pila al aparecer. */}
        <FormError message={google.error} />

        <BigButton label="Ya tengo cuenta" variant="ghost" onPress={() => router.push('/login')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
  },
  hero: { marginTop: Space.huge },
  stage: { flex: 1, alignItems: 'center', justifyContent: 'center', marginVertical: Space.lg },
  sticker: { width: '64%', aspectRatio: STICKER_RATIO },
  providerIcon: { width: 20, height: 20 },
  actions: { gap: Space.md },
});
