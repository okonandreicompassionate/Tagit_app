import type { Card, LeaderRow, LinkEvent } from '../types';
import { findMockCard, MOCK_LEADERBOARD } from './mock';
import { esc, isLive, rest } from './rest';
import { ensureUserId } from './supabase';

export { isLive } from './rest';

/** Row shape in Postgres — snake_case, unlike the app's camelCase `Card`. */
type CardRow = {
  id: string;
  name: string;
  nickname: string | null;
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
  avatar: r.avatar ?? undefined,
  socials: r.socials ?? {},
  snapScore: r.snap_score ?? undefined,
  swag: r.swag ?? 0,
  createdAt: new Date(r.created_at).getTime(),
});

// `swag` is deliberately absent: it's server-owned, derived by triggers from
// the link and check-in ledgers, and the column is revoked from the client
// role — sending it would be rejected outright.
const fromCard = (c: Card) => ({
  id: c.id,
  name: c.name,
  nickname: c.nickname ?? null,
  avatar: c.avatar ?? null,
  socials: c.socials,
  snap_score: c.snapScore ?? null,
});

const SELECT = 'id,name,nickname,avatar,socials,snap_score,swag,created_at';

/** The one endpoint everything hangs off: GET /u/:id. */
export async function getCard(cardId: string): Promise<Card | null> {
  if (!isLive) return findMockCard(cardId);
  const rows = await rest<CardRow[]>(`cards?id=eq.${esc(cardId)}&select=${SELECT}&limit=1`);
  return rows[0] ? toCard(rows[0]) : null;
}

/** Batch of `getCard`, for hydrating a whole Tagged list in one request. */
export async function getCards(ids: string[]): Promise<Card[]> {
  if (!ids.length) return [];
  if (!isLive) {
    return ids.map((id) => findMockCard(id)).filter((c): c is Card => Boolean(c));
  }
  const rows = await rest<CardRow[]>(
    `cards?id=in.(${ids.map(esc).join(',')})&select=${SELECT}`
  );
  return rows.map(toCard);
}

type LinkRow = {
  to_card: string;
  event_id: string | null;
  direction: 'scanned' | 'scanned_by';
  created_at: string;
};

/**
 * Every person this card has ever met, straight from the ledger — not just
 * whichever of them happened to arrive over Realtime while a phone was open
 * and connected. `mirror_link()` guarantees a `from_card = cardId` row
 * exists on both sides of a scan, whoever initiated it, so this one query
 * is the complete list either way.
 */
export async function myLinks(cardId: string): Promise<LinkRow[]> {
  if (!isLive) return [];
  return rest<LinkRow[]>(
    `links?select=to_card,event_id,direction,created_at&from_card=eq.${esc(cardId)}&order=created_at.asc`
  );
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
  const rows = await rest<{ id: string }[]>(`cards?id=eq.${esc(cardId)}&select=id&limit=1`);
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
    ? `event_leaderboard?event_id=eq.${esc(eventId)}&`
    : 'leaderboard?';
  return rest<LeaderRow[]>(`${path}order=swag.desc&limit=100`);
}
