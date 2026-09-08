/**
 * NDEF URI parsing — pure, with no native or React Native dependency.
 *
 * Kept separate from `nfc.ts` on purpose: this is the part that has to be
 * correct against arbitrary input, so it must be testable without dragging in
 * the native module (or react-native itself) to do it.
 */

export type NdefRecord = { payload?: number[] | Uint8Array };
export type NfcTag = { ndefMessage?: NdefRecord[] };

/**
 * NDEF stores a one-byte abbreviation in place of a common URL prefix. That
 * abbreviation is what keeps a full URL inside the tiny memory of a cheap tag.
 * Index = the code; value = what it stands for.
 */
export const URI_PREFIXES = [
  '', // 0x00 — no prefix, the whole URI follows
  'http://www.',
  'https://www.',
  'http://',
  'https://',
  'tel:',
  'mailto:',
] as const;

export function decodeUriRecord(payload: number[] | Uint8Array | undefined): string | null {
  if (!payload || payload.length === 0) return null;

  const bytes = Array.from(payload);
  const code = bytes[0];
  const known = code < URI_PREFIXES.length;

  // An unknown first byte isn't a prefix code at all — some writers store
  // plain text with no prefix. Dropping it would corrupt every such tag.
  const prefix = known ? URI_PREFIXES[code] : '';
  const body = known ? bytes.slice(1) : bytes;

  // A prefix byte with nothing after it is a blank or truncated tag, not a
  // URL — returning a bare "https://" would send the scanner nowhere.
  if (body.length === 0) return null;

  try {
    const url = `${prefix}${String.fromCharCode(...body)}`.trim();
    return url.length ? url : null;
  } catch {
    return null;
  }
}

/** Pulls the first readable URL out of whatever the tag holds. */
export function urlFromTag(tag: NfcTag | null | undefined): string | null {
  for (const record of tag?.ndefMessage ?? []) {
    const url = decodeUriRecord(record.payload);
    if (url) return url;
  }
  return null;
}
