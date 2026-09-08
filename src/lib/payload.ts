import type { Card } from '../types';

export const TAG_HOST = 'tag.to';

/**
 * What actually goes in the QR code. Kept to a short URL rather than embedded
 * JSON so (a) the code stays low-density and scans fast in bad lighting, and
 * (b) a non-user who scans it with the stock camera lands on a web card.
 *
 * `e` carries the event so a scan can be attributed without asking.
 */
export function encodeTag(cardId: string, eventId?: string): string {
  const q = eventId ? `?e=${encodeURIComponent(eventId)}` : '';
  return `https://${TAG_HOST}/u/${encodeURIComponent(cardId)}${q}`;
}

export type DecodedTag = { cardId: string; eventId?: string };

/**
 * Accepts the https link, the `tag://` deep link, and a bare id — people paste
 * all three. Returns null for any other QR code so we can stay silent instead
 * of firing an error on every random barcode the camera sees.
 */
export function decodeTag(raw: string): DecodedTag | null {
  const value = raw.trim();
  if (!value) return null;

  const patterns = [
    /^(?:https?:\/\/)?(?:www\.)?tag\.to\/u\/([A-Za-z0-9_.-]{2,40})(?:\?(.*))?$/i,
    /^tag:\/\/u\/([A-Za-z0-9_.-]{2,40})(?:\?(.*))?$/i,
    /^tag:([A-Za-z0-9_.-]{2,40})$/i,
    /^([A-Za-z0-9_.-]{2,40})$/,
  ];

  for (const re of patterns) {
    const m = value.match(re);
    if (!m) continue;
    const cardId = m[1];
    const eventId = m[2] ? new URLSearchParams(m[2]).get('e') ?? undefined : undefined;
    return { cardId, eventId };
  }
  return null;
}

export const primaryHandle = (card: Card) =>
  card.socials.snap ?? card.socials.ig ?? card.socials.tiktok ?? card.id;

export const displayName = (card: Card) => card.nickname?.trim() || card.name;
