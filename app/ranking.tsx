import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, radius, type } from '../src/theme';

type Factor = { title: string; body: string };

const FACTORS: Factor[] = [
  {
    title: 'Paid placement',
    body: 'Events a brand or host has paid to feature always lead — that funds the free events around them.',
  },
  {
    title: 'Friends going',
    body: 'The one thing no generic events app can claim: how many of your actual friends have verifiably checked in or scanned in at an event. This only counts real friendships from a mutual scan — never a guess.',
  },
  {
    title: 'What you actually go to',
    body: "Taken from your own verified check-in history, not what you say you like. If you mostly check into parties, parties rank a little higher for you — quietly, in the background.",
  },
  {
    title: 'Where you actually are',
    body: 'Same idea, by city — from where you’ve actually checked in before, not a location you typed once.',
  },
  {
    title: 'Starting soon',
    body: 'Tonight matters more than next month. This fades out the further away an event is, and disappears once it’s already started.',
  },
  {
    title: 'New listings',
    body: 'A small, temporary bump for the first two days after an event is created, so it isn’t buried under one with a head start — and it can’t be gamed by re-editing an old event to look fresh.',
  },
  {
    title: 'Popularity',
    body: 'How many people have verifiably checked in, capped so a handful of huge events can’t drown out everything else.',
  },
  {
    title: 'Already been',
    body: "A small penalty once you’ve verifiably attended — it's done, so this stops leading with it.",
  },
];

/**
 * Plain-language version of what `discover_feed()` actually does — see that
 * migration's own header comment for the exact formula. This is the version
 * written for someone who's never read a scoring function, reachable from
 * the feed itself rather than requiring anyone to ask.
 */
export default function Ranking() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  return (
    <View style={s.root}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 32 }]}
        showsVerticalScrollIndicator={false}>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.back}>‹ Back</Text>
        </Pressable>

        <View style={{ gap: 8 }}>
          <Text style={s.title}>How your feed is ranked</Text>
          <Text style={s.intro}>
            Not just soonest-first. Every event you see is scored against what your friends are
            doing and what you personally show up to, in this order — earlier factors matter
            more.
          </Text>
        </View>

        <View style={{ gap: 12 }}>
          {FACTORS.map((f, i) => (
            <View key={f.title} style={s.row}>
              <View style={s.num}>
                <Text style={s.numText}>{i + 1}</Text>
              </View>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={s.rowTitle}>{f.title}</Text>
                <Text style={s.rowBody}>{f.body}</Text>
              </View>
            </View>
          ))}
        </View>

        <Text style={s.footnote}>
          Everything here comes from real scans and verified check-ins — never from what you type
          into a bio or a preferences screen.
        </Text>
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, gap: 26 },
  back: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  title: { ...type.display, fontSize: 28, color: colors.text },
  intro: { ...type.body, color: colors.textDim, lineHeight: 22 },
  row: { flexDirection: 'row', gap: 14 },
  num: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.snap,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  numText: { color: colors.snap, fontSize: 12, fontWeight: '900' },
  rowTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  rowBody: { fontSize: 13.5, color: colors.textDim, lineHeight: 19 },
  footnote: { fontSize: 12, color: colors.textDim, lineHeight: 18, textAlign: 'center' },
});
