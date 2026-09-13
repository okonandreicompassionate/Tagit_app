import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { Glass } from '../components/Glass';
import { TAB_BAR_HEIGHT } from '../lib/layout';
import { MOCK_CARDS } from '../lib/mock';
import { cancelNfc, isNfcAvailable, readTagUrl } from '../lib/nfc';
import { decodeScan } from '../lib/payload';
import { ScanFrame } from '../components/ScanFrame';
import { Avatar, Button } from '../components/ui';
import { useActiveEvent, useMe, useUnseenNotificationCount } from '../store/useTagStore';
import { colors, radius } from '../theme';

/** How long to ignore the camera after a hit, so one code fires once. */
const SCAN_COOLDOWN_MS = 2500;

export function ScannerPane({
  active,
  onOpenCode,
}: {
  active: boolean;
  onOpenCode: () => void;
}) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const unseen = useUnseenNotificationCount();
  const event = useActiveEvent();
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  const [nfcReady, setNfcReady] = useState(false);
  const [tapping, setTapping] = useState(false);
  const locked = useRef(false);
  // Timestamp of the last single tap, for double-tap detection.
  const lastTap = useRef(0);

  const flip = useCallback(() => {
    setFacing((f) => (f === 'back' ? 'front' : 'back'));
    if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  /** Double-tap the viewfinder to flip, the way Snapchat does. */
  const onViewfinderTap = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      flip();
    } else {
      lastTap.current = now;
    }
  }, [flip]);

  // Only offer tapping where it actually works: real hardware, NFC switched
  // on, and not Expo Go (where the native module isn't bundled).
  useEffect(() => {
    let alive = true;
    void isNfcAvailable().then((ok) => {
      if (alive) setNfcReady(ok);
    });
    return () => {
      alive = false;
      void cancelNfc();
    };
  }, []);

  // Never leave the torch burning on a tab the user has switched away from —
  // it drains the battery and heats the phone with nothing on screen.
  useEffect(() => {
    if (!active && torch) setTorch(false);
  }, [active, torch]);

  // The front camera has no torch to switch on.
  useEffect(() => {
    if (facing === 'front' && torch) setTorch(false);
  }, [facing, torch]);

  const handleCode = useCallback(
    (raw: string) => {
      if (locked.current) return;
      const target = decodeScan(raw);
      // Silently ignore anything that isn't a Tagit code — the camera sees a lot.
      if (!target) return;
      if (target.kind === 'user' && target.cardId === me?.id) return;

      locked.current = true;
      if (Platform.OS !== 'web') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      if (target.kind === 'event') {
        // A door code checks you in — the verified kind of attendance.
        router.push({ pathname: '/event/[id]', params: { id: target.eventId, checkin: '1' } });
      } else {
        // `scan: 1` is what tells the sheet to actually record the link.
        router.push({
          pathname: '/card/[id]',
          params: { id: target.cardId, event: target.eventId ?? '', scan: '1' },
        });
      }

      setTimeout(() => {
        locked.current = false;
      }, SCAN_COOLDOWN_MS);
    },
    [me?.id, router]
  );

  /**
   * Tap a sticker, wristband or Tagit card. The tag holds the same URL as the
   * equivalent QR code, so it goes through exactly the same handler.
   */
  const tapToScan = useCallback(async () => {
    if (tapping) return;
    setTapping(true);
    try {
      const url = await readTagUrl();
      if (url) handleCode(url);
    } finally {
      setTapping(false);
    }
  }, [tapping, handleCode]);

  if (!permission) return <View style={s.root} />;

  if (!permission.granted) {
    return (
      <View style={[s.root, s.gate, { paddingTop: insets.top + 80 }]}>
        <Text style={s.gateTitle}>Tagit needs the camera</Text>
        <Text style={s.gateBody}>
          That's the whole app — point it at someone's code and they're added. Nothing is recorded
          or uploaded.
        </Text>
        <Button label="Allow camera" onPress={() => void requestPermission()} />
        <Button label="Show my code instead" variant="ghost" onPress={onOpenCode} />
      </View>
    );
  }

  return (
    <View style={s.root}>
      {/* Only mount the camera on the active pane — it's the app's main
          battery cost and there's no reason to run it off-screen. */}
      {active ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          facing={facing}
          enableTorch={torch && facing === 'back'}
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={({ data }) => handleCode(data)}
        />
      ) : null}

      {/* Tap target for the double-tap flip. Sits under the control bars. */}
      <Pressable
        style={StyleSheet.absoluteFill}
        onPress={onViewfinderTap}
        accessibilityRole="button"
        accessibilityLabel="Double tap to switch camera"
      />


      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="My card"
          onPress={() => router.push('/edit')}>
          <Avatar uri={me?.avatar} name={me?.name ?? 'Me'} size={40} ring={colors.snap} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={event ? `Event: ${event.name}` : 'Join an event'}
          onPress={() => router.push('/events')}
          style={s.eventChip}>
          <Glass style={StyleSheet.absoluteFill} radius={radius.pill} intensity={35} />
          <Text style={s.eventText} numberOfLines={1}>
            {event ? `● ${event.name}` : '+ Join event'}
          </Text>
        </Pressable>

        {/* The one nav element worth naming rather than iconing — it's the
            easiest-to-miss screen in the app otherwise. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Browse the events feed"
          onPress={() => router.push('/feed')}
          style={s.feedBtn}>
          <TicketIcon color={colors.snapInk} />
          <Text style={s.feedText}>Feed</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Leaderboard"
          onPress={() => router.push('/leaderboard')}
          style={s.iconBtn}>
          <Glass style={StyleSheet.absoluteFill} radius={20} intensity={35} />
          <TrophyIcon color={colors.text} />
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unseen > 0 ? `Notifications, ${unseen} new` : 'Notifications'}
          onPress={() => router.push('/notifications')}
          style={s.iconBtn}>
          <Glass style={StyleSheet.absoluteFill} radius={20} intensity={35} />
          <BellIcon color={colors.text} />
          {unseen > 0 ? <View style={s.badge} /> : null}
        </Pressable>
      </View>

      <View style={s.center} pointerEvents="none">
        <ScanFrame hint={event ? `Scanning at ${event.name}` : 'Point at a Tagit code'} />
      </View>

      {nfcReady ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Tap an NFC sticker or card instead"
          onPress={() => void tapToScan()}
          style={s.tapBtn}>
          <Glass style={StyleSheet.absoluteFill} radius={radius.pill} intensity={40} />
          <Text style={s.tapText}>{tapping ? 'Hold near the sticker…' : 'or tap a sticker'}</Text>
        </Pressable>
      ) : null}

      {/* Clears the app's own bottom tab bar, which floats over this pane —
          "My code" lives there now, so this row is just camera controls. */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + TAB_BAR_HEIGHT + 14 }]}>
        {__DEV__ ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => handleCode(MOCK_CARDS[Math.floor(Math.random() * MOCK_CARDS.length)].id)}
            style={s.devBtn}>
            <Glass style={StyleSheet.absoluteFill} radius={radius.pill} intensity={40} />
            <Text style={s.devText}>DEV · fake a scan</Text>
          </Pressable>
        ) : null}

        <View style={s.bottomRow}>
          {/* These rooms are dark and the torch gets reached for constantly. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={torch ? 'Turn torch off' : 'Turn torch on'}
            accessibilityState={{ selected: torch }}
            disabled={facing === 'front'}
            onPress={() => setTorch((t) => !t)}
            style={[
              s.iconBtn,
              torch && s.iconBtnOn,
              facing === 'front' && { opacity: 0.35 },
            ]}>
            {!torch ? <Glass style={StyleSheet.absoluteFill} radius={20} intensity={35} /> : null}
            <FlashIcon color={torch ? colors.snapInk : colors.text} on={torch} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Flip camera" onPress={flip} style={s.iconBtn}>
            <Glass style={StyleSheet.absoluteFill} radius={20} intensity={35} />
            <FlipCameraIcon color={colors.text} />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function TicketIcon({ color }: { color: string }) {
  return (
    <Svg width={15} height={15} viewBox="0 0 24 24" fill="none">
      <Path
        d="M4 9a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1.3a1.7 1.7 0 0 0 0 3.4V15a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-1.3a1.7 1.7 0 0 0 0-3.4V9Z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path d="M14 7.5v9" stroke={color} strokeWidth={1.7} strokeDasharray="2.4 2.4" />
    </Svg>
  );
}

function TrophyIcon({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M7 4h10v4a5 5 0 0 1-5 5 5 5 0 0 1-5-5V4Z" stroke={color} strokeWidth={1.7} strokeLinejoin="round" />
      <Path
        d="M7 5.2H4.7A2 2 0 0 0 6.6 8.7M17 5.2h2.3a2 2 0 0 1-1.9 3.5"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
      />
      <Path
        d="M12 13v2.6M9.3 19h5.4c0-1.9-1-2.6-1.3-3.4h-2.8c-.3.8-1.3 1.5-1.3 3.4Z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/** Filled while the torch is on, outline while it's off — same shape either way. */
function FlashIcon({ color, on }: { color: string; on: boolean }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path
        d="M13 3 5 14h5l-1 7 8-11h-5l1-7Z"
        stroke={color}
        strokeWidth={on ? 0 : 1.7}
        fill={on ? color : 'none'}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function FlipCameraIcon({ color }: { color: string }) {
  return (
    <Svg width={19} height={19} viewBox="0 0 24 24" fill="none">
      <Path d="M4 9a8 8 0 0 1 13.8-4.6L20 7" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M20 3.6V7h-3.4" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
      <Path d="M20 15a8 8 0 0 1-13.8 4.6L4 17" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
      <Path d="M4 20.4V17h3.4" stroke={color} strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function BellIcon({ color }: { color: string }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 10.5a6 6 0 0 1 12 0c0 3.2 1 5 1.6 5.8H4.4C5 15.5 6 13.7 6 10.5Z"
        stroke={color}
        strokeWidth={1.7}
        strokeLinejoin="round"
      />
      <Path d="M10 18.5a2 2 0 0 0 4 0" stroke={color} strokeWidth={1.7} strokeLinecap="round" />
    </Svg>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  gate: { paddingHorizontal: 32, gap: 14, alignItems: 'stretch' },
  gateTitle: { fontSize: 26, fontWeight: '900', color: colors.text, letterSpacing: -0.6 },
  gateBody: { fontSize: 15, color: colors.textDim, lineHeight: 22, marginBottom: 10 },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  eventChip: {
    flex: 1,
    height: 34,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.snap,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    overflow: 'hidden',
  },
  eventText: { color: colors.snap, fontSize: 12, fontWeight: '800' },
  feedBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: radius.pill,
    backgroundColor: colors.snap,
  },
  feedText: { color: colors.snapInk, fontSize: 13, fontWeight: '800' },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  iconBtnOn: { backgroundColor: colors.snap },
  badge: {
    position: 'absolute',
    top: 6,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.snap,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  tapBtn: {
    position: 'absolute',
    top: '64%',
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.snap,
    overflow: 'hidden',
  },
  tapText: { color: colors.snap, fontSize: 13, fontWeight: '800' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  bottom: { position: 'absolute', bottom: 0, left: 0, right: 0, gap: 12, paddingHorizontal: 16 },
  bottomRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 28 },
  devBtn: {
    alignSelf: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  devText: { color: colors.textDim, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
});
