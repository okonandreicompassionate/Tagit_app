import { useState } from 'react';
import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';
import { snapcodeUrl } from '../lib/snapchat';
import { colors, radius } from '../theme';

/**
 * Someone's genuine Snapcode, Bitmoji included, straight from Snapchat.
 *
 * Why this exists alongside the Tag code: a Tag code carries the whole Tag
 * identity — swag, streaks, event attribution — but only works if the other
 * person has Tag. A Snapcode works for anyone with Snapchat, which at a party
 * is everyone. So it's the fallback that makes the app useful on day one,
 * before anybody else has installed it.
 */
export function Snapcode({ handle, size = 230 }: { handle: string; size?: number }) {
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');

  return (
    <View style={[s.tile, { width: size + 56 }]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        {state !== 'failed' ? (
          <Image
            source={{ uri: snapcodeUrl(handle, Math.round(size * 2)) }}
            style={{ width: size, height: size }}
            resizeMode="contain"
            onLoad={() => setState('ready')}
            onError={() => setState('failed')}
            accessibilityLabel={`Snapcode for @${handle}`}
          />
        ) : null}

        {state === 'loading' ? (
          <View style={s.overlay}>
            <ActivityIndicator color={colors.snapInk} />
          </View>
        ) : null}

        {state === 'failed' ? (
          <View style={s.overlay}>
            <Text style={s.failed}>
              Couldn&apos;t load the Snapcode.{'\n'}Check the handle, or your connection.
            </Text>
          </View>
        ) : null}
      </View>

      <Text style={s.handle} numberOfLines={1}>
        @{handle}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  tile: {
    backgroundColor: colors.snap,
    borderRadius: radius.lg + 8,
    padding: 28,
    alignItems: 'center',
    gap: 14,
  },
  overlay: { position: 'absolute', alignItems: 'center', justifyContent: 'center', padding: 12 },
  failed: {
    color: colors.snapInk,
    fontSize: 13,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 18,
  },
  handle: { color: colors.snapInk, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
});
