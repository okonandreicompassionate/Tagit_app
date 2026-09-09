import { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';
import { colors } from '../theme';

const PARTICLE_COLORS = [colors.snap, colors.good, colors.ig, colors.tiktok, colors.flame, '#FFFFFF'];
const COUNT = 16;

/**
 * A one-shot confetti burst — small colour chips that spring outward and
 * drift down, then fade. Mount it, it plays once, done. Reserved for the
 * handful of moments that earn one: a new card, a mutual add — never a
 * standing decoration.
 */
export function Confetti({ onDone }: { onDone?: () => void }) {
  const anim = useRef(new Animated.Value(0)).current;
  const particles = useMemo(
    () =>
      Array.from({ length: COUNT }, (_, i) => ({
        color: PARTICLE_COLORS[i % PARTICLE_COLORS.length],
        angle: (i / COUNT) * Math.PI * 2 + (Math.random() - 0.5) * 0.6,
        distance: 90 + Math.random() * 70,
        size: 6 + Math.random() * 5,
        spin: (Math.random() - 0.5) * 720,
      })),
    []
  );

  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 900,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) onDone?.();
    });
  }, [anim, onDone]);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p, i) => {
        const dx = Math.cos(p.angle) * p.distance;
        const dy = Math.sin(p.angle) * p.distance * 0.7 + p.distance * 0.5;
        return (
          <Animated.View
            key={i}
            style={[
              s.particle,
              {
                width: p.size,
                height: p.size * 0.6,
                backgroundColor: p.color,
                opacity: anim.interpolate({
                  inputRange: [0, 0.15, 0.8, 1],
                  outputRange: [0, 1, 1, 0],
                }),
                transform: [
                  { translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, dx] }) },
                  { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, dy] }) },
                  {
                    rotate: anim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', `${p.spin}deg`],
                    }),
                  },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  particle: { position: 'absolute', top: '46%', left: '50%', borderRadius: 2 },
});
