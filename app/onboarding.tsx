import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
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
import { Avatar, Button, Field } from '../src/components/ui';
import { isHandleFree } from '../src/lib/api';
import { verifyHandle, type HandleCheck } from '../src/lib/snapchat';
import { SOCIALS } from '../src/lib/socials';
import { useTagStore } from '../src/store/useTagStore';
import { colors, radius, type } from '../src/theme';

/** Derive the code id from the Snap handle — one less thing to invent. */
const toId = (snap: string) =>
  snap
    .trim()
    .toLowerCase()
    .replace(/^@+/, '')
    .replace(/[^a-z0-9_.-]/g, '')
    .slice(0, 40);

export default function Onboarding() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const createMe = useTagStore((s) => s.createMe);

  const [name, setName] = useState('');
  const [nickname, setNickname] = useState('');
  const [snap, setSnap] = useState('');
  const [bio, setBio] = useState('');
  const [ig, setIg] = useState('');
  const [tiktok, setTiktok] = useState('');
  const [snapScore, setSnapScore] = useState('');
  const [avatar, setAvatar] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snapCheck, setSnapCheck] = useState<HandleCheck | 'checking' | null>(null);

  const id = useMemo(() => toId(snap), [snap]);

  /**
   * Check the Snap handle against Snapchat's public profile page when the
   * field loses focus. A typo here silently breaks the app's single most
   * important action — the Add on Snap button — and nobody finds out until
   * someone can't add them.
   *
   * Never blocks: an unreachable check leaves the user free to continue.
   */
  const checkSnap = async () => {
    const handle = snap.trim();
    if (!handle) {
      setSnapCheck(null);
      return;
    }
    setSnapCheck('checking');
    const result = await verifyHandle(handle);
    setSnapCheck(result);
    // Save them typing their own name if Snapchat already knows it.
    if (result.status === 'valid' && result.displayName && !name.trim()) {
      setName(result.displayName);
    }
  };

  const snapHint = (() => {
    if (snapCheck === 'checking') return 'Checking with Snapchat…';
    if (snapCheck?.status === 'valid') {
      return snapCheck.displayName
        ? `✓ Found — ${snapCheck.displayName}`
        : '✓ That Snapchat account exists';
    }
    if (snapCheck?.status === 'not-found') return '✗ No Snapchat account with that handle';
    if (id) return `Your code will be tag.to/u/${id}`;
    return 'This is the anchor of your card';
  })();
  const ready = name.trim().length >= 2 && id.length >= 2;

  const pickAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.6,
    });
    if (!result.canceled) setAvatar(result.assets[0]?.uri);
  };

  const submit = async () => {
    if (!ready || busy) return;
    setBusy(true);
    setError(null);
    try {
      // Only blocks when a backend is wired up; offline this always passes.
      const free = await isHandleFree(id).catch(() => true);
      if (!free) {
        setError(`@${id} is taken on Tag. Try a different Snap handle.`);
        return;
      }
      const score = Number(snapScore.replace(/[^\d]/g, ''));
      await createMe({
        id,
        name,
        nickname,
        bio,
        avatar,
        snapScore: Number.isFinite(score) && score > 0 ? score : undefined,
        socials: {
          snap: snap.trim().replace(/^@+/, ''),
          ...(ig.trim() ? { ig: ig.trim().replace(/^@+/, '') } : {}),
          ...(tiktok.trim() ? { tiktok: tiktok.trim().replace(/^@+/, '') } : {}),
        },
      });
      router.replace('/');
    } catch {
      setError("Couldn't save your card. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[
          s.content,
          { paddingTop: insets.top + 28, paddingBottom: insets.bottom + 40 },
        ]}
        keyboardShouldPersistTaps="handled">
        <View style={{ gap: 6 }}>
          <Text style={s.wordmark}>TAG</Text>
          <Text style={s.tagline}>
            The fastest way to add people on Snap in real life. Build your card once — after that
            it's one scan.
          </Text>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Choose a photo"
          onPress={() => void pickAvatar()}
          style={s.avatarPick}>
          <Avatar uri={avatar} name={name || '?'} size={84} ring={colors.snap} />
          <Text style={s.avatarHint}>{avatar ? 'Change photo' : 'Add a photo'}</Text>
        </Pressable>

        <View style={{ gap: 16 }}>
          <Field
            label="Snapchat handle"
            value={snap}
            onChangeText={(v) => {
              setSnap(v);
              setSnapCheck(null);
            }}
            onEndEditing={() => void checkSnap()}
            placeholder="yoursnap"
            autoCapitalize="none"
            hint={snapHint}
          />
          <Field
            label="Name"
            value={name}
            onChangeText={setName}
            placeholder="Full name"
            autoCapitalize="words"
          />
          <Field
            label="What people call you"
            value={nickname}
            onChangeText={setNickname}
            placeholder="Optional"
            autoCapitalize="words"
          />
          <Field
            label="Vibe line"
            value={bio}
            onChangeText={setBio}
            placeholder="One line about you"
            maxLength={80}
            autoCapitalize="sentences"
          />
        </View>

        <View style={s.secondary}>
          <Text style={s.secondaryTitle}>ALSO ON (OPTIONAL)</Text>
          <View style={{ gap: 12 }}>
            <Field label={SOCIALS.ig.label} value={ig} onChangeText={setIg} placeholder="handle" />
            <Field
              label={SOCIALS.tiktok.label}
              value={tiktok}
              onChangeText={setTiktok}
              placeholder="handle"
            />
            <Field
              label="Snap score"
              value={snapScore}
              onChangeText={setSnapScore}
              placeholder="e.g. 284500"
              keyboardType="number-pad"
              hint="Shows on your card. Skip it if you'd rather not."
            />
          </View>
        </View>

        {error ? <Text style={s.error}>{error}</Text> : null}

        <Button
          label={busy ? 'Setting up…' : 'Make my code'}
          onPress={() => void submit()}
          disabled={!ready || busy}
        />
        <Text style={s.footnote}>
          Your card lives on your phone. Nothing is shared until someone scans your code.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, gap: 24 },
  wordmark: { fontSize: 44, fontWeight: '900', color: colors.snap, letterSpacing: -2 },
  tagline: { ...type.body, color: colors.textDim, lineHeight: 22 },
  avatarPick: { alignItems: 'center', gap: 8 },
  avatarHint: { fontSize: 12, fontWeight: '800', color: colors.snap },
  secondary: {
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryTitle: { ...type.label, color: colors.textDim },
  error: { color: colors.danger, fontSize: 13, fontWeight: '600' },
  footnote: { fontSize: 11, color: colors.textDim, textAlign: 'center', lineHeight: 16 },
});
