import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button } from '../src/components/ui';
import { blockCard, REPORT_REASONS, reportCard, type ReportReason } from '../src/lib/safety';
import { useMe, useTagStore } from '../src/store/useTagStore';
import { colors, radius, type } from '../src/theme';

/**
 * Reporting someone or something.
 *
 * Two decisions worth noting. Blocking is offered *on the same screen* and
 * ticked by default when reporting a person — someone who has just been made
 * uncomfortable should not have to find a second screen to make it stop. And
 * the confirmation never says "we'll investigate": it says what will actually
 * happen, because promising review we can't guarantee is worse than saying
 * nothing.
 */
export default function Report() {
  const { card, event, name } = useLocalSearchParams<{
    card?: string;
    event?: string;
    name?: string;
  }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const untag = useTagStore((s) => s.untag);

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [detail, setDetail] = useState('');
  const [alsoBlock, setAlsoBlock] = useState(Boolean(card));
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const subject = name || (event ? 'this event' : 'this person');

  const submit = async () => {
    if (!reason || busy) return;
    setBusy(true);
    setError(null);

    const sent = await reportCard({
      reporterId: me?.id ?? null,
      targetCardId: card,
      targetEventId: event,
      reason,
      detail,
    });

    if (!sent) {
      setError("Couldn't send the report. Check your connection and try again.");
      setBusy(false);
      return;
    }

    if (alsoBlock && card && me) {
      await blockCard(me.id, card);
      // Take them off this phone too, so the block is visible immediately
      // rather than after the next sync.
      untag(card);
    }

    setBusy(false);
    setDone(true);
  };

  if (done) {
    return (
      <View style={[s.root, s.center, { padding: 28 }]}>
        <Text style={s.doneTitle}>Report sent</Text>
        <Text style={s.doneBody}>
          {alsoBlock && card
            ? `${subject} is blocked. They can't scan you, appear in your lists, or link with you again — and they aren't told.`
            : 'Thanks for telling us. Reports are reviewed by a person.'}
        </Text>
        <View style={{ height: 18 }} />
        <Button label="Done" onPress={() => router.dismissAll()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>Report</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={s.close}>Cancel</Text>
          </Pressable>
        </View>

        <Text style={s.blurb}>
          What&apos;s wrong with {subject}? This goes to us, not to them.
        </Text>

        <View style={{ gap: 8 }}>
          {REPORT_REASONS.map((r) => {
            const on = reason === r.key;
            return (
              <Pressable
                key={r.key}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setReason(r.key)}
                style={[s.reason, on && { borderColor: colors.snap }]}>
                <Text style={[s.reasonText, on && { color: colors.snap }]}>{r.label}</Text>
                <Text style={[s.radio, on && { color: colors.snap }]}>{on ? '●' : '○'}</Text>
              </Pressable>
            );
          })}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.label}>ANYTHING ELSE (OPTIONAL)</Text>
          <TextInput
            value={detail}
            onChangeText={setDetail}
            placeholder="What happened?"
            placeholderTextColor={colors.textDim}
            multiline
            maxLength={1000}
            style={s.detail}
            accessibilityLabel="Extra detail"
          />
        </View>

        {card ? (
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: alsoBlock }}
            onPress={() => setAlsoBlock((v) => !v)}
            style={[s.reason, alsoBlock && { borderColor: colors.snap }]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.reasonText, alsoBlock && { color: colors.snap }]}>
                Block them too
              </Text>
              <Text style={s.hint}>
                They can&apos;t link with you again, and they&apos;re never told.
              </Text>
            </View>
            <Text style={[s.radio, alsoBlock && { color: colors.snap }]}>
              {alsoBlock ? '●' : '○'}
            </Text>
          </Pressable>
        ) : null}

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Button
          label={busy ? 'Sending…' : 'Send report'}
          onPress={() => void submit()}
          disabled={!reason || busy}
        />

        <Text style={s.footnote}>
          If someone is in danger, contact your local emergency services. Tagit can&apos;t help
          with an emergency.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...type.h1, color: colors.text },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  blurb: { ...type.body, color: colors.textDim, lineHeight: 22 },
  label: { ...type.label, color: colors.textDim },
  reason: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 14,
  },
  reasonText: { flex: 1, fontSize: 15, fontWeight: '700', color: colors.text },
  hint: { fontSize: 11.5, color: colors.textDim, lineHeight: 16 },
  radio: { fontSize: 16, color: colors.textDim },
  detail: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHi,
    padding: 13,
    minHeight: 96,
    color: colors.text,
    fontSize: 15,
    textAlignVertical: 'top',
  },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  footnote: { fontSize: 11.5, color: colors.textDim, textAlign: 'center', lineHeight: 17 },
  doneTitle: { ...type.h1, color: colors.text, textAlign: 'center' },
  doneBody: {
    ...type.body,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 10,
  },
});
