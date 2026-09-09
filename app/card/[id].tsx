import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StreakFlame, TierBadge } from '../../src/components/Badges';
import { Confetti } from '../../src/components/Confetti';
import { SwagToast } from '../../src/components/SwagToast';
import { Avatar, Button, Empty, Pill } from '../../src/components/ui';
import * as api from '../../src/lib/api';
import { acceptFriend } from '../../src/lib/friends';
import { displayName } from '../../src/lib/payload';
import { openSocial, SOCIALS, SOCIAL_ORDER } from '../../src/lib/socials';
import { streakAlive, streakExpiresIn, type Award } from '../../src/lib/swag';
import { useMe, useTagStore } from '../../src/store/useTagStore';
import { colors, radius, type } from '../../src/theme';
import type { Card } from '../../src/types';

/**
 * The pop-up after a scan. One job above all others: get them added on Snap
 * in a single tap. Everything else on this screen is secondary to that button.
 */
export default function CardSheet() {
  // `scan` is set only by the camera. Opening this sheet from the Tagged list
  // must never record a new link or award points. `incoming` is set only by
  // IncomingLinkWatcher, when this sheet opens because someone else just
  // scanned the viewer — the one case worth greeting differently, since
  // otherwise this looks identical to browsing your own Tagged list.
  const { id, event, scan, incoming } = useLocalSearchParams<{
    id: string;
    event?: string;
    scan?: string;
    incoming?: string;
  }>();
  const fromScan = scan === '1';
  const isIncoming = incoming === '1';
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const me = useMe();
  const tag = useTagStore((s) => s.tag);
  const setNote = useTagStore((s) => s.setNote);
  const markAddedOnSnap = useTagStore((s) => s.markAddedOnSnap);
  const untag = useTagStore((s) => s.untag);
  const setActiveEvent = useTagStore((s) => s.setActiveEvent);
  const person = useTagStore((s) => (id ? s.tagged[id] : undefined));
  const knownEvent = useTagStore((s) => (event ? s.events[event] : undefined));

  const [card, setCard] = useState<Card | null>(person?.card ?? null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>(
    person ? 'ready' : 'loading'
  );
  // Bumped to retry after a network failure, distinct from a genuinely
  // missing card — those aren't the same thing and shouldn't look the same.
  const [attempt, setAttempt] = useState(0);
  const [awards, setAwards] = useState<Award[] | null>(null);
  const [draftNote, setDraftNote] = useState(person?.note ?? '');
  // A scan must be recorded exactly once, even though this screen re-renders.
  const recorded = useRef(false);

  // If the scanned code carried an event we already joined, adopt it so this
  // scan and the ones after it get attributed without the user picking it.
  useEffect(() => {
    if (fromScan && knownEvent) setActiveEvent(knownEvent.id);
  }, [fromScan, knownEvent, setActiveEvent]);

  useEffect(() => {
    if (!id || recorded.current) return;
    let cancelled = false;
    setState((s) => (s === 'error' ? 'loading' : s));

    (async () => {
      try {
        const found = person?.card ?? (await api.getCard(id));
        if (cancelled) return;
        if (!found) {
          setState('missing');
          return;
        }
        setCard(found);
        setState('ready');
        recorded.current = true;
        if (fromScan) setAwards(tag(found, 'scanned'));
      } catch (err) {
        // A thrown error means the request itself failed — offline, timed
        // out, the server rejected it — which is not evidence the code is
        // bad. Conflating the two is what made a friend's phone being
        // offline for a second look identical to a code that never existed.
        if (!cancelled) {
          setState('error');
          if (__DEV__) console.warn('[card] getCard failed:', err);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [id, person?.card, tag, fromScan, attempt]);

  if (state === 'loading') {
    return (
      <View style={[s.root, s.center]}>
        <ActivityIndicator color={colors.snap} />
      </View>
    );
  }

  if (state === 'error') {
    return (
      <View style={[s.root, { paddingTop: insets.top + 40 }]}>
        <Empty
          title="Couldn't check that code"
          body="The request didn't reach the server — a signal drop, not a bad code. Try again."
        />
        <View style={{ padding: 24, gap: 8 }}>
          <Button label="Try again" onPress={() => setAttempt((a) => a + 1)} />
          <Button label="Back to camera" variant="ghost" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  if (state === 'missing' || !card) {
    return (
      <View style={[s.root, { paddingTop: insets.top + 40 }]}>
        <Empty
          title="No card behind that code"
          body="It might be an old code, or the person hasn't finished setting up Tagit yet."
        />
        <View style={{ padding: 24 }}>
          <Button label="Back to camera" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const snap = card.socials.snap;
  const others = SOCIAL_ORDER.filter((k) => k !== 'snap' && card.socials[k]);
  const links = person?.links ?? [];
  const streak = person?.streak ?? 0;

  const addOnSnap = async () => {
    if (!snap) return;
    markAddedOnSnap(card.id);
    // Adding on Snap is a deliberate, active second step — a stronger signal
    // of "we're actually connected" than the passive act of scanning a code
    // ever was. Treat it as consent on both sides: confirm the friendship
    // now rather than waiting on them to scan back. The row already exists
    // (this screen only exists because a scan created it), so this is an
    // update, never a fresh request landing unprompted in their list.
    if (me) void acceptFriend(me.id, card.id);
    await openSocial('snap', snap);
  };

  const confirmRemove = () =>
    Alert.alert('Remove them?', `${displayName(card)} comes off your Tagged list.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => {
          untag(card.id);
          router.back();
        },
      },
    ]);

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 120 }]}
        showsVerticalScrollIndicator={false}>
        <View style={s.grabber} />

        {isIncoming ? (
          <View style={s.incomingBanner}>
            <Text style={s.incomingText}>🎉 {displayName(card)} just scanned you</Text>
          </View>
        ) : null}

        <View style={{ alignItems: 'center', gap: 10 }}>
          <Avatar uri={card.avatar} name={card.name} size={92} ring={colors.snap} />
          <View style={{ alignItems: 'center', gap: 4 }}>
            <View style={s.nameRow}>
              <Text style={s.name}>{displayName(card)}</Text>
              <StreakFlame
                count={streak}
                alive={streakAlive(links)}
                expiresIn={streakExpiresIn(links)}
              />
            </View>
            {card.nickname && card.nickname !== card.name ? (
              <Text style={s.realName}>{card.name}</Text>
            ) : null}
          </View>

          <View style={s.pills}>
            <TierBadge swag={card.swag} />
            {card.snapScore ? (
              <Pill color={colors.snap}>
                {Intl.NumberFormat('en', { notation: 'compact' }).format(card.snapScore)} SNAP SCORE
              </Pill>
            ) : null}
            {links.length > 1 ? <Pill>{links.length} SCANS</Pill> : null}
          </View>
        </View>

        {others.length ? (
          <View style={s.others}>
            {others.map((k) => {
              const spec = SOCIALS[k];
              const handle = card.socials[k]!;
              return (
                <Pressable
                  key={k}
                  accessibilityRole="button"
                  accessibilityLabel={`Open ${spec.label} ${handle}`}
                  onPress={() => void openSocial(k, handle)}
                  style={({ pressed }) => [
                    s.otherBtn,
                    { borderColor: spec.color },
                    pressed && { opacity: 0.6 },
                  ]}>
                  <Text style={[s.otherLabel, { color: spec.color }]}>{spec.label}</Text>
                  <Text style={s.otherHandle} numberOfLines={1}>
                    {spec.prefix}
                    {handle}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        <View style={s.block}>
          <Text style={s.blockLabel}>HOW YOU MET</Text>
          <TextInput
            value={draftNote}
            onChangeText={setDraftNote}
            onEndEditing={() => setNote(card.id, draftNote.trim())}
            placeholder="Add a note while you still remember"
            placeholderTextColor={colors.textDim}
            multiline
            style={s.note}
            accessibilityLabel="Note about how you met"
          />
          {links.length ? (
            <View style={{ gap: 6, marginTop: 4 }}>
              {[...links]
                .reverse()
                .slice(0, 4)
                .map((l) => (
                  <Text key={l.at} style={s.historyLine}>
                    {new Date(l.at).toLocaleDateString(undefined, {
                      day: 'numeric',
                      month: 'short',
                    })}
                    {l.eventName ? ` · ${l.eventName}` : ''}
                  </Text>
                ))}
            </View>
          ) : null}
        </View>

        <Pressable accessibilityRole="button" onPress={confirmRemove} style={s.remove}>
          <Text style={s.removeText}>Remove from Tagged</Text>
        </Pressable>
      </ScrollView>

      {awards ? (
        <>
          <Confetti />
          <View style={[s.toast, { top: insets.top + 12 }]}>
            <SwagToast awards={awards} onDone={() => setAwards(null)} />
          </View>
        </>
      ) : null}

      {/* Pinned so the add action is always reachable without scrolling. */}
      <View style={[s.footer, { paddingBottom: insets.bottom + 12 }]}>
        {snap ? (
          <Button
            label={person?.addedOnSnap ? `Added @${snap}` : `Add @${snap} on Snap`}
            variant={person?.addedOnSnap ? 'dark' : 'snap'}
            onPress={() => void addOnSnap()}
          />
        ) : (
          <Button label="No Snap on this card" variant="dark" disabled onPress={() => {}} />
        )}
        <Button label="Keep scanning" variant="ghost" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24, paddingTop: 10, gap: 22 },
  incomingBanner: {
    alignSelf: 'center',
    backgroundColor: colors.snap,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 14,
  },
  incomingText: { color: colors.snapInk, fontSize: 13.5, fontWeight: '800' },
  grabber: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: 8,
  },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  name: { ...type.display, color: colors.text },
  realName: { fontSize: 13, fontWeight: '600', color: colors.textDim },
  bio: { ...type.body, color: colors.textDim, textAlign: 'center', lineHeight: 21 },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', justifyContent: 'center' },
  others: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  otherBtn: {
    flexGrow: 1,
    minWidth: '30%',
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 2,
  },
  otherLabel: { fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  otherHandle: { fontSize: 13, fontWeight: '700', color: colors.text },
  block: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    gap: 8,
  },
  blockLabel: { ...type.label, color: colors.textDim },
  note: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '500',
    minHeight: 44,
    textAlignVertical: 'top',
  },
  historyLine: { fontSize: 12, color: colors.textDim, fontWeight: '600' },
  remove: { alignSelf: 'center', padding: 10 },
  removeText: { color: colors.danger, fontSize: 13, fontWeight: '700' },
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
});
