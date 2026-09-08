import type { CheckIn, EventType, TaggedPerson } from '../types';
import { streakAlive } from './swag';

/**
 * How each event type reads inside a sentence. Kept here rather than pulled
 * from the UI's label map: this module produces prose, and display labels are
 * a screen's business — importing them would also make this file depend on a
 * value from the types module, which it otherwise doesn't.
 */
const PLURAL: Record<EventType, string> = {
  concert: 'concerts',
  party: 'parties',
  meetup: 'meetups',
  launch: 'launches',
  popup: 'pop-ups',
  other: 'events',
};

/**
 * The profile, derived rather than typed.
 *
 * Nobody writes a bio in Tagit. Everything on a profile is computed from
 * verified check-ins and real scans, so it can't be inflated — which is the
 * entire premise: rank should reflect an actual social life, not a bio and a
 * follower count.
 *
 * Only `method: 'qr'` check-ins count as verified. A typed event code is
 * convenient but proves nothing, so it's kept out of the numbers that matter.
 */

export type Badge = {
  key: string;
  label: string;
  hint: string;
  earned: boolean;
  /** 0..1 toward earning it, for the ones worth showing progress on. */
  progress: number;
};

export type About = {
  /** One generated line, in place of a bio. */
  line: string;
  verifiedEvents: number;
  unverifiedEvents: number;
  peopleMet: number;
  addedOnSnap: number;
  bestStreak: number;
  liveStreaks: number;
  cities: string[];
  /** Event types attended, most frequent first. */
  topTypes: { type: EventType; count: number }[];
  /** The most recent verified night out. */
  lastSeen?: { name: string; at: number };
  badges: Badge[];
};

const verified = (c: CheckIn) => c.method === 'qr';

export function deriveAbout(args: {
  checkins: CheckIn[];
  people: TaggedPerson[];
}): About {
  const { checkins, people } = args;

  // One event attended once, however many times its code was scanned.
  const byEvent = new Map<string, CheckIn>();
  for (const c of checkins) {
    const existing = byEvent.get(c.eventId);
    // Prefer the verified record if the same event was both typed and scanned.
    if (!existing || (verified(c) && !verified(existing))) byEvent.set(c.eventId, c);
  }
  const unique = [...byEvent.values()];
  const verifiedList = unique.filter(verified);

  const typeCounts = new Map<EventType, number>();
  for (const c of verifiedList) {
    if (c.type) typeCounts.set(c.type, (typeCounts.get(c.type) ?? 0) + 1);
  }
  const topTypes = [...typeCounts.entries()]
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);

  const cities = [
    ...new Set(verifiedList.map((c) => c.city).filter((c): c is string => Boolean(c))),
  ];

  const bestStreak = people.reduce((n, p) => Math.max(n, p.streak), 0);
  const liveStreaks = people.filter((p) => p.streak >= 2 && streakAlive(p.links)).length;
  const peopleMet = people.length;
  const addedOnSnap = people.filter((p) => p.addedOnSnap).length;

  const latest = verifiedList.reduce<CheckIn | undefined>(
    (best, c) => (!best || c.at > best.at ? c : best),
    undefined
  );

  return {
    line: buildLine({ verified: verifiedList.length, peopleMet, topTypes, cities, bestStreak }),
    verifiedEvents: verifiedList.length,
    unverifiedEvents: unique.length - verifiedList.length,
    peopleMet,
    addedOnSnap,
    bestStreak,
    liveStreaks,
    cities,
    topTypes,
    lastSeen: latest ? { name: latest.eventName, at: latest.at } : undefined,
    badges: deriveBadges({ verified: verifiedList.length, peopleMet, bestStreak, typeCounts, cities }),
  };
}

/**
 * The generated bio line. Deliberately factual — it reads as a record, not a
 * boast, and it says nothing when there's nothing true to say yet.
 */
function buildLine(a: {
  verified: number;
  peopleMet: number;
  topTypes: { type: EventType; count: number }[];
  cities: string[];
  bestStreak: number;
}): string {
  if (a.verified === 0) {
    return a.peopleMet > 0
      ? `${a.peopleMet} ${plural(a.peopleMet, 'link')} so far. Scan a door code to start a record.`
      : 'No events yet. Scan a door code and this fills itself in.';
  }

  const parts: string[] = [];
  parts.push(`${a.verified} ${plural(a.verified, 'night')} out`);
  if (a.peopleMet > 0) parts.push(`${a.peopleMet} ${plural(a.peopleMet, 'person', 'people')} met`);

  const top = a.topTypes[0];
  if (top && top.count > 1) parts.push(`mostly ${PLURAL[top.type]}`);
  if (a.cities.length === 1) parts.push(a.cities[0]);
  else if (a.cities.length > 1) parts.push(`${a.cities.length} cities`);
  if (a.bestStreak >= 3) parts.push(`${a.bestStreak}-deep streak`);

  return parts.join(' · ');
}

function deriveBadges(a: {
  verified: number;
  peopleMet: number;
  bestStreak: number;
  typeCounts: Map<EventType, number>;
  cities: string[];
}): Badge[] {
  const at = (n: number, need: number) => ({
    earned: n >= need,
    progress: Math.max(0, Math.min(1, n / need)),
  });

  const concerts = a.typeCounts.get('concert') ?? 0;

  return [
    {
      key: 'first-night',
      label: 'First night',
      hint: 'Check in at one event',
      ...at(a.verified, 1),
    },
    {
      key: 'regular',
      label: 'Regular',
      hint: 'Check in at 5 events',
      ...at(a.verified, 5),
    },
    {
      key: 'everywhere',
      label: 'Everywhere',
      hint: 'Check in at 15 events',
      ...at(a.verified, 15),
    },
    {
      key: 'concert-head',
      label: 'Concert head',
      hint: '5 concerts',
      ...at(concerts, 5),
    },
    {
      key: 'connector',
      label: 'Connector',
      hint: 'Meet 25 people in person',
      ...at(a.peopleMet, 25),
    },
    {
      key: 'known-face',
      label: 'Known face',
      hint: 'Run into the same person 5 times',
      ...at(a.bestStreak, 5),
    },
    {
      key: 'out-of-town',
      label: 'Out of town',
      hint: 'Check in in 3 cities',
      ...at(a.cities.length, 3),
    },
  ];
}

const plural = (n: number, one: string, many?: string) =>
  n === 1 ? one : (many ?? `${one}s`);
