import { router } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeInDown, FadeOutDown, LinearTransition } from 'react-native-reanimated';

import { BackButton } from '@/components/ui/back-button';
import { BigButton } from '@/components/ui/big-button';
import { Micro } from '@/components/ui/card';
import { Choice } from '@/components/ui/choice';
import { FormError } from '@/components/ui/form-error';
import { Icon3D, Icon3DSize, type Icon3DName } from '@/components/ui/icon3d';
import { ProgressRing } from '@/components/ui/progress-ring';
import { StepDots } from '@/components/ui/step-dots';
import { Motion, Radius, Space, Touch, Type, useAccent, useTheme, type AccentName } from '@/constants/theme';
import { ApiError, type Workspace } from '@/features/auth/api';
import { useAuth } from '@/features/auth/auth-context';
import { ACCENT_COLOR, WORKSPACE_TAGS } from '@/features/auth/options';
import { workspacesApi } from '@/features/workspaces/api';
import { InviteStep } from '@/features/workspaces/invite-step';
import { usePressScale } from '@/hooks/use-press-scale';
import { useScreenPadding } from '@/hooks/use-screen-padding';

/**
 * Los iconos que se ofrecen, en el orden en que alguien busca un proyecto.
 *
 * Un subconjunto de los 18 horneados y no todos: `check` y `clock` son objetos de la app (una tarea
 * hecha, un temporizador), no cosas de las que alguien tenga un proyecto. Doce entran en cuatro filas
 * de tres sin scroll, que es lo que hace que elegir sea un vistazo y no una lista.
 *
 * El catalogo REAL vive en el API (`GET /workspaces/catalogs`) y valida los 18; esto es la seleccion
 * que se pinta. Si algun dia hace falta ofrecerlos todos, se pide ahi y se pinta sin desplegar la app.
 */
const ICONS: readonly Icon3DName[] = [
  'work',
  'academic',
  'home',
  'health',
  'money',
  'relationships',
  'creativity',
  'leaf',
  'light',
  'lightning',
  'trophy',
  'moon',
];

/** Los cuatro pasos. El titulo es la pregunta, como en el onboarding. */
const STEPS = [
  { ask: '¿De qué es este espacio?', hint: 'Un nombre y una cara para reconocerlo.' },
  { ask: 'Elige su color', hint: 'Es como lo vas a distinguir de un vistazo.' },
  { ask: '¿Cómo lo clasificas?', hint: 'De aquí salen el icono y el color de sus tareas.' },
  { ask: '¿Con quién?', hint: '' },
] as const;

/**
 * El bloque del paso entra y sale; el chasis se queda.
 *
 * Aqui NO hay precedente en el repo: el onboarding acumula sus pasos en un hilo de chat y estos se
 * intercambian. La pareja `FadeInDown`/`FadeOutDown` es la misma de los paneles del perfil, y el
 * `LinearTransition` del contenedor es lo que impide que la zona de accion salte durante los 160ms en
 * que los dos pasos coexisten en el arbol.
 */
const STEP_IN = FadeInDown.duration(Motion.enter);
const STEP_OUT = FadeOutDown.duration(Motion.exit);
const RESIZE = LinearTransition.duration(Motion.enter);

/**
 * Crear un espacio de trabajo, en cuatro pasos.
 *
 * **Push de tarjeta y no hoja**, al reves que `new-task`: cuatro pasos con scroll pelean contra el
 * gesto de arrastrar hacia abajo para cerrar, y esto ya no es un parentesis de tres segundos.
 *
 * **El espacio se crea al terminar el paso 3, no al final.** El paso 4 necesita un `workspaceId` de
 * verdad para poder generar un codigo de invitacion, asi que los tres primeros son un borrador local y
 * el cuarto ya opera sobre algo que existe. Salir ahi deja el espacio creado, que es lo correcto:
 * invitar es opcional y nadie deberia perder lo que acaba de nombrar por cerrar la pantalla.
 */
export default function NewWorkspaceScreen() {
  const { user, token, setActiveSpace } = useAuth();
  const t = useTheme();
  const pad = useScreenPadding(Space.xxl);

  const [step, setStep] = useState(0);
  const [name, setName] = useState('');
  const [icon, setIcon] = useState<Icon3DName>('work');
  // Arranca en el acento de la persona: es el color que ya eligio para la app.
  const [color, setColor] = useState<AccentName>(user?.accentColor ?? 'olive');
  const [tag, setTag] = useState<string>('');
  /** Lo que devuelve el API al terminar el paso 3. Con esto el paso 4 ya puede invitar. */
  const [created, setCreated] = useState<Workspace | null>(null);

  /**
   * El tinte del color ELEGIDO, y se pide ARRIBA con el resto de hooks.
   *
   * `useAccent` es un hook: dentro de un paso condicional seria una llamada que aparece y desaparece
   * segun el paso, que es exactamente lo que rompe el orden de los hooks.
   */
  const picked = useAccent(color);

  const [fields, setFields] = useState<Record<string, string>>({});
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  /** Lo que falta para poder avanzar. Es del paso actual, no del guardado. */
  const [nudge, setNudge] = useState('');

  /**
   * Lo que hace falta para seguir. El boton NUNCA se apaga: si falta algo, el toque lo dice.
   *
   * Es la regla del onboarding, y su argumento aguanta aqui igual — un boton gris no explica que le
   * falta, y con TDAH un callejon sin salida es donde se abandona la pantalla.
   */
  const ready = step === 0 ? name.trim().length > 0 : true;

  const advance = () => {
    if (!ready) return setNudge('Ponle un nombre para seguir.');
    setNudge('');
    if (step < 2) return setStep(step + 1);
    void create();
  };

  /**
   * Crea el espacio de verdad y pasa al paso de invitar.
   *
   * Y lo ACTIVA: acabas de decidir su nombre, su cara, su color y de que es — dar todo eso y volver a
   * un inicio que no ha cambiado seria pedir que lo elijas otra vez. Es la misma regla con la que
   * `join-workspace` entra al espacio en cuanto aceptas el codigo.
   */
  const create = async () => {
    const clean = name.trim();
    if (!token) return;
    setSaving(true);
    setError('');
    setFields({});
    try {
      const { workspace } = await workspacesApi.create(token, {
        name: clean,
        icon,
        accent: color,
        // Sin clasificar es un valor legitimo: `null` y no la cadena vacia, que es lo que valida el API.
        tag: tag || null,
      });
      setCreated(workspace);
      setStep(3);
      // El `catch` de fuera es para el alta; este es para la activacion. Sin separarlos, un fallo de
      // red al activar pintaria "no pudimos crearlo" sobre un espacio que ya existe.
      await setActiveSpace({
        id: workspace.id,
        name: workspace.name,
        icon: workspace.icon,
        accent: workspace.accent,
        tag: workspace.tag ?? null,
      }).catch(() => {});
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        setError(e.fields.name ? '' : (Object.values(e.fields)[0] ?? e.message));
        // Vuelve al paso que el API rechazo, como hace el onboarding.
        if (e.fields.name) setStep(0);
        if (e.fields.accent) setStep(1);
        if (e.fields.tag) setStep(2);
      } else {
        setError('No pudimos crearlo');
      }
    } finally {
      setSaving(false);
    }
  };

  // Despues de todos los hooks: al cerrar sesion el user se vuelve null y salir antes dejaria a
  // React con menos hooks que en el render anterior.
  if (!user) return null;

  const current = STEPS[step];

  return (
    <View style={[styles.screen, { backgroundColor: t.canvas }]}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.screen}>
        <View style={[styles.header, { paddingTop: pad.top }]}>
          {/* Flecha y no cruz: esto es un push. En el ultimo paso desaparece — el espacio YA existe y
              retroceder a elegir color prometeria deshacerlo; ahi la salida es el boton de "Listo". */}
          {step < 3 && <BackButton onPress={() => (step === 0 ? router.back() : setStep(step - 1))} />}
          {/* `StepDots` reparte sus brotes con `space-between`, asi que necesita un ancho: sin el
              `flex: 1` de este envoltorio se encoge a la suma de los cuatro y el carril desaparece. */}
          <View style={styles.dots}>
            <StepDots total={STEPS.length} current={step} accent={color} />
          </View>
        </View>

        <ScrollView
          contentContainerStyle={[styles.content, { paddingBottom: pad.bottom }]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}>
          <Animated.View layout={RESIZE} style={styles.block}>
            <View style={styles.ask}>
              <Micro>Nuevo espacio</Micro>
              <Text style={[Type.title, { color: t.text }]}>{current.ask}</Text>
              {!!current.hint && (
                <Text style={[Type.body, { color: t.textMuted }]}>{current.hint}</Text>
              )}
            </View>

            {/*
              La vista previa es la CARD de verdad, no un chip: enseña exactamente lo que vas a obtener,
              y al cambiar de color o de icono se repinta delante de ti. Es la confirmacion de los tres
              primeros pasos, asi que vive fuera de ellos.
            */}
            {step < 3 && (
              <View style={styles.preview}>
                <View style={[styles.card, { backgroundColor: t.surface }]}>
                  <View style={styles.cardHead}>
                    <ProgressRing done={0} total={0} accent={color} />
                    <Icon3D name={icon} size={Icon3DSize.md} />
                  </View>
                  <Text style={[Type.section, { color: t.text }]} numberOfLines={1}>
                    {name.trim() || 'Sin nombre'}
                  </Text>
                  <Text style={[Type.hint, { color: t.textMuted }]}>Sin tareas todavía</Text>
                </View>
              </View>
            )}

            {step === 0 && (
              <Animated.View entering={STEP_IN} exiting={STEP_OUT} style={styles.step}>
                {/* Sin caja ni etiqueta: es lo unico que el paso pide. */}
                <TextInput
                  value={name}
                  onChangeText={(value) => {
                    setName(value);
                    setNudge('');
                  }}
                  placeholder="La tesis, la mudanza…"
                  placeholderTextColor={t.textMuted}
                  selectionColor={picked.ink}
                  style={[Type.title, styles.name, { color: t.text }]}
                  autoFocus
                  maxLength={40}
                  submitBehavior="blurAndSubmit"
                />
                <FormError message={fields.name} />
                <IconChoice value={icon} onChange={setIcon} accent={color} />
              </Animated.View>
            )}

            {step === 1 && (
              <Animated.View entering={STEP_IN} exiting={STEP_OUT} style={styles.step}>
                {/* Las etiquetas de color ya existen en `options.ts` y las comparte con el onboarding:
                    dos listas de los mismos cinco colores se desincronizan a la primera. */}
                <Choice
                  options={ACCENT_COLOR}
                  value={color}
                  onChange={(value: AccentName) => setColor(value)}
                  accent={color}
                />
              </Animated.View>
            )}

            {step === 2 && (
              <Animated.View entering={STEP_IN} exiting={STEP_OUT} style={styles.step}>
                <Choice
                  options={WORKSPACE_TAGS}
                  value={tag}
                  onChange={(value: string) => setTag(value)}
                  accent={color}
                  hint="Puedes dejarlo sin clasificar."
                />
                <FormError message={fields.tag} />
              </Animated.View>
            )}

            {step === 3 && created && (
              <Animated.View entering={STEP_IN} style={styles.step}>
                <InviteStep workspace={created} accent={color} />
              </Animated.View>
            )}

            <FormError message={error} />
            <FormError message={nudge} />
          </Animated.View>
        </ScrollView>

        {/* La zona de accion es FIJA abajo, como en el onboarding: el boton no se va con el scroll. */}
        <View style={[styles.actions, { backgroundColor: t.canvas, borderTopColor: t.line }]}>
          {step < 3 ? (
            <BigButton
              label={step === 2 ? 'Crear el espacio' : 'Seguir'}
              loading={saving}
              onPress={advance}
              accent={color}
            />
          ) : (
            <BigButton label="Listo" onPress={() => router.back()} accent={color} />
          )}
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

/**
 * La rejilla de iconos 3D.
 *
 * No usa `Choice` aunque se le parezca: `Choice` pinta un icono de LINEA de Lucide junto a una
 * etiqueta de texto, y aqui el icono ES la opcion — un render 3D de 32pt con la palabra "Trabajo" al
 * lado seria decir lo mismo dos veces, y con doce opciones eso son doce filas en vez de cuatro.
 */
function IconChoice({
  value,
  onChange,
  accent,
}: {
  value: Icon3DName;
  onChange: (icon: Icon3DName) => void;
  accent: AccentName;
}) {
  const t = useTheme();
  const tint = useAccent(accent);

  return (
    <View style={styles.icons}>
      <Micro>Icono</Micro>
      <View style={styles.iconGrid}>
        {ICONS.map((name) => {
          const on = name === value;
          return (
            <View
              key={name}
              // El borde vive siempre y solo cambia de color: animar el grosor movia el icono un
              // pixel en cada toque. Es la misma regla que `choice.tsx`.
              style={[
                styles.iconSlot,
                { backgroundColor: on ? tint.soft : t.surface, borderColor: on ? tint.ink : t.line },
              ]}>
              <IconOption name={name} on={on} onPress={() => onChange(name)} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

/** Aparte para que cada opcion tenga sus propios shared values, como el `Card` de `choice.tsx`. */
function IconOption({ name, on, onPress }: { name: Icon3DName; on: boolean; onPress: () => void }) {
  const press = usePressScale({ to: 0.9 });
  return (
    <Animated.View style={press.style}>
      <Pressable
        accessibilityRole="radio"
        accessibilityState={{ checked: on }}
        accessibilityLabel={name}
        onPress={onPress}
        onPressIn={press.onPressIn}
        onPressOut={press.onPressOut}
        style={styles.iconTouch}>
        <Icon3D name={name} size={Icon3DSize.md} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Space.lg,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.md,
  },
  dots: { flex: 1 },
  content: { paddingHorizontal: Space.xl, paddingTop: Space.md },
  block: { gap: Space.xl },
  ask: { gap: Space.xs },
  step: { gap: Space.lg },
  preview: { alignItems: 'center' },
  // La misma card del inicio, a media anchura: lo que se ve aqui es lo que va a salir alla.
  card: { width: '62%', borderRadius: Radius.lg, padding: Space.lg, gap: Space.md },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  name: { minHeight: Touch.button, paddingTop: Space.sm },
  icons: { gap: Space.sm },
  iconGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: Space.sm },
  iconSlot: { borderRadius: Radius.md, borderWidth: 2 },
  iconTouch: {
    width: Touch.chip,
    height: Touch.chip,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { paddingHorizontal: Space.xl, paddingTop: Space.md, borderTopWidth: 1 },
});
