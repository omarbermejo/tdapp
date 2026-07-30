import { Stack } from 'expo-router';

import { Brand } from '@/constants/brand';

export const unstable_settings = { anchor: 'welcome' };

export default function AuthLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: Brand.ink },
        animation: 'slide_from_right',
      }}
    />
  );
}
