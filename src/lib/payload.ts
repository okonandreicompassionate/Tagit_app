import type { Card } from '../types';

export const TAG_HOST = 'tag.to';

/**
 * What actually goes in a QR code. Kept to a short URL rather than embedded
 * JSON so (a) the code stays low-density and scans fast in bad lighting, and
 * (b) a non-user who scans it with the stock camera lands on a web card
 * instead of a wall of gibberish.
 *
 * Two kinds of code exist and the scanner has to tell them apart:
 *   /u/<cardId>  a person  — scanning it links you two
 *   /e/<eventId> a venue   — scanning it checks you in
 */
export function encodeTag(cardId: string, eventId?: string): string {
  const q = eventId ? `?e=${encodeURIComponent(eventId)}` : '';
  return `https://${TAG_HOST}/u/${encodeURIComponent(cardId)}${q}`;
}

/** The code an organiser prints and sticks on the door. */
export function encodeEvent(eventId: string): string {
  return `https://${TAG_HOST}/e/${encodeURIComponent(eventId)}`;
}

export type ScanTarget =
  | { kind: 'user'; cardId: string; eventId?: string }
  | { kind: 'event'; eventId: string };

const ID = '[A-Za-z0-9_.-]{2,40}';

const USER_PATTERNS = [
  new RegExp(`^(?:https?://)?(?:www\\.)?tag\\.to/u/(${ID})(?:\\?(.*))?$`, 'i'),
  new RegExp(`^tag://u/(${ID})(?:\\?(.*))?$`, 'i'),
  new RegExp(`^tag:(${ID})$`, 'i'),
  new RegExp(`^(${ID})$`),
];

const EVENT_PATTERNS = [
  new RegExp(`^(?:https?://)?(?:www\\.)?tag\\.to/e/(${ID})(?:\\?.*)?$`, 'i'),
  new RegExp(`^tag://e/(${ID})(?:\\?.*)?$`, 'i'),
];

/**
 * Reads any Tag code. Returns null for every other QR the camera happens to
 * see — a WiFi code, a payment code, a random poster — so the scanner can stay
 * silent instead of firing an error at everything in the room.
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
