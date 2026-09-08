import { Redirect, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { CodePane } from '../src/panes/CodePane';
import { ScannerPane } from '../src/panes/ScannerPane';
import { TaggedPane } from '../src/panes/TaggedPane';
import { myCard } from '../src/lib/account';
import { currentUserId } from '../src/lib/auth';
import { isLive } from '../src/lib/rest';
import { useMe, useTagStore } from '../src/store/useTagStore';
import { colors } from '../src/theme';

const PANES = ['Tagged', 'Scan', 'My code'] as const;
const CAMERA = 1;

/**
 * The whole app lives on one horizontally-paged screen and opens on the
 * camera, so the muscle memory matches Snapchat: swipe left for people you've
 * tagged, swipe right for your own code. No home screen, no tab bar.
 */
export default function Home() {
  const me = useMe();
  const router = useRouter();
  const adoptCard = useTagStore((s) => s.adoptCard);
  // null = still checking. Rendering the app before this resolves would flash
  // onboarding at someone who is already signed in.
  const [signedIn, setSignedIn] = useState<boolean | null>(isLive ? null : false);
  const { width } = useWindowDimensions();
  const scroller = useRef<ScrollView>(null);
  const [pane, setPane] = useState<number>(CAMERA);

  const goTo = useCallback(
    (index: number) => {
      scroller.current?.scrollTo({ x: index * width, animated: true });
      setPane(index);
    },
    [width]
  );

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const next = Math.round(e.nativeEvent.contentOffset.x / width);
    if (next !== pane) setPane(next);
  };

  useEffect(() => {
    if (!isLive) return;
    let alive = true;

    void (async () => {
      const uid = await currentUserId();
      if (!alive) return;
      setSignedIn(Boolean(uid));
      if (!uid) return;

      // Signed in on a fresh install: pull the account's card back down so the
      // user lands in the app rather than being asked to sign up again.
      if (!me) {
        try {
          const card = await myCard();
          if (alive && card) adoptCard(card);
        } catch {
          // Offline. Onboarding still resolves the handle as "yours".
        }
      }
    })();

    return () => {
      alive = false;
    };
  }, [me, adoptCard]);

  // Hooks first, then the gates.
  if (signedIn === null) {
    return (
      <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.snap} />
      </View>
    );
  }
  if (isLive && !signedIn) return <Redirect href="/signin" />;
  if (!me) return <Redirect href="/onboarding" />;

  return (
    <View style={s.root}>
      <ScrollView
        ref={scroller}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Start on the camera without an animated jump on mount.
        contentOffset={{ x: width * CAMERA, y: 0 }}
        onMomentumScrollEnd={onScroll}
        // The camera pane owns the full screen, so let it swallow taps.
        keyboardShouldPersistTaps="handled">
        <View style={{ width }}>
          <TaggedPane
            active={pane === 0}
            onOpenPerson={(id) => router.push(`/card/${id}`)}
            onBackToCamera={() => goTo(CAMERA)}
          />
        </View>
        <View style={{ width }}>
          <ScannerPane active={pane === CAMERA} onOpenCode={() => goTo(2)} />
        </View>
        <View style={{ width }}>
          <CodePane active={pane === 2} onBackToCamera={() => goTo(CAMERA)} />
        </View>
      </ScrollView>

      <View style={s.dots} pointerEvents="none">
        {PANES.map((label, i) => (
          <View key={label} style={s.dotWrap}>
            <View style={[s.dot, i === pane && s.dotActive]} />
            {i === pane ? <Text style={s.dotLabel}>{label}</Text> : null}
          </View>
        ))}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  dots: {
    position: 'absolute',
    bottom: 14,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 14,
  },
  dotWrap: { alignItems: 'center', gap: 4, minWidth: 24 },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.textDim,
  },
  dotActive: { backgroundColor: colors.snap, width: 18 },
  dotLabel: {
    position: 'absolute',
    top: 10,
    fontSize: 9,
    fontWeight: '800',
    color: colors.textDim,
    letterSpacing: 0.5,
  },
});
