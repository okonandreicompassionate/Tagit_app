import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { radius } from '../theme';

/**
 * The app's one frosted-glass surface — real blur (expo-blur), not a flat
 * tint pretending to be one. Used wherever floating UI sits over something
 * busy (the camera, artwork, a scrolling list) so it reads as translucent
 * depth rather than an opaque bar stamped on top. Same recipe everywhere —
 * blur, a faint tint, a hairline light border — so every glassy surface in
 * the app reads as one material, not a different improvised effect per
 * screen. Palette is untouched: this is a treatment, not a new color.
 */
export function Glass({
  children,
  style,
  radius: cornerRadius = radius.lg,
  intensity = 40,
  pointerEvents,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}) {
  return (
    <View style={[{ borderRadius: cornerRadius, overflow: 'hidden' }, style]} pointerEvents={pointerEvents}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(255,255,255,0.035)' },
        ]}
      />
      <View pointerEvents="none" style={[StyleSheet.absoluteFill, s.border, { borderRadius: cornerRadius }]} />
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  border: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.10)',
  },
});
