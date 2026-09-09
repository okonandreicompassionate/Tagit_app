import { Redirect, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CodePane } from '../src/panes/CodePane';
import { ScannerPane } from '../src/panes/ScannerPane';
import { TaggedPane } from '../src/panes/TaggedPane';
import { myCard } from '../src/lib/account';
import { currentUserId } from '../src/lib/auth';
import { isLive } from '../src/lib/rest';
import { useMe, useTagStore } from '../src/store/useTagStore';
import { colors } from '../src/theme';

const TAGGED = 0;
const CAMERA = 1;
const CODE = 2;

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
  const insets = useSafeAreaInsets();
  const adoptCard = useTagStore((s) => s.adoptCard);
  // null = still checking. Rendering the app before this resolves would flash
  // onboarding at someone who is already signed in.
  const [signedIn, setSignedIn] = useState<boolean | null>(isLive ? null : false);
  const [tab, setTab] = useState<number>(CAMERA);

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

      <View style={[s.bar, { paddingBottom: insets.bottom + 10 }]}>
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
      </View>
    </View>
  );
}

function TabButton({
  label,
  active,
  onPress,
  icon,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  icon: (color: string) => React.ReactNode;
}) {
  const color = active ? colors.snap : colors.textDim;
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

function PeopleIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
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
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="6.5" width="17" height="12" rx="3" stroke={color} strokeWidth={STROKE} />
      <Circle cx="12" cy="12.5" r="3.4" stroke={color} strokeWidth={STROKE} />
      <Rect x="9" y="4.4" width="6" height="2.6" rx="1" fill={color} />
    </Svg>
  );
}

function CodeIcon({ color }: { color: string }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none">
      <Rect x="3.5" y="3.5" width="6.5" height="6.5" rx="1.3" stroke={color} strokeWidth={STROKE} />
      <Rect x="14" y="3.5" width="6.5" height="6.5" rx="1.3" stroke={color} strokeWidth={STROKE} />
      <Rect x="3.5" y="14" width="6.5" height="6.5" rx="1.3" stroke={color} strokeWidth={STROKE} />
      <Rect x="15.5" y="15.5" width="3.3" height="3.3" rx="0.8" fill={color} />
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
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingTop: 10,
  },
  tab: { flex: 1, alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 10.5, fontWeight: '700', letterSpacing: 0.2 },
});
