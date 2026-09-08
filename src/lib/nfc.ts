import { Platform } from 'react-native';
import { urlFromTag, type NfcTag } from './ndef';

export { decodeUriRecord, URI_PREFIXES, urlFromTag } from './ndef';
export type { NdefRecord, NfcTag } from './ndef';

/**
 * NFC — tapping instead of scanning.
 *
 * An NFC sticker is a batteryless chip that stores one short URL: the very
 * same `tagit.app/...` link already inside a Tagit QR code. So nothing about
 * check-ins, links or scoring changes — NFC is a second doorway into the
 * system that already exists, and every tag we write stays readable by any
 * phone even without Tagit installed.
 *
 * Two limits worth stating in code, because they shape the whole feature:
 *
 *  - **Two phones cannot tap each other.** iOS cannot emulate an NFC tag at
 *    all, and Android removed phone-to-phone push (Beam) years ago. NFC here
 *    is strictly phone-to-*thing*: wristbands, door stickers, Tagit cards,
 *    posters. Phone-to-phone remains the camera.
 *  - **Not available in Expo Go.** This is a third-party native module, so it
 *    is required lazily and every function degrades to "unavailable" rather
 *    than throwing. The app must stay fully usable without it.
 */

type NfcModule = {
  default: {
    start: () => Promise<void>;
    isSupported: () => Promise<boolean>;
    isEnabled: () => Promise<boolean>;
    requestTechnology: (tech: unknown) => Promise<unknown>;
    getTag: () => Promise<NfcTag | null>;
    cancelTechnologyRequest: () => Promise<void>;
    writeNdefMessage: (bytes: number[]) => Promise<void>;
  };
  NfcTech: { Ndef: unknown };
  Ndef: {
    encodeMessage: (records: unknown[]) => number[];
    uriRecord: (uri: string) => unknown;
  };
};

let cached: NfcModule | null | undefined;

/** Lazy require: a static import would break the Expo Go bundle. */
function load(): NfcModule | null {
  if (cached !== undefined) return cached;
  try {
    cached = require('react-native-nfc-manager') as NfcModule;
  } catch {
    cached = null;
  }
  return cached;
}

let started = false;

/**
 * Whether this device can actually tap. False on web, in Expo Go, on hardware
 * without an NFC radio, and when the user has NFC switched off in settings.
 */
export async function isNfcAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  const mod = load();
  if (!mod) return false;

  try {
    if (!(await mod.default.isSupported())) return false;
    if (!started) {
      await mod.default.start();
      started = true;
    }
    // Android lets the user disable the radio; iOS has no such switch and
    // reports enabled whenever it is supported.
    return Platform.OS === 'android' ? await mod.default.isEnabled() : true;
  } catch {
    return false;
  }
}

/**
 * Opens a tap session and resolves with the URL on the tag.
 *
 * On iOS this shows the system "Ready to Scan" sheet; on Android the app must
 * be in the foreground. Returns null if the tap is cancelled or the tag holds
 * nothing we can read.
 */
export async function readTagUrl(): Promise<string | null> {
  const mod = load();
  if (!mod || !(await isNfcAvailable())) return null;

  try {
    await mod.default.requestTechnology(mod.NfcTech.Ndef);
    return urlFromTag(await mod.default.getTag());
  } catch {
    // Cancelled, moved away too early, or an unreadable tag.
    return null;
  } finally {
    // Always release the radio: an abandoned session blocks the next tap.
    await mod.default.cancelTechnologyRequest().catch(() => {});
  }
}

/**
 * Writes a URL onto a blank tag — how a host turns a pack of stickers into
 * door codes, or someone programs their own Tagit card.
 */
export async function writeTagUrl(url: string): Promise<boolean> {
  const mod = load();
  if (!mod || !(await isNfcAvailable())) return false;

  try {
    await mod.default.requestTechnology(mod.NfcTech.Ndef);
    const bytes = mod.Ndef.encodeMessage([mod.Ndef.uriRecord(url)]);
    if (!bytes) return false;
    await mod.default.writeNdefMessage(bytes);
    return true;
  } catch {
    return false;
  } finally {
    await mod.default.cancelTechnologyRequest().catch(() => {});
  }
}

/** Call when leaving a screen that offered tapping. */
export async function cancelNfc(): Promise<void> {
  const mod = load();
  if (!mod) return;
  await mod.default.cancelTechnologyRequest().catch(() => {});
}
