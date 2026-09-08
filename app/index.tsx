import { Redirect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
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
import { useMe } from '../src/store/useTagStore';
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

  // Hooks first, then the gate — no card means we haven't onboarded yet.
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
