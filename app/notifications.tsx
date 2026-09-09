import { useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Empty } from '../src/components/ui';
import { listFriends, type Friend } from '../src/lib/friends';
import { displayName } from '../src/lib/payload';
import { useMe, useTagStore } from '../src/store/useTagStore';
import { colors, type } from '../src/theme';
import type { Card } from '../src/types';

type Item = { key: string; card: Card; at: number; text: string; unread: boolean };

const rel = (ts: number) => {
  const mins = Math.round((Date.now() - ts) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
};

/**
 * Everything that happened *to* you, in one list: scans and friend requests.
 * Nothing here is its own record — it's derived from data already synced
 * (Tagged's scan history) or fetched fresh (pending friend requests), so
 * there's no separate notifications table to keep consistent with the truth.
 */
export default function Notifications() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const tagged = useTagStore((s) => s.tagged);
  const lastSeen = useTagStore((s) => s.lastSeenNotificationsAt);
  const markSeen = useTagStore((s) => s.markNotificationsSeen);
  const [requests, setRequests] = useState<Friend[]>([]);

  useEffect(() => {
    if (!me) return;
    void listFriends(me.id)
      .then((all) => setRequests(all.filter((f) => f.status === 'pending' && f.theyAsked)))
      .catch(() => setRequests([]));
  }, [me]);

  // Marked seen on the way out, not on mount — so the badge and this list
  // still agree with each other while it's actually on screen.
  useEffect(() => {
    return () => markSeen();
  }, [markSeen]);

  const items = useMemo<Item[]>(() => {
    const scans: Item[] = Object.values(tagged).flatMap((p) =>
      p.links
        .filter((l) => l.direction === 'scanned_by')
        .map((l) => ({
          key: `scan-${p.card.id}-${l.at}`,
          card: p.card,
          at: l.at,
          text: 'scanned you' + (l.eventName ? ` at ${l.eventName}` : ''),
          unread: l.at > lastSeen,
        }))
    );
    const asks: Item[] = requests.map((f) => ({
      key: `req-${f.card.id}`,
      card: f.card,
      at: f.since,
      text: 'wants to be friends on Tagit',
      unread: f.since > lastSeen,
    }));
    return [...scans, ...asks].sort((a, b) => b.at - a.at);
  }, [tagged, requests, lastSeen]);

  return (
    <View style={s.root}>
      <View style={[s.header, { paddingTop: insets.top + 10 }]}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.back}>‹ Back</Text>
        </Pressable>
        <Text style={s.title}>Notifications</Text>
        <View style={{ width: 48 }} />
      </View>

      <FlatList<Item>
        data={items}
        keyExtractor={(item) => item.key}
        contentContainerStyle={{ paddingBottom: insets.bottom + 24, paddingTop: 4 }}
        ListEmptyComponent={
          <Empty title="Nothing yet" body="Scans and friend requests show up here." />
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push(`/card/${item.card.id}`)}
            style={({ pressed }) => [s.row, pressed && { backgroundColor: colors.surfaceHi }]}>
            {item.unread ? <View style={s.dot} /> : <View style={{ width: 6 }} />}
            <Avatar uri={item.card.avatar} name={item.card.name} size={46} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name} numberOfLines={1}>
                {displayName(item.card)}
              </Text>
              <Text style={s.text} numberOfLines={1}>
                {item.text}
              </Text>
            </View>
            <Text style={s.time}>{rel(item.at)}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
  },
  back: { color: colors.textDim, fontSize: 14, fontWeight: '700', width: 48 },
  title: { ...type.h2, color: colors.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.snap,
  },
  name: { ...type.h2, fontSize: 15, color: colors.text },
  text: { fontSize: 13, color: colors.textDim, fontWeight: '500' },
  time: { fontSize: 11, color: colors.textDim, fontWeight: '600' },
});
