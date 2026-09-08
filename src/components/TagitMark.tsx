import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { colors } from '../theme';

/**
 * The Tagit mark: a scan reticle around two linked nodes.
 *
 * Deliberately the same four corners as `ScanFrame` — the logo is the app's
 * own viewfinder rather than a badge applied to it, so the thing on the icon
 * is literally the thing you look through. Two dots joined by a bar: two
 * people, one scan.
 *
 * Geometry mirrors assets/brand/mark.svg. Change one, run `npm run icons`,
 * and change the other.
 */
export function TagitMark({ size = 48, color = colors.snap }: { size?: number; color?: string }) {
  // The viewBox does the scaling: stroke widths are authored on the 120-unit
  // grid and scale with the box, so nothing here depends on `size`.
  return (
    <Svg width={size} height={size} viewBox="0 0 120 120">
      <Path
        d="M8,34 L8,8 L34,8"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M86,8 L112,8 L112,34"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M8,86 L8,112 L34,112"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Path
        d="M112,86 L112,112 L86,112"
        stroke={color}
        strokeWidth={9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <Line x1={52} y1={60} x2={68} y2={60} stroke={color} strokeWidth={7} strokeLinecap="round" />
      <Circle cx={44} cy={60} r={9} fill={color} />
      <Circle cx={76} cy={60} r={9} fill={color} />
    </Svg>
  );
}

/** Mark plus wordmark, for the top of onboarding and sign-in. */
export function TagitLockup({ size = 44 }: { size?: number }) {
  return (
    <View style={styles.row}>
      <TagitMark size={size} />
      <Text style={[styles.word, { fontSize: size * 0.95 }]}>Tagit</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  word: {
    color: colors.text,
    fontWeight: '900',
    letterSpacing: -1.8,
  },
});
