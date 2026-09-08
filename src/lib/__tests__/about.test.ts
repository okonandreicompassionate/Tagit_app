/**
 * The derived profile. Worth testing because it's the app's central claim:
 * a profile nobody can write by hand, where every number traces back to
 * having actually been somewhere.
 */
import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveAbout } from '../about.ts';
import { streakFrom } from '../swag.ts';
import type { CheckIn, LinkEvent, TaggedPerson } from '../../types.ts';

const DAY = 86_400_000;

const checkin = (
  eventId: string,
  method: CheckIn['method'],
  extra: Partial<CheckIn> = {}
): CheckIn => ({
  eventId,
  eventName: eventId,
  at: Date.now(),
  method,
  ...extra,
});

const person = (id: string, dayOffsets: number[], addedOnSnap = false): TaggedPerson => {
  const links: LinkEvent[] = dayOffsets.map((d) => ({
    at: Date.now() - d * DAY,
    direction: 'scanned',
  }));
  return {
    card: { id, name: id, socials: {}, swag: 0, createdAt: Date.now() },
    links,
    streak: streakFrom(links),
    addedOnSnap,
  };
};

test('only scanned check-ins count as attendance', () => {
  const about = deriveAbout({
    checkins: [checkin('a', 'qr'), checkin('b', 'code'), checkin('c', 'qr')],
    people: [],
  });
  assert.equal(about.verifiedEvents, 2);
  assert.equal(about.unverifiedEvents, 1);
});

test('one event attended once, however many records exist for it', () => {
  // A person who typed the code and later scanned the door is one attendee,
  // and the verified record is the one that survives.
  const about = deriveAbout({
    checkins: [checkin('a', 'code'), checkin('a', 'qr')],
    people: [],
  });
  assert.equal(about.verifiedEvents, 1);
  assert.equal(about.unverifiedEvents, 0);
});

test('an empty profile says so rather than inventing a bio', () => {
  const about = deriveAbout({ checkins: [], people: [] });
  assert.match(about.line, /No events yet/);
  assert.equal(about.badges.every((b) => !b.earned), true);
});

test('the line is built from real history', () => {
  const about = deriveAbout({
    checkins: [
      checkin('a', 'qr', { type: 'concert', city: 'Lagos' }),
      checkin('b', 'qr', { type: 'concert', city: 'Lagos' }),
      checkin('c', 'qr', { type: 'party', city: 'Abuja' }),
    ],
    people: [person('x', [0]), person('y', [0])],
  });
  assert.match(about.line, /3 nights out/);
  assert.match(about.line, /2 people met/);
  assert.match(about.line, /concerts/);
  assert.deepEqual(about.cities.sort(), ['Abuja', 'Lagos']);
  assert.equal(about.topTypes[0].type, 'concert');
});

test('badges are earned from attendance, and report progress before that', () => {
  const about = deriveAbout({
    checkins: Array.from({ length: 5 }, (_, i) => checkin(`e${i}`, 'qr', { type: 'concert' })),
    people: [],
  });
  const byKey = Object.fromEntries(about.badges.map((b) => [b.key, b]));
  assert.equal(byKey['first-night'].earned, true);
  assert.equal(byKey['regular'].earned, true);
  assert.equal(byKey['concert-head'].earned, true);
  assert.equal(byKey['everywhere'].earned, false);
  // 5 of the 15 needed.
  assert.ok(Math.abs(byKey['everywhere'].progress - 1 / 3) < 0.01);
});

test('streaks and Snap adds come through from the people list', () => {
  const about = deriveAbout({
    checkins: [checkin('a', 'qr')],
    people: [person('x', [6, 3, 0], true), person('y', [0])],
  });
  assert.equal(about.bestStreak, 3);
  assert.equal(about.liveStreaks, 1);
  assert.equal(about.addedOnSnap, 1);
  assert.equal(about.peopleMet, 2);
});
