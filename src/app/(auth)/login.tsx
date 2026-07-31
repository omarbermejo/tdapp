import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormError } from '@/components/ui/form-error';
import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Stem } from '@/components/ui/stem';
import { Space, Type, useTheme } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

export default function LoginScreen() {
  const t = useTheme();
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
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <BackButton />

          <View style={styles.hero}>
            <Text style={[Type.display, { color: t.text }]}>Hola de nuevo.</Text>
            <Text style={[Type.body, { color: t.textMuted }]}>Entra y seguimos donde lo dejaste.</Text>
          </View>

          <Stem filled={[!!email, !!password]}>
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
          </Stem>

          <FormError message={error} />

          {/*
            Aqui y no abajo con los otros: queda justo debajo del "Correo o contraseña incorrectos",
            que es el instante exacto en que hace falta. Y `actions` no se convierte en tres botones
            apilados donde el CTA deja de destacar.
          */}
          <BigButton
            label="Olvidé mi contraseña"
            variant="ghost"
            onPress={() => router.push('/forgot')}
          />

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

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  content: {
    flexGrow: 1,
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.xl,
  },
  hero: { gap: Space.sm },
  spacer: { flex: 1 },
  actions: { gap: Space.md },
});
