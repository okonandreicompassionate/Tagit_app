import { Pressable, StyleSheet, Text, View } from 'react-native';
import { displayName } from '../lib/payload';
import { streakAlive, streakExpiresIn } from '../lib/swag';
import { colors, radius, type } from '../theme';
import type { TaggedPerson } from '../types';
import { StreakFlame } from './Badges';
import { Avatar } from './ui';

const rel = (ts: number) => {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
};

export function PersonRow({
  person,
  onPress,
}: {
  person: TaggedPerson;
  onPress: () => void;
}) {
  const last = person.links[person.links.length - 1];
  // The "why we met" line — the context you'd otherwise forget by next week.
  const context = person.note?.trim() || last?.eventName || `${person.links.length} scans`;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${displayName(person.card)}, ${context}`}
      onPress={onPress}
      style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceHi }]}>
      <Avatar
        uri={person.card.avatar}
        name={person.card.name}
        size={52}
        ring={person.addedOnSnap ? colors.snap : undefined}
      />
      <View style={{ flex: 1, gap: 3 }}>
        <View style={s.nameRow}>
          <Text style={s.name} numberOfLines={1}>
            {displayName(person.card)}
          </Text>
          <StreakFlame
            count={person.streak}
            alive={streakAlive(person.links)}
            expiresIn={streakExpiresIn(person.links)}
          />
        </View>
        <Text style={s.handle} numberOfLines={1}>
          @{person.card.socials.snap ?? person.card.id}
        </Text>
        <Text style={s.context} numberOfLines={1}>
          {context}
        </Text>
      </View>
      <View style={{ alignItems: 'flex-end', gap: 4 }}>
        <Text style={s.time}>{last ? rel(last.at) : ''}</Text>
        {!person.addedOnSnap ? <Text style={s.pending}>NOT ADDED</Text> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: radius.md,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { ...type.h2, color: colors.text, flexShrink: 1 },
  handle: { fontSize: 13, fontWeight: '700', color: colors.snap },
  context: { fontSize: 12, fontWeight: '500', color: colors.textDim },
  time: { fontSize: 11, fontWeight: '600', color: colors.textDim },
  pending: { fontSize: 9, fontWeight: '900', color: colors.flame, letterSpacing: 0.6 },
});
