import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TierProgress } from '../components/Badges';
import { TagCode } from '../components/TagCode';
import { Button, Stat } from '../components/ui';
import { displayName, encodeTag } from '../lib/payload';
import { useActiveEvent, useMe, useStats } from '../store/useTagStore';
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
  const [copied, setCopied] = useState(false);

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

      <TagCode card={me} eventId={event?.id} />

      <View style={{ alignItems: 'center', gap: 4 }}>
        <Text style={s.name}>{displayName(me)}</Text>
        {me.bio ? <Text style={s.bio}>{me.bio}</Text> : null}
      </View>

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
  eventNote: {
    fontSize: 12,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 10,
  },
});
