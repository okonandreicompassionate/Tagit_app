import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { EventCard } from '../src/components/EventCard';
import { Button, Empty, Field } from '../src/components/ui';
import { discoverEvents, myHostedEvents } from '../src/lib/eventsApi';
import { isLive } from '../src/lib/rest';
import { useJoinedEvents, useMe, useTagStore } from '../src/store/useTagStore';
import { colors, radius, type } from '../src/theme';
import { EVENT_TYPE_LABELS, EVENT_TYPES, type EventType, type TagEvent } from '../src/types';

type Tab = 'discover' | 'mine';

const DAY = 86_400_000;
const WHEN = [
  { key: 'any', label: 'Any time', until: undefined },
  { key: 'today', label: 'Today', until: DAY },
  { key: 'week', label: 'This week', until: 7 * DAY },
] as const;

/**
 * The events dashboard: discovery on one side, the events you've joined or are
 * hosting on the other. Deliberately a separate surface from your profile —
 * finding somewhere to go and looking at who you've met are different jobs.
 */
export default function Events() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const joined = useJoinedEvents();
  const joinEventByCode = useTagStore((s) => s.joinEventByCode);
  const activeEventId = useTagStore((s) => s.activeEventId);
  const setActiveEvent = useTagStore((s) => s.setActiveEvent);

  const [tab, setTab] = useState<Tab>('discover');
  const [feed, setFeed] = useState<TagEvent[] | null>(null);
  const [hosted, setHosted] = useState<TagEvent[]>([]);
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<EventType[]>([]);
  const [when, setWhen] = useState<(typeof WHEN)[number]['key']>('any');
  const [city, setCity] = useState('');
  const [feedError, setFeedError] = useState<string | null>(null);

  const [code, setCode] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setFeed(null);
    setFeedError(null);
    const until = WHEN.find((w) => w.key === when)?.until;
    try {
      setFeed(
        await discoverEvents({
          query: query.trim() || undefined,
          types: types.length ? types : undefined,
          city: city.trim() || undefined,
          until: until ? Date.now() + until : undefined,
        })
      );
    } catch {
      setFeedError("Couldn't load events.");
      setFeed([]);
    }
  }, [query, types, city, when]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!me) return;
    void myHostedEvents(me.id)
      .then(setHosted)
      .catch(() => setHosted([]));
  }, [me]);

  const join = async () => {
    if (!code.trim() || joining) return;
    setJoining(true);
    setJoinError(null);
    try {
      const event = await joinEventByCode(code);
      if (!event) {
        setJoinError("No event with that code. Check with whoever's running it.");
        return;
      }
      setCode('');
      router.push({ pathname: '/event/[id]', params: { id: event.id } });
    } catch {
      setJoinError("Couldn't reach the server. Try again in a moment.");
    } finally {
      setJoining(false);
    }
  };

  const toggleType = (t: EventType) =>
    setTypes((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));

  // Hosted events can also appear in `joined`; show each once.
  const mine = useMemo(() => {
    const seen = new Set<string>();
    return [...hosted, ...joined].filter((e) => {
      if (seen.has(e.id)) return false;
      seen.add(e.id);
      return true;
    });
  }, [hosted, joined]);

  return (
    <View style={[s.root, { paddingTop: insets.top + 14 }]}>
      <View style={s.header}>
        <Text style={s.title}>Events</Text>
        <View style={{ flexDirection: 'row', gap: 16, alignItems: 'center' }}>
          <Pressable accessibilityRole="button" onPress={() => router.push('/search')}>
            <Text style={s.headerLink}>Search</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={s.close}>Close</Text>
          </Pressable>
        </View>
      </View>

      <View style={s.tabs}>
        {(
          [
            { key: 'discover', label: 'Discover' },
            { key: 'mine', label: `Mine${mine.length ? ` ${mine.length}` : ''}` },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="button"
            accessibilityState={{ selected: tab === t.key }}
            onPress={() => setTab(t.key)}
            style={[s.tab, tab === t.key && s.tabOn]}>
            <Text style={[s.tabText, tab === t.key && s.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {tab === 'discover' ? (
        <FlatList<TagEvent>
          data={feed ?? []}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingHorizontal: 16 }}
          ListHeaderComponent={
            <View style={{ gap: 12, paddingBottom: 14 }}>
              <Button label="Browse the feed" variant="dark" onPress={() => router.push('/feed')} />
              <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search events, venues, cities"
                placeholderTextColor={colors.textDim}
                style={s.search}
                accessibilityLabel="Search events"
              />

              <FlatList
                horizontal
                data={EVENT_TYPES}
                keyExtractor={(t) => t}
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 7 }}
                renderItem={({ item }) => {
                  const on = types.includes(item);
                  return (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => toggleType(item)}
                      style={[s.chip, on && s.chipOn]}>
                      <Text style={[s.chipText, on && s.chipTextOn]}>
                        {EVENT_TYPE_LABELS[item]}
                      </Text>
                    </Pressable>
                  );
                }}
              />

              <View style={{ flexDirection: 'row', gap: 7 }}>
                {WHEN.map((w) => {
                  const on = when === w.key;
                  return (
                    <Pressable
                      key={w.key}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setWhen(w.key)}
                      style={[s.chip, on && s.chipOn]}>
                      <Text style={[s.chipText, on && s.chipTextOn]}>{w.label}</Text>
                    </Pressable>
                  );
                })}
                <TextInput
                  value={city}
                  onChangeText={setCity}
                  placeholder="City"
                  placeholderTextColor={colors.textDim}
                  style={s.cityInput}
                  accessibilityLabel="Filter by city"
                />
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            feed === null ? (
              <View style={{ paddingTop: 50 }}>
                <ActivityIndicator color={colors.snap} />
              </View>
            ) : (
              <Empty
                title={feedError ?? 'Nothing on'}
                body={
                  feedError
                    ? 'Pull to try again.'
                    : 'No public events match that. Clear a filter, or host one yourself.'
                }
              />
            )
          }
          refreshing={false}
          onRefresh={() => void load()}
        />
      ) : (
        <FlatList<TagEvent>
          data={mine}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingBottom: insets.bottom + 90, paddingHorizontal: 16 }}
          ListHeaderComponent={
            <View style={{ gap: 12, paddingBottom: 16 }}>
              <View style={s.panel}>
                <Field
                  label="Join with a code"
                  value={code}
                  onChangeText={(v) => setCode(v.toUpperCase())}
                  placeholder="FLYTIME"
                  autoCapitalize="characters"
                  maxLength={16}
                  hint="Typing a code joins you. Scanning the door code proves you were there."
                />
                {joinError ? <Text style={s.error}>{joinError}</Text> : null}
                <Button
                  label={joining ? 'Joining…' : 'Join event'}
                  onPress={() => void join()}
                  disabled={!code.trim() || joining}
                />
              </View>
              {activeEventId ? (
                <Button
                  label="Stop tagging to an event"
                  variant="ghost"
                  onPress={() => setActiveEvent(null)}
                />
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View>
              <EventCard
                event={item}
                active={item.id === activeEventId}
                hosting={item.hostCardId === me?.id}
                onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } })}
              />
              {/* Boost was previously buried inside the event screen, so a host
                  had no way to discover they could pay for reach. */}
              {item.hostCardId === me?.id && item.visibility === 'public' ? (
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Boost ${item.name}`}
                  onPress={() =>
                    router.push({ pathname: '/event/boost', params: { id: item.id } })
                  }
                  style={s.boostRow}>
                  <Text style={s.boostText}>
                    {item.boostedUntil && item.boostedUntil > Date.now()
                      ? '● Boosted — extend'
                      : '↑ Boost this to reach more people'}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Empty
              title="No events yet"
              body="Join one with a code, scan a door code on the night, or host your own."
            />
          }
        />
      )}

      <View style={[s.fabWrap, { paddingBottom: insets.bottom + 14 }]}>
        <Button label="+ Host an event" onPress={() => router.push('/event/new')} />
        {!isLive ? (
          <Text style={s.offline}>Offline demo data — connect Supabase for real events.</Text>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { ...type.display, color: colors.text },
  headerLink: { fontSize: 13, fontWeight: '800', color: colors.snap },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 14 },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.snap, borderColor: colors.snap },
  tabText: { fontSize: 13, fontWeight: '800', color: colors.textDim },
  tabTextOn: { color: colors.snapInk },
  search: {
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  chip: {
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.snap, borderColor: colors.snap },
  chipText: { fontSize: 12, fontWeight: '700', color: colors.textDim },
  chipTextOn: { color: colors.snapInk },
  cityInput: {
    flex: 1,
    minWidth: 70,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 13,
    color: colors.text,
    fontSize: 12,
    fontWeight: '700',
  },
  panel: {
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  fabWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 6,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  offline: { fontSize: 10, color: colors.textDim, textAlign: 'center' },
  boostRow: {
    marginTop: -6,
    marginBottom: 10,
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.snap,
  },
  boostText: { fontSize: 12.5, fontWeight: '800', color: colors.snap },
});
