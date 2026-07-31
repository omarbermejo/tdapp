import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { Choice, type Option } from '@/components/ui/choice';
import { DateField } from '@/components/ui/date-field';
import { FormError } from '@/components/ui/form-error';
import { StepDots } from '@/components/ui/step-dots';
import { Radius, Space, Type, useAccent, useShadow, useTheme } from '@/constants/theme';
import { ApiError, type ProfileInput, type User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import {
  ACCENT_COLOR,
  FOCUS_AREAS,
  PEAK_ENERGY,
  REMINDER_HOUR,
  REMINDER_STYLE,
} from '@/features/auth/options';
import { askForNotifications } from '@/features/notifications/local';

/**
 * Onboarding como conversacion: la app pregunta en burbujas, tu respuesta se queda en el hilo,
 * y al final el hilo entero ES tu perfil. Una sola decision a la vista a la vez, que es lo que
 * pide una app hecha para no distraerse.
 *
 * Nada es saltable, porque todos estos datos se usan: los focos ordenan el dia, la intensidad
 * y la hora agendan el recordatorio, y el color pinta la app. Lo unico opcional es el permiso
 * de avisos del sistema, que ademas no se puede forzar.
 */
type Step = {
  key: keyof ProfileInput;
  ask: string;
  hint?: string;
  /** `multi` y `date` piden confirmar con el boton; el resto avanza al tocar. */
  kind: 'multi' | 'single' | 'hour' | 'date';
  options?: readonly Option[];
  max?: number;
};

const STEPS: readonly Step[] = [
  {
    key: 'focusAreas',
    ask: '¿En qué te quieres enfocar?',
    hint: 'Hasta 3. Menos focos, más resultados.',
    kind: 'multi',
    options: FOCUS_AREAS,
    max: 3,
  },
  { key: 'peakEnergy', ask: '¿Cuándo rindes mejor?', kind: 'single', options: PEAK_ENERGY },
  { key: 'reminderStyle', ask: '¿Cómo te recuerdo las cosas?', kind: 'single', options: REMINDER_STYLE },
  { key: 'reminderHour', ask: '¿A qué hora te escribo?', kind: 'hour', options: REMINDER_HOUR },
  { key: 'birthDate', ask: '¿Cuándo naciste?', kind: 'date' },
  { key: 'accentColor', ask: 'Y por último: elige tu color.', kind: 'single', options: ACCENT_COLOR },
];

/** Un paso mas que las preguntas: pedir el permiso no guarda un dato, asi que va aparte. */
const TOTAL = STEPS.length + 1;

const labelOf = (options: readonly Option[] | undefined, value: string) =>
  options?.find((o) => o.value === value)?.label ?? value;

/** Lo que queda escrito en el hilo como tu respuesta. */
const answerOf = (step: Step, form: ProfileInput) => {
  if (step.kind === 'multi') return form.focusAreas.map((v) => labelOf(step.options, v)).join(' · ');
  if (step.kind === 'date') {
    return form.birthDate
      ? new Date(`${form.birthDate}T00:00:00`).toLocaleDateString('es-MX', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';
  }
  return labelOf(step.options, String(form[step.key]));
};

/** El registro ya devolvio el perfil con los defaults del backend: ese es el estado inicial. */
const profileOf = (user: User): ProfileInput => ({
  birthDate: user.birthDate,
  focusAreas: user.focusAreas,
  peakEnergy: user.peakEnergy,
  reminderStyle: user.reminderStyle,
  reminderHour: user.reminderHour,
  accentColor: user.accentColor,
});

export default function OnboardingScreen() {
  const { user, finishOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfileInput>(() => profileOf(user!));
  const [error, setError] = useState('');
  const [fields, setFields] = useState<Record<string, string>>({});
  /** Lo que falta para poder avanzar. Es del paso actual, no del guardado. */
  const [nudge, setNudge] = useState('');
  const [loading, setLoading] = useState(false);
  const thread = useRef<ScrollView>(null);

  const t = useTheme();
  // El color elegido se aplica en vivo: en el ultimo paso el hilo entero se repinta.
  const accent = useAccent(form.accentColor);
  const accentName = form.accentColor;

  // Cada burbuja nueva empuja el hilo; sin esto la pregunta actual nace fuera de pantalla.
  useEffect(() => {
    const id = setTimeout(() => thread.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(id);
  }, [step]);

  const current: Step | undefined = STEPS[step];
  const asking = current !== undefined;

  const answer = (key: keyof ProfileInput, value: ProfileInput[keyof ProfileInput]) =>
    setForm((f) => ({ ...f, [key]: value }));

  /** Elegir ya es responder: avanza solo, con una pausa para que se vea la animacion del chip. */
  const answerAndAdvance = (key: keyof ProfileInput, value: ProfileInput[keyof ProfileInput]) => {
    answer(key, value);
    setTimeout(() => setStep((s) => s + 1), 320);
  };

  const ready = !current
    ? true
    : current.kind === 'multi'
      ? form.focusAreas.length > 0
      : current.kind === 'date'
        ? form.birthDate !== null
        : true;

  /**
   * El boton NO se apaga: un primario en disabled deja su etiqueta en un contraste malisimo
   * y se lee como app roto. Si falta la respuesta, el toque dice que falta.
   */
  const advance = () => {
    if (ready) {
      setNudge('');
      return setStep((s) => s + 1);
    }
    setNudge(current?.kind === 'multi' ? 'Elige al menos uno para seguir.' : 'Revisa la fecha para seguir.');
  };

  const save = async (withAlerts: boolean) => {
    setError('');
    setFields({});
    setLoading(true);
    try {
      // Primero el permiso y despues el guardado: el guardado voltea el guard y desmonta esto.
      // Se llamaba `withPush` y era mentira: no hay push, y lo que se pide aqui es el permiso del
      // sistema, que es lo que necesitan los avisos locales.
      if (withAlerts) await askForNotifications();
      await finishOnboarding(form);
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        // Si el API rechazo un campo, se vuelve a su pregunta en vez de dejar un error suelto.
        const failed = STEPS.findIndex((s) => e.fields[s.key]);
        if (failed >= 0) setStep(failed);
        // Y ahi el mensaje general se calla: el del campo ya dice lo mismo, mas concreto.
        setError(failed >= 0 ? '' : e.message);
      } else {
        setError('Algo salió mal');
      }
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <SafeAreaView style={[styles.screen, { backgroundColor: t.canvas }]}>
      <View style={styles.header}>
        <StepDots total={TOTAL} current={step} accent={accentName} />
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        <ScrollView
          ref={thread}
          contentContainerStyle={styles.thread}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Bubble text={`Hola, ${user.name.trim().split(' ')[0]}.`} />
          <Bubble text="Seis respuestas y la app queda a tu medida." />

          {STEPS.map((s, i) =>
            i > step ? null : (
              <View key={s.key} style={styles.pair}>
                <Bubble text={s.ask} hint={i === step ? s.hint : undefined} />
                {i < step && <Said text={answerOf(s, form)} tint={accent.soft} color={t.text} />}
              </View>
            )
          )}

          {!asking && <Bubble text="Listo. ¿Te dejo avisarte a esa hora? Un toque y ya, sin regaños." />}
        </ScrollView>

        <View style={[styles.answerZone, { backgroundColor: t.canvas, borderTopColor: t.line }]}>
          <FormError message={error || nudge} />

          {current?.kind === 'multi' && (
            <>
              <Choice
                options={current.options!}
                value={form.focusAreas}
                onChange={(v) => {
                  setNudge('');
                  answer('focusAreas', v);
                }}
                max={current.max}
                accent={accentName}
              />
              <BigButton label="Seguir" onPress={advance} />
            </>
          )}

          {current?.kind === 'single' && (
            <Choice
              options={current.options!}
              value={String(form[current.key])}
              onChange={(v) => answerAndAdvance(current.key, v)}
              accent={accentName}
            />
          )}

          {current?.kind === 'hour' && (
            <Choice
              options={current.options!}
              value={String(form.reminderHour)}
              // El API valida entero 0..23 y Choice trabaja con texto: aqui se convierte.
              onChange={(v) => answerAndAdvance('reminderHour', Number(v))}
              accent={accentName}
            />
          )}

          {current?.kind === 'date' && (
            <>
              <DateField
                label="Día, mes y año"
                value={form.birthDate}
                onChange={(v) => {
                  setNudge('');
                  answer('birthDate', v);
                }}
                accent={accentName}
                error={fields.birthDate}
              />
              <BigButton label="Seguir" onPress={advance} />
            </>
          )}

          {!asking && (
            <>
              <BigButton label="Sí, avísame" loading={loading} onPress={() => save(true)} />
              <BigButton
                label="Ahora no"
                variant="ghost"
                accent={accentName}
                onPress={() => save(false)}
              />
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Lo que dice la app: papel, a la izquierda, con la esquina de abajo recortada. */
function Bubble({ text, hint }: { text: string; hint?: string }) {
  const t = useTheme();
  const shadow = useShadow();

  return (
    <Animated.View
      entering={FadeInDown.duration(220)}
      style={[styles.bubble, { backgroundColor: t.surface }, shadow]}>
      <Text style={[Type.body, { color: t.text }]}>{text}</Text>
      {!!hint && <Text style={[Type.hint, { color: t.textMuted }]}>{hint}</Text>}
    </Animated.View>
  );
}

/** Lo que respondiste: tinte del acento, a la derecha. */
function Said({ text, tint, color }: { text: string; tint: string; color: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(220)} style={[styles.said, { backgroundColor: tint }]}>
      <Text style={[Type.label, { color }]}>{text}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  flex: { flex: 1 },
  header: { paddingHorizontal: Space.xl, paddingVertical: Space.md },
  thread: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
    paddingBottom: Space.xl,
    gap: Space.md,
  },
  // Pregunta y respuesta van mas juntas entre si que con el resto del hilo.
  pair: { gap: Space.sm },
  bubble: {
    alignSelf: 'flex-start',
    maxWidth: '86%',
    gap: Space.xs,
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderBottomLeftRadius: Radius.sm,
  },
  said: {
    alignSelf: 'flex-end',
    maxWidth: '86%',
    paddingHorizontal: Space.lg,
    paddingVertical: Space.md,
    borderRadius: Radius.lg,
    borderBottomRightRadius: Radius.sm,
  },
  answerZone: {
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingTop: Space.lg,
    paddingBottom: Space.md,
    borderTopWidth: 1,
  },
});
