import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatWhen } from '../../src/components/EventCard';
import { SwagToast } from '../../src/components/SwagToast';
import { Button, Empty, Pill, Stat } from '../../src/components/ui';
import { deleteEvent, getEvent } from '../../src/lib/eventsApi';
import { encodeEvent } from '../../src/lib/payload';
import type { Award } from '../../src/lib/swag';
import { useTagStore } from '../../src/store/useTagStore';
import { colors, radius, type } from '../../src/theme';
import { EVENT_TYPE_LABELS, type TagEvent } from '../../src/types';

/**
 * One event. Does three different jobs depending on who's looking:
 * an attendee checks in, a browser buys a ticket, and the host gets the door
 * code to print plus the option to pay for reach.
 */
export default function EventScreen() {
  const { id, checkin } = useLocalSearchParams<{ id: string; checkin?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const me = useTagStore((s) => s.me);
  const checkIn = useTagStore((s) => s.checkIn);
  const rememberEvent = useTagStore((s) => s.rememberEvent);
  const setActiveEvent = useTagStore((s) => s.setActiveEvent);
  const myCheckin = useTagStore((s) => (id ? s.checkins[id] : undefined));
  const activeEventId = useTagStore((s) => s.activeEventId);
  const knownEvent = useTagStore((s) => (id ? s.events[id] : undefined));

  const [event, setEvent] = useState<TagEvent | null>(knownEvent ?? null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>(
    knownEvent ? 'ready' : 'loading'
  );
  const [awards, setAwards] = useState<Award[] | null>(null);
  // A door-code scan must check in exactly once, however often this re-renders.
  const checkedIn = useRef(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;

    (async () => {
      try {
        const found = knownEvent ?? (await getEvent(id));
        if (cancelled) return;
        if (!found) {
          setState('missing');
          return;
        }
        setEvent(found);
        setState('ready');
        rememberEvent(found);

        // `checkin=1` is set only by the scanner, so arriving here from the
        // events list never fakes attendance.
        if (checkin === '1' && !checkedIn.current) {
          checkedIn.current = true;
          const earned = checkIn(found, 'qr');
          if (earned.length) setAwards(earned);
        }
      } catch {
        if (!cancelled) setState('missing');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, knownEvent, checkin, checkIn, rememberEvent]);

  if (state === 'loading') {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={colors.snap} />
      </View>
    );
  }

  if (state === 'missing' || !event) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 40 }]}>
        <Empty
          title="Event not found"
          body="It may have been deleted, or the code belongs to a private event you weren't invited to."
        />
        <View style={{ padding: 24 }}>
          <Button label="Back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const hosting = event.hostCardId === me?.id;
  const verified = myCheckin?.method === 'qr';
  const isActive = activeEventId === event.id;

  const openTickets = async () => {
    if (!event.ticketUrl) return;
    try {
      await Linking.openURL(event.ticketUrl);
    } catch {
      Alert.alert("Couldn't open tickets", event.ticketUrl);
    }
  };

  const confirmDelete = () =>
    Alert.alert('Delete this event?', `${event.name} will be removed for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteEvent(event.id);
            router.back();
          } catch {
            Alert.alert("Couldn't delete it", 'Try again in a moment.');
          }
        },
      },
    ]);

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 130 },
        ]}
        showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={s.close}>‹ Back</Text>
          </Pressable>
          {hosting ? (
            <Pressable accessibilityRole="button" onPress={confirmDelete}>
              <Text style={s.delete}>Delete</Text>
            </Pressable>
          ) : null}
        </View>

        <View style={{ gap: 6 }}>
          <Text style={s.when}>{formatWhen(event.startsAt)}</Text>
          <Text style={s.name}>{event.name}</Text>
          {event.location || event.city ? (
            <Text style={s.place}>{[event.location, event.city].filter(Boolean).join(' · ')}</Text>
          ) : null}
        </View>

        <View style={s.pills}>
          <Pill>{EVENT_TYPE_LABELS[event.type].toUpperCase()}</Pill>
          {event.sponsored ? (
            <Pill color={colors.snap} filled>
              FEATURED
            </Pill>
          ) : null}
          {event.visibility === 'private' ? <Pill>PRIVATE</Pill> : null}
          {verified ? <Pill color={colors.good}>✓ YOU WERE THERE</Pill> : null}
          {hosting ? <Pill color={colors.good}>HOSTING</Pill> : null}
        </View>

        {event.description ? <Text style={s.desc}>{event.description}</Text> : null}

        <View style={s.statsRow}>
          <Stat value={event.attendeeCount} label="checked in" />
          {event.hostName ? <Stat value={event.hostName} label="host" /> : null}
        </View>

        {event.ticketUrl ? (
          <Button label="Get tickets" onPress={() => void openTickets()} />
        ) : null}

        {/* The host's door code. This is the thing that gets printed and taped
            up at the entrance — scanning it is what makes attendance verified. */}
        {hosting ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>DOOR CODE</Text>
            <Text style={s.panelBody}>
              Print this and put it on the door. Scanning it checks people in and proves they were
              here — typing the event code doesn&apos;t.
            </Text>
            <Text style={s.mono}>{encodeEvent(event.id)}</Text>
            {event.code ? <Text style={s.panelBody}>Spoken code: {event.code}</Text> : null}
            <Button
              label="Show the door code"
              variant="dark"
              onPress={() => router.push({ pathname: '/event/door', params: { id: event.id } })}
            />
          </View>
        ) : null}

        {hosting && event.visibility === 'public' ? (
          <View style={s.panel}>
            <Text style={s.panelTitle}>REACH</Text>
            <Text style={s.panelBody}>
              Boost this event to rank it above unboosted ones in Discover. Featured brand slots
              rank above every boost.
            </Text>
            <Button
              label="Boost this event"
              variant="dark"
              onPress={() => router.push({ pathname: '/event/boost', params: { id: event.id } })}
            />
          </View>
        ) : null}
      </ScrollView>

      {awards ? (
        <View style={[s.toast, { top: insets.top + 12 }]}>
          <SwagToast awards={awards} onDone={() => setAwards(null)} />
        </View>
      ) : null}

      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {verified ? (
          <Button
            label={isActive ? 'Scanning for this event' : 'Tagit people here'}
            variant={isActive ? 'dark' : 'snap'}
            onPress={() => {
              setActiveEvent(event.id);
              router.dismissAll();
            }}
          />
        ) : (
          <>
            <Button
              label="Scan the door code to check in"
              onPress={() => router.dismissAll()}
            />
            <Text style={s.footNote}>
              {myCheckin
                ? 'Joined by code. Scan the door code on the night to make it verified.'
                : 'Verified attendance only counts from the door code at the venue.'}
            </Text>
          </>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24, gap: 18 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  delete: { color: colors.danger, fontSize: 13, fontWeight: '700' },
  when: { fontSize: 13, fontWeight: '800', color: colors.snap },
  name: { ...type.display, color: colors.text },
  place: { ...type.body, color: colors.textDim },
  pills: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  desc: { ...type.body, color: colors.textDim, lineHeight: 22 },
  statsRow: { flexDirection: 'row', gap: 28 },
  panel: {
    gap: 10,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  panelTitle: { ...type.label, color: colors.textDim },
  panelBody: { fontSize: 12.5, color: colors.textDim, lineHeight: 18 },
  mono: { ...type.mono, color: colors.snap },
  toast: { position: 'absolute', left: 0, right: 0, alignItems: 'center' },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: 12,
    gap: 8,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  footNote: { fontSize: 11, color: colors.textDim, textAlign: 'center', lineHeight: 16 },
});
