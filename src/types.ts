export type SocialKey = 'snap' | 'ig' | 'tiktok' | 'x' | 'whatsapp';

/**
 * A person's shareable card. `snap` is the anchor — everything else is secondary.
 *
 * Note there is no bio field: the "about me" is derived from where someone has
 * actually been (see `deriveAbout` in src/lib/about.ts), never typed. A profile
 * you can write by hand is a profile you can lie on, which is exactly what Tagit
 * exists to get away from.
 */
export type Card = {
  /** Stable id used in the QR payload. Immutable once created. */
  id: string;
  name: string;
  nickname?: string;
  avatar?: string;
  /** Handles keyed by platform. `snap` is required at onboarding. */
  socials: Partial<Record<SocialKey, string>>;
  /** Snap Score, entered by the user — no API exposes it. */
  snapScore?: number;
  swag: number;
  createdAt: number;
};

/** A saved card plus the context of how you met — the part people forget. */
export type TaggedPerson = {
  card: Card;
  /** Every time you two scanned each other. Newest last. */
  links: LinkEvent[];
  streak: number;
  note?: string;
  /** Set when the user has actually opened Snapchat to add them. */
  addedOnSnap: boolean;
};

export type LinkEvent = {
  at: number;
  eventId?: string;
  eventName?: string;
  /** 'scanned' = you scanned them. 'scanned_by' = they scanned you. */
  direction: 'scanned' | 'scanned_by';
};

/* ---------- events ---------- */

export const EVENT_TYPES = [
  'concert',
  'party',
  'meetup',
  'launch',
  'popup',
  'other',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  concert: 'Concert',
  party: 'Party',
  meetup: 'Meetup',
  launch: 'Brand launch',
  popup: 'Pop-up',
  other: 'Other',
};

export type TagEvent = {
  id: string;
  name: string;
  /** Short code an organiser reads out. Optional for user-made events. */
  code?: string;
  type: EventType;
  description?: string;
  /** Free-text place name — "Hard Rock Cafe, VI". */
  location?: string;
  city?: string;
  startsAt?: number;
  endsAt?: number;
  /** Card id of whoever created it. Absent for seeded/partner events. */
  hostCardId?: string;
  hostName?: string;
  /** Private events never appear in discovery or search. */
  visibility: 'public' | 'private';
  /** Where tickets are sold — deep-linked out to the ticketing partner. */
  ticketUrl?: string;
  cover?: string;
  /** Paid placement. Higher sorts first in discovery while still live. */
  boostScore: number;
  boostedUntil?: number;
  /** Brand-paid featured slot, ranked above user boosts. */
  sponsored: boolean;
  /** Verified check-ins, denormalised for list rendering. */
  attendeeCount: number;
  createdAt: number;
  /** Set when the current user has joined this event. */
  joinedAt?: number;
};

/**
 * Proof someone was physically there.
 *
 * `qr` means they scanned the venue's code on the door — that is the verified
 * kind, and the only kind that earns an attendance badge. `code` means they
 * typed an event code, which is convenient but proves nothing, so it is
 * tracked separately rather than being quietly treated as the same thing.
 */
export type CheckIn = {
  eventId: string;
  eventName: string;
  at: number;
  method: 'qr' | 'code';
  /** Carried so badges can be derived offline, without refetching events. */
  type?: EventType;
  city?: string;
};

export type LeaderRow = {
  cardId: string;
  name: string;
  handle: string;
  avatar?: string;
  swag: number;
  tags: number;
};

/** A person as they appear in search results. */
export type UserResult = {
  cardId: string;
  name: string;
  handle: string;
  avatar?: string;
  swag: number;
  /** Public events they're hosting. */
  hostingCount: number;
};
