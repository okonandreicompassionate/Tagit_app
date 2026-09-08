import * as Haptics from 'expo-haptics';
import { ReactNode } from 'react';
import {
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, radius, type } from '../theme';

export function Avatar({
  uri,
  name,
  size = 48,
  ring,
}: {
  uri?: string;
  name: string;
  size?: number;
  ring?: string;
}) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('');

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.surfaceHi,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: ring ? 2.5 : 0,
        borderColor: ring ?? 'transparent',
        overflow: 'hidden',
      }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: '100%', height: '100%' }} />
      ) : (
        <Text style={{ color: colors.textDim, fontSize: size * 0.36, fontWeight: '800' }}>
          {initials || '?'}
        </Text>
      )}
    </View>
  );
}

export function Button({
  label,
  onPress,
  variant = 'snap',
  icon,
  disabled,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'snap' | 'ghost' | 'dark' | 'danger';
  icon?: ReactNode;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const palette = {
    snap: { bg: colors.snap, fg: colors.snapInk, border: colors.snap },
    dark: { bg: colors.surfaceHi, fg: colors.text, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.text, border: colors.border },
    danger: { bg: 'transparent', fg: colors.danger, border: colors.border },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={() => {
        if (Platform.OS !== 'web') void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        s.btn,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
          opacity: disabled ? 0.4 : pressed ? 0.75 : 1,
        },
        style,
      ]}>
      {icon}
      <Text style={[s.btnLabel, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Field({
  label,
  hint,
  ...props
}: TextInputProps & { label: string; hint?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={s.fieldLabel}>{label.toUpperCase()}</Text>
      <TextInput
        placeholderTextColor={colors.textDim}
        autoCapitalize="none"
        autoCorrect={false}
        {...props}
        style={[s.input, props.style]}
      />
      {hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

export function Pill({
  children,
  color = colors.textDim,
  filled,
}: {
  children: ReactNode;
  color?: string;
  filled?: boolean;
}) {
  return (
    <View
      style={[
        s.pill,
        {
          borderColor: color,
          backgroundColor: filled ? color : 'transparent',
        },
      ]}>
      <Text
        style={[s.pillText, { color: filled ? colors.snapInk : color }]}
        numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

export function Stat({ value, label }: { value: string | number; label: string }) {
  return (
    <View style={{ alignItems: 'center', minWidth: 64 }}>
      <Text style={s.statValue}>{value}</Text>
      <Text style={s.statLabel}>{label.toUpperCase()}</Text>
    </View>
  );
}

export function Empty({ title, body }: { title: string; body: string }) {
  return (
    <View style={s.empty}>
      <Text style={s.emptyTitle}>{title}</Text>
      <Text style={s.emptyBody}>{body}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    height: 52,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  btnLabel: { fontSize: 16, fontWeight: '800' },
  fieldLabel: { ...type.label, color: colors.textDim },
  input: {
    backgroundColor: colors.surfaceHi,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    height: 50,
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  hint: { fontSize: 12, color: colors.textDim },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignSelf: 'flex-start',
  },
  pillText: { fontSize: 11, fontWeight: '800', letterSpacing: 0.4 },
  statValue: { ...type.h1, color: colors.text },
  statLabel: { fontSize: 10, fontWeight: '700', color: colors.textDim, letterSpacing: 0.8 },
  empty: { alignItems: 'center', gap: 8, paddingHorizontal: 40, paddingTop: 80 },
  emptyTitle: { ...type.h2, color: colors.text, textAlign: 'center' },
  emptyBody: { ...type.body, color: colors.textDim, textAlign: 'center', lineHeight: 21 },
});
