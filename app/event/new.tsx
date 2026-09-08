import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field } from '../../src/components/ui';
import { createEvent } from '../../src/lib/eventsApi';
import { useMe, useTagStore } from '../../src/store/useTagStore';
import { colors, radius, type } from '../../src/theme';
import { EVENT_TYPE_LABELS, EVENT_TYPES, type EventType } from '../../src/types';

const DAY = 86_400_000;

/** Whole hours from now — enough for "tonight at 9" without a date picker. */
const PRESETS = [
  { label: 'Tonight', at: () => atHour(0, 21) },
  { label: 'Tomorrow', at: () => atHour(1, 21) },
  { label: 'This weekend', at: () => nextWeekend() },
] as const;

function atHour(daysAhead: number, hour: number) {
  const d = new Date(Date.now() + daysAhead * DAY);
  d.setHours(hour, 0, 0, 0);
  return d.getTime();
}

function nextWeekend() {
  const d = new Date();
  // 6 = Saturday.
  const delta = (6 - d.getDay() + 7) % 7 || 7;
  return atHour(delta, 21);
}

export default function NewEvent() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const rememberEvent = useTagStore((s) => s.rememberEvent);

  const [name, setName] = useState('');
  const [eventType, setEventType] = useState<EventType>('party');
  const [description, setDescription] = useState('');
  const [location, setLocation] = useState('');
  const [city, setCity] = useState('');
  const [ticketUrl, setTicketUrl] = useState('');
  const [startsAt, setStartsAt] = useState<number | undefined>(atHour(0, 21));
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = name.trim().length >= 2 && !!me;

  const submit = async () => {
    if (!ready || !me || busy) return;
    setBusy(true);
    setError(null);
    try {
      const event = await createEvent(
        {
          name,
          type: eventType,
          description,
          location,
          city,
          startsAt,
          ticketUrl: ticketUrl.trim() || undefined,
          visibility,
        },
        me.id
      );
      rememberEvent(event);
      router.replace({ pathname: '/event/[id]', params: { id: event.id } });
    } catch {
      setError("Couldn't create the event. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>Host an event</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={s.close}>Close</Text>
          </Pressable>
        </View>

        <View style={{ gap: 16 }}>
          <Field
            label="What is it"
            value={name}
            onChangeText={setName}
            placeholder="Streaming in Lekki"
            autoCapitalize="sentences"
            maxLength={80}
          />

          <View style={{ gap: 6 }}>
            <Text style={s.label}>TYPE</Text>
            <View style={s.chips}>
              {EVENT_TYPES.map((t) => {
                const on = eventType === t;
                return (
                  <Pressable
                    key={t}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setEventType(t)}
                    style={[s.chip, on && s.chipOn]}>
                    <Text style={[s.chipText, on && s.chipTextOn]}>{EVENT_TYPE_LABELS[t]}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          <View style={{ gap: 6 }}>
            <Text style={s.label}>WHEN</Text>
            <View style={s.chips}>
              {PRESETS.map((p) => {
                const at = p.at();
                const on = startsAt === at;
                return (
                  <Pressable
                    key={p.label}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setStartsAt(at)}
                    style={[s.chip, on && s.chipOn]}>
                    <Text style={[s.chipText, on && s.chipTextOn]}>{p.label}</Text>
                  </Pressable>
                );
              })}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: startsAt === undefined }}
                onPress={() => setStartsAt(undefined)}
                style={[s.chip, startsAt === undefined && s.chipOn]}>
                <Text style={[s.chipText, startsAt === undefined && s.chipTextOn]}>TBC</Text>
              </Pressable>
            </View>
            {startsAt ? (
              <Text style={s.hint}>
                {new Date(startsAt).toLocaleString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'short',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            ) : null}
          </View>

          <Field
            label="Where"
            value={location}
            onChangeText={setLocation}
            placeholder="Venue or address"
            autoCapitalize="words"
          />
          <Field
            label="City"
            value={city}
            onChangeText={setCity}
            placeholder="Lagos"
            autoCapitalize="words"
          />
          <Field
            label="Details"
            value={description}
            onChangeText={setDescription}
            placeholder="Optional"
            autoCapitalize="sentences"
            maxLength={200}
          />
          <Field
            label="Ticket link"
            value={ticketUrl}
            onChangeText={setTicketUrl}
            placeholder="https://… (optional)"
            keyboardType="url"
          />
        </View>

        <View style={s.panel}>
          <Text style={s.label}>WHO CAN FIND IT</Text>
          {(
            [
              {
                key: 'public' as const,
                label: 'Public',
                sub: 'Shows in Discover and search. Can be boosted.',
              },
              {
                key: 'private' as const,
                label: 'Invite only',
                sub: 'Never listed anywhere. Only people you send the link to.',
              },
            ]
          ).map((opt) => {
            const on = visibility === opt.key;
            return (
              <Pressable
                key={opt.key}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setVisibility(opt.key)}
                style={[s.option, on && { borderColor: colors.snap }]}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text style={[s.optionLabel, on && { color: colors.snap }]}>{opt.label}</Text>
                  <Text style={s.optionSub}>{opt.sub}</Text>
                </View>
                <Text style={[s.radio, on && { color: colors.snap }]}>{on ? '●' : '○'}</Text>
              </Pressable>
            );
          })}
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Button
          label={busy ? 'Creating…' : 'Create event'}
          onPress={() => void submit()}
          disabled={!ready || busy}
        />
        <Text style={s.footnote}>
          You&apos;ll get a door code to print. People who scan it are checked in and verified as
          having been there.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, gap: 22 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...type.h1, color: colors.text },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  label: { ...type.label, color: colors.textDim },
  hint: { fontSize: 12, color: colors.snap, fontWeight: '600' },
  chips: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
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
  panel: {
    gap: 10,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 13,
  },
  optionLabel: { fontSize: 15, fontWeight: '800', color: colors.text },
  optionSub: { fontSize: 11.5, color: colors.textDim, lineHeight: 16 },
  radio: { fontSize: 16, color: colors.textDim },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  footnote: { fontSize: 11, color: colors.textDim, textAlign: 'center', lineHeight: 16 },
});
