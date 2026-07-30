import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Brand, Type } from '@/constants/brand';
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
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Text style={[Type.hero, styles.title]}>Hola de{'\n'}nuevo 👋</Text>

          <View style={styles.form}>
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
            {!!error && <Text style={[Type.hint, styles.error]}>⚠︎ {error}</Text>}
          </View>

          <View style={styles.actions}>
            <BigButton label="Entrar" accent="lime" loading={loading} onPress={submit} />
            <BigButton
              label="No tengo cuenta"
              variant="ghost"
              accent="electric"
              onPress={() => router.replace('/register')}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.ink },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 24, gap: 32, justifyContent: 'center' },
  title: { color: Brand.text },
  form: { gap: 20 },
  actions: { gap: 10 },
  error: { color: Brand.danger },
});
