/**
 * The NDEF URI parser. Worth real tests because it is fed whatever tag a
 * stranger waves at the phone — a hotel key, a bus pass, a poster, a blank —
 * and it must extract a URL or quietly give up, never throw.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeUriRecord, urlFromTag } from '../ndef.ts';
import { decodeScan } from '../payload.ts';

/** Builds a payload the way a writer does: prefix code, then ASCII. */
const payload = (prefixCode: number, rest: string) => [
  prefixCode,
  ...rest.split('').map((c) => c.charCodeAt(0)),
];

test('the first byte expands to a URL prefix', () => {
  // 0x04 = https:// — the abbreviation is what keeps a URL small enough for a
  // cheap tag.
  assert.equal(decodeUriRecord(payload(0x04, 'tag.to/u/bigsho')), 'https://tag.to/u/bigsho');
  assert.equal(decodeUriRecord(payload(0x03, 'tag.to/e/evt_1')), 'http://tag.to/e/evt_1');
  assert.equal(decodeUriRecord(payload(0x02, 'tag.to/u/x')), 'https://www.tag.to/u/x');
});

test('prefix code 0 means the whole URI is spelled out', () => {
  assert.equal(decodeUriRecord(payload(0x00, 'https://tag.to/u/tolu')), 'https://tag.to/u/tolu');
});

test('an unrecognised first byte is kept, not eaten', () => {
  // Some writers store plain text with no prefix byte at all. Dropping the
  // first character would silently corrupt every such tag.
  const decoded = decodeUriRecord(payload(0x54, 'ag'));
  assert.equal(decoded, 'Tag');
});

test('empty and missing payloads give up quietly', () => {
  assert.equal(decodeUriRecord(undefined), null);
  assert.equal(decodeUriRecord([]), null);
  assert.equal(decodeUriRecord([0x04]), null);
});

test('accepts a Uint8Array as well as a plain array', () => {
  const bytes = new Uint8Array(payload(0x04, 'tag.to/u/ams'));
  assert.equal(decodeUriRecord(bytes), 'https://tag.to/u/ams');
});

test('reads the first usable record out of a multi-record tag', () => {
  const tag = {
    ndefMessage: [
      { payload: [] },
      { payload: payload(0x04, 'tag.to/e/evt_flytime') },
      { payload: payload(0x04, 'example.com') },
    ],
  };
  assert.equal(urlFromTag(tag), 'https://tag.to/e/evt_flytime');
});

test('a tag with nothing readable returns null', () => {
  assert.equal(urlFromTag({ ndefMessage: [] }), null);
  assert.equal(urlFromTag(null), null);
  assert.equal(urlFromTag({}), null);
});

/* ---- the point of all this ---- */

test('a tapped tag lands on exactly the same target as a scanned code', () => {
  // NFC is a second doorway into the system that already exists: the tag
  // carries the same URL, so it resolves through the same decoder.
  const tapped = urlFromTag({ ndefMessage: [{ payload: payload(0x04, 'tag.to/e/evt_flytime') }] });
  assert.deepEqual(decodeScan(tapped!), { kind: 'event', eventId: 'evt_flytime' });

  const card = urlFromTag({ ndefMessage: [{ payload: payload(0x04, 'tag.to/u/bigsho') }] });
  assert.deepEqual(decodeScan(card!), { kind: 'user', cardId: 'bigsho', eventId: undefined });
});

test('a foreign tag is ignored rather than misread as a person', () => {
  const busPass = urlFromTag({ ndefMessage: [{ payload: payload(0x04, 'transport.example/card/9') }] });
  assert.equal(decodeScan(busPass!), null);
});
