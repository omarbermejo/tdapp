import * as Haptics from 'expo-haptics';
import { Platform, StyleSheet, View, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

const DIAL = 264;
const R = DIAL / 2;
const STEP = Math.PI / 30;
const DEAD = 44;
const MIN = 1;
const MAX = 60;

const bump = () => {
  if (Platform.OS === 'android') {
    Haptics.performAndroidHapticsAsync(Haptics.AndroidHaptics.Clock_Tick).catch(() => {});
  } else {
    Haptics.selectionAsync().catch(() => {});
  }
};

export function Probe({
  minutes,
  onChange,
}: {
  minutes: number;
  onChange: (m: number) => void;
}) {
  const angle = useSharedValue(minutes * STEP);
  const held = useSharedValue(0);
  const grip = useSharedValue(0);
  const snapped = useSharedValue(minutes);

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      grip.set(Math.atan2(e.x - R, R - e.y));
      held.set(1);
    })
    .onUpdate((e) => {
      const dx = e.x - R;
      const dy = R - e.y;
      const theta = Math.atan2(dx, dy);
      if (dx * dx + dy * dy < DEAD * DEAD) {
        grip.set(theta);
        return;
      }
      let d = theta - grip.get();
      if (d > Math.PI) d -= 2 * Math.PI;
      else if (d < -Math.PI) d += 2 * Math.PI;
      grip.set(theta);

      const next = Math.min(MAX * STEP, Math.max(MIN * STEP, angle.get() + d));
      angle.set(next);

      const m = Math.round(next / STEP);
      if (m !== snapped.get()) {
        snapped.set(m);
        scheduleOnRN(bump);
        scheduleOnRN(onChange, m);
      }
    })
    .onFinalize(() => {
      held.set(0);
      angle.set(snapped.get() * STEP);
    });

  const knob = useAnimatedStyle(() => ({
    transform: [{ rotate: `${snapped.get() * STEP}rad` }],
    opacity: held.get() ? 1 : 0.7,
  }));

  return (
    <GestureDetector gesture={pan}>
      <View style={styles.box}>
        <Animated.View style={[styles.slot, knob]}>
          <View style={styles.dot} />
        </Animated.View>
        <Text>{minutes}</Text>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  box: { width: DIAL, height: DIAL, alignItems: 'center', justifyContent: 'center' },
  slot: { position: 'absolute', top: 0, left: 0, width: DIAL, height: DIAL, alignItems: 'center' },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#000' },
});
