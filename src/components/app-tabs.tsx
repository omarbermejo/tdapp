import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Accents, Brand } from '@/constants/brand';

export default function AppTabs() {
  return (
    <NativeTabs
      backgroundColor={Brand.inkSoft}
      indicatorColor={Accents.electric}
      labelStyle={{ color: Brand.textMute, selected: { color: Brand.text } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Home</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/home.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="explore">
        <NativeTabs.Trigger.Label>Explore</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          src={require('@/assets/images/tabIcons/explore.png')}
          renderingMode="template"
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
