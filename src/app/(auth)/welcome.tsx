import { router } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { Accents, Brand, Radius, Type } from '@/constants/brand';
import { useGoogleSignIn } from '@/features/auth/use-google-sign-in';

export default function WelcomeScreen() {
  const google = useGoogleSignIn();

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.hero}>
        <View style={styles.badge}>
          <Text style={styles.badgeEmoji}>🧠</Text>
        </View>
        <Text style={[Type.hero, styles.title]}>Tu cabeza va{'\n'}rápido.</Text>
        <Text style={[Type.hero, styles.titleAccent]}>Aquí no{'\n'}se pierde.</Text>
        <Text style={[Type.body, styles.subtitle]}>
          Tareas cortas, recordatorios que sí funcionan y cero formularios eternos.
        </Text>
      </View>

      <View style={styles.actions}>
        <BigButton label="Crear mi cuenta" accent="lime" onPress={() => router.push('/register')} />
        {/* Un solo boton para Google: si el correo es nuevo crea la cuenta, si ya existe entra. */}
        {google.available && (
          <BigButton
            label="Continuar con Google"
            variant="outline"
            accent="turquoise"
            loading={google.loading}
            onPress={google.signIn}
          />
        )}
        {!!google.error && <Text style={[Type.hint, styles.error]}>⚠︎ {google.error}</Text>}
        <BigButton
          label="Ya tengo cuenta"
          variant="ghost"
          accent="electric"
          onPress={() => router.push('/login')}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.ink, paddingHorizontal: 24, paddingBottom: 16 },
  hero: { flex: 1, justifyContent: 'center', gap: 4 },
  badge: {
    width: 88,
    height: 88,
    borderRadius: Radius.lg,
    backgroundColor: Accents.electric,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 24,
  },
  badgeEmoji: { fontSize: 48 },
  title: { color: Brand.text },
  titleAccent: { color: Accents.lime },
  subtitle: { color: Brand.textMute, marginTop: 20 },
  actions: { gap: 14 },
  error: { color: Brand.danger },
});
