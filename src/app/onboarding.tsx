import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { FormError } from '@/components/ui/form-error';
import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { Choice } from '@/components/ui/choice';
import { DateField } from '@/components/ui/date-field';
import { StepDots } from '@/components/ui/step-dots';
import { Stem } from '@/components/ui/stem';
import { Accents, Radius, Space, Theme, Type, accentOf } from '@/constants/theme';
import { ApiError, type ProfileInput, type User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { ACCENT_COLOR, FOCUS_AREAS, PEAK_ENERGY, REMINDER_STYLE } from '@/features/auth/options';
import { registerPushDevice } from '@/features/notifications/register-device';

const STEPS = 3;
const STICKER_RATIO = 101 / 91;

/** Como suenan los avisos que eligio, para que el ultimo paso hable de lo que ya decidio. */
const REMINDER_WORD: Record<string, string> = {
  gentle: 'suaves',
  firm: 'firmes',
  persistent: 'insistentes',
};

/** El registro ya devolvio el perfil con los defaults del backend: ese es el estado inicial. */
const profileOf = (user: User): ProfileInput => ({
  birthDate: user.birthDate,
  focusAreas: user.focusAreas,
  peakEnergy: user.peakEnergy,
  reminderStyle: user.reminderStyle,
  accentColor: user.accentColor,
});

/**
 * Tres pasos en un archivo, no tres rutas: con rutas separadas el tallo se desmonta y salta
 * en cada push. Aqui la rama de la cabecera transiciona y el tallo nunca se va.
 */
export default function OnboardingScreen() {
  const { user, token, finishOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfileInput>(() => profileOf(user!));
  // Los brotes se llenan con lo que el usuario ya toco. Comparar contra el punto de partida
  // evita duplicar en el cliente los defaults que son del backend.
  const initial = useRef(form);
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  if (!user) return null;

  // El acento elegido se aplica en vivo: el tallo, los brotes y la rama se repintan.
  const accent = accentOf(form.accentColor);
  const accentName = form.accentColor;
  const set = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));
  const touched = (key: keyof ProfileInput) => form[key] !== initial.current[key];

  const save = async (withPush: boolean) => {
    setError('');
    setFields({});
    setLoading(true);
    try {
      // Primero el permiso y despues el guardado: el guardado voltea el guard y desmonta esto.
      if (withPush && token) await registerPushDevice(token);
      await finishOnboarding(form);
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

  const next = () => setStep(step + 1);

  return (
    <SafeAreaView style={styles.screen}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <View style={styles.header}>
          {step > 0 && <BackButton onPress={() => setStep(step - 1)} />}
          <View style={styles.flex}>
            <StepDots total={STEPS} current={step} accent={accentName} />
          </View>
          <Text style={[Type.micro, styles.stepLabel]}>{`Paso ${step + 1} de ${STEPS}`}</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          {step === 0 && (
            <>
              <View style={styles.hero}>
                <Text style={[Type.display, styles.title]}>Cuéntanos de ti.</Text>
                <Text style={[Type.display, { color: accent.ink }]}>Solo si quieres.</Text>
                <Text style={[Type.body, styles.subtitle]}>No es obligatorio, y se cambia después.</Text>
              </View>

              <Stem accent={accentName} filled={[form.birthDate !== null]}>
                <DateField
                  label="Fecha de nacimiento"
                  value={form.birthDate}
                  onChange={(v) => set('birthDate', v)}
                  accent={accentName}
                  error={fields.birthDate}
                />
              </Stem>
            </>
          )}

          {step === 1 && (
            <>
              <View style={styles.hero}>
                <Text style={[Type.display, styles.title]}>Vamos a lo tuyo.</Text>
                <Text style={[Type.display, { color: accent.ink }]}>Tú eliges cómo.</Text>
                <Text style={[Type.body, styles.subtitle]}>Cuatro toques y listo.</Text>
              </View>

              <Stem
                accent={accentName}
                filled={[
                  form.focusAreas.length > 0,
                  touched('peakEnergy'),
                  touched('reminderStyle'),
                  touched('accentColor'),
                ]}>
                <Choice
                  label="Tus focos"
                  hint="Máximo 3. Menos focos, más resultados."
                  options={FOCUS_AREAS}
                  value={form.focusAreas}
                  onChange={(v) => set('focusAreas', v)}
                  max={3}
                  accent={accentName}
                />
                <Choice
                  label="Rindes mejor en…"
                  options={PEAK_ENERGY}
                  value={form.peakEnergy}
                  onChange={(v) => set('peakEnergy', v)}
                  accent={accentName}
                />
                <Choice
                  label="¿Cómo te recordamos las cosas?"
                  options={REMINDER_STYLE}
                  value={form.reminderStyle}
                  onChange={(v) => set('reminderStyle', v)}
                  accent={accentName}
                />
                <Choice
                  label="Tu color"
                  options={ACCENT_COLOR}
                  value={form.accentColor}
                  onChange={(v) => set('accentColor', v)}
                  accent={accentName}
                />
              </Stem>
            </>
          )}

          {step === 2 && (
            <>
              <View style={styles.hero}>
                <Text style={[Type.display, styles.title]}>Te avisamos.</Text>
                <Text style={[Type.display, { color: accent.ink }]}>Sin regaños.</Text>
                <Text style={[Type.body, styles.subtitle]}>Un toque cuando toca. Nada más.</Text>
              </View>

              {/* El tallo sube, se curva y sostiene el sticker: el remate del recorrido. */}
              <View style={styles.stage}>
                <View pointerEvents="none" style={[styles.connector, { borderColor: accent.ink }]} />
                <Image
                  source={require('@/assets/stickers/bubble.svg')}
                  style={styles.sticker}
                  contentFit="contain"
                  accessible={false}
                />
              </View>

              <Text style={[Type.hint, styles.subtitle]}>
                {`Elegiste avisos ${REMINDER_WORD[form.reminderStyle] ?? 'firmes'}. Se cambia cuando quieras.`}
              </Text>
            </>
          )}

          <FormError message={error} />

          <View style={styles.spacer} />

          <View style={styles.actions}>
            {step < STEPS - 1 ? (
              <BigButton label="Siguiente" onPress={next} />
            ) : (
              <BigButton label="Sí, avísame" loading={loading} onPress={() => save(true)} />
            )}
            <BigButton
              label={step < STEPS - 1 ? 'Saltar' : 'Ahora no'}
              variant="ghost"
              accent={accentName}
              onPress={() => (step < STEPS - 1 ? setStep(STEPS - 1) : save(false))}
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
  stepLabel: { color: Theme.textMuted },
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
  stage: { minHeight: 200, justifyContent: 'flex-end' },
  connector: {
    position: 'absolute',
    left: 5,
    right: '42%',
    top: '30%',
    bottom: 0,
    borderLeftWidth: 2,
    borderTopWidth: 2,
    borderTopLeftRadius: Radius.lg,
  },
  sticker: { alignSelf: 'flex-end', width: '56%', aspectRatio: STICKER_RATIO },
  spacer: { flex: 1 },
  actions: { gap: Space.md },
});
