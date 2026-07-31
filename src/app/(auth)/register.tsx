import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormError } from '@/components/ui/form-error';
import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { MIN_PASSWORD, PasswordMeter, strengthOf } from '@/components/ui/password-meter';
import { StepDots } from '@/components/ui/step-dots';
import { Stem } from '@/components/ui/stem';
import { Space, Type, useTheme } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

/**
 * Solo credenciales. El perfil TDAH se pide en el onboarding, despues de verificar el correo:
 * pedirlo todo aqui era el camino corto a que nadie termine de registrarse.
 */
export default function RegisterScreen() {
  const t = useTheme();
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const strength = strengthOf(password);
  const matches = !!repeat && repeat === password;

  const submit = async () => {
    setError('');
    setFields({});

    // Se valida aqui en vez de apagar el boton: un CTA apagado se lee como app roto, y
    // ademas el disabled deja la etiqueta en un contraste malisimo. Tocar siempre da razon.
    const local: Record<string, string> = {};
    if (!strength.valid) local.password = `Mínimo ${MIN_PASSWORD} caracteres`;
    // Que las dos coincidan es cosa nuestra: el API solo recibe una.
    if (password !== repeat) local.repeat = 'Las dos contraseñas tienen que ser iguales';
    if (Object.keys(local).length) return setFields(local);

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
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]}>
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
            <Text style={[Type.display, { color: t.text }]}>Solo tres datos.</Text>
            <Text style={[Type.body, { color: t.textMuted }]}>Lo demás lo ajustas después.</Text>
          </View>

          <Stem filled={[!!name, !!email, strength.valid, matches]}>
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
            <View style={styles.withMeter}>
              <BigField
                label="Contraseña"
                value={password}
                onChangeText={setPassword}
                placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
                secureTextEntry
                autoComplete="new-password"
                error={fields.password}
              />
              <PasswordMeter password={password} />
            </View>
            <BigField
              label="Repite la contraseña"
              value={repeat}
              onChangeText={setRepeat}
              placeholder="La misma de arriba"
              secureTextEntry
              autoComplete="new-password"
              onSubmitEditing={submit}
              returnKeyType="go"
              // El error aparece al escribir, no solo al mandar el formulario.
              error={fields.repeat ?? (repeat && !matches ? 'No coinciden' : undefined)}
            />
          </Stem>

          <FormError message={error} />

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
  screen: { flex: 1 },
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

  withMeter: { gap: Space.sm },

  spacer: { flex: 1 },
  actions: { gap: Space.md },
});
