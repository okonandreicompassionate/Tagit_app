import type { LinkEvent, TaggedPerson } from '../types';

/** Points are awarded once per rule per link — see `pointsForLink`. */
export const POINTS = {
  newPerson: 10,
  scannedByYou: 5,
  repeatLink: 3,
  streakKept: 15,
  firstAtEvent: 25,
  /** Scanning the door code. Only the verified kind pays. */
  checkIn: 20,
} as const;

export const TIERS = [
  { name: 'Fresh', min: 0, color: '#8A8A96' },
  { name: 'Regular', min: 100, color: '#4DA3FF' },
  { name: 'Connector', min: 300, color: '#2BD97C' },
  { name: 'Plug', min: 750, color: '#FFFC00' },
  { name: 'Icon', min: 1500, color: '#FF6B2C' },
  { name: 'Legend', min: 3000, color: '#E1306C' },
] as const;

export type Tier = (typeof TIERS)[number];

export function tierFor(swag: number): Tier {
  let current: Tier = TIERS[0];
  for (const t of TIERS) if (swag >= t.min) current = t;
  return current;
}

export function nextTier(swag: number): Tier | null {
  return TIERS.find((t) => t.min > swag) ?? null;
}

/** 0..1 progress toward the next tier. Returns 1 at the top tier. */
export function tierProgress(swag: number): number {
  const cur = tierFor(swag);
  const next = nextTier(swag);
  if (!next) return 1;
  return (swag - cur.min) / (next.min - cur.min);
}

const DAY = 86_400_000;
/** A streak survives this long without a new link. Mirrors Snap's own grace window. */
export const STREAK_WINDOW_DAYS = 30;

const dayOf = (ts: number) => Math.floor(ts / DAY);

/**
 * Streaks count *distinct days* you linked with the same person, not raw scans —
 * so re-scanning someone twice at one event doesn't inflate it.
 * A gap longer than STREAK_WINDOW_DAYS resets the count.
 */
export function streakFrom(links: LinkEvent[]): number {
  if (links.length === 0) return 0;
  const days = [...new Set(links.map((l) => dayOf(l.at)))].sort((a, b) => a - b);
  let streak = 1;
  for (let i = 1; i < days.length; i++) {
    streak = days[i] - days[i - 1] <= STREAK_WINDOW_DAYS ? streak + 1 : 1;
  }
  return streak;
}

/** True while the streak is still alive today — drives the flame icon. */
export function streakAlive(links: LinkEvent[], now = Date.now()): boolean {
  if (links.length === 0) return false;
  const last = Math.max(...links.map((l) => l.at));
  return dayOf(now) - dayOf(last) <= STREAK_WINDOW_DAYS;
}

/** Days left before a streak lapses. Null when there's no streak to lose. */
export function streakExpiresIn(links: LinkEvent[], now = Date.now()): number | null {
  if (links.length === 0) return null;
  const last = Math.max(...links.map((l) => l.at));
  const left = STREAK_WINDOW_DAYS - (dayOf(now) - dayOf(last));
  return left > 0 ? left : null;
}

export type Award = { rule: keyof typeof POINTS; points: number; label: string };

/**
 * Works out what a single new link is worth.
 * `existing` is the person's record *before* this link, so a first meeting
 * and a re-tag price differently.
 */
export function pointsForLink(args: {
  existing?: TaggedPerson;
  link: LinkEvent;
  /** Event ids the user has already tagged someone at. */
  eventsSeen: string[];
}): Award[] {
  const { existing, link, eventsSeen } = args;
  const awards: Award[] = [];

  if (!existing) {
    awards.push({ rule: 'newPerson', points: POINTS.newPerson, label: 'New link' });
  } else {
    awards.push({ rule: 'repeatLink', points: POINTS.repeatLink, label: 'Ran into them again' });
    const before = streakFrom(existing.links);
    const after = streakFrom([...existing.links, link]);
    if (after > before) {
      awards.push({ rule: 'streakKept', points: POINTS.streakKept, label: `${after}-day streak` });
    }
  }

  if (link.direction === 'scanned') {
    awards.push({ rule: 'scannedByYou', points: POINTS.scannedByYou, label: 'You scanned' });
  }

  if (link.eventId && !eventsSeen.includes(link.eventId)) {
    awards.push({
      rule: 'firstAtEvent',
      points: POINTS.firstAtEvent,
      label: `First tag at ${link.eventName ?? 'this event'}`,
    });
  }

  return awards;
}

/**
 * What a check-in is worth.
 *
 * Two rules keep this honest, and they're the whole reason rank means
 * anything here:
 *  - Only `qr` pays. Typing an event code you were told over WhatsApp is not
 *    evidence you went, so it earns nothing.
 *  - Once per event, ever. Re-scanning the door on your way back from the bar
 *    isn't a second night out.
 */
export function pointsForCheckIn(args: {
  method: 'qr' | 'code';
  eventId: string;
  /** Event ids the user has already checked into. */
  eventsCheckedIn: string[];
}): Award[] {
  if (args.method !== 'qr') return [];
  if (args.eventsCheckedIn.includes(args.eventId)) return [];
  return [{ rule: 'checkIn', points: POINTS.checkIn, label: 'Checked in' }];
}

export const totalPoints = (awards: Award[]) => awards.reduce((sum, a) => sum + a.points, 0);
