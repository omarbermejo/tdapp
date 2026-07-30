import { Stack } from 'expo-router';

import { useTheme } from '@/constants/theme';

export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  const t = useTheme();
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: t.canvas },
        animation: 'slide_from_right',
      }}
    />
  );
}
