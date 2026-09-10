import * as Brightness from 'expo-brightness';
import * as Clipboard from 'expo-clipboard';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import QRCode from 'react-native-qrcode-svg';
import { formatWhen } from '../../src/components/EventCard';
import { TagitLockup } from '../../src/components/TagitMark';
import { Button } from '../../src/components/ui';
import { canExportImage, captureViewAsPng } from '../../src/lib/exportImage';
import { cancelNfc, isNfcAvailable, writeTagUrl } from '../../src/lib/nfc';
import { encodeEvent } from '../../src/lib/payload';
import * as Sharing from 'expo-sharing';
import { useTagStore } from '../../src/store/useTagStore';
import { colors, radius, type } from '../../src/theme';

type Layout = 'screen' | 'poster';

/**
 * The door code. Two shapes for two different jobs:
 *  - Screen: held up at the entrance, or shown on a laptop behind the bar.
 *    Nothing but code — maximum size, maximum contrast, no chrome that could
 *    be mistaken for something to press.
 *  - Poster: exported as an image, printed and taped to a wall or door.
 *    Read from a few feet away rather than six inches, so the event name
 *    leads — large, above the code — instead of sitting underneath it.
 * Same data either way; only the proportions change.
 */
export default function DoorCode() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const event = useTagStore((s) => (id ? s.events[id] : undefined));
  const [copied, setCopied] = useState(false);
  const [nfcReady, setNfcReady] = useState(false);
  const [writeState, setWriteState] = useState<'idle' | 'writing' | 'done' | 'failed'>('idle');
  const [layout, setLayout] = useState<Layout>('screen');
  const [exporting, setExporting] = useState(false);
  const posterRef = useRef<View>(null);

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
  const eventName = event?.name ?? 'Door code';
  const when = formatWhen(event?.startsAt);
  const place = [event?.location, event?.city].filter(Boolean).join(' · ');

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
        message: `Check in to ${eventName} on Tagit\n${url}`,
        url,
      });
    } catch {
      // Cancelled.
    }
  };

  /** Exports the poster as a PNG and hands it to the OS share sheet — from
   * there, "print" is whatever printer/Files/AirPrint that sheet offers. */
  const exportPoster = async () => {
    setExporting(true);
    try {
      const uri = await captureViewAsPng(posterRef);
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: `${eventName} door code` });
      } else {
        await share();
      }
    } catch {
      // Cancelled or capture failed; nothing worth interrupting over.
    } finally {
      setExporting(false);
    }
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 20 }]}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.close}>‹ Back</Text>
        </Pressable>

        <View style={s.chips}>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: layout === 'screen' }}
            onPress={() => setLayout('screen')}
            style={[s.chip, layout === 'screen' && s.chipOn]}>
            <Text style={[s.chipText, layout === 'screen' && s.chipTextOn]}>Screen</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected: layout === 'poster' }}
            onPress={() => setLayout('poster')}
            style={[s.chip, layout === 'poster' && s.chipOn]}>
            <Text style={[s.chipText, layout === 'poster' && s.chipTextOn]}>Poster</Text>
          </Pressable>
        </View>
      </View>

      {layout === 'screen' ? (
        <View style={s.middle}>
          <View style={s.tile}>
            <QRCode value={url} size={260} color={colors.snapInk} backgroundColor={colors.snap} ecl="M" />
          </View>
          <Text style={s.name} numberOfLines={2}>
            {eventName}
          </Text>
          <Text style={s.instruction}>Scan with Tagit to check in</Text>
        </View>
      ) : (
        <View style={s.posterWrap}>
          {/* Captured as-is — no insets, no buttons, just the poster. */}
          <View ref={posterRef} collapsable={false} style={s.poster}>
            <View style={s.posterTop}>
              <TagitLockup size={22} />
              {when !== 'Date TBC' ? <Text style={s.posterWhen}>{when.toUpperCase()}</Text> : null}
            </View>

            <Text style={s.posterName} numberOfLines={4}>
              {eventName}
            </Text>
            {place ? <Text style={s.posterPlace}>{place}</Text> : null}

            <View style={s.posterTile}>
              <QRCode value={url} size={200} color={colors.snapInk} backgroundColor={colors.snap} ecl="M" />
            </View>

            <Text style={s.posterInstruction}>SCAN TO CHECK IN</Text>
          </View>
        </View>
      )}

      <View style={{ gap: 8, paddingHorizontal: 24 }}>
        {layout === 'poster' ? (
          <Button
            label={
              exporting ? 'Preparing…' : canExportImage ? 'Save / share as image' : 'Share link instead'
            }
            onPress={() => void exportPoster()}
            disabled={exporting}
          />
        ) : null}
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 24,
  },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  chips: { flexDirection: 'row', gap: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.snap, borderColor: colors.snap },
  chipText: { fontSize: 12, fontWeight: '800', color: colors.textDim },
  chipTextOn: { color: colors.snapInk },
  middle: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 24 },
  tile: { backgroundColor: colors.snap, borderRadius: radius.lg + 8, padding: 28 },
  name: { ...type.h1, color: colors.text, textAlign: 'center' },
  instruction: { fontSize: 14, fontWeight: '700', color: colors.snap },
  posterWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  // 3:4 — close to A4/Letter, so a printed export isn't awkwardly cropped.
  poster: {
    width: '100%',
    aspectRatio: 3 / 4,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 24,
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  posterTop: { width: '100%', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  posterWhen: { fontSize: 11, fontWeight: '900', color: colors.snap, letterSpacing: 0.8 },
  posterName: { ...type.display, fontSize: 30, color: colors.text, textAlign: 'center' },
  posterPlace: { fontSize: 14, fontWeight: '700', color: colors.textDim, textAlign: 'center', marginTop: -8 },
  posterTile: { backgroundColor: colors.snap, borderRadius: radius.lg, padding: 18 },
  posterInstruction: { fontSize: 13, fontWeight: '900', color: colors.snap, letterSpacing: 1 },
});
