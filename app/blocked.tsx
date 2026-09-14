import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Empty } from '../src/components/ui';
import { displayName } from '../src/lib/payload';
import { type BlockedPerson, listBlocked, unblockCard } from '../src/lib/safety';
import { useMe } from '../src/store/useTagStore';
import { colors, radius, type } from '../src/theme';

/**
 * Blocking someone has to be reversible from somewhere, or it isn't really a
 * choice — this is that somewhere. Not reachable from the report flow itself
 * on purpose: someone blocking in the heat of the moment shouldn't be shown
 * the undo button in the same breath.
 */
export default function Blocked() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();

  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!me) return;
    void listBlocked(me.id).then(setPeople);
  }, [me]);

  useEffect(load, [load]);

  const confirmUnblock = (person: BlockedPerson) =>
    Alert.alert(
      `Unblock ${displayName(person.card)}?`,
      "They'll be able to scan you and link with you again.",
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Unblock',
          onPress: async () => {
            if (!me) return;
            setBusyId(person.card.id);
            await unblockCard(me.id, person.card.id);
            setBusyId(null);
            load();
          },
        },
      ]
    );

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Text style={s.title}>Blocked</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.close}>Close</Text>
        </Pressable>
      </View>

      {people === null ? null : people.length === 0 ? (
        <Empty title="Nobody's blocked" body="Block someone from their card and they'll show up here." />
      ) : (
        <View style={{ gap: 10 }}>
          {people.map((p) => (
            <View key={p.card.id} style={s.row}>
              <Avatar uri={p.card.avatar} name={p.card.name} size={44} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={s.name} numberOfLines={1}>
                  {displayName(p.card)}
                </Text>
                <Text style={s.since}>
                  Blocked{' '}
                  {new Date(p.since).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                disabled={busyId === p.card.id}
                onPress={() => confirmUnblock(p)}
                style={{ padding: 8, opacity: busyId === p.card.id ? 0.5 : 1 }}>
                <Text style={s.unblock}>Unblock</Text>
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, gap: 22 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  title: { ...type.h1, color: colors.text },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  name: { fontSize: 15, fontWeight: '700', color: colors.text },
  since: { fontSize: 11.5, color: colors.textDim, fontWeight: '600' },
  unblock: { color: colors.snap, fontSize: 13, fontWeight: '800' },
});
