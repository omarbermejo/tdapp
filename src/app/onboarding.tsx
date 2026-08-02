import { useState } from "react";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, { FadeInDown, FadeOutDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { AccentPicker } from "@/components/ui/accent-picker";
import { BackButton } from "@/components/ui/back-button";
import { BigButton } from "@/components/ui/big-button";
import { BigField } from "@/components/ui/big-field";
import { Micro } from "@/components/ui/card";
import { Choice } from "@/components/ui/choice";
import { DateField } from "@/components/ui/date-field";
import { FormError } from "@/components/ui/form-error";
import { Icon3D, Icon3DSize, type Icon3DName } from "@/components/ui/icon3d";
import { ProgressRing } from "@/components/ui/progress-ring";
import { StepDots } from "@/components/ui/step-dots";
import {
    AccentContext,
    Motion,
    RESHAPE,
    Radius,
    Space,
    Type,
    useAccent,
    useTheme,
    type AccentName,
} from "@/constants/theme";
import { ApiError, type ProfileInput, type User } from "@/features/auth/api";
import { useAuth } from "@/features/auth/auth-context";
import {
    PEAK_ENERGY,
    REMINDER_HOUR,
    REMINDER_STYLE,
    WORKSPACE_TAGS,
} from "@/features/auth/options";
import { askForNotifications } from "@/features/notifications/local";
import { AvatarPicker } from "@/features/profile/avatar-picker";
import { useAvatars } from "@/features/profile/use-avatars";
import { useLocalToday } from "@/features/tasks/day";
import { focusForTag, iconForTag } from "@/features/tasks/focus-accent";
import { workspacesApi } from "@/features/workspaces/api";
import { useScreenPadding } from "@/hooks/use-screen-padding";

/**
 * El alta, en ocho pasos.
 *
 * **Era un hilo de chat y ya no lo es.** La app preguntaba en burbujas y las respuestas se
 * acumulaban debajo, como una conversación. Se leía bonito la primera vez y mal a partir de la
 * segunda: el hilo crecía hacia abajo, cada respuesta empujaba la siguiente pregunta fuera de la
 * pantalla, y sobre todo **no se podía volver atrás** — una respuesta escrita en el hilo era una
 * respuesta cerrada. Para un alta que pide ocho cosas eso es una trampa.
 *
 * Ahora usa el chasis de `new-workspace`: cabecera con flecha y carril de puntos, un bloque por paso
 * que entra y sale, y la zona de acción FIJA abajo. Se retrocede, se ve cuánto falta, y el botón
 * está siempre en el mismo sitio.
 *
 * **El orden pone la identidad primero.** Antes empezaba pidiendo crear un espacio de trabajo, que es
 * la pregunta más pesada de las ocho y la primera que alguien ve de la app. Ahora arranca por la cara
 * y el color: dos toques, respuesta inmediata en pantalla, y de paso el resto del alta ya se pinta
 * con el color elegido. El espacio pasa al final y **se puede omitir** — es lo único de aquí que se
 * crea igual de bien desde dentro de la app.
 */

/** Lo que un paso necesita saber de sí mismo. `key` solo existe para volver al que falló. */
type Step = {
  key: keyof ProfileInput | "avatar" | "workspace" | "alerts";
  ask: string;
  hint?: string;
  /** Se puede seguir sin contestar. Solo el espacio: los demás datos los usa la app. */
  skippable?: boolean;
};

const STEPS: readonly Step[] = [
  {
    key: "avatar",
    ask: "¿Cuál es tu cara?",
    hint: "La vas a ver en tu perfil y en la barra.",
  },
  {
    key: "accentColor",
    ask: "Elige tu color",
    hint: "Pinta la app entera, y también tu inicial.",
  },
  {
    key: "peakEnergy",
    ask: "¿Cuándo rindes mejor?",
    hint: "Con eso ordeno tu día.",
  },
  { key: "reminderStyle", ask: "¿Cómo te recuerdo las cosas?" },
  { key: "reminderHour", ask: "¿A qué hora te escribo?" },
  { key: "birthDate", ask: "¿Cuándo naciste?" },
  {
    key: "workspace",
    ask: "¿En qué vas a trabajar?",
    hint: "Tu primer espacio: la tesis, la mudanza, el trabajo. Puedes dejarlo para después.",
    skippable: true,
  },
  {
    key: "alerts",
    ask: "¿Te aviso?",
    hint: "Un empujón a la hora que elegiste. Nada más.",
  },
] as const;

/**
 * El bloque del paso entra y sale; el chasis se queda. Es la misma pareja que `new-workspace`.
 *
 * Aquí SÍ hay `exiting`, al contrario que los paneles del perfil: esto no vive dentro de una `Card`
 * que encoja, así que nada queda dibujado fuera de su caja.
 */
const STEP_IN = FadeInDown.duration(Motion.enter);
const STEP_OUT = FadeOutDown.duration(Motion.exit);

/** El borrador del primer espacio. Vive fuera de `form` porque no es un campo del perfil. */
type Draft = { name: string; tag: string };

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
  const { user, token, finishOnboarding, signOut } = useAuth();
  const t = useTheme();
  const pad = useScreenPadding(0);
  const insets = useSafeAreaInsets();
  const today = useLocalToday();
  const avatars = useAvatars(today);

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<ProfileInput>(() => profileOf(user!));
  const [draft, setDraft] = useState<Draft>({ name: "", tag: "" });
  /** Se omitió el espacio. Distinto de "no lo ha contestado todavía". */
  const [skipped, setSkipped] = useState(false);
  const [error, setError] = useState("");
  const [fields, setFields] = useState<Record<string, string>>({});
  /** Lo que falta para poder avanzar. Es del paso actual, no del guardado. */
  const [nudge, setNudge] = useState("");
  const [saving, setSaving] = useState(false);

  /**
   * El tinte del color elegido, pedido ARRIBA con el resto de hooks.
   *
   * `useAccent` es un hook: dentro de un paso condicional sería una llamada que aparece y desaparece
   * según el paso, que es exactamente lo que rompe el orden de los hooks. Mismo argumento que en
   * `new-workspace`.
   */
  const picked = useAccent(form.accentColor);

  const current = STEPS[step];
  const last = step === STEPS.length - 1;

  const answer = (
    key: keyof ProfileInput,
    value: ProfileInput[keyof ProfileInput],
  ) => {
    setNudge("");
    setForm((f) => ({ ...f, [key]: value }));
  };

  /**
   * Elegir ya es responder: avanza solo, con una pausa para que se vea el rebote del chip.
   *
   * No aplica a los pasos que necesitan confirmar (la cara, el color, la fecha y el espacio): ahí la
   * elección se puede corregir varias veces antes de estar bien, y avanzar al primer toque
   * convertiría un tanteo en un salto.
   */
  const answerAndAdvance = (
    key: keyof ProfileInput,
    value: ProfileInput[keyof ProfileInput],
  ) => {
    answer(key, value);
    setTimeout(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 320);
  };

  /** Si el paso actual da para seguir. La cara y el color siempre tienen valor, así que siempre. */
  const ready =
    current.key === "workspace"
      ? skipped || (draft.name.trim().length > 0 && draft.tag !== "")
      : current.key === "birthDate"
        ? // `!!` y no `!== null`: el perfil puede llegar del API SIN el campo, y `undefined !== null`
          // es cierto — el guard dejaba pasar el paso con la fecha vacia y se guardaba sin ella.
          !!form.birthDate
        : true;

  /**
   * Guardar es DOS escrituras y su orden importa: primero el espacio, después el perfil.
   *
   * `finishOnboarding` es lo que voltea el guard y desmonta esta pantalla, así que tiene que ir al
   * final — al revés, un fallo al crear el espacio dejaría a la persona ya dentro de la app con el
   * error pintado sobre una pantalla que ya no existe.
   *
   * Con el espacio omitido no se crea nada y el perfil se guarda sin `activeWorkspaceId`: se entra a
   * la app en modo general, que es un estado que la app ya sabe pintar.
   */
  const save = async (withAlerts: boolean) => {
    if (!token) return;
    setError("");
    setFields({});
    setSaving(true);
    try {
      if (withAlerts) await askForNotifications();

      const space =
        skipped || !draft.tag
          ? null
          : (
              await workspacesApi.create(token, {
                name: draft.name.trim(),
                tag: draft.tag,
                icon: iconForTag(draft.tag),
                accent: form.accentColor,
              })
            ).workspace;

      await finishOnboarding({
        ...form,
        // El foco sale de la clasificacion en vez de una pregunta propia. Sin espacio no hay foco
        // que derivar, y la app ordena el dia igual: es lo que ya hace en modo general.
        focusAreas: space ? focusForTag(draft.tag) : [],
        ...(space ? { activeWorkspaceId: space.id } : {}),
      });
    } catch (e) {
      if (e instanceof ApiError) {
        setFields(e.fields);
        /**
         * A qué pregunta volver. El alta del espacio rechaza por `name`, `tag`, `icon` o `accent`, y
         * las tres primeras son del ESPACIO y no de la persona, así que se resuelven a mano contra su
         * paso antes de buscar en `STEPS`.
         */
        const ofSpace = ["name", "tag", "icon"].some((k) => e.fields[k]);
        const failed = ofSpace
          ? STEPS.findIndex((s) => s.key === "workspace")
          : STEPS.findIndex((s) => e.fields[s.key]);
        if (failed >= 0) setStep(failed);
        setError(failed >= 0 ? "" : e.message);
      } else {
        setError("Algo salió mal");
      }
    } finally {
      setSaving(false);
    }
  };

  /**
   * El botón NO se apaga: un primario en disabled deja su etiqueta en un contraste malísimo y se lee
   * como app rota. Si falta la respuesta, el toque dice qué falta.
   */
  const advance = () => {
    if (last) return void save(true);
    if (ready) {
      setNudge("");
      return setStep(step + 1);
    }
    if (current.key === "birthDate")
      return setNudge("Revisa la fecha para seguir.");
    setNudge(
      draft.name.trim()
        ? "Elige de qué va para seguir."
        : "Ponle un nombre para seguir.",
    );
  };

  // Despues de todos los hooks: al cerrar sesion el user se vuelve null.
  if (!user) return null;

  return (
    /**
     * El color se prueba EN VIVO, antes de guardarse: la sesión todavía no lo tiene, porque
     * `finishOnboarding` corre al final. Adelantando el borrador local, elegirlo repinta la pantalla
     * entera — el carril de puntos, el botón, los chips — que es la única confirmación que ese paso
     * puede dar.
     */
    <AccentContext value={form.accentColor}>
      <View style={[styles.screen, { backgroundColor: t.canvas }]}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.screen}
        >
          <View style={[styles.header, { paddingTop: pad.top }]}>
            {/*
              Retroceder, que es lo que el hilo de chat no dejaba hacer.
              En el paso 0 no hay a dónde volver DENTRO del alta, así que la salida es cambiar de
              correo: `signOut` devuelve al login, y el API deja reclamar un correo sin verificar
              registrándose otra vez.
            */}
            <BackButton
              onPress={() => (step === 0 ? void signOut() : setStep(step - 1))}
            />
            <View style={styles.dots}>
              <StepDots total={STEPS.length} current={step} />
            </View>
          </View>

          <ScrollView
            contentContainerStyle={[
              styles.content,
              { paddingBottom: Space.lg },
            ]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Animated.View layout={RESHAPE} style={styles.block}>
              <View style={styles.ask}>
                <Micro>
                  {last ? "Ya casi" : `Paso ${step + 1} de ${STEPS.length}`}
                </Micro>
                <Text style={[Type.title, { color: t.text }]}>
                  {current.ask}
                </Text>
                {!!current.hint && (
                  <Text style={[Type.body, { color: t.textMuted }]}>
                    {current.hint}
                  </Text>
                )}
              </View>

              {current.key === "avatar" && (
                <Animated.View
                  entering={STEP_IN}
                  exiting={STEP_OUT}
                  style={styles.step}
                >
                  {/*
                    El vestidor entero, el mismo de "Cómo te ves". Guarda al toque con
                    `updateProfile`, así que la cara ya está puesta antes de terminar el alta — y por
                    eso este paso no necesita nada que confirmar.
                  */}
                  <AvatarPicker user={user} avatars={avatars} />
                </Animated.View>
              )}

              {current.key === "accentColor" && (
                <Animated.View
                  entering={STEP_IN}
                  exiting={STEP_OUT}
                  style={styles.step}
                >
                  <AccentPicker
                    value={form.accentColor}
                    onChange={(value: AccentName) =>
                      answer("accentColor", value)
                    }
                  />
                </Animated.View>
              )}

              {current.key === "peakEnergy" && (
                <Animated.View
                  entering={STEP_IN}
                  exiting={STEP_OUT}
                  style={styles.step}
                >
                  <Choice
                    options={PEAK_ENERGY}
                    value={form.peakEnergy}
                    onChange={(v) => answerAndAdvance("peakEnergy", v)}
                  />
                </Animated.View>
              )}

              {current.key === "reminderStyle" && (
                <Animated.View
                  entering={STEP_IN}
                  exiting={STEP_OUT}
                  style={styles.step}
                >
                  <Choice
                    options={REMINDER_STYLE}
                    value={form.reminderStyle}
                    onChange={(v) => answerAndAdvance("reminderStyle", v)}
                  />
                </Animated.View>
              )}

              {current.key === "reminderHour" && (
                <Animated.View
                  entering={STEP_IN}
                  exiting={STEP_OUT}
                  style={styles.step}
                >
                  <Choice
                    options={REMINDER_HOUR}
                    value={String(form.reminderHour)}
                    onChange={(v) =>
                      answerAndAdvance("reminderHour", Number(v))
                    }
                  />
                </Animated.View>
              )}

              {current.key === "birthDate" && (
                <Animated.View
                  entering={STEP_IN}
                  exiting={STEP_OUT}
                  style={styles.step}
                >
                  <DateField
                    label="Tu fecha"
                    value={form.birthDate}
                    onChange={(value) => answer("birthDate", value)}
                    error={fields.birthDate}
                  />
                </Animated.View>
              )}

              {current.key === "workspace" && (
                <Animated.View
                  entering={STEP_IN}
                  exiting={STEP_OUT}
                  style={styles.step}
                >
                  {/*
                    La vista previa es la CARD de verdad, igual que en `new-workspace`: enseña lo que
                    vas a obtener y se repinta al elegir. Omitido, se apaga en vez de desaparecer —
                    que el hueco siga ahí es lo que dice que se puede volver.
                  */}
                  <View
                    style={[
                      styles.card,
                      { backgroundColor: t.surface, borderColor: t.line },
                      skipped && styles.faded,
                    ]}
                  >
                    <View style={styles.cardHead}>
                      <ProgressRing
                        done={0}
                        total={0}
                        accent={form.accentColor}
                      />
                      <Icon3D
                        name={
                          (draft.tag
                            ? iconForTag(draft.tag)
                            : "work") as Icon3DName
                        }
                        size={Icon3DSize.md}
                      />
                    </View>
                    <Text
                      style={[Type.section, { color: t.text }]}
                      numberOfLines={1}
                    >
                      {draft.name.trim() || "Sin nombre"}
                    </Text>
                    <View
                      style={[styles.chip, { backgroundColor: picked.soft }]}
                    >
                      <Text
                        style={[
                          Type.micro,
                          styles.chipLabel,
                          { color: t.text },
                        ]}
                      >
                        Sin tareas todavía
                      </Text>
                    </View>
                  </View>

                  <BigField
                    label="Cómo se llama"
                    value={draft.name}
                    onChangeText={(name) => {
                      setSkipped(false);
                      setNudge("");
                      setDraft((d) => ({ ...d, name }));
                    }}
                    placeholder="La tesis, la mudanza…"
                    error={fields.name}
                  />
                  <Choice
                    options={WORKSPACE_TAGS}
                    value={draft.tag}
                    onChange={(tag) => {
                      setSkipped(false);
                      setNudge("");
                      setDraft((d) => ({ ...d, tag }));
                    }}
                  />
                </Animated.View>
              )}

              {current.key === "alerts" && (
                <Animated.View
                  entering={STEP_IN}
                  exiting={STEP_OUT}
                  style={styles.step}
                >
                  <Text style={[Type.body, { color: t.textMuted }]}>
                    Los avisos son de este teléfono y no salen de aquí. Si dices
                    que no, la app funciona igual — solo dejo de escribirte.
                  </Text>
                </Animated.View>
              )}

              <FormError message={error} />
              <FormError message={nudge} />
            </Animated.View>
          </ScrollView>

          {/* La zona de acción es FIJA abajo: el botón no se va con el scroll. */}
          <View
            style={[
              styles.actions,
              {
                paddingBottom: insets.bottom + Space.md,
                backgroundColor: t.canvas,
                borderTopColor: t.line,
              },
            ]}
          >
            <BigButton
              label={last ? "Sí, avísame" : "Seguir"}
              loading={saving}
              disabled={saving}
              onPress={advance}
            />

            {/*
              Las dos salidas suaves, cada una en su paso. Van en `ghost` y debajo del primario: son
              alternativas, no la acción — y con el mismo peso se leerían como dos caminos iguales.
            */}
            {current.skippable && !skipped && (
              <BigButton
                label="Ahora no"
                variant="ghost"
                onPress={() => {
                  setSkipped(true);
                  setDraft({ name: "", tag: "" });
                  setNudge("");
                  setStep(step + 1);
                }}
              />
            )}
            {last && (
              <BigButton
                label="Ahora no"
                variant="ghost"
                onPress={() => void save(false)}
              />
            )}
          </View>
        </KeyboardAvoidingView>
      </View>
    </AccentContext>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: Space.md,
    paddingHorizontal: Space.xl,
    paddingBottom: Space.md,
  },
  /** `StepDots` reparte con `space-between`, así que necesita un ancho o se encoge y el carril muere. */
  dots: { flex: 1 },
  content: { paddingHorizontal: Space.xl, paddingTop: Space.md },
  block: { gap: Space.xl },
  ask: { gap: Space.xs },
  step: { gap: Space.lg },

  card: {
    borderRadius: Radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Space.lg,
    gap: Space.sm,
  },
  /** Omitido: sigue ahí, apagado. Desaparecer diría que ya no se puede volver. */
  faded: { opacity: 0.4 },
  cardHead: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  chip: {
    alignSelf: "flex-start",
    borderRadius: Radius.pill,
    paddingHorizontal: Space.md,
    paddingVertical: 6,
  },
  chipLabel: { letterSpacing: 0.4 },

  actions: {
    paddingHorizontal: Space.xl,
    paddingTop: Space.md,
    gap: Space.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
