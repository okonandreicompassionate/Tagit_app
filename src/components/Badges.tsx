import { StyleSheet, Text, View } from 'react-native';
import { nextTier, tierFor, tierProgress } from '../lib/swag';
import { colors, radius, type } from '../theme';
import { Pill } from './ui';

export function TierBadge({ swag, filled }: { swag: number; filled?: boolean }) {
  const tier = tierFor(swag);
  return (
    <Pill color={tier.color} filled={filled}>
      {tier.name.toUpperCase()}
    </Pill>
  );
}

/** Swag total plus a bar showing how far off the next tier is. */
export function TierProgress({ swag }: { swag: number }) {
  const tier = tierFor(swag);
  const next = nextTier(swag);
  const pct = Math.max(0.02, Math.min(1, tierProgress(swag)));

  return (
    <View style={{ gap: 8 }}>
      <View style={s.row}>
        <Text style={[s.swag, { color: tier.color }]}>{swag.toLocaleString()} swag</Text>
        <Text style={s.next}>
          {next ? `${(next.min - swag).toLocaleString()} to ${next.name}` : 'Maxed out'}
        </Text>
      </View>
      <View
        style={s.track}
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(pct * 100) }}>
        <View style={[s.fill, { width: `${pct * 100}%`, backgroundColor: tier.color }]} />
      </View>
    </View>
  );
}

/**
 * The streak flame. Dims once the streak has lapsed rather than disappearing,
 * because "you're about to lose this" is the part that pulls people back.
 */
export function StreakFlame({
  count,
  alive,
  expiresIn,
}: {
  count: number;
  alive: boolean;
  expiresIn?: number | null;
}) {
  if (count < 2) return null;
  const urgent = alive && expiresIn != null && expiresIn <= 3;

  return (
    <View style={[s.flame, !alive && { opacity: 0.35 }]}>
      <Text style={s.flameIcon}>{alive ? '🔥' : '💨'}</Text>
      <Text style={[s.flameCount, urgent && { color: colors.danger }]}>{count}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  swag: { ...type.h2 },
  next: { fontSize: 12, fontWeight: '600', color: colors.textDim },
  track: {
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill },
  flame: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  flameIcon: { fontSize: 14 },
  flameCount: { fontSize: 13, fontWeight: '900', color: colors.flame },
});
