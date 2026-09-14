import { Redirect, usePathname, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Glass } from '../src/components/Glass';
import { CodePane } from '../src/panes/CodePane';
import { ScannerPane } from '../src/panes/ScannerPane';
import { TaggedPane } from '../src/panes/TaggedPane';
import { myCard } from '../src/lib/account';
import * as api from '../src/lib/api';
import { currentUserId } from '../src/lib/auth';
import { getEvent } from '../src/lib/eventsApi';
import { TAB_BAR_HEIGHT } from '../src/lib/layout';
import { isLive } from '../src/lib/rest';
import { useMe, useTagStore } from '../src/store/useTagStore';
import { colors } from '../src/theme';

const TAGGED = 0;
const CAMERA = 1;
const CODE = 2;
/** Swipe order for the three in-place panes. Events (the fourth tab) isn't
 * one of them — it navigates to the full /events screen instead of
 * swapping a pane, so it has no slot here; swiping past Code should not
 * leave the panes at all. */
const SWIPE_ORDER = [TAGGED, CAMERA, CODE];

/** How fresh an unseen incoming scan has to be to still greet with a popup —
 * old enough and it reads as a random ambush rather than "you just met". */
const RECENT_SCAN_MS = 10 * 60 * 1000;

/**
 * The whole app lives on one screen with a bottom tab bar, opening on the
 * camera so the muscle memory matches Snapchat: friends on the left, your own
 * code on the right. All three panes stay mounted (never remounted on tab
 * switch — the camera in particular is expensive to warm up); the inactive
 * ones are just laid out off-screen, and `active` still gates the camera.
 */
export default function Home() {
  const me = useMe();
  const router = useRouter();
  // /events is presented as a modal *over* this screen (see _layout.tsx) —
  // Home stays mounted underneath, so its "active" state has to come from
  // the actual route, not local `tab` state. Setting `tab` to a fourth
  // value that none of the three panes match would leave them all hidden
  // — a blank screen — the moment the modal is dismissed and this screen
  // is back in front with nothing telling it to show a pane again.
  const onEvents = usePathname() === '/events';
  const insets = useSafeAreaInsets();
  const adoptCard = useTagStore((s) => s.adoptCard);
  const syncTagged = useTagStore((s) => s.syncTagged);
  const activeEventId = useTagStore((s) => s.activeEventId);
  const setActiveEvent = useTagStore((s) => s.setActiveEvent);
  // null = still checking. Rendering the app before this resolves would flash
  // onboarding at someone who is already signed in.
  const [signedIn, setSignedIn] = useState<boolean | null>(isLive ? null : false);
  // Separate from `me`: signing in on a new device is real, live-loaded uid
  // first, local `me` second — without this, a signed-in user with no local
  // card yet (the exact shape of "restoring on a new device") would see
  // `!me` true for the one render before myCard() resolves and bounce
  // straight to onboarding, as if they were new. Starts true so the gate
  // below waits for the first real answer rather than racing it.
  const [restoring, setRestoring] = useState(true);
  const [tab, setTab] = useState<number>(CAMERA);

  useEffect(() => {
    if (!isLive) return;
    let alive = true;

    void (async () => {
      const uid = await currentUserId();
      if (!alive) return;
      setSignedIn(Boolean(uid));
      if (!uid) return;

      let current = me;

      // Signed in on a fresh install: pull the account's card back down so the
      // user lands in the app rather than being asked to sign up again.
      if (!current) {
        try {
          const card = await myCard();
          if (!alive) return;
          if (card) {
            adoptCard(card);
            current = card;
          }
        } catch {
          // Offline. Onboarding still resolves the handle as "yours".
          if (alive) setRestoring(false);
          return;
        }
      }
      // Settled either way — already had a card locally, just restored one,
      // or confirmed there genuinely isn't one. Only past this point is
      // "no card" trustworthy enough to act on by sending someone to
      // onboarding instead of quietly losing them mid-restore.
      if (alive) setRestoring(false);

      // A card exists locally the moment onboarding finishes, whether or not
      // it actually reached the server — local-first, on purpose, so signup
      // works offline. But if that save silently failed (dropped connection,
      // anything), nobody ever finds out until someone else scans them and
      // gets "no card behind that code". Checked and retried on every open
      // instead, so a card that never made it up heals itself the next time
      // this phone has a connection, with nothing for the user to do.
      if (current) {
        try {
          const exists = await api.getCard(current.id);
          if (alive && !exists) await api.saveCard(current);
        } catch {
          // Still offline, or the server's unreachable — retried next open.
        }
      }

      // The "scanning at X" chip on the camera reads activeEventId straight
      // from local state, which is never invalidated on its own — an event
      // that was deleted, or one whose creation silently failed server-side
      // (same local-first gap as the card above), sticks there forever.
      // Confirmed against the server on open; cleared if it's gone.
      if (alive && activeEventId) {
        try {
          const stillExists = await getEvent(activeEventId);
          if (alive && !stillExists) setActiveEvent(null);
        } catch {
          // Offline — leave it; not evidence the event is actually gone.
        }
      }

      // Every open, not just the first: a scan that landed while this phone
      // was closed or offline only ever reaches the server, never this
      // device's local store, until something asks for it. If one of those
      // happened recently enough that it's still worth greeting, show the
      // same takeover Realtime would have — covers a scan Realtime missed
      // while this phone was closed, same as the poll in CodePane covers one
      // it missed while the phone was open.
      if (!alive) return;
      const fresh = await syncTagged();
      const recent = fresh.filter((f) => Date.now() - f.at < RECENT_SCAN_MS);
      if (alive && recent.length) {
        const latest = recent.sort((a, b) => b.at - a.at)[0];
        // IncomingLinkWatcher's Realtime push and CodePane's poll can both
        // independently reach the same conclusion — claimed here so this
        // only navigates if neither of them already has.
        if (useTagStore.getState().claimIncomingPopup(`${latest.card.id}:${latest.at}`)) {
          router.push({ pathname: '/card/[id]', params: { id: latest.card.id, incoming: '1' } });
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [me, adoptCard, syncTagged, router, activeEventId, setActiveEvent]);

  // Hooks first, then the gates.
  if (signedIn === null || (isLive && signedIn && restoring)) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.snap} />
      </View>
    );
  }
  if (isLive && !signedIn) return <Redirect href="/signin" />;
  if (!me) return <Redirect href="/onboarding" />;

  // Only a clearly horizontal drag takes this over (activeOffsetX), and a
  // clearly vertical one fails it immediately (failOffsetY) — every pane
  // scrolls, and a swipe gesture that also ate those scrolls would make the
  // panes themselves unusable. runOnJS: the only thing this ever does is
  // call a React state setter, which has to happen on the JS thread anyway.
  const swipe = Gesture.Pan()
    .activeOffsetX([-20, 20])
    .failOffsetY([-15, 15])
    .onEnd((e) => {
      const idx = SWIPE_ORDER.indexOf(tab);
      if (idx === -1) return;
      if (e.translationX < -50 && idx < SWIPE_ORDER.length - 1) setTab(SWIPE_ORDER[idx + 1]);
      else if (e.translationX > 50 && idx > 0) setTab(SWIPE_ORDER[idx - 1]);
    })
    .runOnJS(true);

  return (
    <View style={s.root}>
      <GestureDetector gesture={swipe}>
        <View style={StyleSheet.absoluteFill}>
          <View style={[StyleSheet.absoluteFill, tab !== TAGGED && s.hidden]}>
            <TaggedPane
              active={tab === TAGGED}
              onOpenPerson={(id) => router.push(`/card/${id}`)}
              onBackToCamera={() => setTab(CAMERA)}
            />
          </View>
          <View style={[StyleSheet.absoluteFill, tab !== CAMERA && s.hidden]}>
            <ScannerPane active={tab === CAMERA} onOpenCode={() => setTab(CODE)} />
          </View>
          <View style={[StyleSheet.absoluteFill, tab !== CODE && s.hidden]}>
            <CodePane active={tab === CODE} onBackToCamera={() => setTab(CAMERA)} />
          </View>
        </View>
      </GestureDetector>

      <Glass radius={0} intensity={55} style={[s.bar, { paddingBottom: insets.bottom + 16 }]}>
        <TabButton
          label="Tagged"
          active={tab === TAGGED}
          onPress={() => setTab(TAGGED)}
          icon={(c) => <PeopleIcon color={c} />}
        />
        <TabButton
          label="Scan"
          active={tab === CAMERA}
          onPress={() => setTab(CAMERA)}
          icon={(c) => <ScanIcon color={c} />}
        />
        <TabButton
          label="My code"
          active={tab === CODE}
          onPress={() => setTab(CODE)}
          icon={(c) => <CodeIcon color={c} />}
        />
        <TabButton
          label="Events"
          active={onEvents}
          activeColor={colors.blue}
          onPress={() => router.push('/events')}
          icon={(c) => <EventsIcon color={c} />}
        />
      </Glass>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
  icon,
  activeColor = colors.snap,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: (color: string) => React.ReactNode;
  /** snap yellow for the core scan loop, blue for the one tab that leaves
   * it — two accents so "this takes you somewhere else" reads at a glance. */
  activeColor?: string;
}) {
  const color = active ? activeColor : colors.textDim;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: active }}
      onPress={onPress}
      hitSlop={10}
      style={s.tab}>
      {icon(color)}
      <Text style={[s.tabLabel, { color, opacity: active ? 1 : 0 }]}>{label}</Text>
    </Pressable>
  );
}

// Plain line icons, no glyphs — kept to one weight and one size so the bar
// reads as a single quiet object rather than three different ideas.
const STROKE = 1.7;
const ICON_SIZE = 25;

function PeopleIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Circle cx="9" cy="8.5" r="3.2" stroke={color} strokeWidth={STROKE} />
      <Circle cx="16" cy="10" r="2.6" stroke={color} strokeWidth={STROKE} />
      <Rect
        x="3.6"
        y="14.2"
        width="10.8"
        height="6.4"
        rx="3.2"
        stroke={color}
        strokeWidth={STROKE}
      />
      <Rect x="13" y="15.4" width="8" height="5.2" rx="2.6" stroke={color} strokeWidth={STROKE} />
    </Svg>
  );
}

function ScanIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="6.5" width="17" height="12" rx="3" stroke={color} strokeWidth={STROKE} />
      <Circle cx="12" cy="12.5" r="3.4" stroke={color} strokeWidth={STROKE} />
      <Rect x="9" y="4.4" width="6" height="2.6" rx="1" fill={color} />
    </Svg>
  );
}

function CodeIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.3" stroke={color} strokeWidth={STROKE} />
      <Rect x="14" y="3.5" width="6.5" height="6.5" rx="1.3" stroke={color} strokeWidth={STROKE} />
      <Rect x="3.5" y="14" width="6.5" height="6.5" rx="1.3" stroke={color} strokeWidth={STROKE} />
      <Rect x="15.5" y="15.5" width="3.3" height="3.3" rx="0.8" fill={color} />
    </Svg>
  );
}

function EventsIcon({ color }: { color: string }) {
  return (
    <Svg width={ICON_SIZE} height={ICON_SIZE} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="5" width="17" height="15.5" rx="2.6" stroke={color} strokeWidth={STROKE} />
      <Path d="M3.5 9.8 H20.5" stroke={color} strokeWidth={STROKE} />
      <Path d="M7.8 3.2 V6.4" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Path d="M16.2 3.2 V6.4" stroke={color} strokeWidth={STROKE} strokeLinecap="round" />
      <Circle cx="8.6" cy="14" r="1.15" fill={color} />
      <Circle cx="12" cy="14" r="1.15" fill={color} />
      <Circle cx="15.4" cy="14" r="1.15" fill={color} />
    </Svg>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  hidden: { display: 'none' },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    minHeight: TAB_BAR_HEIGHT,
    paddingTop: 14,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 5, minHeight: 44 },
  tabLabel: { fontSize: 11.5, fontWeight: '700', letterSpacing: 0.2 },
});
