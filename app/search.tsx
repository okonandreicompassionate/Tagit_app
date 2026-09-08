import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
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
import { TierBadge } from '../src/components/Badges';
import { EventCard } from '../src/components/EventCard';
import { Avatar, Empty } from '../src/components/ui';
import { discoverEvents, searchUsers } from '../src/lib/eventsApi';
import { isLive } from '../src/lib/rest';
import { colors, radius, type } from '../src/theme';
import type { TagEvent, UserResult } from '../src/types';

type Scope = 'events' | 'people';

/**
 * Search across public events and people.
 *
 * Private events are absent by construction, not filtered here — the RLS
 * policy and the `event_feed` view only ever expose public ones, so there is
 * no query this screen could ask that would surface someone's private party.
 */
export default function Search() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [scope, setScope] = useState<Scope>('events');
  const [query, setQuery] = useState('');
  const [events, setEvents] = useState<TagEvent[] | null>(null);
  const [people, setPeople] = useState<UserResult[] | null>(null);

  const run = useCallback(async () => {
    const q = query.trim();
    if (scope === 'events') {
      setEvents(null);
      try {
        setEvents(await discoverEvents({ query: q || undefined, limit: 40 }));
      } catch {
        setEvents([]);
      }
    } else {
      if (!q) {
        setPeople([]);
        return;
      }
      setPeople(null);
      try {
        setPeople(await searchUsers(q));
      } catch {
        setPeople([]);
      }
    }
  }, [query, scope]);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const t = setTimeout(() => void run(), 300);
    return () => clearTimeout(t);
  }, [run]);

  const loading = scope === 'events' ? events === null : people === null;

  return (
    <View style={[s.root, { paddingTop: insets.top + 14 }]}>
      <View style={s.header}>
        <Text style={s.title}>Search</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.close}>Close</Text>
        </Pressable>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={scope === 'events' ? 'Events, venues, cities' : 'Name or @handle'}
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        autoFocus
        style={s.search}
        accessibilityLabel="Search"
      />

      <View style={s.tabs}>
        {(
          [
            { key: 'events', label: 'Events' },
            { key: 'people', label: 'People' },
          ] as const
        ).map((t) => (
          <Pressable
            key={t.key}
            accessibilityRole="button"
            accessibilityState={{ selected: scope === t.key }}
            onPress={() => setScope(t.key)}
            style={[s.tab, scope === t.key && s.tabOn]}>
            <Text style={[s.tabText, scope === t.key && s.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {loading ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.snap} />
        </View>
      ) : scope === 'events' ? (
        <FlatList<TagEvent>
          data={events ?? []}
          keyExtractor={(e) => e.id}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <EventCard
              event={item}
              onPress={() => router.push({ pathname: '/event/[id]', params: { id: item.id } })}
            />
          )}
          ListEmptyComponent={
            <Empty
              title="Nothing found"
              body="Only public events are searchable. Private ones stay off the directory entirely."
            />
          }
        />
      ) : (
        <FlatList<UserResult>
          data={people ?? []}
          keyExtractor={(p) => p.cardId}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${item.name}, @${item.handle}`}
              onPress={() => router.push({ pathname: '/card/[id]', params: { id: item.cardId } })}
              style={({ pressed }) => [s.person, pressed && { backgroundColor: colors.surfaceHi }]}>
              <Avatar uri={item.avatar} name={item.name} size={46} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.personName} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={s.personHandle} numberOfLines={1}>
                  @{item.handle}
                </Text>
              </View>
              <TierBadge swag={item.swag} />
            </Pressable>
          )}
          ListEmptyComponent={
            <Empty
              title={query.trim() ? 'No one found' : 'Search for someone'}
              body={
                !isLive
                  ? 'People search needs the backend connected.'
                  : 'Try a name, a nickname, or their Tagit handle.'
              }
            />
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 12,
  },
  title: { ...type.h1, color: colors.text },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  search: {
    marginHorizontal: 16,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceHi,
    paddingHorizontal: 16,
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 14 },
  tab: {
    flex: 1,
    height: 36,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabOn: { backgroundColor: colors.snap, borderColor: colors.snap },
  tabText: { fontSize: 13, fontWeight: '800', color: colors.textDim },
  tabTextOn: { color: colors.snapInk },
  person: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
  },
  personName: { ...type.h2, color: colors.text, fontSize: 16 },
  personHandle: { fontSize: 12.5, fontWeight: '700', color: colors.snap },
});
