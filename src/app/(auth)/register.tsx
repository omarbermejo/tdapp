import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Choice } from '@/components/ui/choice';
import { StepDots } from '@/components/ui/step-dots';
import { AccentName, Brand, Type } from '@/constants/brand';
import { ApiError, type RegisterInput } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import {
  ACCENT_COLOR,
  DIAGNOSIS,
  FOCUS_AREAS,
  PEAK_ENERGY,
  REMINDER_STYLE,
  TREATMENT,
} from '@/features/auth/options';

const STEPS = 3;

/**
 * Registro en 3 pasos. Solo el primero es obligatorio: el resto se puede saltar
 * y el backend rellena con defaults. Un formulario largo de golpe es abandono seguro.
 */
export default function RegisterScreen() {
  const { signUp } = useAuth();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});

  const [form, setForm] = useState<RegisterInput>({
    name: '',
    email: '',
    password: '',
    birthYear: null,
    diagnosis: 'undisclosed',
    treatment: 'undisclosed',
    focusAreas: [],
    peakEnergy: 'varies',
    reminderStyle: 'firm',
    accentColor: 'electric',
  });

  const accent = form.accentColor as AccentName;
  const set = <K extends keyof RegisterInput>(key: K, value: RegisterInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const submit = async () => {
    setError('');
    setFields({});
    setLoading(true);
    try {
      await signUp(form);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message);
        setFields(e.fields);
        if (Object.keys(e.fields).length) setStep(0);
      } else {
        setError('Algo salió mal');
      }
    } finally {
      setLoading(false);
    }
  };

  const next = () => (step === STEPS - 1 ? submit() : setStep(step + 1));
  const back = () => (step === 0 ? router.back() : setStep(step - 1));

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <View style={styles.header}>
          <Pressable onPress={back} hitSlop={16} accessibilityRole="button" accessibilityLabel="Atrás">
            <Text style={styles.back}>←</Text>
          </Pressable>
          <StepDots total={STEPS} current={step} accent={accent} />
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <Text style={[Type.title, styles.title]}>Empecemos{'\n'}por lo básico</Text>
              <BigField
                label="¿Cómo te llamamos?"
                value={form.name}
                onChangeText={(v) => set('name', v)}
                placeholder="Tu nombre"
                accent={accent}
                error={fields.name}
                autoComplete="given-name"
              />
              <BigField
                label="Correo"
                value={form.email}
                onChangeText={(v) => set('email', v)}
                placeholder="tu@correo.com"
                keyboardType="email-address"
                autoCapitalize="none"
                inputMode="email"
                autoComplete="email"
                accent={accent}
                error={fields.email}
              />
              <BigField
                label="Contraseña"
                value={form.password}
                onChangeText={(v) => set('password', v)}
                placeholder="Mínimo 8 caracteres"
                secureTextEntry
                autoComplete="new-password"
                accent={accent}
                error={fields.password}
              />
            </>
          )}

          {step === 1 && (
            <>
              <Text style={[Type.title, styles.title]}>Cuéntanos{'\n'}de ti</Text>
              <Text style={[Type.hint, styles.skipHint]}>Todo esto es opcional. Puedes saltarlo.</Text>
              <Choice
                label="Tu TDAH es de tipo…"
                options={DIAGNOSIS}
                value={form.diagnosis!}
                onChange={(v) => set('diagnosis', v)}
                accent={accent}
              />
              <Choice
                label="¿Llevas algún tratamiento?"
                options={TREATMENT}
                value={form.treatment!}
                onChange={(v) => set('treatment', v)}
                accent={accent}
              />
              <BigField
                label="Año de nacimiento"
                value={form.birthYear ? String(form.birthYear) : ''}
                onChangeText={(v) => set('birthYear', v ? Number(v.replace(/\D/g, '')) : null)}
                placeholder="1995"
                keyboardType="number-pad"
                maxLength={4}
                accent={accent}
                error={fields.birthYear}
              />
            </>
          )}

          {step === 2 && (
            <>
              <Text style={[Type.title, styles.title]}>¿En qué{'\n'}te ayudamos?</Text>
              <Choice
                label="Tus focos"
                hint="Máximo 3. Menos focos, más resultados."
                options={FOCUS_AREAS}
                value={form.focusAreas!}
                onChange={(v) => set('focusAreas', v)}
                max={3}
                accent={accent}
              />
              <Choice
                label="Rindes mejor en…"
                options={PEAK_ENERGY}
                value={form.peakEnergy!}
                onChange={(v) => set('peakEnergy', v)}
                accent={accent}
              />
              <Choice
                label="¿Cómo te recordamos las cosas?"
                options={REMINDER_STYLE}
                value={form.reminderStyle!}
                onChange={(v) => set('reminderStyle', v)}
                accent={accent}
              />
              <Choice
                label="Tu color"
                options={ACCENT_COLOR}
                value={form.accentColor!}
                onChange={(v) => set('accentColor', v)}
                accent={accent}
              />
            </>
          )}

          {!!error && <Text style={[Type.hint, styles.error]}>⚠︎ {error}</Text>}
        </ScrollView>

        <View style={styles.actions}>
          <BigButton
            label={step === STEPS - 1 ? 'Crear mi cuenta' : 'Siguiente'}
            accent={accent}
            loading={loading}
            onPress={next}
          />
          {step > 0 && step < STEPS - 1 && (
            <BigButton label="Saltar y crear cuenta" variant="ghost" accent={accent} onPress={submit} />
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Brand.ink },
  flex: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', gap: 20, paddingHorizontal: 24, paddingVertical: 12 },
  back: { color: Brand.text, fontSize: 32, fontWeight: '800', lineHeight: 36 },
  content: { paddingHorizontal: 24, paddingBottom: 24, gap: 24 },
  title: { color: Brand.text },
  skipHint: { color: Brand.textMute, marginTop: -16 },
  actions: { paddingHorizontal: 24, paddingBottom: 12, gap: 8 },
  error: { color: Brand.danger },
});
