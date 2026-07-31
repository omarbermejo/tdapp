import { Outfit_800ExtraBold } from '@expo-google-fonts/outfit/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Confetti } from '@/components/ui/confetti';
import { hydratePreference } from '@/constants/scheme-store';
import { useAccent, useNavTheme, useScheme, useTheme } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { useReminders } from '@/features/notifications/use-reminders';
import { useWidgetSync } from '@/features/widgets/use-widget-sync';

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

function RootNavigator() {
  const t = useTheme();
  const olive = useAccent('olive').solid;
  const { stage, token, user, loading, celebrating, stopCelebrating } = useAuth();
  // El widget solo tiene sentido con la cuenta lista: antes no hay tareas que enseñar.
  useWidgetSync(token, stage === 'ready');
  // La hora que prometió el onboarding, agendada de verdad. Mismo gate y mismo momento que el widget:
  // antes de 'ready' no hay perfil con hora ni tareas que avisar.
  useReminders(token, user, stage === 'ready');
  // Los titulares son la fuente cargada: sin ella la primera pantalla parpadea con otra tipografia.
  const [fontsLoaded, fontError] = useFonts({ Outfit_800ExtraBold });

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

  useEffect(() => {
    const id = setTimeout(() => void SplashScreen.hideAsync().catch(() => {}), SPLASH_CAP_MS);
    return () => clearTimeout(id);
  }, []);

  if (!ready) {
    return (
      <View style={[styles.loading, { backgroundColor: t.canvas }]}>
        <ActivityIndicator size="large" color={olive} />
      </View>
    );
  }

  /**
   * Los cuatro estados del alta son excluyentes, asi que solo hay una pantalla disponible a la
   * vez y no hace falta anchor. El fade evita que pasar de un estado a otro se lea como un
   * push desde el lado equivocado.
   */
  return (
    <>
      <Stack
        screenOptions={{ headerShown: false, animation: 'fade', contentStyle: { backgroundColor: t.canvas } }}>
        <Stack.Protected guard={stage === 'guest'}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={stage === 'verify'}>
          <Stack.Screen name="verify" />
        </Stack.Protected>
        <Stack.Protected guard={stage === 'onboarding'}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={stage === 'ready'}>
          <Stack.Screen name="(app)" />
        </Stack.Protected>
        {/* Banco de pruebas de la Isla Dinámica. Fuera de los guards y solo en desarrollo: se abre con
            `xcrun simctl openurl booted "tdapp:///la-preview"` sin navegar ni estar logueado. */}
        {__DEV__ && <Stack.Screen name="la-preview" />}
      </Stack>
      {/* Encima del navegador: el confeti sobrevive al cambio de grupo de rutas. */}
      {celebrating && <Confetti onDone={stopCelebrating} />}
    </>
  );
}

export default function RootLayout() {
  const navTheme = useNavTheme();
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
      <ThemeProvider value={navTheme}>
        <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
        <AuthProvider>
          <RootNavigator />
        </AuthProvider>
      </ThemeProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
