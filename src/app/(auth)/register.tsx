import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { StepDots } from '@/components/ui/step-dots';
import { Stem } from '@/components/ui/stem';
import { Space, Theme, Type } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Solo credenciales. El perfil TDAH se pide en el onboarding, despues de verificar el correo:
 * pedirlo todo aqui era el camino corto a que nadie termine de registrarse.
 */
export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    setFields({});
    setLoading(true);
    try {
      // No navega: al quedar la sesion sin verificar, el guard del root salta al codigo.
      await signUp({ name, email, password });
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
      } else {
        setError('Algo salió mal');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <View style={styles.header}>
          <BackButton />
          <View style={styles.flex}>
            <StepDots total={2} current={0} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.hero}>
            <Text style={[Type.display, styles.title]}>Solo tres datos.</Text>
            <Text style={[Type.body, styles.subtitle]}>Lo demás lo ajustas después.</Text>
          </View>

          <Stem filled={[!!name, !!email, !!password]}>
            <BigField
              label="¿Cómo te llamamos?"
              value={name}
              onChangeText={setName}
              placeholder="Tu nombre"
              error={fields.name}
              autoComplete="given-name"
            />
            <BigField
              label="Correo"
              value={email}
              onChangeText={setEmail}
              placeholder="tu@correo.com"
              keyboardType="email-address"
              autoCapitalize="none"
              inputMode="email"
              autoComplete="email"
              error={fields.email}
            />
            <BigField
              label="Contraseña"
              value={password}
              onChangeText={setPassword}
              placeholder="Mínimo 8 caracteres"
              secureTextEntry
              autoComplete="new-password"
              onSubmitEditing={submit}
              returnKeyType="go"
              error={fields.password}
            />
          </Stem>

          {!!error && <Text style={[Type.hint, styles.error]}>{error}</Text>}

          <View style={styles.spacer} />

          <View style={styles.actions}>
            <BigButton label="Crear mi cuenta" loading={loading} onPress={submit} />
            <BigButton
              label="Ya tengo cuenta"
              variant="ghost"
              onPress={() => router.replace('/login')}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Theme.canvas },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
  },
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
  spacer: { flex: 1 },
  actions: { gap: Space.md },
  error: { color: Theme.danger },
});
