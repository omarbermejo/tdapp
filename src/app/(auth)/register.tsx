import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Choice } from '@/components/ui/choice';
import { StepDots } from '@/components/ui/step-dots';
import { Radius, Shadow, Space, Theme, Touch, Type, type AccentName } from '@/constants/theme';
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
    accentColor: 'olive',
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
          <Pressable
            onPress={back}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Atrás"
            style={({ pressed }) => [styles.back, pressed && styles.pressed]}>
            <Text style={styles.backGlyph}>←</Text>
          </Pressable>
          <View style={styles.flex}>
            <StepDots total={STEPS} current={step} accent={accent} />
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {step === 0 && (
            <>
              <Text style={[Type.display, styles.title]}>Empecemos{'\n'}por lo básico</Text>
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
              <View style={styles.intro}>
                <Text style={[Type.display, styles.title]}>Cuéntanos{'\n'}de ti</Text>
                <Text style={[Type.body, styles.hint]}>Todo esto es opcional. Puedes saltarlo.</Text>
              </View>
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
              <View style={styles.intro}>
                <Text style={[Type.display, styles.title]}>¿En qué{'\n'}te ayudamos?</Text>
                <Text style={[Type.body, styles.hint]}>Todo esto es opcional. Puedes saltarlo.</Text>
              </View>
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

          {!!error && <Text style={[Type.hint, styles.error]}>{error}</Text>}
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
  screen: { flex: 1, backgroundColor: Theme.canvas },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
    paddingHorizontal: Space.xl,
    paddingVertical: Space.md,
  },
  back: {
    width: Touch.icon,
    height: Touch.icon,
    borderRadius: Radius.pill,
    backgroundColor: Theme.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...Shadow.card,
  },
  backGlyph: { color: Theme.text, fontSize: 22, lineHeight: 26, fontWeight: '700' },
  pressed: { opacity: 0.9 },
  content: { paddingHorizontal: Space.xl, paddingTop: Space.md, paddingBottom: Space.xl, gap: Space.xl },
  // Titular y bajada van juntos: son un bloque, no dos secciones.
  intro: { gap: Space.sm },
  title: { color: Theme.text },
  hint: { color: Theme.textMuted },
  error: { color: Theme.danger },
  actions: { paddingHorizontal: Space.xl, paddingTop: Space.md, paddingBottom: Space.sm, gap: Space.sm },
});
