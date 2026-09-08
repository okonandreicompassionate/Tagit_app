import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { totalPoints, type Award } from '../lib/swag';
import { colors, radius } from '../theme';

/**
 * Slides in the points a scan just earned, then leaves on its own. Purely
 * feedback — dismissing it is handled by the parent's timer, so it never
 * blocks the camera.
 */
export function SwagToast({ awards, onDone }: { awards: Award[]; onDone: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const total = totalPoints(awards);

  useEffect(() => {
    Animated.sequence([
      Animated.timing(anim, {
        toValue: 1,
        duration: 280,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
      Animated.delay(2200),
      Animated.timing(anim, { toValue: 0, duration: 200, useNativeDriver: true }),
    ]).start(({ finished }) => {
      if (finished) onDone();
    });
  }, [anim, onDone]);

  if (total === 0) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        s.wrap,
        {
          opacity: anim,
          transform: [
            { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
            { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }) },
          ],
        },
      ]}>
      <Text style={s.total}>+{total} swag</Text>
      <View style={{ gap: 2 }}>
        {awards.map((a) => (
          <View key={a.rule} style={s.row}>
            <Text style={s.label}>{a.label}</Text>
            <Text style={s.points}>+{a.points}</Text>
          </View>
        ))}
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: colors.snap,
    borderRadius: radius.md,
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    minWidth: 200,
  },
  total: { color: colors.snapInk, fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  label: { color: colors.snapInk, fontSize: 12, fontWeight: '600', opacity: 0.8 },
  points: { color: colors.snapInk, fontSize: 12, fontWeight: '900' },
});
