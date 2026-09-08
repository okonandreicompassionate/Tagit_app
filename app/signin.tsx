import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Field } from '../src/components/ui';
import { myCard } from '../src/lib/account';
import { parseIdentifier, sendCode, verifyCode } from '../src/lib/auth';
import { isLive } from '../src/lib/rest';
import { useTagStore } from '../src/store/useTagStore';
import { colors, radius, type } from '../src/theme';

/**
 * One screen, two steps: send a code, then type it.
 *
 * Deliberately a single field that takes a phone number or an email rather
 * than a picker. Asking someone to choose a login method before they've seen
 * the app is a step that earns nothing — the shape of what they type already
 * says which it is.
 */
export default function SignIn() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const adoptCard = useTagStore((s) => s.adoptCard);

  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'identify' | 'verify'>('identify');
  const [sentTo, setSentTo] = useState<'phone' | 'email' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseIdentifier(identifier);

  const send = async () => {
    if (!parsed || busy) return;
    setBusy(true);
    setError(null);
    const result = await sendCode(identifier);
    setBusy(false);

    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setSentTo(result.kind);
    setStep('verify');
  };

  const verify = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);

    const result = await verifyCode(identifier, code);
    if (!result.ok) {
      setError(result.reason);
      setBusy(false);
      return;
    }

    // Signed in. If this account already has a card, that *is* the login —
    // restore it and skip onboarding entirely.
    try {
      const existing = await myCard();
      if (existing) {
        adoptCard(existing);
        router.replace('/');
        return;
      }
    } catch {
      // Falling through to onboarding is the right failure: worst case they
      // re-enter a handle they already own, which now resolves to "yours".
    } finally {
      setBusy(false);
    }

    router.replace('/onboarding');
  };

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 40, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={{ gap: 8 }}>
          <Text style={s.wordmark}>TAGIT</Text>
          <Text style={s.tagline}>
            {step === 'identify'
              ? 'Sign in so your card follows you to a new phone.'
              : `Enter the code we sent to your ${sentTo === 'phone' ? 'phone' : 'email'}.`}
          </Text>
        </View>

        {step === 'identify' ? (
          <View style={{ gap: 16 }}>
            <Field
              label="Phone number or email"
              value={identifier}
              onChangeText={(v) => {
                setIdentifier(v);
                setError(null);
              }}
              placeholder="0801 234 5678"
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="username"
              hint={
                parsed?.kind === 'phone'
                  ? `We'll text ${parsed.value}`
                  : parsed?.kind === 'email'
                    ? `We'll email ${parsed.value}`
                    : 'A Nigerian number works with or without +234.'
              }
            />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <Button
              label={busy ? 'Sending…' : 'Send me a code'}
              onPress={() => void send()}
              disabled={!parsed || busy}
            />
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            <Field
              label="Your code"
              value={code}
              onChangeText={(v) => {
                setCode(v);
                setError(null);
              }}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              maxLength={8}
            />
            {error ? <Text style={s.error}>{error}</Text> : null}
            <Button
              label={busy ? 'Checking…' : 'Continue'}
              onPress={() => void verify()}
              disabled={code.trim().length < 4 || busy}
            />
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                setStep('identify');
                setCode('');
                setError(null);
              }}>
              <Text style={s.link}>Use a different number or email</Text>
            </Pressable>
          </View>
        )}

        {!isLive ? (
          <Text style={s.footnote}>
            No backend configured — sign-in is unavailable. The app still works offline.
          </Text>
        ) : (
          <Text style={s.footnote}>
            Already used Tagit on another phone? Sign in with the same number and your card,
            people and rank come back.
          </Text>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, gap: 30 },
  wordmark: { fontSize: 44, fontWeight: '900', color: colors.snap, letterSpacing: -2 },
  tagline: { ...type.body, color: colors.textDim, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  link: { color: colors.snap, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  footnote: { fontSize: 11.5, color: colors.textDim, textAlign: 'center', lineHeight: 17 },
});
