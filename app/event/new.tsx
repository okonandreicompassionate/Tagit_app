import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Image,
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
import { createEvent, inviteToEvent, uploadArtwork } from '../../src/lib/eventsApi';
import { listFriends, type Friend } from '../../src/lib/friends';
import { isLive } from '../../src/lib/rest';
import { Avatar } from '../../src/components/ui';
import { displayName } from '../../src/lib/payload';
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

/** Hours after the start time that the door code stops accepting scans. */
const CUTOFF_PRESETS = [
  { label: '4 hours', hours: 4 },
  { label: '8 hours', hours: 8 },
  { label: '24 hours', hours: 24 },
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
  const [endsAt, setEndsAt] = useState<number | undefined>(undefined);
  const [visibility, setVisibility] = useState<'public' | 'private'>('public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [picker, setPicker] = useState<'date' | 'time' | null>(null);
  const [artwork, setArtwork] = useState<string | undefined>();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [invited, setInvited] = useState<string[]>([]);

  // Only accepted friends can be invited — a pending request isn't a friend yet.
  useEffect(() => {
    if (!me || !isLive) return;
    void listFriends(me.id)
      .then((all) => setFriends(all.filter((f) => f.status === 'accepted')))
      .catch(() => setFriends([]));
  }, [me]);

  const pickArtwork = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      // Portrait, because the feed is full-screen vertical.
      aspect: [9, 16],
      quality: 0.7,
    });
    if (!result.canceled) setArtwork(result.assets[0]?.uri);
  };

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
          endsAt,
          ticketUrl: ticketUrl.trim() || undefined,
          visibility,
        },
        me.id
      );

      // Poster and guests are best-effort: the event already exists, and
      // failing either shouldn't throw away what the user just typed.
      if (artwork) {
        const url = await uploadArtwork(event.id, artwork);
        if (url) event.artwork = url;
      }
      if (visibility === 'private' && invited.length) {
        await inviteToEvent(event.id, invited, me.id).catch(() => {
          setError('Event created, but the invites failed to send. Add guests from the event.');
        });
      }

      rememberEvent(event);
      router.replace({ pathname: '/event/[id]', params: { id: event.id } });
    } catch (err) {
      // Show what actually went wrong. Swallowing this is exactly why the
      // first round of "it's not saving" was impossible to diagnose.
      const detail = err instanceof Error ? err.message : String(err);
      setError(
        detail.toLowerCase().includes('permission') || detail.includes('42501')
          ? "You're not allowed to create events yet — try signing in again."
          : `Couldn't create the event. ${detail.slice(0, 160)}`
      );
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

          <View style={{ gap: 8 }}>
            <Text style={s.label}>WHEN</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pick a date"
                onPress={() => setPicker('date')}
                style={[s.pickBtn, { flex: 1.3 }]}>
                <Text style={s.pickLabel}>DATE</Text>
                <Text style={s.pickValue}>
                  {startsAt
                    ? new Date(startsAt).toLocaleDateString(undefined, {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })
                    : 'Not set'}
                </Text>
              </Pressable>

              <Pressable
                accessibilityRole="button"
                accessibilityLabel="Pick a time"
                onPress={() => setPicker('time')}
                style={[s.pickBtn, { flex: 1 }]}>
                <Text style={s.pickLabel}>TIME</Text>
                <Text style={s.pickValue}>
                  {startsAt
                    ? new Date(startsAt).toLocaleTimeString(undefined, {
                        hour: 'numeric',
                        minute: '2-digit',
                      })
                    : '--:--'}
                </Text>
              </Pressable>
            </View>

            <View style={s.chips}>
              {PRESETS.map((p) => (
                <Pressable
                  key={p.label}
                  accessibilityRole="button"
                  onPress={() => setStartsAt(p.at())}
                  style={s.chip}>
                  <Text style={s.chipText}>{p.label}</Text>
                </Pressable>
              ))}
              <Pressable
                accessibilityRole="button"
                accessibilityState={{ selected: startsAt === undefined }}
                onPress={() => setStartsAt(undefined)}
                style={[s.chip, startsAt === undefined && s.chipOn]}>
                <Text style={[s.chipText, startsAt === undefined && s.chipTextOn]}>TBC</Text>
              </Pressable>
            </View>

            {picker ? (
              <DateTimePicker
                value={new Date(startsAt ?? atHour(0, 21))}
                mode={picker}
                is24Hour={false}
                // Android shows a modal and fires once; iOS renders inline and
                // fires continuously, so it stays mounted until dismissed.
                display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                minimumDate={picker === 'date' ? new Date() : undefined}
                onChange={(event, picked) => {
                  if (Platform.OS !== 'ios') setPicker(null);
                  if (event.type === 'dismissed' || !picked) return;

                  // Each picker edits only its own half of the timestamp,
                  // otherwise choosing a time silently resets the date.
                  const base = new Date(startsAt ?? atHour(0, 21));
                  if (picker === 'date') {
                    base.setFullYear(picked.getFullYear(), picked.getMonth(), picked.getDate());
                  } else {
                    base.setHours(picked.getHours(), picked.getMinutes(), 0, 0);
                  }
                  setStartsAt(base.getTime());
                }}
              />
            ) : null}

            {Platform.OS === 'ios' && picker ? (
              <Button label="Done" variant="dark" onPress={() => setPicker(null)} />
            ) : null}

            {startsAt ? (
              <Text style={s.hint}>
                {new Date(startsAt).toLocaleString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: 'numeric',
                  minute: '2-digit',
                })}
              </Text>
            ) : null}
          </View>

          {startsAt ? (
            <View style={{ gap: 8 }}>
              <Text style={s.label}>SCAN CUTOFF</Text>
              <View style={s.chips}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: endsAt === undefined }}
                  onPress={() => setEndsAt(undefined)}
                  style={[s.chip, endsAt === undefined && s.chipOn]}>
                  <Text style={[s.chipText, endsAt === undefined && s.chipTextOn]}>No cutoff</Text>
                </Pressable>
                {CUTOFF_PRESETS.map((p) => {
                  const value = startsAt + p.hours * 3_600_000;
                  const on = endsAt === value;
                  return (
                    <Pressable
                      key={p.label}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      onPress={() => setEndsAt(value)}
                      style={[s.chip, on && s.chipOn]}>
                      <Text style={[s.chipText, on && s.chipTextOn]}>{p.label} after start</Text>
                    </Pressable>
                  );
                })}
              </View>
              <Text style={s.hint}>
                After this, the door code stops counting as check-in — keeps the guest list honest
                once the night's over. Doesn't affect people just browsing the event.
              </Text>
            </View>
          ) : null}

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

        <View style={{ gap: 8 }}>
          <Text style={s.label}>POSTER</Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={artwork ? 'Change poster' : 'Add a poster'}
            onPress={() => void pickArtwork()}
            style={s.artwork}>
            {artwork ? (
              <Image source={{ uri: artwork }} style={s.artworkImg} resizeMode="cover" />
            ) : (
              <View style={s.artworkEmpty}>
                <Text style={s.artworkPlus}>+</Text>
                <Text style={s.artworkHint}>Add a poster</Text>
              </View>
            )}
          </Pressable>
          <Text style={s.hint}>
            Portrait works best — this is what fills the screen in the feed.
          </Text>
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

          {visibility === 'private' ? (
            <View style={{ gap: 8, marginTop: 4 }}>
              <Text style={s.label}>
                GUEST LIST{invited.length ? ` · ${invited.length}` : ''}
              </Text>
              {friends.length === 0 ? (
                <Text style={s.hint}>
                  {isLive
                    ? 'No friends yet. Scan someone and they can be invited here.'
                    : 'Guest lists need the backend connected.'}
                </Text>
              ) : (
                friends.map((f) => {
                  const on = invited.includes(f.card.id);
                  return (
                    <Pressable
                      key={f.card.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: on }}
                      onPress={() =>
                        setInvited((prev) =>
                          on ? prev.filter((id) => id !== f.card.id) : [...prev, f.card.id]
                        )
                      }
                      style={[s.guest, on && { borderColor: colors.snap }]}>
                      <Avatar uri={f.card.avatar} name={f.card.name} size={34} />
                      <Text style={s.guestName} numberOfLines={1}>
                        {displayName(f.card)}
                      </Text>
                      <Text style={[s.radio, on && { color: colors.snap }]}>{on ? '●' : '○'}</Text>
                    </Pressable>
                  );
                })
              )}
            </View>
          ) : null}
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
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  pickBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceHi,
    paddingVertical: 10,
    paddingHorizontal: 14,
    gap: 2,
  },
  pickLabel: { fontSize: 9.5, fontWeight: '800', letterSpacing: 0.7, color: colors.textDim },
  pickValue: { fontSize: 15, fontWeight: '700', color: colors.text },
  artwork: {
    height: 180,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    overflow: 'hidden',
  },
  artworkImg: { width: '100%', height: '100%' },
  artworkEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 4 },
  artworkPlus: { fontSize: 30, color: colors.snap, fontWeight: '300' },
  artworkHint: { fontSize: 12.5, color: colors.textDim, fontWeight: '600' },
  guest: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 9,
  },
  guestName: { flex: 1, fontSize: 14.5, fontWeight: '700', color: colors.text },
  footnote: { fontSize: 11, color: colors.textDim, textAlign: 'center', lineHeight: 16 },
});
