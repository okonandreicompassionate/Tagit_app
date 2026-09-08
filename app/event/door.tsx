import * as Brightness from 'expo-brightness';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { Button } from '../../src/components/ui';
import { cancelNfc, isNfcAvailable, writeTagUrl } from '../../src/lib/nfc';
import { encodeEvent } from '../../src/lib/payload';
import { useTagStore } from '../../src/store/useTagStore';
import { colors, radius, type } from '../../src/theme';

/**
 * The door code, full screen.
 *
 * This is held up at an entrance or printed and taped to a wall, so it is
 * nothing but code: maximum size, maximum contrast, screen forced bright, and
 * no chrome that could be mistaken for something to press.
 */
export default function DoorCode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const event = useTagStore((s) => (id ? s.events[id] : undefined));
  const [copied, setCopied] = useState(false);
  const [nfcReady, setNfcReady] = useState(false);
  const [writeState, setWriteState] = useState<'idle' | 'writing' | 'done' | 'failed'>('idle');

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

  useEffect(() => {
    let previous: number | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { granted } = await Brightness.requestPermissionsAsync();
        if (!granted || cancelled) return;
        previous = await Brightness.getBrightnessAsync();
        if (!cancelled) await Brightness.setBrightnessAsync(1);
      } catch {
        // Not available — a dim screen isn't worth interrupting anyone over.
      }
    })();

    return () => {
      cancelled = true;
      if (previous !== null) void Brightness.setBrightnessAsync(previous).catch(() => {});
    };
  }, []);

  if (!id) return <View style={s.root} />;
  const url = encodeEvent(id);

  const copy = async () => {
    await Clipboard.setStringAsync(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  /** Writes this event's URL to a blank tag. Repeatable for a whole pack. */
  const writeSticker = async () => {
    setWriteState('writing');
    const ok = await writeTagUrl(url);
    setWriteState(ok ? 'done' : 'failed');
    setTimeout(() => setWriteState('idle'), 2600);
  };

  const share = async () => {
    try {
      await Share.share({
        message: `Check in to ${event?.name ?? 'the event'} on Tagit\n${url}`,
        url,
      });
    } catch {
      // Cancelled.
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 20 }]}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.close}>‹ Back</Text>
        </Pressable>
      </View>

      <View style={s.middle}>
        <View style={s.tile}>
          <QRCode value={url} size={260} color={colors.snapInk} backgroundColor={colors.snap} ecl="M" />
        </View>
        <Text style={s.name} numberOfLines={2}>
          {event?.name ?? 'Door code'}
        </Text>
        <Text style={s.instruction}>Scan with Tagit to check in</Text>
      </View>

      <View style={{ gap: 8, paddingHorizontal: 24 }}>
        {/* Turning a pack of blank stickers into door codes. Only offered
            where NFC actually works, so it never appears as a dead button. */}
        {nfcReady ? (
          <Button
            label={
              writeState === 'writing'
                ? 'Hold a sticker to the phone…'
                : writeState === 'done'
                  ? 'Written — tap another to repeat'
                  : writeState === 'failed'
                    ? 'Failed — try again'
                    : '⌁  Write to an NFC sticker'
            }
            variant={writeState === 'done' ? 'dark' : 'snap'}
            onPress={() => void writeSticker()}
            disabled={writeState === 'writing'}
          />
        ) : null}
        <Button label={copied ? 'Link copied' : 'Copy link'} variant="dark" onPress={() => void copy()} />
        <Button label="Share" variant="ghost" onPress={() => void share()} />
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 24 },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 24 },
  tile: { backgroundColor: colors.snap, borderRadius: radius.lg + 8, padding: 28 },
  name: { ...type.h1, color: colors.text, textAlign: 'center' },
  instruction: { fontSize: 14, fontWeight: '700', color: colors.snap },
});
