import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TierProgress } from '../src/components/Badges';
import { Avatar, Button, Field } from '../src/components/ui';
import { isLive } from '../src/lib/api';
import { SOCIALS, SOCIAL_ORDER } from '../src/lib/socials';
import { ensureUserId } from '../src/lib/supabase';
import { useMe, useTagStore } from '../src/store/useTagStore';
import { colors, radius, type } from '../src/theme';
import type { SocialKey } from '../src/types';

/**
 * Card builder. The id is deliberately not editable — it's baked into every
 * code already printed, shared or saved on someone else's phone.
 */
export default function EditCard() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const me = useMe();
  const updateMe = useTagStore((s) => s.updateMe);
  const reset = useTagStore((s) => s.reset);

  const [name, setName] = useState(me?.name ?? '');
  const [nickname, setNickname] = useState(me?.nickname ?? '');
  const [avatar, setAvatar] = useState(me?.avatar);
  const [snapScore, setSnapScore] = useState(me?.snapScore ? String(me.snapScore) : '');
  const [socials, setSocials] = useState<Partial<Record<SocialKey, string>>>(me?.socials ?? {});
  const [saving, setSaving] = useState(false);
  // Surfaced at the bottom of this screen so the state of the backend is
  // checkable on a real device, where there's no console to read.
  const [authState, setAuthState] = useState<'checking' | 'signed-in' | 'anonymous'>('checking');

  useEffect(() => {
    let alive = true;
    void ensureUserId().then((uid) => {
      if (alive) setAuthState(uid ? 'signed-in' : 'anonymous');
    });
    return () => {
      alive = false;
    };
  }, []);

  if (!me) return <View style={s.root} />;

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

  const save = async () => {
    setSaving(true);
    const score = Number(snapScore.replace(/[^\d]/g, ''));
    // Drop emptied handles rather than storing blank strings.
    const cleaned = Object.fromEntries(
      Object.entries(socials)
        .map(([k, v]) => [k, v?.trim().replace(/^@+/, '')])
        .filter(([, v]) => v)
    ) as Partial<Record<SocialKey, string>>;

    await updateMe({
      name: name.trim() || me.name,
      nickname: nickname.trim() || undefined,
      avatar,
      snapScore: Number.isFinite(score) && score > 0 ? score : undefined,
      socials: cleaned,
    });
    setSaving(false);
    router.back();
  };

  const confirmReset = () =>
    Alert.alert(
      'Start over?',
      'Deletes your card and everyone you’ve tagged on this phone. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete everything',
          style: 'destructive',
          onPress: () => {
            reset();
            router.replace('/onboarding');
          },
        },
      ]
    );

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={[s.content, { paddingBottom: insets.bottom + 40 }]}
        keyboardShouldPersistTaps="handled">
        <View style={s.header}>
          <Text style={s.title}>My card</Text>
          <Pressable accessibilityRole="button" onPress={() => router.back()}>
            <Text style={s.close}>Close</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Change photo"
          onPress={() => void pickAvatar()}
          style={{ alignItems: 'center', gap: 8 }}>
          <Avatar uri={avatar} name={name} size={84} ring={colors.snap} />
          <Text style={s.avatarHint}>Change photo</Text>
        </Pressable>

        <View style={s.panel}>
          <TierProgress swag={me.swag} />
          <Text style={s.idNote}>
            Your code: tag.to/u/{me.id} · fixed, so old codes keep working
          </Text>
        </View>

        <View style={{ gap: 16 }}>
          <Field label="Name" value={name} onChangeText={setName} autoCapitalize="words" />
          <Field
            label="What people call you"
            value={nickname}
            onChangeText={setNickname}
            autoCapitalize="words"
            placeholder="Optional"
          />
        </View>

        <View style={s.panel}>
          <Text style={s.panelTitle}>HANDLES</Text>
          {SOCIAL_ORDER.map((key) => (
            <Field
              key={key}
              label={SOCIALS[key].label + (key === 'snap' ? ' · anchor' : '')}
              value={socials[key] ?? ''}
              onChangeText={(v) => setSocials((prev) => ({ ...prev, [key]: v }))}
              placeholder={key === 'whatsapp' ? '+234…' : 'handle'}
              keyboardType={key === 'whatsapp' ? 'phone-pad' : 'default'}
            />
          ))}
          <Field
            label="Snap score"
            value={snapScore}
            onChangeText={setSnapScore}
            keyboardType="number-pad"
            placeholder="Optional"
          />
        </View>

        <Button label={saving ? 'Saving…' : 'Save card'} onPress={() => void save()} disabled={saving} />

        <Text style={s.backend}>
          {!isLive
            ? 'Backend: local only — set EXPO_PUBLIC_SUPABASE_URL to sync'
            : authState === 'checking'
              ? 'Backend: connected · checking sign-in…'
              : authState === 'signed-in'
                ? 'Backend: connected · card claimed to this phone'
                : 'Backend: connected · unclaimed (enable anonymous sign-in to lock it)'}
        </Text>

        <Pressable accessibilityRole="button" onPress={confirmReset} style={{ padding: 10 }}>
          <Text style={s.reset}>Delete my card and start over</Text>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { paddingHorizontal: 24, paddingTop: 20, gap: 22 },
  header: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
  title: { ...type.h1, color: colors.text },
  close: { color: colors.textDim, fontSize: 14, fontWeight: '700' },
  avatarHint: { fontSize: 12, fontWeight: '800', color: colors.snap },
  panel: {
    gap: 12,
    padding: 16,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  panelTitle: { ...type.label, color: colors.textDim },
  idNote: { fontSize: 11, color: colors.textDim, fontWeight: '600' },
  backend: { fontSize: 11, color: colors.textDim, textAlign: 'center' },
  reset: { color: colors.danger, fontSize: 13, fontWeight: '700', textAlign: 'center' },
});
