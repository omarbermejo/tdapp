import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { FadeInDown, FadeOutUp, LinearTransition } from 'react-native-reanimated';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { BigField } from '@/components/ui/big-field';
import { Micro } from '@/components/ui/card';
import { Confetti } from '@/components/ui/confetti';
import { FormError } from '@/components/ui/form-error';
import { Icon3D, Icon3DSize } from '@/components/ui/icon3d';
import { StatusVeil, useScrollVeil } from '@/components/ui/status-veil';
import { StepDots } from '@/components/ui/step-dots';
import { Motion, Radius, Space, Touch, Type, useAccent, useTheme } from '@/constants/theme';
import { ApiError } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { FOCUS_AREAS } from '@/features/auth/options';
import { isoAt, localDate, tasksApi } from '@/features/tasks/api';
import {
  TASK_ICONS,
  TOTAL_STEPS,
  areasFor,
  canAdvance,
  iconForArea,
  type Draft,
} from '@/features/tasks/task-wizard';
import { useWorkspaces } from '@/features/workspaces/use-workspaces';
import { usePressScale } from '@/hooks/use-press-scale';
import { useScreenPadding } from '@/hooks/use-screen-padding';

/** Lo que el confeti se queda antes de volver al inicio. Ver el mismo numero en `new-task`. */
const CONFIRM_MS = 1100;

/** Las horas que se ofrecen. Las mismas que el formulario corto, para no tener dos catalogos. */
const HOURS = ['07', '09', '12', '15', '18', '20', '22'];

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * El hueco inicial: dia Y hora juntos, porque son una sola decision.
 *
 * Si ya no queda hora en punto hoy, arranca en mañana con la primera — es lo que evita que anotar a
 * las 22:00 con los defaults cree una tarea para HOY a las 07:00, ya vencida.
 */
const initialWhen = () => {
  const now = new Date();
  const hour = HOURS.find((h) => Number(h) > now.getHours());
  const at = new Date(now);
  if (!hour) at.setDate(at.getDate() + 1);
  return { date: localDate(at), hour: hour ?? HOURS[0] };
};

const dayLabel = (date: string) => {
  const [y, m, d] = date.split('-').map(Number);
  const at = new Date(y, m - 1, d);
  const today = new Date();
  const same = at.toDateString() === today.toDateString();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  if (same) return 'Hoy';
  if (at.toDateString() === tomorrow.toDateString()) return 'Mañana';
  return cap(at.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'short' }));
};

/**
 * Anotar en cuatro pasos.
 *
 * Una pregunta por pantalla, como el onboarding: la alternativa —los siete campos a la vez— es
 * exactamente donde una tarea se muere cuando la cabeza va rapido. Y por eso ningun paso salvo el
 * primero puede bloquear: todos traen ya la respuesta que la mayoria elegiria.
 *
 * El paso 4 NO es solo confirmar, es "confirmar y cuando". Sin fecha una tarea no sale ni en Hoy ni
 * en Planear — solo en lo que quedo atras — asi que un asistente que se saltara el dia seria una
 * regresion silenciosa frente al formulario que reemplaza.
 */
export default function NewTaskStepsScreen() {
  const { user, token } = useAuth();
  const t = useTheme();
  const veil = useScrollVeil();
  const pad = useScreenPadding(Space.xxl);
  const { workspaces } = useWorkspaces();

  const [step, setStep] = useState(0);
  const [when] = useState(initialWhen);
  const [draft, setDraft] = useState<Draft>(() => ({
    icon: null,
    title: '',
    workspaceId: null,
    focusArea: '',
    date: when.date,
    hour: when.hour,
  }));
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const tint = useAccent(user?.accentColor);
  const space = useMemo(
    () => workspaces?.find((w) => w.id === draft.workspaceId) ?? null,
    [workspaces, draft.workspaceId]
  );

  /**
   * Las clasificaciones del paso 3 dependen del paso 2, y esa es la unica carga de datos a mitad del
   * asistente. No se siente trabada porque `useWorkspaces` ya trajo la lista al montar la pantalla:
   * cuando se llega al paso 2 los espacios ya estan, y el paso 3 solo lee lo que el 2 dejo elegido.
   */
  const areas = useMemo(
    () => areasFor(space, user?.focusAreas ?? [], FOCUS_AREAS.map((a) => a.value)),
    [space, user?.focusAreas]
  );

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));

  const back = () => (step === 0 ? router.back() : setStep((s) => s - 1));
  const next = () => setStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));

  const create = async () => {
    if (!token || !draft.date) return;
    setSaving(true);
    setError('');
    try {
      await tasksApi.create(token, {
        title: draft.title.trim(),
        icon: draft.icon,
        focusArea: draft.focusArea || null,
        workspaceId: draft.workspaceId,
        // isoAt y no toISOString(): en ISO UTC una tarea de la noche se va al dia siguiente.
        dueAt: isoAt(draft.date, Number(draft.hour), 0),
      });
      Keyboard.dismiss();
      setDone(true);
      // El confeti se queda un momento y luego vuelve solo: hacerte tocar "listo" despues de
      // celebrar convierte la celebracion en un tramite.
      setTimeout(() => router.back(), CONFIRM_MS);
    } catch (e) {
      setError(e instanceof ApiError ? (Object.values(e.fields)[0] ?? e.message) : 'No pudimos crearla');
    } finally {
      setSaving(false);
    }
  };

  // El guard va DESPUES de todos los hooks: al cerrar sesion el user se vuelve null.
  if (!user) return null;

  const last = step === TOTAL_STEPS - 1;

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <Animated.ScrollView
        {...veil.scrollProps}
        contentContainerStyle={[styles.content, { paddingTop: Space.lg, paddingBottom: pad.bottom }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.head}>
          <BackButton onPress={back} />
          <View style={styles.dots}>
            <StepDots total={TOTAL_STEPS} current={step} accent={user.accentColor} />
          </View>
        </View>

        {/*
          `layout` para que el bloque de abajo suba y baje sin saltar cuando cambia de alto entre
          pasos. Lineal y no muelle: un rebote empuja el boton de continuar bajo el pulgar.
        */}
        <Animated.View layout={LinearTransition.duration(Motion.enter)} style={styles.stage}>
          {step === 0 && (
            <Step ask="¿Qué hay que hacer?" hint="Ponle nombre y una cara.">
              <BigField
                label="La tarea"
                value={draft.title}
                onChangeText={(title) => set({ title })}
                placeholder="Leer el capítulo 4"
                accent={user.accentColor}
                autoFocus
                returnKeyType="next"
                onSubmitEditing={() => canAdvance(0, draft) && next()}
              />

              <Micro>Su cara</Micro>
              <View style={styles.icons}>
                {TASK_ICONS.map((name) => (
                  <IconCell
                    key={name}
                    name={name}
                    on={draft.icon === name}
                    tint={tint}
                    onPress={() => set({ icon: draft.icon === name ? null : name })}
                  />
                ))}
              </View>
            </Step>
          )}

          {step === 1 && (
            <Step ask="¿Dónde va?" hint="Puedes moverla después.">
              <Option
                label="Mi espacio"
                detail="Solo tuyo"
                on={draft.workspaceId === null}
                tint={tint}
                onPress={() => set({ workspaceId: null, focusArea: '' })}
              />
              {(workspaces ?? []).map((w) => (
                <Option
                  key={w.id}
                  label={w.name}
                  detail={`${w.done} de ${w.total}`}
                  on={draft.workspaceId === w.id}
                  tint={tint}
                  // Al cambiar de espacio se limpia la clasificacion: la del espacio anterior
                  // no tiene por que existir en el nuevo, y arrastrarla crearia una contradiccion.
                  onPress={() => set({ workspaceId: w.id, focusArea: '' })}
                />
              ))}
            </Step>
          )}

          {step === 2 && (
            <Step
              ask="¿De qué es?"
              hint={space ? `Lo hereda de ${space.name}.` : 'Para darle color en la lista.'}>
              <Option
                label="Sin clasificar"
                on={!draft.focusArea}
                tint={tint}
                onPress={() => set({ focusArea: '' })}
              />
              {areas.map((value) => {
                const option = FOCUS_AREAS.find((a) => a.value === value);
                return (
                  <Option
                    key={value}
                    label={option?.label ?? cap(value)}
                    icon={iconForArea(value)}
                    on={draft.focusArea === value}
                    tint={tint}
                    // Elegir clasificacion sugiere su cara, pero solo si no elegiste una a mano.
                    onPress={() => set({ focusArea: value, icon: draft.icon ?? iconForArea(value) })}
                  />
                );
              })}
            </Step>
          )}

          {step === 3 && (
            <Step ask="¿Cuándo?" hint="Sin día se queda en lo que quedó atrás.">
              <View style={styles.row}>
                {[0, 1, 2].map((n) => {
                  const at = new Date();
                  at.setDate(at.getDate() + n);
                  const value = localDate(at);
                  return (
                    <Chip
                      key={value}
                      label={dayLabel(value)}
                      on={draft.date === value}
                      tint={tint}
                      onPress={() => set({ date: value })}
                    />
                  );
                })}
              </View>

              <Micro>A qué hora</Micro>
              <View style={styles.row}>
                {HOURS.map((h) => (
                  <Chip
                    key={h}
                    label={`${Number(h) % 12 || 12} ${Number(h) < 12 ? 'am' : 'pm'}`}
                    on={draft.hour === h}
                    tint={tint}
                    onPress={() => set({ hour: h })}
                  />
                ))}
              </View>

              {/* El resumen: lo ultimo que se ve antes de crear, con todo lo decidido junto. */}
              <View style={[styles.summary, { backgroundColor: t.sunken }]}>
                {draft.icon && <Icon3D name={draft.icon} size={Icon3DSize.md} />}
                <View style={styles.flex}>
                  <Text style={[Type.body, { color: t.text }]} numberOfLines={2}>
                    {draft.title.trim() || 'Sin nombre'}
                  </Text>
                  <Text style={[Type.hint, { color: t.textMuted }]}>
                    {space?.name ?? 'Mi espacio'}
                    {draft.date ? ` · ${dayLabel(draft.date)}` : ''}
                  </Text>
                </View>
              </View>
            </Step>
          )}
        </Animated.View>

        <FormError message={error} />

        <BigButton
          label={last ? 'Crear' : 'Seguir'}
          accent={user.accentColor}
          loading={saving}
          success={done}
          disabled={!canAdvance(step, draft)}
          onPress={last ? create : next}
        />
      </Animated.ScrollView>

      <StatusVeil scrollY={veil.scrollY} />

      {/* Encima de todo y fuera del scroll: el confeti cae sobre la pantalla entera. */}
      {done && <Confetti />}
    </View>
  );
}

/** Un paso: la pregunta grande, su pista, y lo que haya que elegir. */
function Step({ ask, hint, children }: { ask: string; hint?: string; children: React.ReactNode }) {
  const t = useTheme();
  return (
    <Animated.View
      entering={FadeInDown.duration(Motion.enter)}
      exiting={FadeOutUp.duration(Motion.exit)}
      style={styles.step}>
      <Text style={[Type.title, { color: t.text }]}>{ask}</Text>
      {!!hint && <Text style={[Type.body, { color: t.textMuted }]}>{hint}</Text>}
      {children}
    </Animated.View>
  );
}

/** Una fila elegible: espacio o clasificacion. Alta y ancha, para el pulgar. */
function Option({
  label,
  detail,
  icon,
  on,
  tint,
  onPress,
}: {
  label: string;
  detail?: string;
  icon?: string | null;
  on: boolean;
  tint: { soft: string; ink: string };
  onPress: () => void;
}) {
  const t = useTheme();
  const press = usePressScale({ to: 0.98 });

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.option,
          { backgroundColor: on ? tint.soft : t.surface, borderColor: on ? tint.ink : t.line },
        ]}>
        {!!icon && <Icon3D name={icon as never} size={Icon3DSize.sm} />}
        <Text style={[Type.body, styles.flex, { color: t.text }]} numberOfLines={1}>
          {label}
        </Text>
        {!!detail && <Text style={[Type.hint, { color: t.textMuted }]}>{detail}</Text>}
      </Pressable>
    </Animated.View>
  );
}

/** Un chip corto: dia u hora. Van en fila con wrap. */
function Chip({
  label,
  on,
  tint,
  onPress,
}: {
  label: string;
  on: boolean;
  tint: { soft: string; ink: string };
  onPress: () => void;
}) {
  const t = useTheme();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={[
        styles.chip,
        { backgroundColor: on ? tint.soft : t.surface, borderColor: on ? tint.ink : t.line },
      ]}>
      <Text style={[Type.label, { color: t.text }]}>{label}</Text>
    </Pressable>
  );
}

/** Una cara elegible del paso 1. */
function IconCell({
  name,
  on,
  tint,
  onPress,
}: {
  name: string;
  on: boolean;
  tint: { soft: string; ink: string };
  onPress: () => void;
}) {
  const t = useTheme();
  const press = usePressScale({ to: 0.94 });

  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={`Icono ${name}`}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={[
          styles.iconCell,
          { backgroundColor: on ? tint.soft : t.sunken, borderColor: on ? tint.ink : 'transparent' },
        ]}>
        <Icon3D name={name as never} size={Icon3DSize.sm} />
      </Pressable>
    </Animated.View>
  );
}

const CELL = Touch.chip;

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: Space.xl, gap: Space.xl },
  head: { flexDirection: 'row', alignItems: 'center', gap: Space.lg },
  dots: { flex: 1 },
  stage: { gap: Space.lg },
  step: { gap: Space.md },
  flex: { flex: 1 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  icons: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  iconCell: {
    width: CELL,
    height: CELL,
    borderRadius: Radius.md,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    minHeight: Touch.button,
    paddingHorizontal: Space.lg,
    borderRadius: Radius.md,
    borderWidth: 2,
  },
  chip: {
    minHeight: Touch.chip,
    justifyContent: 'center',
    paddingHorizontal: Space.lg,
    borderRadius: Radius.pill,
    borderWidth: 2,
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.md,
    padding: Space.lg,
    borderRadius: Radius.md,
  },
});
