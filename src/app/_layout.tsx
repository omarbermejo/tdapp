import { Outfit_800ExtraBold } from '@expo-google-fonts/outfit/800ExtraBold';
import { useFonts } from 'expo-font';
import { Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Accents, NavTheme, Theme } from '@/constants/theme';
import { AuthProvider, useAuth } from '@/features/auth/auth-context';

function RootNavigator() {
  const { user, loading } = useAuth();
  // Los titulares son la fuente cargada: sin ella la primera pantalla parpadea con otra tipografia.
  const [fontsLoaded, fontError] = useFonts({ Outfit_800ExtraBold });

  if (loading || (!fontsLoaded && !fontError)) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color={Accents.olive.solid} />
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Theme.canvas } }}>
      <Stack.Protected guard={!user}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={!!user}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider value={NavTheme}>
      <StatusBar style="dark" />
      <AuthProvider>
        <RootNavigator />
      </AuthProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    backgroundColor: Theme.canvas,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
