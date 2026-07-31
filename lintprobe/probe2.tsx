import { useState } from 'react';
import { TextInput, View, type AccessibilityActionEvent } from 'react-native';
import { useIsScreenReaderEnabled } from 'react-native-gesture-handler';
import Animated, { useAnimatedProps, useSharedValue } from 'react-native-reanimated';

const AnimatedTextInput = Animated.createAnimatedComponent(TextInput);

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export function Probe2() {
  const [minutes, setMinutes] = useState(25);
  const reader = useIsScreenReaderEnabled();
  const live = useSharedValue(25);

  const props = useAnimatedProps(() => ({ text: `${Math.round(live.get())}` }) as any);

  const step = (e: AccessibilityActionEvent) => {
    const d = e.nativeEvent.actionName === 'increment' ? 1 : -1;
    setMinutes((m) => clamp(m + d * 5, 5, 60));
  };

  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel="Cuánto enfocas"
      accessibilityValue={{ min: 5, max: 60, now: minutes, text: `${minutes} minutos` }}
      accessibilityActions={[
        { name: 'increment', label: 'Cinco minutos más' },
        { name: 'decrement', label: 'Cinco minutos menos' },
      ]}
      onAccessibilityAction={step}>
      {reader ? null : (
        <AnimatedTextInput editable={false} animatedProps={props} defaultValue="25" />
      )}
    </View>
  );
}
