/**
 * Run with: npm test
 *
 * Covers the two bits of logic that are easy to get subtly wrong and hard to
 * notice in the UI: how a scan is priced, and how streaks count days.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeScan, encodeEvent, encodeTag } from '../payload.ts';
import {
  pointsForCheckIn,
  pointsForLink,
  streakAlive,
  streakFrom,
  tierFor,
  totalPoints,
} from '../swag.ts';
import type { LinkEvent, TaggedPerson } from '../../types.ts';

const DAY = 86_400_000;
const link = (daysAgo: number, extra: Partial<LinkEvent> = {}): LinkEvent => ({
  at: Date.now() - daysAgo * DAY,
  direction: 'scanned',
  ...extra,
});

const person = (links: LinkEvent[]): TaggedPerson => ({
  card: {
    id: 'x',
    name: 'X',
    socials: { snap: 'x' },
    swag: 0,
    createdAt: Date.now(),
  },
  links,
  streak: streakFrom(links),
  addedOnSnap: false,
});

/* ---- payload ---- */

test('a person code round-trips, event included', () => {
  assert.deepEqual(decodeScan(encodeTag('bigsho')), {
    kind: 'user',
    cardId: 'bigsho',
    eventId: undefined,
  });
  assert.deepEqual(decodeScan(encodeTag('bigsho', 'evt_1')), {
    kind: 'user',
    cardId: 'bigsho',
    eventId: 'evt_1',
  });
});

test('a door code is read as an event, not a person', () => {
  // This is the distinction the whole check-in flow rests on: /e/ must never
  // be swallowed by the bare-id fallback that matches people.
  assert.deepEqual(decodeScan(encodeEvent('evt_flytime')), {
    kind: 'event',
    eventId: 'evt_flytime',
  });
  assert.deepEqual(decodeScan('tagit://e/evt_flytime'), {
    kind: 'event',
    eventId: 'evt_flytime',
  });
});

test('accepts deep link and bare id, rejects foreign codes', () => {
  assert.deepEqual(decodeScan('tagit://u/tolu'), { kind: 'user', cardId: 'tolu', eventId: undefined });
  assert.equal(decodeScan('tagit:tolu')?.kind, 'user');
  assert.equal(decodeScan('tolu')?.kind, 'user');
  assert.equal(decodeScan('https://instagram.com/tolu'), null);
  assert.equal(decodeScan('WIFI:S=guest;P=1234;;'), null);
  assert.equal(decodeScan(''), null);
});

/* ---- streaks ---- */

test('streak counts distinct days, not raw scans', () => {
  // Three scans in one afternoon is still a streak of 1.
  assert.equal(streakFrom([link(0), link(0), link(0)]), 1);
  assert.equal(streakFrom([link(10), link(5), link(0)]), 3);
});

test('a gap past the window resets the streak', () => {
  assert.equal(streakFrom([link(90), link(60), link(1)]), 1);
  assert.equal(streakAlive([link(90)]), false);
  assert.equal(streakAlive([link(2)]), true);
});

/* ---- points ---- */

test('a first meeting is worth more than a re-tag', () => {
  const first = pointsForLink({ existing: undefined, link: link(0), eventsSeen: [] });
  const repeat = pointsForLink({ existing: person([link(0)]), link: link(0), eventsSeen: [] });
  assert.ok(totalPoints(first) > totalPoints(repeat));
  assert.deepEqual(
    first.map((a) => a.rule).sort(),
    ['newPerson', 'scannedByYou']
  );
});

test('keeping a streak alive pays, re-scanning the same day does not', () => {
  const sameDay = pointsForLink({ existing: person([link(0)]), link: link(0), eventsSeen: [] });
  const newDay = pointsForLink({ existing: person([link(3)]), link: link(0), eventsSeen: [] });
  assert.ok(!sameDay.some((a) => a.rule === 'streakKept'));
  assert.ok(newDay.some((a) => a.rule === 'streakKept'));
});

test('a second scan of the same person on the same day pays nothing at all', () => {
  // Not just the streak bonus — repeatLink, scannedByYou, firstAtEvent too.
  // Re-scanning a friend all night shouldn't be a points farm.
  const again = pointsForLink({
    existing: person([link(0)]),
    link: link(0, { direction: 'scanned', eventId: 'evt_1', eventName: 'Flytime' }),
    eventsSeen: [],
  });
  assert.deepStrictEqual(again, []);
});

test('the event bonus is once per event, not once per person', () => {
  const l = link(0, { eventId: 'evt_1', eventName: 'Flytime' });
  const firstThere = pointsForLink({ existing: undefined, link: l, eventsSeen: [] });
  const laterThere = pointsForLink({ existing: undefined, link: l, eventsSeen: ['evt_1'] });
  assert.ok(firstThere.some((a) => a.rule === 'firstAtEvent'));
  assert.ok(!laterThere.some((a) => a.rule === 'firstAtEvent'));
});

/* ---- check-ins ---- */

test('only a scanned door code earns anything', () => {
  // The premise of the whole ranking system: typing a code someone read out
  // over WhatsApp is not evidence you went.
  const scanned = pointsForCheckIn({ method: 'qr', eventId: 'e1', eventsCheckedIn: [] });
  const typed = pointsForCheckIn({ method: 'code', eventId: 'e1', eventsCheckedIn: [] });
  assert.ok(totalPoints(scanned) > 0);
  assert.equal(totalPoints(typed), 0);
});

test('a check-in pays once per event, however many times you scan the door', () => {
  const again = pointsForCheckIn({ method: 'qr', eventId: 'e1', eventsCheckedIn: ['e1'] });
  assert.equal(totalPoints(again), 0);
  const elsewhere = pointsForCheckIn({ method: 'qr', eventId: 'e2', eventsCheckedIn: ['e1'] });
  assert.ok(totalPoints(elsewhere) > 0);
});

/* ---- tiers ---- */

test('tiers step up at their thresholds', () => {
  assert.equal(tierFor(0).name, 'Fresh');
  assert.equal(tierFor(99).name, 'Fresh');
  assert.equal(tierFor(100).name, 'Regular');
  assert.equal(tierFor(1_000_000).name, 'Legend');
});
