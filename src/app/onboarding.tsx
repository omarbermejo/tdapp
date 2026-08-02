import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Choice, type Option } from '@/components/ui/choice';
import { DateField } from '@/components/ui/date-field';
import { FormError } from '@/components/ui/form-error';
import { StepDots } from '@/components/ui/step-dots';
import { Motion, Radius, Space, Type, useAccent, useShadow, useTheme } from '@/constants/theme';
import { ApiError, type ProfileInput, type User } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import {
  ACCENT_COLOR,
  PEAK_ENERGY,
  REMINDER_HOUR,
  REMINDER_STYLE,
  WORKSPACE_TAGS,
} from '@/features/auth/options';
import { askForNotifications } from '@/features/notifications/local';
import { focusForTag, iconForTag } from '@/features/tasks/focus-accent';
import { workspacesApi } from '@/features/workspaces/api';

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
  /**
   * El campo del perfil que responde, o `workspace` para el primer paso — que no guarda un campo del
   * perfil sino que CREA un espacio. Es el unico con esa llave y por eso no colisiona con `e.fields`.
   */
  key: keyof ProfileInput | 'workspace';
  ask: string;
  hint?: string;
  /** `workspace` y `date` piden confirmar con el boton; el resto avanza al tocar. */
  kind: 'workspace' | 'single' | 'hour' | 'date';
  options?: readonly Option[];
};

const STEPS: readonly Step[] = [
  /**
   * La primera pregunta ERA "¿en qué te quieres enfocar?", hasta tres de siete focos. Ahora es tu
   * primer espacio de trabajo, y el cambio no es de forma sino de fondo: los focos eran una etiqueta
   * suelta que solo pintaba iconos, y un espacio es donde de verdad vive el trabajo — se comparte, se
   * mide, y la app entera se puede acotar a el.
   *
   * El foco no se pierde: sale de la clasificacion que elijas (ver `focusForTag`), asi que el dia
   * sigue teniendo con que ordenarse sin una pregunta mas.
   */
  {
    key: 'workspace',
    ask: '¿En qué vas a trabajar?',
    hint: 'Tu primer espacio: la tesis, la mudanza, el trabajo.',
    kind: 'workspace',
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

/** El borrador del primer espacio. Vive fuera de `form` porque no es un campo del perfil. */
type Draft = { name: string; tag: string };

/** Lo que queda escrito en el hilo como tu respuesta. */
const answerOf = (step: Step, form: ProfileInput, draft: Draft) => {
  if (step.kind === 'workspace') {
    return draft.tag ? `${draft.name} · ${labelOf(WORKSPACE_TAGS, draft.tag)}` : draft.name;
  }
  if (step.kind === 'date') {
    return form.birthDate
      ? new Date(`${form.birthDate}T00:00:00`).toLocaleDateString('es-MX', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        })
      : '';
  }
  return labelOf(step.options, String(form[step.key as keyof ProfileInput]));
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
  const { user, token, finishOnboarding } = useAuth();
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfileInput>(() => profileOf(user!));
  const [draft, setDraft] = useState<Draft>({ name: '', tag: '' });
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
    : current.kind === 'workspace'
      ? draft.name.trim().length > 0 && draft.tag !== ''
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
    if (current?.kind !== 'workspace') return setNudge('Revisa la fecha para seguir.');
    setNudge(draft.name.trim() ? 'Elige de qué va para seguir.' : 'Ponle un nombre para seguir.');
  };

  /**
   * Guardar es DOS escrituras y su orden importa: primero el espacio, despues el perfil.
   *
   * `finishOnboarding` es lo que voltea el guard y desmonta esta pantalla, asi que tiene que ir al
   * final — al reves, un fallo al crear el espacio dejaria a la persona ya dentro de la app con el
   * error pintado sobre una pantalla que ya no existe. Y el perfil se guarda con el espacio nuevo YA
   * activo: se entra a la app dentro de lo que acabas de crear, que es de lo que iba la pregunta.
   */
  const save = async (withAlerts: boolean) => {
    if (!token) return;
    setError('');
    setFields({});
    setLoading(true);
    try {
      // Se llamaba `withPush` y era mentira: no hay push, y lo que se pide aqui es el permiso del
      // sistema, que es lo que necesitan los avisos locales.
      if (withAlerts) await askForNotifications();

      const { workspace } = await workspacesApi.create(token, {
        name: draft.name.trim(),
        tag: draft.tag,
        icon: iconForTag(draft.tag),
        accent: form.accentColor,
      });

      await finishOnboarding({
        ...form,
        // El foco sale de la clasificacion en vez de una pregunta propia: ver el comentario de STEPS.
        focusAreas: focusForTag(draft.tag),
        activeWorkspaceId: workspace.id,
      });
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        /**
         * A que pregunta volver. El alta del espacio rechaza por `name`, `tag`, `icon` o `accent`, y
         * ninguna de esas es una llave de `Step` — `name` ademas es del espacio, no de la persona. Por
         * eso las cuatro se resuelven a mano contra el paso 0 antes de buscar en `STEPS`.
         */
        const ofSpace = ['name', 'tag', 'icon'].some((k) => e.fields[k]);
        const failed = ofSpace ? 0 : STEPS.findIndex((s) => e.fields[s.key]);
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
                {i < step && <Said text={answerOf(s, form, draft)} tint={accent.soft} color={t.text} />}
              </View>
            )
          )}

          {!asking && <Bubble text="Listo. ¿Te dejo avisarte a esa hora? Un toque y ya, sin regaños." />}
        </ScrollView>

        <View style={[styles.answerZone, { backgroundColor: t.canvas, borderTopColor: t.line }]}>
          <FormError message={error || nudge} />

          {/*
            El unico paso con dos controles, y por eso el unico que pide confirmar: el nombre se
            teclea y la clasificacion se toca, asi que avanzar al elegir se llevaria por delante un
            nombre a medio escribir.
          */}
          {current?.kind === 'workspace' && (
            <>
              <BigField
                label="Cómo se llama"
                value={draft.name}
                onChangeText={(v) => {
                  setNudge('');
                  setDraft((d) => ({ ...d, name: v }));
                }}
                error={fields.name}
                accent={accentName}
                placeholder="La tesis, la mudanza…"
                maxLength={40}
                submitBehavior="blurAndSubmit"
              />
              <Choice
                label="De qué va"
                options={WORKSPACE_TAGS}
                value={draft.tag}
                onChange={(v: string) => {
                  setNudge('');
                  setDraft((d) => ({ ...d, tag: v }));
                }}
                accent={accentName}
              />
              <BigButton label="Seguir" onPress={advance} />
            </>
          )}

          {current?.kind === 'single' && (
            <Choice
              options={current.options!}
              value={String(form[current.key as keyof ProfileInput])}
              onChange={(v) => answerAndAdvance(current.key as keyof ProfileInput, v)}
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
      entering={FadeInDown.duration(Motion.enter)}
      style={[styles.bubble, { backgroundColor: t.surface }, shadow]}>
      <Text style={[Type.body, { color: t.text }]}>{text}</Text>
      {!!hint && <Text style={[Type.hint, { color: t.textMuted }]}>{hint}</Text>}
    </Animated.View>
  );
}

/** Lo que respondiste: tinte del acento, a la derecha. */
function Said({ text, tint, color }: { text: string; tint: string; color: string }) {
  return (
    <Animated.View entering={FadeInDown.duration(Motion.enter)} style={[styles.said, { backgroundColor: tint }]}>
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
