import * as Brightness from 'expo-brightness';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TierProgress } from '../components/Badges';
import { Snapcode } from '../components/Snapcode';
import { TagCode } from '../components/TagCode';
import { Button, Stat } from '../components/ui';
import { displayName, encodeTag } from '../lib/payload';
import { useAbout, useActiveEvent, useMe, useStats } from '../store/useTagStore';
import { colors, radius, type } from '../theme';

/** Your own code — the thing you hold up for someone else to scan. */
export function CodePane({
  active,
  onBackToCamera,
}: {
  active: boolean;
  onBackToCamera: () => void;
}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const me = useMe();
  const event = useActiveEvent();
  const stats = useStats();
  const about = useAbout();
  const [copied, setCopied] = useState(false);
  const [showSnapcode, setShowSnapcode] = useState(false);

  /**
   * Wind the screen up to full while the code is showing, and put it back on
   * the way out. A phone at 30% in a dark venue is genuinely hard to scan —
   * this is the other half of the torch on the scanner side.
   *
   * Best-effort: on Android this needs a permission the user may refuse, and
   * a dim screen is never worth interrupting them over.
   */
  useEffect(() => {
    if (!active) return;
    let previous: number | null = null;
    let cancelled = false;

    (async () => {
      try {
        const { granted } = await Brightness.requestPermissionsAsync();
        if (!granted || cancelled) return;
        previous = await Brightness.getBrightnessAsync();
        if (!cancelled) await Brightness.setBrightnessAsync(1);
      } catch {
        // Not available on this device — leave the screen alone.
      }
    })();

    return () => {
      cancelled = true;
      if (previous !== null) void Brightness.setBrightnessAsync(previous).catch(() => {});
    };
  }, [active]);

  if (!me) return <View style={s.root} />;

  const link = encodeTag(me.id, event?.id);

  const copy = async () => {
    await Clipboard.setStringAsync(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const share = async () => {
    try {
      await Share.share({
        message: `Add me on Tag — @${me.socials.snap ?? me.id}\n${link}`,
        url: link,
      });
    } catch {
      // User cancelled the share sheet; nothing to do.
    }
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 80 },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Pressable accessibilityRole="button" accessibilityLabel="Back to camera" onPress={onBackToCamera}>
          <Text style={s.back}>‹ Camera</Text>
        </Pressable>
        <Pressable accessibilityRole="button" onPress={() => router.push('/edit')}>
          <Text style={s.edit}>Edit card</Text>
        </Pressable>
      </View>

      {showSnapcode && me.socials.snap ? (
        <Snapcode handle={me.socials.snap} />
      ) : (
        <TagCode card={me} eventId={event?.id} />
      )}

      {me.socials.snap ? (
        <View style={s.switcher}>
          {(
            [
              { key: false, label: 'Tag code', sub: 'full profile + swag' },
              { key: true, label: 'Snapcode', sub: 'works without Tag' },
            ] as const
          ).map((opt) => {
            const on = showSnapcode === opt.key;
            return (
              <Pressable
                key={String(opt.key)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                onPress={() => setShowSnapcode(opt.key)}
                style={[s.switchBtn, on && s.switchBtnOn]}>
                <Text style={[s.switchLabel, on && s.switchLabelOn]}>{opt.label}</Text>
                <Text style={[s.switchSub, on && s.switchSubOn]}>{opt.sub}</Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open my profile"
        onPress={() => router.push('/profile')}
        style={{ alignItems: 'center', gap: 4 }}>
        <Text style={s.name}>{displayName(me)}</Text>
        {/* Generated from verified check-ins and real scans — never typed. */}
        <Text style={s.bio}>{about.line}</Text>
      </Pressable>

      <View style={s.statsRow}>
        <Stat value={stats.people} label="tagged" />
        <Stat value={stats.longestStreak || '—'} label="best streak" />
        <Stat
          value={me.snapScore ? Intl.NumberFormat('en', { notation: 'compact' }).format(me.snapScore) : '—'}
          label="snap score"
        />
      </View>

      <View style={s.card}>
        <TierProgress swag={me.swag} />
      </View>

      <View style={{ gap: 10, width: '100%' }}>
        <Button label={copied ? 'Link copied' : 'Copy my link'} variant="dark" onPress={() => void copy()} />
        <Button label="Share my code" onPress={() => void share()} />
        <Button label="My recap" variant="ghost" onPress={() => router.push('/recap')} />
      </View>

      {event ? (
        <Text style={s.eventNote}>
          Scans of this code count toward {event.name}. Change it from the camera.
        </Text>
      ) : (
        <Pressable accessibilityRole="button" onPress={() => router.push('/events')}>
          <Text style={s.eventNote}>Join an event so your scans count on a leaderboard →</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { alignItems: 'center', gap: 22, paddingHorizontal: 24 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
  },
  back: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  edit: { color: colors.snap, fontSize: 14, fontWeight: '800' },
  name: { ...type.h1, color: colors.text },
  bio: { ...type.body, color: colors.textDim, textAlign: 'center' },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    width: '100%',
  },
  card: {
    width: '100%',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
  },
  switcher: { flexDirection: 'row', gap: 8, width: '100%' },
  switchBtn: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 9,
    paddingHorizontal: 10,
    gap: 1,
    alignItems: 'center',
  },
  switchBtnOn: { backgroundColor: colors.snap, borderColor: colors.snap },
  switchLabel: { fontSize: 13, fontWeight: '800', color: colors.textDim },
  switchLabelOn: { color: colors.snapInk },
  switchSub: { fontSize: 10, fontWeight: '600', color: colors.textDim },
  switchSubOn: { color: colors.snapInk, opacity: 0.7 },
  eventNote: {
    fontSize: 12,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
});
