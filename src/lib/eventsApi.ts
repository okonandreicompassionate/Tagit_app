import type { CheckIn, EventType, TagEvent, UserResult } from '../types';
import { findMockEvent, MOCK_EVENTS } from './mock';
import { esc, isLive, rest } from './rest';
import { authToken, ensureUserId } from './supabase';

/**
 * Events, check-ins, discovery and paid placement.
 *
 * Reads come from the `event_feed` view (public events only, already ranked
 * and counted); writes go straight to `events` and `checkins`, where RLS
 * decides what's allowed.
 */

type FeedRow = {
  id: string;
  name: string;
  code: string | null;
  type: EventType;
  description: string | null;
  location: string | null;
  city: string | null;
  starts_at: string | null;
  ends_at: string | null;
  host_card: string | null;
  host_name: string | null;
  visibility: 'public' | 'private';
  ticket_url: string | null;
  cover: string | null;
  artwork: string | null;
  sponsored: boolean;
  boost_score: number;
  boosted_until: string | null;
  attendee_count: number;
  created_at: string;
};

const ms = (s: string | null) => (s ? new Date(s).getTime() : undefined);

const toEvent = (r: FeedRow): TagEvent => ({
  id: r.id,
  name: r.name,
  code: r.code ?? undefined,
  type: r.type ?? 'other',
  description: r.description ?? undefined,
  location: r.location ?? undefined,
  city: r.city ?? undefined,
  startsAt: ms(r.starts_at),
  endsAt: ms(r.ends_at),
  hostCardId: r.host_card ?? undefined,
  hostName: r.host_name ?? undefined,
  visibility: r.visibility ?? 'public',
  ticketUrl: r.ticket_url ?? undefined,
  cover: r.cover ?? undefined,
  artwork: r.artwork ?? undefined,
  boostScore: r.boost_score ?? 0,
  boostedUntil: ms(r.boosted_until),
  sponsored: r.sponsored ?? false,
  attendeeCount: r.attendee_count ?? 0,
  createdAt: new Date(r.created_at).getTime(),
});

const FEED_SELECT = '*';

export type DiscoverFilters = {
  types?: EventType[];
  city?: string;
  /** Only events starting on or after this instant. Defaults to now. */
  from?: number;
  /** Only events starting before this instant. */
  until?: number;
  query?: string;
  limit?: number;
};

/**
 * The discovery feed.
 *
 * Ordering is the product decision here: brand-sponsored slots first, then
 * live user boosts by amount, then whatever starts soonest. Boosts expire on
 * their own — the view zeroes `boost_score` once `boosted_until` passes — so
 * nothing has to sweep them.
 */
export async function discoverEvents(filters: DiscoverFilters = {}): Promise<TagEvent[]> {
  const from = filters.from ?? Date.now();

  if (!isLive) {
    return MOCK_EVENTS.filter((e) => matchesLocally(e, filters, from)).sort(rankEvents);
  }

  const parts = [
    `select=${FEED_SELECT}`,
    // A missing start time shouldn't hide an event from discovery.
    `or=(starts_at.gte.${new Date(from).toISOString()},starts_at.is.null)`,
    'order=sponsored.desc,boost_score.desc,starts_at.asc',
    `limit=${filters.limit ?? 50}`,
  ];

  if (filters.types?.length) parts.push(`type=in.(${filters.types.map(esc).join(',')})`);
  if (filters.city) parts.push(`city=ilike.*${esc(filters.city)}*`);
  if (filters.until) parts.push(`starts_at=lte.${new Date(filters.until).toISOString()}`);
  if (filters.query?.trim()) {
    const q = esc(filters.query.trim());
    parts.push(`or=(name.ilike.*${q}*,location.ilike.*${q}*,city.ilike.*${q}*)`);
  }

  const rows = await rest<FeedRow[]>(`event_feed?${parts.join('&')}`);
  return rows.map(toEvent);
}

function matchesLocally(e: TagEvent, f: DiscoverFilters, from: number): boolean {
  if (e.visibility !== 'public') return false;
  if (f.types?.length && !f.types.includes(e.type)) return false;
  if (f.city && !(e.city ?? '').toLowerCase().includes(f.city.toLowerCase())) return false;
  if (e.startsAt && e.startsAt < from) return false;
  if (f.until && e.startsAt && e.startsAt > f.until) return false;
  if (f.query?.trim()) {
    const q = f.query.trim().toLowerCase();
    const hay = `${e.name} ${e.location ?? ''} ${e.city ?? ''}`.toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

/** Same ranking as the server, for the offline path. */
export const rankEvents = (a: TagEvent, b: TagEvent) => {
  const live = (e: TagEvent) => (e.boostedUntil && e.boostedUntil > Date.now() ? e.boostScore : 0);
  if (a.sponsored !== b.sponsored) return a.sponsored ? -1 : 1;
  const boost = live(b) - live(a);
  if (boost !== 0) return boost;
  return (a.startsAt ?? Infinity) - (b.startsAt ?? Infinity);
};

type FeedPageRow = FeedRow & { friends_going: number; rank_score: number };

/**
 * One page of the personalized feed — paid placement, then friends going,
 * then what the viewer actually goes to, then everything else. See
 * `discover_feed()` in supabase/migrations/20260909130000_personalized_feed.sql
 * for the exact scoring; this is the thin client wrapper around it.
 *
 * `viewerId` is required: without a signed-in card there's no history to
 * personalize from, and the caller should fall through to `discoverEvents()`
 * (paid + soonest) instead — see `app/feed.tsx`.
 */
export async function getFeedPage(args: {
  viewerId: string;
  offset: number;
  limit?: number;
}): Promise<TagEvent[]> {
  if (!isLive) {
    // No RPC in mock mode; the static rank is the closest honest equivalent
    // — no personalization signals exist without a real backend either.
    const sorted = [...MOCK_EVENTS].filter((e) => e.visibility === 'public').sort(rankEvents);
    return sorted.slice(args.offset, args.offset + (args.limit ?? 20));
  }

  const rows = await rest<FeedPageRow[]>('rpc/discover_feed', {
    method: 'POST',
    body: JSON.stringify({
      p_viewer: args.viewerId,
      p_offset: args.offset,
      p_limit: args.limit ?? 20,
    }),
  });

  return rows.map((r) => ({ ...toEvent(r), friendsGoing: r.friends_going }));
}

/**
 * Light diversity pass over one already-ranked page: if the same host lands
 * back to back, swap the second one forward a slot. Pure presentation — it
 * never changes what's *in* the page, only the order within it, so it can't
 * fight the SQL ranking, only smooth it.
 */
export function diversify(events: TagEvent[]): TagEvent[] {
  const out = [...events];
  for (let i = 1; i < out.length; i++) {
    if (out[i].hostCardId && out[i].hostCardId === out[i - 1].hostCardId) {
      const swapWith = out.findIndex((e, j) => j > i && e.hostCardId !== out[i - 1].hostCardId);
      if (swapWith !== -1) [out[i], out[swapWith]] = [out[swapWith], out[i]];
    }
  }
  return out;
}

/**
 * One event by id. Falls back to the `events` table when the feed has nothing,
 * which is how a private event opened from an invite link resolves — it is
 * absent from the public feed by design.
 */
export async function getEvent(eventId: string): Promise<TagEvent | null> {
  if (!isLive) return MOCK_EVENTS.find((e) => e.id === eventId) ?? null;

  const feed = await rest<FeedRow[]>(
    `event_feed?id=eq.${esc(eventId)}&select=${FEED_SELECT}&limit=1`
  );
  if (feed[0]) return toEvent(feed[0]);

  const raw = await rest<FeedRow[]>(`events?id=eq.${esc(eventId)}&select=*&limit=1`);
  return raw[0] ? toEvent({ ...raw[0], host_name: null, attendee_count: 0 }) : null;
}

export async function findEventByCode(code: string): Promise<TagEvent | null> {
  if (!isLive) return findMockEvent(code);
  const rows = await rest<FeedRow[]>(
    `events?code=eq.${esc(code.trim().toUpperCase())}&select=*&limit=1`
  );
  return rows[0] ? toEvent({ ...rows[0], host_name: null, attendee_count: 0 }) : null;
}

export type NewEvent = {
  name: string;
  type: EventType;
  description?: string;
  location?: string;
  city?: string;
  startsAt?: number;
  endsAt?: number;
  ticketUrl?: string;
  visibility: 'public' | 'private';
};

/** Creates a user event. The host card must be the caller's own. */
export async function createEvent(input: NewEvent, hostCardId: string): Promise<TagEvent> {
  const local: TagEvent = {
    id: `evt_local_${Date.now().toString(36)}`,
    ...input,
    hostCardId,
    boostScore: 0,
    sponsored: false,
    attendeeCount: 0,
    createdAt: Date.now(),
  };
  if (!isLive) return local;

  // Make sure the card exists server-side before it's referenced as host.
  await ensureUserId();

  const rows = await rest<FeedRow[]>('events', {
    method: 'POST',
    body: JSON.stringify({
      name: input.name.trim(),
      type: input.type,
      description: input.description?.trim() || null,
      location: input.location?.trim() || null,
      city: input.city?.trim() || null,
      starts_at: input.startsAt ? new Date(input.startsAt).toISOString() : null,
      ends_at: input.endsAt ? new Date(input.endsAt).toISOString() : null,
      ticket_url: input.ticketUrl?.trim() || null,
      visibility: input.visibility,
      host_card: hostCardId,
    }),
  });
  return rows[0] ? toEvent({ ...rows[0], host_name: null, attendee_count: 0 }) : local;
}

export async function myHostedEvents(hostCardId: string): Promise<TagEvent[]> {
  if (!isLive) return [];
  const rows = await rest<FeedRow[]>(
    `events?host_card=eq.${esc(hostCardId)}&select=*&order=created_at.desc&limit=50`
  );
  return rows.map((r) => toEvent({ ...r, host_name: null, attendee_count: 0 }));
}

export async function deleteEvent(eventId: string): Promise<void> {
  if (!isLive) return;
  await rest(`events?id=eq.${esc(eventId)}`, {
    method: 'DELETE',
    headers: { Prefer: 'return=minimal' },
  });
}

/**
 * Records attendance.
 *
 * Upserts on (card, event) so a person who typed the code earlier and then
 * scans the door gets *upgraded* to verified rather than gaining a second
 * row — which would otherwise double-count them in every attendance number.
 */
export async function recordCheckIn(args: {
  cardId: string;
  eventId: string;
  method: CheckIn['method'];
}): Promise<void> {
  if (!isLive) return;
  try {
    await rest('checkins?on_conflict=card_id,event_id', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=merge-duplicates' },
      body: JSON.stringify({
        card_id: args.cardId,
        event_id: args.eventId,
        method: args.method,
      }),
    });
  } catch (err) {
    if (__DEV__) console.warn('[eventsApi] recordCheckIn failed, kept locally:', err);
  }
}

/* ---------- search ---------- */

export async function searchUsers(query: string): Promise<UserResult[]> {
  const q = query.trim();
  if (!q || !isLive) return [];

  type Row = {
    id: string;
    name: string;
    nickname: string | null;
    avatar: string | null;
    socials: Record<string, string>;
    swag: number;
  };

  const rows = await rest<Row[]>(
    `cards?or=(id.ilike.*${esc(q)}*,name.ilike.*${esc(q)}*,nickname.ilike.*${esc(q)}*)` +
      '&select=id,name,nickname,avatar,socials,swag&order=swag.desc&limit=30'
  );

  return rows.map((r) => ({
    cardId: r.id,
    name: r.nickname || r.name,
    handle: r.socials?.snap ?? r.id,
    avatar: r.avatar ?? undefined,
    swag: r.swag ?? 0,
    hostingCount: 0,
  }));
}

/* ---------- paid placement ---------- */

/* ---------- artwork ---------- */

/**
 * Uploads an event poster and returns its public URL.
 *
 * React Native has no File, so the image goes up as an ArrayBuffer read from
 * the local file URI — FormData with a file object silently uploads zero bytes
 * on Android, which is a genuinely hard bug to spot because the request
 * succeeds.
 */
export async function uploadArtwork(eventId: string, localUri: string): Promise<string | null> {
  if (!isLive) return localUri;

  const base = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
  const token = await authToken();
  if (!base || !token) return null;

  try {
    const res = await fetch(localUri);
    const bytes = await res.arrayBuffer();

    const ext = (localUri.split('.').pop() ?? 'jpg').toLowerCase().slice(0, 4);
    const type = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    const path = `${eventId}/${Date.now()}.${ext}`;

    const upload = await fetch(`${base}/storage/v1/object/artwork/${path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': type,
        'x-upsert': 'true',
      },
      body: bytes,
    });
    if (!upload.ok) throw new Error(await upload.text().catch(() => 'upload failed'));

    const publicUrl = `${base}/storage/v1/object/public/artwork/${path}`;
    await rest(`events?id=eq.${esc(eventId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ artwork: publicUrl }),
    });
    return publicUrl;
  } catch (err) {
    if (__DEV__) console.warn('[eventsApi] artwork upload failed:', err);
    return null;
  }
}

/* ---------- private guest lists ---------- */

/** Invites friends to a private event. Only the host may write these. */
export async function inviteToEvent(
  eventId: string,
  cardIds: string[],
  invitedBy: string
): Promise<void> {
  if (!isLive || cardIds.length === 0) return;
  await rest('event_invites?on_conflict=event_id,card_id', {
    method: 'POST',
    headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
    body: JSON.stringify(
      cardIds.map((card_id) => ({ event_id: eventId, card_id, invited_by: invitedBy }))
    ),
  });
}

export type BoostQuote = {
  days: number;
  amountKobo: number;
  score: number;
};

/**
 * Boost pricing. Flat and legible on purpose — self-serve means nobody is
 * around to explain a rate card, so it has to be obvious at a glance.
 * Kobo because Paystack charges in the smallest unit.
 */
export const BOOST_TIERS: BoostQuote[] = [
  { days: 1, amountKobo: 100_000, score: 100 },
  { days: 3, amountKobo: 250_000, score: 250 },
  { days: 7, amountKobo: 500_000, score: 500 },
];

export const formatNaira = (kobo: number) =>
  `₦${(kobo / 100).toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
