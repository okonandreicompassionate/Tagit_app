import { Alert, Linking, Platform } from 'react-native';
import { colors } from '../theme';
import type { SocialKey } from '../types';

type Spec = {
  key: SocialKey;
  label: string;
  color: string;
  prefix: string;
  /** Opens the native app directly when installed. */
  appUrl: (handle: string) => string;
  /** Browser fallback when the app isn't there. */
  webUrl: (handle: string) => string;
};

const clean = (h: string) => h.trim().replace(/^@+/, '').replace(/\s+/g, '');

export const SOCIALS: Record<SocialKey, Spec> = {
  snap: {
    key: 'snap',
    label: 'Snapchat',
    color: colors.snap,
    prefix: '@',
    appUrl: (h) => `snapchat://add/${clean(h)}`,
    webUrl: (h) => `https://snapchat.com/add/${clean(h)}`,
  },
  ig: {
    key: 'ig',
    label: 'Instagram',
    color: colors.ig,
    prefix: '@',
    appUrl: (h) => `instagram://user?username=${clean(h)}`,
    webUrl: (h) => `https://instagram.com/${clean(h)}`,
  },
  tiktok: {
    key: 'tiktok',
    label: 'TikTok',
    color: colors.tiktok,
    prefix: '@',
    appUrl: (h) => `https://tiktok.com/@${clean(h)}`,
    webUrl: (h) => `https://tiktok.com/@${clean(h)}`,
  },
  x: {
    key: 'x',
    label: 'X',
    color: colors.x,
    prefix: '@',
    appUrl: (h) => `twitter://user?screen_name=${clean(h)}`,
    webUrl: (h) => `https://x.com/${clean(h)}`,
  },
  whatsapp: {
    key: 'whatsapp',
    label: 'WhatsApp',
    color: colors.wa,
    prefix: '',
    appUrl: (h) => `whatsapp://send?phone=${clean(h).replace(/[^\d+]/g, '')}`,
    webUrl: (h) => `https://wa.me/${clean(h).replace(/[^\d]/g, '')}`,
  },
};

/** Order matters: Snap is the anchor of the card, the rest are secondary. */
export const SOCIAL_ORDER: SocialKey[] = ['snap', 'ig', 'tiktok', 'x', 'whatsapp'];

/**
 * Jumps straight into the platform's app to add someone — the whole point of
 * the app is that nobody types a username. Falls back to the web profile.
 */
export async function openSocial(key: SocialKey, handle: string) {
  const spec = SOCIALS[key];
  const app = spec.appUrl(handle);
  const web = spec.webUrl(handle);
  try {
    // canOpenURL needs the scheme declared in LSApplicationQueriesSchemes on iOS.
    const canOpenApp = Platform.OS === 'web' ? false : await Linking.canOpenURL(app);
    await Linking.openURL(canOpenApp ? app : web);
  } catch {
    try {
      await Linking.openURL(web);
    } catch {
      Alert.alert(`Couldn't open ${spec.label}`, `Their handle is @${clean(handle)}`);
    }
  }
}
