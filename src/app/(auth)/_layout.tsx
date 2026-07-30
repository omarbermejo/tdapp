import { Stack } from 'expo-router';

import { Theme } from '@/constants/theme';

export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Theme.canvas },
        animation: 'slide_from_right',
      }}
    />
  );
}
