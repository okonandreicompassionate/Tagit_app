import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { PersonRow } from '../components/PersonRow';
import { Empty } from '../components/ui';
import { displayName } from '../lib/payload';
import { streakAlive } from '../lib/swag';
import { useTaggedList } from '../store/useTagStore';
import { colors, radius, type } from '../theme';
import type { TaggedPerson } from '../types';

type Filter = 'all' | 'pending' | 'streaks';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'pending', label: 'Not added' },
  { key: 'streaks', label: 'Streaks' },
];

/** Everyone you've tagged. Sorted by most recent link, searchable by handle. */
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
  const people = useTaggedList();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

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

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      <View style={s.header}>
        <Text style={s.title}>Tagged</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leaderboard"
          onPress={() => router.push('/leaderboard')}>
          <Text style={s.headerLink}>Leaderboard</Text>
        </Pressable>
      </View>

      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search name, handle, event, note"
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        style={s.search}
        accessibilityLabel="Search tagged people"
      />

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
        contentContainerStyle={{ paddingBottom: insets.bottom + 70, paddingHorizontal: 4 }}
        keyboardShouldPersistTaps="handled"
        // Off-screen panes don't need to keep a live list warm.
        removeClippedSubviews={!active}
        ListEmptyComponent={
          people.length === 0 ? (
            <Pressable onPress={onBackToCamera} accessibilityRole="button">
              <Empty
                title="Nobody tagged yet"
                body="Swipe back to the camera and scan someone's code. Tap here to go straight there."
              />
            </Pressable>
          ) : (
            <Empty title="Nothing matches" body="Try a different name, handle or event." />
          )
        }
      />
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
});
