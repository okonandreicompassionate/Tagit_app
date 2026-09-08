import QRCode from 'react-native-qrcode-svg';
import { StyleSheet, Text, View } from 'react-native';
import { encodeTag } from '../lib/payload';
import { colors, radius } from '../theme';
import type { Card } from '../types';
import { Avatar } from './ui';

/**
 * A Snapcode-shaped card: yellow tile, code in the middle, avatar punched
 * through the centre. This is the thing people point a phone at, so the code
 * itself gets high contrast and generous quiet-zone padding.
 */
export function TagCode({
  card,
  eventId,
  size = 230,
}: {
  card: Card;
  eventId?: string;
  size?: number;
}) {
  const value = encodeTag(card.id, eventId);

  return (
    <View style={[s.tile, { width: size + 56 }]}>
      <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
        <QRCode
          value={value}
          size={size}
          color={colors.snapInk}
          backgroundColor={colors.snap}
          // Higher EC level so the avatar can cover the middle without
          // making the code unreadable.
          ecl="H"
        />
        <View style={s.center}>
          <Avatar uri={card.avatar} name={card.name} size={size * 0.22} ring={colors.snap} />
        </View>
      </View>
      <Text style={s.handle} numberOfLines={1}>
        @{card.socials.snap ?? card.id}
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
  center: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  handle: { color: colors.snapInk, fontSize: 17, fontWeight: '900', letterSpacing: -0.3 },
});
