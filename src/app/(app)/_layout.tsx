import { Stack } from 'expo-router';

import { Theme } from '@/constants/theme';

// ponytail: una sola pantalla, no hace falta tab bar todavia.
export default function AppLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: Theme.canvas } }} />
  );
}
