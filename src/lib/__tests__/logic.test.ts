/**
 * Run with: npm test
 *
 * Covers the two bits of logic that are easy to get subtly wrong and hard to
 * notice in the UI: how a scan is priced, and how streaks count days.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeTag, encodeTag } from '../payload.ts';
import { pointsForLink, streakAlive, streakFrom, tierFor, totalPoints } from '../swag.ts';
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

test('QR payload round-trips, event included', () => {
  assert.deepEqual(decodeTag(encodeTag('bigsho')), { cardId: 'bigsho', eventId: undefined });
  assert.deepEqual(decodeTag(encodeTag('bigsho', 'evt_1')), {
    cardId: 'bigsho',
    eventId: 'evt_1',
  });
});

test('accepts deep link and bare id, rejects foreign codes', () => {
  assert.equal(decodeTag('tag://u/tolu')?.cardId, 'tolu');
  assert.equal(decodeTag('tag:tolu')?.cardId, 'tolu');
  assert.equal(decodeTag('tolu')?.cardId, 'tolu');
  assert.equal(decodeTag('https://instagram.com/tolu'), null);
  assert.equal(decodeTag('WIFI:S=guest;P=1234;;'), null);
  assert.equal(decodeTag(''), null);
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

test('the event bonus is once per event, not once per person', () => {
  const l = link(0, { eventId: 'evt_1', eventName: 'Flytime' });
  const firstThere = pointsForLink({ existing: undefined, link: l, eventsSeen: [] });
  const laterThere = pointsForLink({ existing: undefined, link: l, eventsSeen: ['evt_1'] });
  assert.ok(firstThere.some((a) => a.rule === 'firstAtEvent'));
  assert.ok(!laterThere.some((a) => a.rule === 'firstAtEvent'));
});

/* ---- tiers ---- */

test('tiers step up at their thresholds', () => {
  assert.equal(tierFor(0).name, 'Fresh');
  assert.equal(tierFor(99).name, 'Fresh');
  assert.equal(tierFor(100).name, 'Regular');
  assert.equal(tierFor(1_000_000).name, 'Legend');
});
