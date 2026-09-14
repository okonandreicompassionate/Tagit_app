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
import { parseIdentifier, sendLinkCode, verifyLinkCode } from '../src/lib/auth';
import { colors, type } from '../src/theme';

/**
 * Attaching an email or phone to the card that's already open — as opposed
 * to app/signin.tsx, which starts a fresh sign-in. The distinction is the
 * whole point: this screen never changes whose card you're holding, it only
 * gives this account a second way back in. See verifyLinkCode's doc comment
 * in lib/auth.ts for the bug that not having this screen caused.
 */
export default function LinkIdentifier() {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'identify' | 'verify' | 'done'>('identify');
  const [sentTo, setSentTo] = useState<'phone' | 'email' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parsed = parseIdentifier(identifier);

  const send = async () => {
    if (!parsed || busy) return;
    setBusy(true);
    setError(null);
    const result = await sendLinkCode(identifier);
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

    const result = await verifyLinkCode(identifier, code);
    setBusy(false);

    if (!result.ok) {
      setError(result.reason);
      return;
    }
    setStep('done');
  };

  if (step === 'done') {
    return (
      <View style={[s.root, s.center, { padding: 28 }]}>
        <Text style={s.doneTitle}>You're covered</Text>
        <Text style={s.doneBody}>
          {sentTo === 'phone' ? identifier : identifier} now gets you back into this exact card —
          same scans, same history, same rank. Lose this phone and that's how you get it back.
        </Text>
        <View style={{ height: 18 }} />
        <Button label="Done" onPress={() => router.back()} />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>Add a recovery email or number</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={s.close}>Close</Text>
          </Pressable>
        </View>

        <Text style={s.blurb}>
          {step === 'identify'
            ? "This card stays exactly as it is — we're only adding a way back into it if you lose this phone."
            : `Enter the code we sent to your ${sentTo === 'phone' ? 'phone' : 'email'}.`}
        </Text>

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
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: 24, gap: 24 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...type.h1, color: colors.text },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  blurb: { ...type.body, color: colors.textDim, lineHeight: 22 },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600', lineHeight: 19 },
  link: { color: colors.snap, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  doneTitle: { ...type.h1, color: colors.text, textAlign: 'center' },
  doneBody: {
    ...type.body,
    color: colors.textDim,
    textAlign: 'center',
    lineHeight: 22,
    marginTop: 10,
  },
});
