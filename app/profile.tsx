import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TierProgress } from '../src/components/Badges';
import { Avatar, Empty, Pill, Stat } from '../src/components/ui';
import { displayName } from '../src/lib/payload';
import { useAbout, useCheckIns, useMe } from '../src/store/useTagStore';
import { colors, radius, type } from '../src/theme';
import { EVENT_TYPE_LABELS } from '../src/types';

/**
 * The profile — entirely derived, nothing typed.
 *
 * Every number here comes from a verified check-in or a real scan, which is
 * the point: a profile you can write by hand is a profile you can lie on. It
 * also means it can't be filled in early — a new user sees an empty record
 * and the only way to change that is to go somewhere.
 */
export default function Profile() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const about = useAbout();
  const checkins = useCheckIns();

  if (!me) return <View style={s.root} />;

  const earned = about.badges.filter((b) => b.earned);
  const next = about.badges.filter((b) => !b.earned).slice(0, 3);

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.close}>‹ Back</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/edit')}>
          <Text style={s.edit}>Edit card</Text>
        </Pressable>
      </View>

      <View style={{ alignItems: 'center', gap: 10 }}>
        <Avatar uri={me.avatar} name={me.name} size={92} ring={colors.snap} />
        <Text style={s.name}>{displayName(me)}</Text>
        <Text style={s.handle}>@{me.socials.snap ?? me.id}</Text>
        {/* The generated bio. */}
        <Text style={s.line}>{about.line}</Text>
      </View>

      <View style={s.panel}>
        <TierProgress swag={me.swag} />
        <Text style={s.note}>
          Swag comes only from verified check-ins and real scans. There is no way to earn it inside
          the app.
        </Text>
      </View>

      <View style={s.statsRow}>
        <Stat value={about.verifiedEvents} label="verified" />
        <Stat value={about.peopleMet} label="met" />
        <Stat value={about.bestStreak || '—'} label="best streak" />
        <Stat value={about.cities.length || '—'} label="cities" />
      </View>

      {about.unverifiedEvents > 0 ? (
        <Text style={s.note}>
          {about.unverifiedEvents} event{about.unverifiedEvents === 1 ? '' : 's'} joined by code
          without scanning the door — those don&apos;t count as attendance.
        </Text>
      ) : null}

      {earned.length ? (
        <View style={{ gap: 10 }}>
          <Text style={s.sectionLabel}>BADGES</Text>
          <View style={s.badgeRow}>
            {earned.map((b) => (
              <Pill key={b.key} color={colors.snap} filled>
                {b.label.toUpperCase()}
              </Pill>
            ))}
          </View>
        </View>
      ) : null}

      {next.length ? (
        <View style={{ gap: 10 }}>
          <Text style={s.sectionLabel}>NEXT UP</Text>
          {next.map((b) => (
            <View key={b.key} style={s.nextRow}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.nextLabel}>{b.label}</Text>
                <Text style={s.nextHint}>{b.hint}</Text>
              </View>
              <View style={s.track}>
                <View style={[s.fill, { width: `${Math.round(b.progress * 100)}%` }]} />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {about.topTypes.length ? (
        <View style={{ gap: 10 }}>
          <Text style={s.sectionLabel}>WHAT YOU GO TO</Text>
          <View style={s.badgeRow}>
            {about.topTypes.map((t) => (
              <Pill key={t.type}>
                {EVENT_TYPE_LABELS[t.type].toUpperCase()} · {t.count}
              </Pill>
            ))}
          </View>
        </View>
      ) : null}

      <View style={{ gap: 10 }}>
        <Text style={s.sectionLabel}>WHERE YOU&apos;VE BEEN</Text>
        {checkins.length === 0 ? (
          <Empty
            title="Nothing here yet"
            body="Scan a door code at an event and it starts filling in on its own."
          />
        ) : (
          checkins.map((c) => (
            <View key={c.eventId} style={s.historyRow}>
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.historyName} numberOfLines={1}>
                  {c.eventName}
                </Text>
                <Text style={s.historyMeta}>
                  {new Date(c.at).toLocaleDateString(undefined, {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                  {c.city ? ` · ${c.city}` : ''}
                </Text>
              </View>
              {c.method === 'qr' ? (
                <Pill color={colors.good}>✓ VERIFIED</Pill>
              ) : (
                <Pill color={colors.textDim}>BY CODE</Pill>
              )}
            </View>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, gap: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  edit: { color: colors.snap, fontSize: 14, fontWeight: '800' },
  name: { ...type.display, color: colors.text },
  handle: { fontSize: 14, fontWeight: '800', color: colors.snap },
  line: { ...type.body, color: colors.textDim, textAlign: 'center', lineHeight: 21 },
  panel: {
    gap: 10,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  note: { fontSize: 11.5, color: colors.textDim, lineHeight: 17 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-between' },
  sectionLabel: { ...type.label, color: colors.textDim },
  badgeRow: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  nextRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
  },
  nextLabel: { fontSize: 14, fontWeight: '700', color: colors.text },
  nextHint: { fontSize: 11.5, color: colors.textDim },
  track: {
    width: 84,
    height: 6,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
    overflow: 'hidden',
  },
  fill: { height: '100%', borderRadius: radius.pill, backgroundColor: colors.snap },
  historyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  historyName: { fontSize: 15, fontWeight: '700', color: colors.text },
  historyMeta: { fontSize: 11.5, color: colors.textDim, fontWeight: '600' },
});
