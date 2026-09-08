import type { Card } from '../types';

/**
 * The domain baked into every code.
 *
 * Configurable rather than hard-coded, and deliberately so: this string ends
 * up printed on stickers, written to NFC tags, and saved on other people's
 * phones, so changing it later means reprinting everything. Overriding it
 * with EXPO_PUBLIC_TAG_HOST lets the domain be decided (or corrected) at build
 * time instead of in a source edit.
 *
 * Static dot access — Expo only inlines EXPO_PUBLIC_* that way.
 */
export const TAG_HOST = process.env.EXPO_PUBLIC_TAG_HOST ?? 'tagit.app';

/** The app's own URL scheme, kept in step with `scheme` in app.json. */
export const TAG_SCHEME = 'tagit';

/**
 * What actually goes in a QR code or onto an NFC tag. Kept to a short URL
 * rather than embedded JSON so (a) the code stays low-density and scans fast
 * in bad lighting, and (b) a non-user who scans it with the stock camera
 * lands on a web card instead of a wall of gibberish.
 *
 * Two kinds of code exist and the scanner has to tell them apart:
 *   /u/<cardId>  a person  — scanning it links you two
 *   /e/<eventId> a venue   — scanning it checks you in
 */
export function encodeTag(cardId: string, eventId?: string): string {
  const q = eventId ? `?e=${encodeURIComponent(eventId)}` : '';
  return `https://${TAG_HOST}/u/${encodeURIComponent(cardId)}${q}`;
}

/** The code an organiser prints, or writes to a sticker, and puts on the door. */
export function encodeEvent(eventId: string): string {
  return `https://${TAG_HOST}/e/${encodeURIComponent(eventId)}`;
}

export type ScanTarget =
  | { kind: 'user'; cardId: string; eventId?: string }
  | { kind: 'event'; eventId: string };

const ID = '[A-Za-z0-9_.-]{2,40}';
const HOST = TAG_HOST.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Built from the configured host so a domain change can't leave the decoder
// matching the old one.
const USER_PATTERNS = [
  new RegExp(`^(?:https?://)?(?:www\\.)?${HOST}/u/(${ID})(?:\\?(.*))?$`, 'i'),
  new RegExp(`^${TAG_SCHEME}://u/(${ID})(?:\\?(.*))?$`, 'i'),
  new RegExp(`^${TAG_SCHEME}:(${ID})$`, 'i'),
  new RegExp(`^(${ID})$`),
];

const EVENT_PATTERNS = [
  new RegExp(`^(?:https?://)?(?:www\\.)?${HOST}/e/(${ID})(?:\\?.*)?$`, 'i'),
  new RegExp(`^${TAG_SCHEME}://e/(${ID})(?:\\?.*)?$`, 'i'),
];

/**
 * Reads any Tagit code. Returns null for every other QR or NFC tag the phone
 * happens to see — a WiFi code, a bus pass, a random poster — so the scanner
 * can stay silent instead of firing an error at everything in the room.
 *
 * Event patterns are tried first: `/e/` would otherwise never match, since the
 * bare-id fallback for users swallows anything.
 */
export function decodeScan(raw: string): ScanTarget | null {
  const value = raw.trim();
  if (!value) return null;

  for (const re of EVENT_PATTERNS) {
    const m = value.match(re);
    if (m) return { kind: 'event', eventId: m[1] };
  }

  for (const re of USER_PATTERNS) {
    const m = value.match(re);
    if (!m) continue;
    const eventId = m[2] ? new URLSearchParams(m[2]).get('e') ?? undefined : undefined;
    return { kind: 'user', cardId: m[1], eventId };
  }

  return null;
}

export const primaryHandle = (card: Card) =>
  card.socials.snap ?? card.socials.ig ?? card.socials.tiktok ?? card.id;

export const displayName = (card: Card) => card.nickname?.trim() || card.name;
