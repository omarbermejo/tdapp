import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type OtpInputRef } from 'react-native-otp-entry';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { CodeField } from '@/components/ui/code-field';
import { FormError } from '@/components/ui/form-error';
import { MIN_PASSWORD, PasswordMeter, strengthOf } from '@/components/ui/password-meter';
import { StepDots } from '@/components/ui/step-dots';
import { Space, Type, useAccent, useTheme } from '@/constants/theme';
import { ApiError, api } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';

/**
 * "Olvidé mi contraseña", en dos pasos y UNA sola ruta.
 *
 * El paso vive en estado local y no en dos rutas por tres razones, y la tercera es la que decide:
 *
 * 1. `POST /auth/reset` necesita `{email, code, password}` en una sola llamada, y "mándame otro
 *    código" necesita el correo otra vez. Con dos rutas ese correo viaja serializado por params y se
 *    vuelve a leer con `useLocalSearchParams` para las dos cosas.
 * 2. `verify.tsx` ya resolvió "pantalla de código sin historial" con un `ghost` de salida. Aquí es un
 *    `setStep('email')`, todavía más barato.
 * 3. Una ruta `/reset` propia sería alcanzable por deep link o por el gesto de atrás sin haber pedido
 *    código, y entonces es una pantalla pidiendo un código que no existe. Es el mismo argumento que
 *    escribió `profile-fields`: una superficie separada puede mentir sobre su estado; un paso local
 *    no, porque no hay nada que sincronizar.
 *
 * **Esta pantalla SÍ tiene botón sólido y `verify.tsx` no**, y no es una incoherencia: allí las
 * celdas son el CTA porque llenarlas es lo último que falta. Aquí después del código viene la
 * contraseña nueva, así que `onFilled` no puede mandar nada.
 */
export default function ForgotScreen() {
  const t = useTheme();
  const tint = useAccent().ink;
  const { resetPassword } = useAuth();
  const input = useRef<OtpInputRef>(null);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  /**
   * Pide el código. `api.forgot` se llama directo y no pasa por el contexto: no toca la sesión, y el
   * contexto existe para ser el único dueño de la sesión.
   *
   * El API contesta 202 exista la cuenta o no, así que aquí no hay nada que ramificar: se avanza
   * siempre. Lo que no se puede es decir "ese correo no tiene cuenta" — no lo sabemos.
   */
  const ask = async () => {
    setError('');
    setFields({});
    setLoading(true);
    try {
      await api.forgot(email);
      setSent(true);
      setStep('code');
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'No pudimos mandar el código');
    } finally {
      setLoading(false);
    }
  };

  const submit = async () => {
    setError('');
    setFields({});

    // Se valida aqui en vez de apagar el boton: un CTA apagado se lee como app roto. Misma
    // decision que en `register.tsx`, con el mismo mensaje.
    const local: Record<string, string> = {};
    if (code.length !== 6) local.code = 'Escribe los 6 dígitos';
    if (!strengthOf(password).valid) local.password = `Mínimo ${MIN_PASSWORD} caracteres`;
    if (Object.keys(local).length) return setFields(local);

    setLoading(true);
    try {
      // Devuelve sesion: el guard del root nos saca de aqui sin navegar. Y si la cuenta no estaba
      // verificada, el API la sella de paso — el codigo llego a ese buzon.
      await resetPassword(email, code, password);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
        // Un codigo rechazado se borra y se vuelve a enfocar, como en `verify.tsx`.
        if (e.fields.code) {
          setCode('');
          input.current?.clear();
          input.current?.focus();
        }
      } else {
        setError('Algo salió mal');
      }
    } finally {
      setLoading(false);
    }
  };

  const status = fields.code
    ? fields.code
    : loading
      ? 'Comprobando…'
      : sent
        ? 'Te mandamos un código. Vence en 10 minutos.'
        : 'Escribe los 6 dígitos que te llegaron.';

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <View style={styles.header}>
            {/* En el paso del codigo, atras es "escribi mal mi correo" y no salir de la pantalla. */}
            <BackButton onPress={step === 'code' ? () => setStep('email') : undefined} />
            <View style={styles.flex}>
              <StepDots total={2} current={step === 'email' ? 0 : 1} />
            </View>
          </View>

          {step === 'email' ? (
            <>
              <View style={styles.hero}>
                <Text style={[Type.display, { color: t.text }]}>¿Se te fue la contraseña?</Text>
                <Text style={[Type.body, { color: t.textMuted }]}>
                  Escribe tu correo y te mando un código para cambiarla.
                </Text>
              </View>

              <BigField
                label="Correo"
                value={email}
                onChangeText={setEmail}
                placeholder="tu@correo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                inputMode="email"
                onSubmitEditing={ask}
                returnKeyType="send"
                error={fields.email}
              />

              <FormError message={error} />
              <View style={styles.spacer} />

              <View style={styles.actions}>
                <BigButton label="Mándame el código" loading={loading} onPress={ask} />
              </View>
            </>
          ) : (
            <>
              <View style={styles.hero}>
                <Text style={[Type.display, { color: t.text }]}>Revisa tu correo.</Text>
                <Text style={[Type.display, { color: tint }]}>Ahí está tu código.</Text>
                <Text style={[Type.label, { color: t.text }]}>{email.trim().toLowerCase()}</Text>
                {/*
                  El API no dice si ese correo tiene cuenta ni si es de Google —decirlo permitiria
                  averiguar que correos existen preguntando uno a uno— asi que esta linea se le
                  muestra a todo el mundo igual, y es la que evita que alguien se quede esperando
                  un correo que nunca va a llegar.
                */}
                <Text style={[Type.hint, { color: t.textMuted }]}>
                  Si tienes cuenta con ese correo, ya va tu código. Si entras con Google o Apple no
                  necesitas contraseña: vuelve y usa ese botón.
                </Text>
              </View>

              <CodeField
                ref={input}
                onFilled={setCode}
                onType={() => {
                  if (fields.code) setFields((previous) => ({ ...previous, code: '' }));
                }}
                error={!!fields.code}
                disabled={loading}
              />

              <Text
                accessibilityLiveRegion="polite"
                style={[Type.hint, styles.status, { color: fields.code ? t.danger : t.textMuted }]}>
                {status}
              </Text>

              <View style={styles.withMeter}>
                <BigField
                  label="Tu contraseña nueva"
                  value={password}
                  onChangeText={setPassword}
                  placeholder={`Mínimo ${MIN_PASSWORD} caracteres`}
                  secureTextEntry
                  autoComplete="new-password"
                  autoCapitalize="none"
                  error={fields.password}
                />
                <PasswordMeter password={password} />
              </View>

              <FormError message={error} />
              <View style={styles.spacer} />

              <View style={styles.actions}>
                <BigButton label="Cambiar mi contraseña" loading={loading} onPress={submit} />
                <BigButton label="Mándame otro código" variant="outline" onPress={ask} />
              </View>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: Space.lg, paddingBottom: Space.xs },
  content: {
    flexGrow: 1,
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
    paddingBottom: Space.lg,
    gap: Space.xl,
  },
  hero: { gap: Space.sm },
  withMeter: { gap: Space.sm },
  // Alto fijo para dos lineas: el mensaje cambia sin mover el campo de abajo.
  status: { minHeight: 40 },
  spacer: { flex: 1 },
  actions: { gap: Space.md },
});
