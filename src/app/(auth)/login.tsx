import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Accents, Radius, Space, Theme, Type } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    setLoading(true);
    try {
      await signIn(email, password);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Algo salió mal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <BackButton />

          <View style={styles.hero}>
            <Text style={[Type.display, styles.title]}>Hola de nuevo.</Text>
            <Text style={[Type.body, styles.subtitle]}>Entra y seguimos donde lo dejaste.</Text>
          </View>

          {/*
            El tallo: una rama continua detras de los campos con un brote por campo.
            Cada brote se llena al escribir, asi que el formulario "crece" en vez de
            ser dos cajas suetas — la misma idea vegetal de la pantalla anterior.
          */}
          <View style={styles.branches}>
            <View style={styles.stem} pointerEvents="none" />

            <View style={styles.branch}>
              <View style={[styles.bud, !!email && styles.budOn]} />
              <View style={styles.flex}>
                <BigField
                  label="Correo"
                  value={email}
                  onChangeText={setEmail}
                  placeholder="tu@correo.com"
                  keyboardType="email-address"
                  autoCapitalize="none"
                  autoComplete="email"
                  inputMode="email"
                />
              </View>
            </View>

            <View style={styles.branch}>
              <View style={[styles.bud, !!password && styles.budOn]} />
              <View style={styles.flex}>
                <BigField
                  label="Contraseña"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="••••••••"
                  secureTextEntry
                  autoComplete="current-password"
                  onSubmitEditing={submit}
                  returnKeyType="go"
                />
              </View>
            </View>
          </View>

          {!!error && <Text style={[Type.hint, styles.error]}>{error}</Text>}

          <View style={styles.spacer} />

          <View style={styles.actions}>
            <BigButton label="Entrar" loading={loading} onPress={submit} />
            <BigButton
              label="No tengo cuenta"
              variant="ghost"
              onPress={() => router.replace('/register')}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const BUD = 12;

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.canvas },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.xl,
  },
  hero: { gap: Space.sm },
  title: { color: Theme.text },
  subtitle: { color: Theme.textMuted },

  branches: { gap: Space.lg },
  stem: {
    position: 'absolute',
    left: BUD / 2 - 1,
    top: BUD / 2 + 2,
    bottom: 0,
    width: 2,
    backgroundColor: Theme.line,
  },
  branch: { flexDirection: 'row', alignItems: 'flex-start', gap: Space.md },
  // El brote tapa el tallo: hueco mientras el campo esta vacio, macizo cuando ya hay algo.
  bud: {
    width: BUD,
    height: BUD,
    marginTop: 2,
    borderRadius: Radius.pill,
    borderWidth: 2,
    borderColor: Theme.line,
    backgroundColor: Theme.canvas,
  },
  budOn: { borderColor: Accents.olive.ink, backgroundColor: Accents.olive.ink },

  spacer: { flex: 1 },
  actions: { gap: Space.md },
  error: { color: Theme.danger },
});
