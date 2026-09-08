import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, radius, type } from '../theme';
import { EVENT_TYPE_LABELS, type TagEvent } from '../types';
import { Pill } from './ui';

const DAY = 86_400_000;

/** "Tonight", "Tomorrow", "Sat 12 Sep" — how people actually talk about dates. */
export function formatWhen(startsAt?: number): string {
  if (!startsAt) return 'Date TBC';
  const now = new Date();
  const then = new Date(startsAt);
  const days = Math.round(
    (new Date(then).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / DAY
  );
  const time = then.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

  if (days < 0) return 'Ended';
  if (days === 0) return `Tonight · ${time}`;
  if (days === 1) return `Tomorrow · ${time}`;
  if (days < 7) return `${then.toLocaleDateString(undefined, { weekday: 'long' })} · ${time}`;
  return `${then.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

export function EventCard({
  event,
  onPress,
  active,
  hosting,
}: {
  event: TagEvent;
  onPress: () => void;
  /** Scans are currently being attributed to this event. */
  active?: boolean;
  hosting?: boolean;
}) {
  const boosted = Boolean(event.boostedUntil && event.boostedUntil > Date.now());

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${event.name}, ${formatWhen(event.startsAt)}`}
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        active && { borderColor: colors.snap },
        pressed && { opacity: 0.75 },
      ]}>
      <View style={s.topRow}>
        <Text style={s.when} numberOfLines={1}>
          {formatWhen(event.startsAt)}
        </Text>
        {/* Paid placement is labelled. Nobody should have to guess why
            something is at the top of a feed. */}
        {event.sponsored ? (
          <Pill color={colors.snap} filled>
            FEATURED
          </Pill>
        ) : boosted ? (
          <Pill color={colors.snap}>BOOSTED</Pill>
        ) : null}
      </View>

      <Text style={s.name} numberOfLines={2}>
        {event.name}
      </Text>

      {event.location || event.city ? (
        <Text style={s.place} numberOfLines={1}>
          {[event.location, event.city].filter(Boolean).join(' · ')}
        </Text>
      ) : null}

      <View style={s.metaRow}>
        <Pill>{EVENT_TYPE_LABELS[event.type].toUpperCase()}</Pill>
        {event.attendeeCount > 0 ? (
          <Text style={s.meta}>{event.attendeeCount} checked in</Text>
        ) : null}
        {event.hostName && !hosting ? (
          <Text style={s.meta} numberOfLines={1}>
            by {event.hostName}
          </Text>
        ) : null}
        {hosting ? <Pill color={colors.good}>HOSTING</Pill> : null}
        {active ? <Pill color={colors.snap}>● ACTIVE</Pill> : null}
        {event.visibility === 'private' ? <Pill color={colors.textDim}>PRIVATE</Pill> : null}
      </View>
    </Pressable>
  );
}

const s = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: 15,
    gap: 5,
    marginBottom: 10,
  },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  when: { fontSize: 12, fontWeight: '800', color: colors.snap, letterSpacing: 0.2 },
  name: { ...type.h2, color: colors.text, fontSize: 19 },
  place: { fontSize: 13, color: colors.textDim, fontWeight: '600' },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 4 },
  meta: { fontSize: 11, color: colors.textDim, fontWeight: '600' },
});
