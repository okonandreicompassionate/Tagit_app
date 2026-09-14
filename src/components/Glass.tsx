import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, radius } from '../theme';

/**
 * The app's one frosted-glass surface — real blur (expo-blur), not a flat
 * tint pretending to be one. Used wherever floating UI sits over something
 * busy (the camera, artwork, a scrolling list) so it reads as translucent
 * depth rather than an opaque bar stamped on top. Same recipe everywhere —
 * blur, a sheen, a hairline border with a faint chromatic edge — so every
 * glassy surface in the app reads as one material, not a different
 * improvised effect per screen. Palette is untouched: `colors.snap` and
 * `colors.blue` are the only hues involved, both already in theme.ts.
 *
 * The "liquid" part is the sheen: a soft diagonal highlight (expo-linear-
 * gradient, already a dependency — no new native module) standing in for
 * light catching a curved glass surface, the way a flat blur alone never
 * quite does. `tint` picks which hue leaks faintly into the edge — `none`
 * for most surfaces, `snap`/`blue` for the ones meant to draw the eye (the
 * active tab, a primary action) without turning them into a solid fill.
 */
export function Glass({
  children,
  style,
  radius: cornerRadius = radius.lg,
  intensity = 55,
  tint = 'none',
  pointerEvents,
}: {
  children?: ReactNode;
  style?: StyleProp<ViewStyle>;
  radius?: number;
  intensity?: number;
  /** Which colour faintly tints the sheen and edge. `none` stays neutral. */
  tint?: 'none' | 'snap' | 'blue';
  pointerEvents?: 'auto' | 'none' | 'box-none' | 'box-only';
}) {
  const edge = tint === 'snap' ? colors.snap : tint === 'blue' ? colors.blue : '#FFFFFF';
  const edgeOpacity = tint === 'none' ? 0.12 : 0.32;

  return (
    <View style={[{ borderRadius: cornerRadius, overflow: 'hidden' }, style]} pointerEvents={pointerEvents}>
      <BlurView intensity={intensity} tint="dark" style={StyleSheet.absoluteFill} />
      <View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(255,255,255,0.035)' }]}
      />
      {/* The sheen: brightest at the top-left corner, gone by the middle —
          a glass panel lit from one side, not a symmetric glow. */}
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(255,255,255,0.16)', 'rgba(255,255,255,0.02)', 'rgba(255,255,255,0)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <View
        pointerEvents="none"
        style={[
          StyleSheet.absoluteFill,
          s.border,
          { borderRadius: cornerRadius, borderColor: hexToRgba(edge, edgeOpacity) },
        ]}
      />
      {children}
    </View>
  );
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const s = StyleSheet.create({
  border: { borderWidth: StyleSheet.hairlineWidth },
});
