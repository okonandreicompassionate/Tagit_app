import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field } from '../src/components/ui';
import { MOCK_EVENTS } from '../src/lib/mock';
import { isLive } from '../src/lib/api';
import { useTagStore } from '../src/store/useTagStore';
import { colors, radius, type } from '../src/theme';

/**
 * Events are how scans get attributed and how leaderboards stay meaningful.
 * You join with a short code the organiser hands out.
 */
export default function Events() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const events = useTagStore((s) => s.events);
  const activeEventId = useTagStore((s) => s.activeEventId);
  const joinEvent = useTagStore((s) => s.joinEvent);
  const setActiveEvent = useTagStore((s) => s.setActiveEvent);
  const tagged = useTagStore((s) => s.tagged);

  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tagsAt = (eventId: string) =>
    Object.values(tagged).reduce(
      (n, p) => n + p.links.filter((l) => l.eventId === eventId).length,
      0
    );

  const join = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const event = await joinEvent(code);
      if (!event) {
        setError("No event with that code. Check with whoever's running it.");
        return;
      }
      setCode('');
      router.back();
    } catch {
      setError("Couldn't reach the server. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
      keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Text style={s.title}>Events</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.close}>Close</Text>
        </Pressable>
      </View>

      <Text style={s.blurb}>
        While an event is active, every scan is tagged with it — so your Tagged list remembers
        where you met people, and you show up on that event's leaderboard.
      </Text>

      <View style={{ gap: 12 }}>
        <Field
          label="Event code"
          value={code}
          onChangeText={(v) => setCode(v.toUpperCase())}
          placeholder="FLYTIME"
          autoCapitalize="characters"
          maxLength={16}
        />
        {error ? <Text style={s.error}>{error}</Text> : null}
        <Button
          label={busy ? 'Joining…' : 'Join event'}
          onPress={() => void join()}
          disabled={!code.trim() || busy}
        />
      </View>

      {events.length ? (
        <View style={{ gap: 10 }}>
          <Text style={s.sectionLabel}>YOUR EVENTS</Text>
          {events.map((e) => {
            const on = e.id === activeEventId;
            return (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setActiveEvent(on ? null : e.id)}
                style={[s.row, on && { borderColor: colors.snap }]}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text style={s.rowTitle}>{e.name}</Text>
                  <Text style={s.rowMeta}>
                    {e.code} · {tagsAt(e.id)} tags
                  </Text>
                </View>
                <Text style={[s.rowState, on && { color: colors.snap }]}>
                  {on ? 'ACTIVE' : 'TAP TO USE'}
                </Text>
              </Pressable>
            );
          })}
          {activeEventId ? (
            <Button
              label="Stop tagging to an event"
              variant="ghost"
              onPress={() => setActiveEvent(null)}
            />
          ) : null}
        </View>
      ) : null}

      {!isLive ? (
        <View style={s.demo}>
          <Text style={s.sectionLabel}>DEMO CODES</Text>
          <Text style={s.rowMeta}>
            No backend wired up yet, so these are the codes the local directory knows:
          </Text>
          <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
            {MOCK_EVENTS.map((e) => (
              <Pressable
                key={e.id}
                accessibilityRole="button"
                onPress={() => setCode(e.code)}
                style={s.codeChip}>
                <Text style={s.codeChipText}>{e.code}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, paddingTop: 20, gap: 24 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...type.h1, color: colors.text },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  blurb: { ...type.body, color: colors.textDim, lineHeight: 22 },
  sectionLabel: { ...type.label, color: colors.textDim },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowTitle: { ...type.h2, color: colors.text },
  rowMeta: { fontSize: 12, color: colors.textDim, fontWeight: '600', lineHeight: 18 },
  rowState: { fontSize: 10, fontWeight: '900', color: colors.textDim, letterSpacing: 0.6 },
  demo: {
    gap: 10,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.snap,
  },
  codeChipText: { color: colors.snap, fontSize: 12, fontWeight: '800' },
});
