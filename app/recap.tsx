import { useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useRef, useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TagitMark } from '../src/components/TagitMark';
import { Avatar, Button } from '../src/components/ui';
import { canExportImage, captureViewAsPng } from '../src/lib/exportImage';
import { displayName, encodeTag } from '../src/lib/payload';
import { tierFor } from '../src/lib/swag';
import { useMe, useStats, useTaggedList } from '../src/store/useTagStore';
import { colors, radius } from '../src/theme';

/**
 * A vertical, Story-shaped recap built to be screenshotted and reposted as a
 * Snap. Deliberately 9:16 with big type and no thin strokes, because it gets
 * viewed at thumbnail size in someone's chat.
 */
export default function Recap() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const stats = useStats();
  const people = useTaggedList();
  const cardRef = useRef<View>(null);
  const [busy, setBusy] = useState(false);

  if (!me) return <View style={s.root} />;

  const tier = tierFor(me.swag);
  const topStreak = people.filter((p) => p.streak >= 2).sort((a, b) => b.streak - a.streak)[0];

  const shareRecap = async () => {
    setBusy(true);
    try {
      const uri = await captureViewAsPng(cardRef);
      if (uri && (await Sharing.isAvailableAsync())) {
        await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Share your recap' });
      } else {
        // Expo Go, web, or a failed capture — share the link and let them
        // screenshot the card, which is what people do with these anyway.
        await Share.share({ message: `My Tagit recap — ${encodeTag(me.id)}` });
      }
    } catch {
      // Cancelled or capture failed; nothing worth interrupting the user for.
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[s.content, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 32 }]}>
      <View style={s.header}>
        <Text style={s.title}>Your recap</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.close}>Close</Text>
        </Pressable>
      </View>

      <View ref={cardRef} collapsable={false} style={s.story}>
        <View style={s.storyTop}>
          <TagitMark size={26} color={colors.snapInk} />
          <Text style={s.storyPeriod}>
            {stats.topEvent ? stats.topEvent.name.toUpperCase() : 'ALL TIME'}
          </Text>
        </View>

        <View style={{ alignItems: 'center', gap: 10 }}>
          <Avatar uri={me.avatar} name={me.name} size={78} ring={colors.snapInk} />
          <Text style={s.storyName}>{displayName(me)}</Text>
          <View style={[s.tierChip, { backgroundColor: colors.snapInk }]}>
            <Text style={[s.tierText, { color: tier.color }]}>{tier.name.toUpperCase()}</Text>
          </View>
        </View>

        <View style={s.bigStat}>
          <Text style={s.bigNumber}>{stats.people}</Text>
          <Text style={s.bigLabel}>PEOPLE TAGGED</Text>
        </View>

        <View style={s.grid}>
          <Cell value={me.swag.toLocaleString()} label="SWAG" />
          <Cell value={stats.scans} label="SCANS" />
          <Cell value={stats.addedOnSnap} label="ADDED ON SNAP" />
          <Cell value={stats.longestStreak || '—'} label="BEST STREAK" />
        </View>

        {topStreak ? (
          <View style={s.streakRow}>
            <Text style={s.streakText}>
              🔥 {topStreak.streak} with {displayName(topStreak.card)}
            </Text>
          </View>
        ) : null}

        <Text style={s.storyFoot}>tagit.app/u/{me.id}</Text>
      </View>

      <Button
        label={busy ? 'Preparing…' : canExportImage ? 'Share to Snap' : 'Share my link'}
        onPress={() => void shareRecap()}
        disabled={busy}
      />
      <Text style={s.footnote}>
        {canExportImage
          ? 'Saves a 9:16 image — post it as a Snap or a Story and your code is right there on it.'
          : 'Screenshot the card above to post it — it’s already 9:16, with your code on it. Image export needs the full build.'}
      </Text>
    </ScrollView>
  );
}

function Cell({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={s.cell}>
      <Text style={s.cellValue}>{value}</Text>
      <Text style={s.cellLabel}>{label}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 20, gap: 18 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, letterSpacing: -0.5 },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  story: {
    backgroundColor: colors.snap,
    borderRadius: radius.lg,
    padding: 24,
    // 9:16 so a screenshot drops straight into Stories with no crop.
    aspectRatio: 9 / 16,
    justifyContent: 'space-between',
  },
  storyTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wordmark: { fontSize: 22, fontWeight: '900', color: colors.snapInk, letterSpacing: -1 },
  storyPeriod: { fontSize: 10, fontWeight: '900', color: colors.snapInk, letterSpacing: 1, opacity: 0.7 },
  storyName: { fontSize: 24, fontWeight: '900', color: colors.snapInk, letterSpacing: -0.6 },
  tierChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: radius.pill },
  tierText: { fontSize: 11, fontWeight: '900', letterSpacing: 1 },
  bigStat: { alignItems: 'center' },
  bigNumber: { fontSize: 86, fontWeight: '900', color: colors.snapInk, letterSpacing: -4, lineHeight: 92 },
  bigLabel: { fontSize: 12, fontWeight: '900', color: colors.snapInk, letterSpacing: 1.6, opacity: 0.75 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: '50%', paddingVertical: 8, gap: 1 },
  cellValue: { fontSize: 24, fontWeight: '900', color: colors.snapInk, letterSpacing: -0.8 },
  cellLabel: { fontSize: 9, fontWeight: '900', color: colors.snapInk, letterSpacing: 0.9, opacity: 0.7 },
  streakRow: {
    alignSelf: 'flex-start',
    backgroundColor: colors.snapInk,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  streakText: { color: colors.snap, fontSize: 12, fontWeight: '900' },
  storyFoot: { fontSize: 12, fontWeight: '800', color: colors.snapInk, opacity: 0.7 },
  footnote: { fontSize: 11, color: colors.textDim, textAlign: 'center', lineHeight: 16 },
});
