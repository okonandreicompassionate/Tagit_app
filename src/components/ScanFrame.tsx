import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { colors, radius } from '../theme';

/**
 * The reticle over the camera. Pulses gently so the screen never looks frozen
 * while it's waiting for a code — the same trick Snap's scanner uses to signal
 * "I'm looking".
 */
export function ScanFrame({ size = 240, hint }: { size?: number; hint?: string }) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration: 1400,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] });
  const opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] });

  return (
    <View style={{ alignItems: 'center', gap: 20 }} pointerEvents="none">
      <Animated.View style={{ width: size, height: size, transform: [{ scale }], opacity }}>
        {(['tl', 'tr', 'bl', 'br'] as const).map((corner) => (
          <View key={corner} style={[s.corner, s[corner]]} />
        ))}
      </Animated.View>
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

const LEN = 46;
const W = 4;

const s = StyleSheet.create({
  corner: {
    position: 'absolute',
    width: LEN,
    height: LEN,
    borderColor: colors.snap,
  },
  tl: {
    top: 0,
    left: 0,
    borderTopWidth: W,
    borderLeftWidth: W,
    borderTopLeftRadius: radius.lg,
  },
  tr: {
    top: 0,
    right: 0,
    borderTopWidth: W,
    borderRightWidth: W,
    borderTopRightRadius: radius.lg,
  },
  bl: {
    bottom: 0,
    left: 0,
    borderBottomWidth: W,
    borderLeftWidth: W,
    borderBottomLeftRadius: radius.lg,
  },
  br: {
    bottom: 0,
    right: 0,
    borderBottomWidth: W,
    borderRightWidth: W,
    borderBottomRightRadius: radius.lg,
  },
  hint: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowRadius: 6,
  },
});
