import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PersonRow } from '../components/PersonRow';
import { Avatar, Button, Empty, Pill } from '../components/ui';
import { acceptFriend, listFriends, type Friend } from '../lib/friends';
import { TAB_BAR_HEIGHT } from '../lib/layout';
import { displayName } from '../lib/payload';
import { isLive } from '../lib/rest';
import { streakAlive } from '../lib/swag';
import { useMe, useTaggedList } from '../store/useTagStore';
import { colors, radius, type } from '../theme';
import type { TaggedPerson } from '../types';

type Tab = 'recent' | 'friends';
type Filter = 'all' | 'pending' | 'streaks';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Not added' },
  { key: 'streaks', label: 'Streaks' },
];

/**
 * Two lists over the same people, answering different questions.
 *
 * **Recent** is "who did I just meet" — everything scanned, newest first, and
 * it works offline because it comes from the local store.
 *
 * **Friends** is "who do I actually know" — the mutual, server-held list. A
 * scan creates the request and mutual scans accept it automatically, so most
 * friendships appear here without anyone tapping anything.
 */
export function TaggedPane({
  active,
  onOpenPerson,
  onBackToCamera,
}: {
  active: boolean;
  onOpenPerson: (cardId: string) => void;
  onBackToCamera: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useMe();
  const people = useTaggedList();

  const [tab, setTab] = useState<Tab>('recent');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [friends, setFriends] = useState<Friend[] | null>(null);

  const loadFriends = useCallback(async () => {
    if (!me || !isLive) {
      setFriends([]);
      return;
    }
    try {
      setFriends(await listFriends(me.id));
    } catch {
      setFriends([]);
    }
  }, [me]);

  // Refresh when the pane comes into view, so accepting on another device
  // shows up without restarting the app.
  useEffect(() => {
    if (active && tab === 'friends') void loadFriends();
  }, [active, tab, loadFriends]);

  const pending = people.filter((p) => !p.addedOnSnap).length;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter((p) => {
      if (filter === 'pending' && p.addedOnSnap) return false;
      if (filter === 'streaks' && !(p.streak >= 2 && streakAlive(p.links))) return false;
      if (!q) return true;
      return (
        displayName(p.card).toLowerCase().includes(q) ||
        p.card.name.toLowerCase().includes(q) ||
        Object.values(p.card.socials).some((h) => h?.toLowerCase().includes(q)) ||
        (p.note?.toLowerCase().includes(q) ?? false) ||
        p.links.some((l) => l.eventName?.toLowerCase().includes(q))
      );
    });
  }, [people, query, filter]);

  const visibleFriends = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = friends ?? [];
    if (!q) return list;
    return list.filter(
      (f) =>
        displayName(f.card).toLowerCase().includes(q) ||
        Object.values(f.card.socials).some((h) => h?.toLowerCase().includes(q))
    );
  }, [friends, query]);

  // Requests first: someone scanned you and is waiting.
  const requests = visibleFriends.filter((f) => f.status === 'pending' && f.theyAsked);
  const accepted = visibleFriends.filter((f) => f.status === 'accepted');
  const sent = visibleFriends.filter((f) => f.status === 'pending' && !f.theyAsked);

  const accept = async (otherId: string) => {
    if (!me) return;
    await acceptFriend(me.id, otherId);
    void loadFriends();
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <Text style={s.title}>People</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leaderboard"
          onPress={() => router.push('/leaderboard')}>
          <Text style={s.headerLink}>Leaderboard</Text>
        </Pressable>
      </View>

      <View style={s.tabs}>
        {(
          [
            { key: 'recent', label: `Recent${people.length ? ` ${people.length}` : ''}` },
            {
              key: 'friends',
              label: `Friends${requests.length ? ` · ${requests.length} new` : ''}`,
            },
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

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder={tab === 'recent' ? 'Search name, handle, event, note' : 'Search friends'}
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.search}
        accessibilityLabel="Search people"
      />

      {tab === 'recent' ? (
        <>
          <View style={s.filters}>
            {FILTERS.map((f) => {
              const on = filter === f.key;
              const count = f.key === 'pending' ? pending : null;
              return (
                <Pressable
                  key={f.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => setFilter(f.key)}
                  style={[s.chip, on && s.chipOn]}>
                  <Text style={[s.chipText, on && s.chipTextOn]}>
                    {f.label}
                    {count ? ` ${count}` : ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <FlatList<TaggedPerson>
            data={visible}
            keyExtractor={(p) => p.card.id}
            renderItem={({ item }) => (
              <PersonRow person={item} onPress={() => onOpenPerson(item.card.id)} />
            )}
            contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16, paddingHorizontal: 4 }}
            keyboardShouldPersistTaps="handled"
            removeClippedSubviews={!active}
            ListEmptyComponent={
              people.length === 0 ? (
                <Pressable onPress={onBackToCamera} accessibilityRole="button">
                  <Empty
                    title="Nobody scanned yet"
                    body="Tap Scan below and point it at someone's code. Tap here to go straight there."
                  />
                </Pressable>
              ) : (
                <Empty title="Nothing matches" body="Try a different name, handle or event." />
              )
            }
          />
        </>
      ) : (
        <FlatList<Friend>
          data={[...requests, ...accepted, ...sent]}
          keyExtractor={(f) => f.card.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 16, paddingHorizontal: 16 }}
          keyboardShouldPersistTaps="handled"
          refreshing={false}
          onRefresh={() => void loadFriends()}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`${displayName(item.card)}, ${item.status}`}
              onPress={() => onOpenPerson(item.card.id)}
              style={({ pressed }) => [s.friend, pressed && { backgroundColor: colors.surfaceHi }]}>
              <Avatar
                uri={item.card.avatar}
                name={item.card.name}
                size={46}
                ring={item.status === 'accepted' ? colors.snap : undefined}
              />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.friendName} numberOfLines={1}>
                  {displayName(item.card)}
                </Text>
                <Text style={s.friendHandle} numberOfLines={1}>
                  @{item.card.socials.snap ?? item.card.id}
                </Text>
              </View>
              {item.status === 'pending' && item.theyAsked ? (
                <Button label="Accept" onPress={() => void accept(item.card.id)} style={s.accept} />
              ) : item.status === 'pending' ? (
                <Pill>REQUESTED</Pill>
              ) : (
                <Pill color={colors.good}>FRIENDS</Pill>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            friends === null ? (
              <Empty title="Loading…" body="Fetching your friends." />
            ) : !isLive ? (
              <Empty
                title="Friends need the backend"
                body="Connect Supabase and friends sync across your phones."
              />
            ) : (
              <Empty
                title="No friends yet"
                body="Scanning someone sends a request. When you've both scanned, you're friends automatically."
              />
            )
          }
        />
      )}
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
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 12 },
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
  filters: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.snap, borderColor: colors.snap },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.textDim },
  chipTextOn: { color: colors.snapInk },
  friend: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    marginTop: 6,
  },
  friendName: { ...type.h2, color: colors.text, fontSize: 16 },
  friendHandle: { fontSize: 12.5, fontWeight: '700', color: colors.snap },
  accept: { height: 34, paddingHorizontal: 16 },
});
