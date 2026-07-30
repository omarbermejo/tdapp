import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { Accents, Radius, Space, Theme, Touch, Type } from '@/constants/theme';
import { useGoogleSignIn } from '@/features/auth/use-google-sign-in';

export default function WelcomeScreen() {
  const google = useGoogleSignIn();

  return (
    <SafeAreaView style={styles.screen}>
      {/* Unica forma decorativa: un tinte del acento para que el papel no quede plano. */}
      <View pointerEvents="none" style={styles.tint} />

      <View style={styles.hero}>
        <View style={styles.badge}>
          <Text style={styles.badgeEmoji}>🧠</Text>
        </View>
        <Text style={[Type.display, styles.title]}>Tu cabeza va rápido.</Text>
        <Text style={[Type.display, styles.titleAccent]}>Aquí no se pierde.</Text>
        <Text style={[Type.body, styles.subtitle]}>
          Tareas cortas, recordatorios que sí funcionan y cero formularios eternos.
        </Text>
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
          />
        )}
        {!!google.error && <Text style={[Type.hint, styles.error]}>⚠︎ {google.error}</Text>}
        <BigButton label="Ya tengo cuenta" variant="ghost" onPress={() => router.push('/login')} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Theme.canvas,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.lg,
    gap: Space.xl,
  },
  tint: {
    position: 'absolute',
    top: -Space.huge,
    right: -Space.huge,
    width: 240,
    height: 240,
    borderRadius: Radius.xl,
    backgroundColor: Accents.olive.soft,
  },
  hero: { flex: 1, justifyContent: 'center', gap: Space.xs },
  badge: {
    width: Touch.input,
    height: Touch.input,
    borderRadius: Radius.pill,
    backgroundColor: Accents.olive.soft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Space.lg,
  },
  badgeEmoji: { fontSize: 28 },
  title: { color: Theme.text },
  titleAccent: { color: Accents.olive.solid },
  subtitle: { color: Theme.textMuted, marginTop: Space.md },
  actions: { gap: Space.md },
  error: { color: Theme.danger },
});
