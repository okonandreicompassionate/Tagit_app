import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field, Pill } from '../../src/components/ui';
import { BOOST_TIERS, formatNaira } from '../../src/lib/eventsApi';
import { createBoostCheckout, PaymentsNotConfigured } from '../../src/lib/payments';
import { useMe, useTagStore } from '../../src/store/useTagStore';
import { colors, radius, type } from '../../src/theme';

/**
 * Self-serve reach. Flat tiers, no rate card to explain, no sales call —
 * a host picks a number of days and pays.
 *
 * The app never confirms payment itself: it opens Paystack's hosted page and
 * the webhook applies the boost. So this screen deliberately ends on
 * "we'll apply it when Paystack confirms" rather than claiming success.
 */
export default function BoostEvent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const event = useTagStore((s) => (id ? s.events[id] : undefined));

  const [days, setDays] = useState(BOOST_TIERS[1].days);
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const tier = BOOST_TIERS.find((t) => t.days === days) ?? BOOST_TIERS[0];
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim());

  const pay = async () => {
    if (!id || !me || !emailOk || busy) return;
    setBusy(true);
    setError(null);
    try {
      const checkout = await createBoostCheckout({
        eventId: id,
        cardId: me.id,
        kind: 'boost',
        days: tier.days,
        amountKobo: tier.amountKobo,
        email: email.trim(),
      });
      setSent(true);
      await Linking.openURL(checkout.authorizationUrl);
    } catch (err) {
      setError(
        err instanceof PaymentsNotConfigured
          ? 'Boost payments aren’t switched on yet. The boost-checkout function needs deploying with a Paystack key — see docs/PAYMENTS.md.'
          : 'Couldn’t start the payment. Try again in a moment.'
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView
      style={s.root}
      contentContainerStyle={[
        s.content,
        { paddingTop: insets.top + 14, paddingBottom: insets.bottom + 40 },
      ]}
      keyboardShouldPersistTaps="handled">
      <View style={s.header}>
        <Text style={s.title}>Boost</Text>
        <Pressable accessibilityRole="button" onPress={() => router.back()}>
          <Text style={s.close}>Close</Text>
        </Pressable>
      </View>

      <Text style={s.blurb}>
        {event ? `“${event.name}” ` : 'This event '}will rank above unboosted events in Discover
        for the period you pick, and be labelled as boosted. Brand-featured slots still rank above
        boosts.
      </Text>

      <View style={{ gap: 10 }}>
        {BOOST_TIERS.map((t) => {
          const on = t.days === days;
          return (
            <Pressable
              key={t.days}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              onPress={() => setDays(t.days)}
              style={[s.tier, on && { borderColor: colors.snap }]}>
              <View style={{ flex: 1, gap: 3 }}>
                <Text style={[s.tierDays, on && { color: colors.snap }]}>
                  {t.days} {t.days === 1 ? 'day' : 'days'}
                </Text>
                <Text style={s.tierSub}>
                  {formatNaira(t.amountKobo / t.days)} a day · rank weight {t.score}
                </Text>
              </View>
              <Text style={[s.tierPrice, on && { color: colors.snap }]}>
                {formatNaira(t.amountKobo)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Field
        label="Email for the receipt"
        value={email}
        onChangeText={setEmail}
        placeholder="you@example.com"
        keyboardType="email-address"
        hint="Paystack sends the receipt here."
      />

      {error ? <Text style={s.error}>{error}</Text> : null}

      {sent ? (
        <View style={s.pending}>
          <Pill color={colors.snap}>PAYMENT OPENED</Pill>
          <Text style={s.pendingText}>
            Finish paying in the browser. The boost goes live as soon as Paystack confirms it —
            usually seconds. You can close this.
          </Text>
        </View>
      ) : null}

      <Button
        label={busy ? 'Starting…' : `Pay ${formatNaira(tier.amountKobo)}`}
        onPress={() => void pay()}
        disabled={!emailOk || busy || !me}
      />
      <Text style={s.footnote}>
        Payment is handled entirely by Paystack — Tagit never sees your card details.
      </Text>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, gap: 20 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...type.h1, color: colors.text },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  blurb: { ...type.body, color: colors.textDim, lineHeight: 22 },
  tier: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    padding: 15,
  },
  tierDays: { fontSize: 16, fontWeight: '800', color: colors.text },
  tierSub: { fontSize: 11.5, color: colors.textDim, fontWeight: '600' },
  tierPrice: { fontSize: 17, fontWeight: '900', color: colors.text },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  pending: {
    gap: 8,
    padding: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.snap,
    backgroundColor: colors.surface,
  },
  pendingText: { fontSize: 12.5, color: colors.textDim, lineHeight: 18 },
  footnote: { fontSize: 11, color: colors.textDim, textAlign: 'center', lineHeight: 16 },
});
