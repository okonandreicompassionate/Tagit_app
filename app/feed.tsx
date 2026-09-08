import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatWhen } from '../src/components/EventCard';
import { Button, Empty, Pill } from '../src/components/ui';
import { discoverEvents } from '../src/lib/eventsApi';
import { colors, radius, type } from '../src/theme';
import { EVENT_TYPE_LABELS, type TagEvent } from '../src/types';

/**
 * The events feed: one event per screen, swipe up for the next.
 *
 * Artwork-led rather than list-led — which is the whole point, and also its
 * weakness: an event with no artwork gets a generated gradient instead, so the
 * feed still reads as a feed rather than a column of grey boxes. The gradient
 * is derived from the event id, so the same event always looks the same.
 */
export default function Feed() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { height, width } = Dimensions.get('window');

  const [events, setEvents] = useState<TagEvent[] | null>(null);

  const load = useCallback(async () => {
    try {
      setEvents(await discoverEvents({ limit: 40 }));
    } catch {
      setEvents([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (events === null) {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={colors.snap} />
      </View>
    );
  }

  if (events.length === 0) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 40 }]}>
        <Empty title="Nothing on yet" body="When events are listed, they show up here." />
        <View style={{ padding: 24 }}>
          <Button label="Back" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  return (
    <View style={s.root}>
      <FlatList<TagEvent>
        data={events}
        keyExtractor={(e) => e.id}
        pagingEnabled
        showsVerticalScrollIndicator={false}
        snapToInterval={height}
        decelerationRate="fast"
        // Each page is a full screen of images; keeping many mounted is the
        // fastest way to run a phone out of memory.
        windowSize={3}
        initialNumToRender={2}
        maxToRenderPerBatch={2}
        removeClippedSubviews
        getItemLayout={(_, index) => ({ length: height, offset: height * index, index })}
        renderItem={({ item }) => (
          <EventPage
            event={item}
            height={height}
            width={width}
            insets={{ top: insets.top, bottom: insets.bottom }}
            onOpen={() => router.push({ pathname: '/event/[id]', params: { id: item.id } })}
          />
        )}
      />

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Close feed"
        onPress={() => router.back()}
        style={[s.close, { top: insets.top + 10 }]}>
        <Text style={s.closeText}>✕</Text>
      </Pressable>
    </View>
  );
}

/** Stable per-event colours, so an event without artwork still has identity. */
function gradientFor(id: string): [string, string] {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  const hue = Math.abs(hash) % 360;
  return [`hsl(${hue}, 62%, 26%)`, `hsl(${(hue + 48) % 360}, 58%, 12%)`];
}

function EventPage({
  event,
  height,
  width,
  insets,
  onOpen,
}: {
  event: TagEvent;
  height: number;
  width: number;
  insets: { top: number; bottom: number };
  onOpen: () => void;
}) {
  const [from, to] = gradientFor(event.id);
  const boosted = Boolean(event.boostedUntil && event.boostedUntil > Date.now());

  const openTickets = async () => {
    if (!event.ticketUrl) return;
    try {
      await Linking.openURL(event.ticketUrl);
    } catch {
      // Nothing useful to say; the detail screen has the link too.
    }
  };

  return (
    <View style={{ height, width, backgroundColor: from }}>
      {event.artwork ? (
        <Image source={{ uri: event.artwork }} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: from }]}>
          <View style={[StyleSheet.absoluteFill, { backgroundColor: to, opacity: 0.65 }]} />
        </View>
      )}

      {/* Scrim: white type over an unknown photo is unreadable without one. */}
      <View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: 'rgba(0,0,0,0.42)' },
        ]}
      />

      <View style={[s.page, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 34 }]}>
        <View style={{ gap: 10 }}>
          <View style={s.pills}>
            <Pill color={colors.snap}>{EVENT_TYPE_LABELS[event.type].toUpperCase()}</Pill>
            {event.sponsored ? (
              <Pill color={colors.snap} filled>
                FEATURED
              </Pill>
            ) : boosted ? (
              <Pill color={colors.snap}>BOOSTED</Pill>
            ) : null}
          </View>

          <Text style={s.when}>{formatWhen(event.startsAt)}</Text>
          <Text style={s.name} numberOfLines={3}>
            {event.name}
          </Text>
          {event.location || event.city ? (
            <Text style={s.place} numberOfLines={1}>
              {[event.location, event.city].filter(Boolean).join(' · ')}
            </Text>
          ) : null}
          {event.description ? (
            <Text style={s.desc} numberOfLines={3}>
              {event.description}
            </Text>
          ) : null}
          {event.attendeeCount > 0 ? (
            <Text style={s.going}>{event.attendeeCount} checked in</Text>
          ) : null}

          <View style={{ gap: 8, marginTop: 8 }}>
            {event.ticketUrl ? (
              <Button label="Get tickets" onPress={() => void openTickets()} />
            ) : null}
            <Button
              label="See the event"
              variant={event.ticketUrl ? 'dark' : 'snap'}
              onPress={onOpen}
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  page: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: 22 },
  pills: { flexDirection: 'row', gap: 7, flexWrap: 'wrap' },
  when: { fontSize: 13, fontWeight: '800', color: colors.snap },
  name: { ...type.display, color: colors.text, fontSize: 38 },
  place: { ...type.body, color: colors.text, opacity: 0.85 },
  desc: { fontSize: 14.5, color: colors.text, opacity: 0.8, lineHeight: 20 },
  going: { fontSize: 12.5, fontWeight: '700', color: colors.snap },
  close: {
    position: 'absolute',
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeText: { color: colors.text, fontSize: 16, fontWeight: '800' },
});
