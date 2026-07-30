import { Outfit_800ExtraBold } from '@expo-google-fonts/outfit/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { Confetti } from '@/components/ui/confetti';
import { useAccent, useNavTheme, useScheme, useTheme } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';
import { useWidgetSync } from '@/features/widgets/use-widget-sync';

function RootNavigator() {
  const t = useTheme();
  const olive = useAccent('olive').solid;
  const { stage, token, loading, celebrating, stopCelebrating } = useAuth();
  // El widget solo tiene sentido con la cuenta lista: antes no hay tareas que enseñar.
  useWidgetSync(token, stage === 'ready');
  // Los titulares son la fuente cargada: sin ella la primera pantalla parpadea con otra tipografia.
  const [fontsLoaded, fontError] = useFonts({ Outfit_800ExtraBold });

  if (loading || (!fontsLoaded && !fontError)) {
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
