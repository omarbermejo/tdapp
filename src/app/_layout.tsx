import { Fraunces_600SemiBold } from "@expo-google-fonts/fraunces/600SemiBold";
import { Outfit_500Medium } from "@expo-google-fonts/outfit/500Medium";
import { Outfit_600SemiBold } from "@expo-google-fonts/outfit/600SemiBold";
import { Outfit_800ExtraBold } from "@expo-google-fonts/outfit/800ExtraBold";
import { useFonts } from "expo-font";
import { Stack, ThemeProvider } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import { Confetti } from "@/components/ui/confetti";
import { hydratePreference } from "@/constants/scheme-store";
import {
  AccentContext,
  useNavTheme,
  useScheme,
  useTheme,
} from "@/constants/theme";
import { AuthProvider, useAuth } from "@/features/auth/auth-context";
import { Booting } from "@/features/cache/booting";
import { warmup } from "@/features/cache/warmup";
import { useReminders } from "@/features/notifications/use-reminders";
import { useWidgetSync } from "@/features/widgets/use-widget-sync";

/**
 * El splash se queda hasta que la app tiene todo lo que necesita para pintar la primera pantalla de
 * verdad. Va a nivel de módulo y no en un efecto: en un efecto llegaría después del primer render, que
 * es justo cuando el sistema ya lo habría escondido.
 *
 * El `catch` es obligatorio: en web el módulo nativo no existe y esto rechaza, y una promesa rechazada
 * a nivel de módulo tumba el arranque.
 */
void SplashScreen.preventAutoHideAsync().catch(() => {});

/** Se va con un fundido en vez de un corte. 260ms: lo suficiente para leerse como una transición. */
SplashScreen.setOptions({ fade: true, duration: 260 });

/**
 * Tope de seguridad. Si algo de lo que esperamos nunca llega (una fuente que no baja, una sesión que
 * se cuelga), el splash NO se puede quedar puesto para siempre — eso se lee como una app muerta. A los
 * cuatro segundos se va y la pantalla enseña lo que tenga, aunque sea el indicador de carga.
 */
const SPLASH_CAP_MS = 4000;

/** Cuando la pantalla de arranque empieza a decir que algo va mal. Antes del tope, para llegar a tiempo. */
const SLOW_MS = 2500;

function RootNavigator() {
  const t = useTheme();
  const { stage, token, user, loading, celebrating, stopCelebrating } =
    useAuth();
  // El widget solo tiene sentido con la cuenta lista: antes no hay tareas que enseñar.
  useWidgetSync(token, stage === "ready");
  // La hora que prometió el onboarding, agendada de verdad. Mismo gate y mismo momento que el widget:
  // antes de 'ready' no hay perfil con hora ni tareas que avisar.
  useReminders(token, user, stage === "ready");
  /**
   * Las fuentes de la app. Sin ellas la primera pantalla parpadea con otra tipografia.
   *
   * Los tres pesos de Outfit porque la fuente de marca tambien viste los CONTROLES (ver `Type` en
   * `constants/theme`): 800 para los titulares, 600 para micro-rotulos y botones, 500 para el valor
   * de una pastilla. Un peso que no se carga se cae a sans-serif en Android, no al de al lado.
   *
   * Fraunces es uno solo y va a un unico sitio: el titular del dia en Hoy.
   */
  const [fontsLoaded, fontError] = useFonts({
    Outfit_800ExtraBold,
    Outfit_600SemiBold,
    Outfit_500Medium,
    Fraunces_600SemiBold,
  });

  /**
   * `fontError` cuenta como listo: si la fuente no bajó, la app se pinta con la del sistema y eso es
   * mejor que quedarse en el splash.
   */
  const ready = !loading && (fontsLoaded || fontError);

  /**
   * Aquí muere el doble arranque.
   *
   * Antes la secuencia era splash → indicador de carga → app: el sistema escondía el splash en cuanto
   * el bundle cargaba, y entonces esta pantalla pintaba un `ActivityIndicator` mientras leía la sesión y
   * las fuentes. O sea DOS pantallas de espera seguidas, y la segunda es exactamente lo que un splash
   * existe para evitar. Manteniéndolo hasta `ready`, el indicador de abajo ya casi nunca se ve — solo si
   * salta el tope de seguridad.
   */
  useEffect(() => {
    if (!ready) return;
    void SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  /**
   * Calienta el cache con lo que el inicio va a pedir, en cuanto hay sesion.
   *
   * NO retiene el splash: se dispara y se olvida. Un splash que espera a la red se siente mas lento
   * que uno corto seguido de una pantalla que carga, aunque el total sea el mismo. Para cuando el
   * inicio monte, o los datos ya estan o siguen en vuelo — y en el segundo caso el hook comparte esa
   * misma peticion en vez de abrir otra.
   */
  useEffect(() => {
    if (token && stage === "ready") warmup(token);
  }, [token, stage]);

  /**
   * Si la espera se alarga, decirlo.
   *
   * El tope de seguridad ya esconde el splash a los cuatro segundos; esto enciende el aviso un poco
   * antes para que la pantalla de arranque tenga algo que contar en vez de girar en silencio.
   */
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (ready) return;
    const id = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(id);
  }, [ready]);

  useEffect(() => {
    const id = setTimeout(
      () => void SplashScreen.hideAsync().catch(() => {}),
      SPLASH_CAP_MS,
    );
    return () => clearTimeout(id);
  }, []);

  if (!ready) return <Booting slow={slow} />;

  /**
   * Los cuatro estados del alta son excluyentes, asi que solo hay una pantalla disponible a la
   * vez. El fade evita que pasar de un estado a otro se lea como un push desde el lado equivocado.
   *
   * Un fallback a (auth) si no hay stage definido, para evitar pantallas en blanco durante
   * transiciones rápidas de estado o cambios de sesión. `loading` también cuenta como un estado
   * de transición que debe mostrar algo en vez de blanco.
   */
  const activeStage = loading ? "guest" : stage || "guest";

  return (
    <>
      <Stack
        screenOptions={{
          headerShown: false,
          animation: "fade",
          contentStyle: { backgroundColor: t.canvas },
        }}
      >
        <Stack.Protected guard={activeStage === "guest"}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={activeStage === "verify"}>
          <Stack.Screen name="verify" />
        </Stack.Protected>
        <Stack.Protected guard={activeStage === "onboarding"}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={activeStage === "ready"}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
      </Stack>
      {/* Encima del navegador: el confeti sobrevive al cambio de grupo de rutas. */}
      {celebrating && <Confetti onDone={stopCelebrating} />}
    </>
  );
}

/**
 * El color de la app, ya con la sesión delante.
 *
 * Existe SOLO por el orden. `ThemeProvider` envolvía a `AuthProvider`, así que `useNavTheme` corría
 * fuera del alcance de la sesión y su `primary` estaba cableado a olive; y `useAccent()` no tenía
 * de dónde sacar el color de la persona. Bajándolo un nivel, el tema del navegador y el acento por
 * defecto salen los dos del mismo sitio y en el mismo render.
 *
 * `StatusBar` se queda arriba, en `RootLayout`: depende del esquema del aparato, no de quién entró.
 */
function Tinted() {
  const { user } = useAuth();
  const accent = user?.accentColor ?? null;

  return (
    <AccentContext value={accent}>
      <ThemeProvider value={useNavTheme(accent)}>
        <RootNavigator />
      </ThemeProvider>
    </AccentContext>
  );
}

export default function RootLayout() {
  // La barra de estado se invierte con el esquema: iconos oscuros sobre papel, claros sobre tinta.
  const scheme = useScheme();

  /**
   * Lee el tema guardado. Una vez y nada más, así que las dependencias van vacías.
   *
   * Mientras no ha leído, la preferencia es `system` — el default correcto —, así que un arranque no
   * parpadea salvo que la persona haya forzado un tema distinto al del teléfono; y ahí el salto dura
   * lo que tarda el Keychain. Guardar el tema fuera del perfil del servidor es a propósito: es una
   * decisión de ESTE aparato (el mismo usuario puede querer oscuro en el teléfono y claro en la tablet)
   * y tiene que funcionar antes de que haya sesión.
   */
  useEffect(() => {
    hydratePreference();
  }, []);

  return (
    // En iOS RNGH parcha la root view y los gestos cuelan sin esto; en Android no: sin esta
    // raiz el swipe de las filas no recibe ni un evento.
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <AuthProvider>
        <Tinted />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
