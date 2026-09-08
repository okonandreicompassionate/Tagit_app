import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TierBadge } from '../src/components/Badges';
import { Avatar, Empty } from '../src/components/ui';
import * as api from '../src/lib/api';
import { useActiveEvent, useMe, useStats } from '../src/store/useTagStore';
import { colors, radius, type } from '../src/theme';
import type { LeaderRow } from '../src/types';

const medal = (rank: number) => (rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `${rank}`);

export default function Leaderboard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const event = useActiveEvent();
  const stats = useStats();

  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [scope, setScope] = useState<'event' | 'global'>(event ? 'event' : 'global');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setRows(null);
    setError(null);
    try {
      setRows(await api.getLeaderboard(scope === 'event' ? event?.id : undefined));
    } catch {
      setError("Couldn't load the leaderboard.");
      setRows([]);
    }
  }, [scope, event?.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // The user's own row is computed locally so it's correct even before a sync.
  const myRow: LeaderRow | null = me
    ? {
        cardId: me.id,
        name: me.nickname || me.name,
        handle: me.socials.snap ?? me.id,
        avatar: me.avatar,
        swag: me.swag,
        tags: stats.people,
      }
    : null;

  const merged = rows
    ? [...rows.filter((r) => r.cardId !== me?.id), ...(myRow ? [myRow] : [])].sort(
        (a, b) => b.swag - a.swag
      )
    : null;

  return (
    <View style={[s.root, { paddingTop: insets.top + 16 }]}>
      <View style={s.header}>
        <Text style={s.title}>Leaderboard</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.close}>Close</Text>
        </Pressable>
      </View>

      <View style={s.tabs}>
        {(['event', 'global'] as const).map((k) => {
          const on = scope === k;
          const disabled = k === 'event' && !event;
          return (
            <Pressable
              key={k}
              accessibilityRole="button"
              accessibilityState={{ selected: on, disabled }}
              disabled={disabled}
              onPress={() => setScope(k)}
              style={[s.tab, on && s.tabOn, disabled && { opacity: 0.35 }]}>
              <Text style={[s.tabText, on && s.tabTextOn]} numberOfLines={1}>
                {k === 'event' ? event?.name ?? 'No event' : 'Everyone'}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {merged === null ? (
        <View style={s.center}>
          <ActivityIndicator color={colors.snap} />
        </View>
      ) : (
        <FlatList<LeaderRow>
          data={merged}
          keyExtractor={(r) => r.cardId}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
          renderItem={({ item, index }) => {
            const isMe = item.cardId === me?.id;
            return (
              <View style={[s.row, isMe && s.rowMe]}>
                <Text style={[s.rank, index < 3 && { fontSize: 20 }]}>{medal(index + 1)}</Text>
                <Avatar
                  uri={item.avatar}
                  name={item.name}
                  size={40}
                  ring={isMe ? colors.snap : undefined}
                />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={s.name} numberOfLines={1}>
                    {isMe ? 'You' : item.name}
                  </Text>
                  <Text style={s.handle} numberOfLines={1}>
                    @{item.handle} · {item.tags} tags
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text style={s.swag}>{item.swag.toLocaleString()}</Text>
                  <TierBadge swag={item.swag} />
                </View>
              </View>
            );
          }}
          ListEmptyComponent={
            <Empty
              title={error ?? 'Nobody here yet'}
              body={
                error
                  ? 'Pull down or reopen to try again.'
                  : 'Scan someone to get on the board. First tag at an event is worth the most.'
              }
            />
          }
          refreshing={false}
          onRefresh={() => void load()}
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
    paddingHorizontal: 24,
  },
  title: { ...type.h1, color: colors.text },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingVertical: 16 },
  tab: {
    flex: 1,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  tabOn: { backgroundColor: colors.snap, borderColor: colors.snap },
  tabText: { fontSize: 12, fontWeight: '800', color: colors.textDim },
  tabTextOn: { color: colors.snapInk },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: radius.md,
  },
  rowMe: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.snap },
  rank: { width: 28, textAlign: 'center', color: colors.textDim, fontSize: 14, fontWeight: '900' },
  name: { ...type.h2, color: colors.text },
  handle: { fontSize: 12, color: colors.textDim, fontWeight: '600' },
  swag: { fontSize: 15, fontWeight: '900', color: colors.text },
});
