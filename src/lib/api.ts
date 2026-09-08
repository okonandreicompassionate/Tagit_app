import type { Card, LeaderRow, LinkEvent, TagEvent } from '../types';
import { findMockCard, findMockEvent, MOCK_LEADERBOARD } from './mock';
import { authToken, ensureUserId } from './supabase';

/**
 * One thin layer over the backend, talked to with plain `fetch` against
 * Supabase's PostgREST endpoint — no SDK, so the exact same calls work from a
 * web card, a partner app, or curl. That's the API you can sell later.
 *
 * With no env vars set, everything falls through to the local mock directory,
 * so the app runs end-to-end before a backend exists.
 */
// Expo inlines EXPO_PUBLIC_* at build time, but only via static dot access —
// destructuring or bracket notation silently doesn't get replaced.
// Either key name works: Supabase renamed the legacy "anon" JWT to
// "publishable" (sb_publishable_…), and both authenticate the same way here.
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isLive = Boolean(URL && KEY);

class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'ApiError';
  }
}

async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isLive) throw new ApiError('No backend configured');

  // `apikey` identifies the project; the bearer carries the user's session when
  // there is one, which is what populates auth.uid() for the RLS policies.
  // Without a session it falls back to the publishable key and acts as `anon`.
  const token = await authToken();

  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${token ?? KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  });

  if (!res.ok) {
    throw new ApiError(await res.text().catch(() => res.statusText), res.status);
  }
  return (await res.json()) as T;
}

/** Row shape in Postgres — snake_case, unlike the app's camelCase `Card`. */
type CardRow = {
  id: string;
  name: string;
  nickname: string | null;
  bio: string | null;
  avatar: string | null;
  socials: Card['socials'];
  snap_score: number | null;
  swag: number;
  created_at: string;
};

const toCard = (r: CardRow): Card => ({
  id: r.id,
  name: r.name,
  nickname: r.nickname ?? undefined,
  bio: r.bio ?? undefined,
  avatar: r.avatar ?? undefined,
  socials: r.socials ?? {},
  snapScore: r.snap_score ?? undefined,
  swag: r.swag ?? 0,
  createdAt: new Date(r.created_at).getTime(),
});

// `swag` is deliberately absent: it's server-owned, derived by a trigger from
// the link ledger, and the column is revoked from the client role — sending it
// would be rejected outright.
const fromCard = (c: Card) => ({
  id: c.id,
  name: c.name,
  nickname: c.nickname ?? null,
  bio: c.bio ?? null,
  avatar: c.avatar ?? null,
  socials: c.socials,
  snap_score: c.snapScore ?? null,
});

/** The one endpoint everything hangs off: GET /u/:id. */
export async function getCard(cardId: string): Promise<Card | null> {
  if (!isLive) return findMockCard(cardId);
  const rows = await rest<CardRow[]>(`cards?id=eq.${encodeURIComponent(cardId)}&select=*&limit=1`);
  return rows[0] ? toCard(rows[0]) : null;
}

export async function saveCard(card: Card): Promise<Card> {
  if (!isLive) return card;

  // Claim the card for this install. Once `owner` is set, the RLS policies
  // stop anyone else editing it. When anonymous auth isn't enabled this is
  // undefined, the column stays null, and the card remains unclaimed —
  // which is the pre-auth behaviour, not a failure.
  const owner = await ensureUserId();

  const rows = await rest<CardRow[]>('cards?on_conflict=id', {
    method: 'POST',
    headers: { Prefer: 'return=representation,resolution=merge-duplicates' },
    body: JSON.stringify({ ...fromCard(card), ...(owner ? { owner } : {}) }),
  });
  return rows[0] ? toCard(rows[0]) : card;
}

/** Whether an id is free. Used by onboarding before we mint someone's code. */
export async function isHandleFree(cardId: string): Promise<boolean> {
  if (!isLive) return !findMockCard(cardId);
  const rows = await rest<{ id: string }[]>(
    `cards?id=eq.${encodeURIComponent(cardId)}&select=id&limit=1`
  );
  return rows.length === 0;
}

/**
 * Logs a scan so both sides get credit and the leaderboard is real.
 * Fire-and-forget on purpose — a failed write must never block the UI, since
 * the local store is already the source of truth for the user's own list.
 */
export async function recordLink(args: {
  fromCardId: string;
  toCardId: string;
  link: LinkEvent;
  points: number;
}): Promise<void> {
  if (!isLive) return;
  try {
    await rest('links', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        from_card: args.fromCardId,
        to_card: args.toCardId,
        event_id: args.link.eventId ?? null,
        direction: args.link.direction,
        points: args.points,
        created_at: new Date(args.link.at).toISOString(),
      }),
    });
  } catch (err) {
    if (__DEV__) console.warn('[api] recordLink failed, kept locally:', err);
  }
}

/**
 * Two views rather than one: the global board is a single row per card, while
 * the event board scores only the points earned at that event. Filtering one
 * combined view by event_id duplicated anyone who'd tagged at several.
 */
export async function getLeaderboard(eventId?: string): Promise<LeaderRow[]> {
  if (!isLive) return MOCK_LEADERBOARD;
  const path = eventId
    ? `event_leaderboard?event_id=eq.${encodeURIComponent(eventId)}&`
    : 'leaderboard?';
  return rest<LeaderRow[]>(`${path}order=swag.desc&limit=100`);
}

export async function joinEventByCode(code: string): Promise<TagEvent | null> {
  if (!isLive) return findMockEvent(code);
  const rows = await rest<{ id: string; name: string; code: string }[]>(
    `events?code=eq.${encodeURIComponent(code.trim().toUpperCase())}&select=id,name,code&limit=1`
  );
  return rows[0] ? { ...rows[0], joinedAt: Date.now() } : null;
}
