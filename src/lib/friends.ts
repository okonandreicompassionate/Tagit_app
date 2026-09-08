import type { Card } from '../types';
import { esc, isLive, rest } from './rest';

/**
 * Friends.
 *
 * A scan already means "we were in the same room and both agreed", so a scan
 * *is* the friend request — there's no separate add flow to forget about. When
 * both people have scanned each other the database promotes it to accepted on
 * its own (see the `request_friendship` function), which is why most
 * friendships never need an accept tap at all.
 */

export type FriendStatus = 'pending' | 'accepted' | 'blocked';

export type Friend = {
  card: Card;
  status: FriendStatus;
  /** True when they scanned you and you haven't scanned them back. */
  theyAsked: boolean;
  since: number;
};

type Row = {
  card_a: string;
  card_b: string;
  status: FriendStatus;
  asked_by: string;
  created_at: string;
};

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

/**
 * Everyone linked to this card, both directions in one query.
 *
 * Pairs are stored ordered (`card_a < card_b`), so "my friends" means rows
 * where I'm on either side — hence the `or`, and the flip below to work out
 * which column is the other person.
 */
export async function listFriends(myCardId: string): Promise<Friend[]> {
  if (!isLive) return [];

  const rows = await rest<Row[]>(
    `friendships?or=(card_a.eq.${esc(myCardId)},card_b.eq.${esc(myCardId)})` +
      '&select=card_a,card_b,status,asked_by,created_at&order=created_at.desc&limit=200'
  );
  if (rows.length === 0) return [];

  const otherIds = rows.map((r) => (r.card_a === myCardId ? r.card_b : r.card_a));

  const cards = await rest<CardRow[]>(
    `cards?id=in.(${otherIds.map(esc).join(',')})` +
      '&select=id,name,nickname,avatar,socials,snap_score,swag,created_at'
  );
  const byId = new Map(cards.map((c) => [c.id, toCard(c)]));

  return rows
    .map((r) => {
      const otherId = r.card_a === myCardId ? r.card_b : r.card_a;
      const card = byId.get(otherId);
      // A friendship whose card has since been deleted is not renderable.
      if (!card) return null;
      return {
        card,
        status: r.status,
        theyAsked: r.asked_by !== myCardId,
        since: new Date(r.created_at).getTime(),
      } satisfies Friend;
    })
    .filter((f): f is Friend => f !== null);
}

/** Accepts a request someone else made by scanning you. */
export async function acceptFriend(myCardId: string, otherId: string): Promise<boolean> {
  if (!isLive) return true;
  const [lo, hi] = [myCardId, otherId].sort();
  try {
    await rest(`friendships?card_a=eq.${esc(lo)}&card_b=eq.${esc(hi)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ status: 'accepted', updated_at: new Date().toISOString() }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function removeFriend(myCardId: string, otherId: string): Promise<boolean> {
  if (!isLive) return true;
  const [lo, hi] = [myCardId, otherId].sort();
  try {
    await rest(`friendships?card_a=eq.${esc(lo)}&card_b=eq.${esc(hi)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    return true;
  } catch {
    return false;
  }
}

/** Public, aggregate-only stats — never who someone met, just how many. */
export type CardStats = {
  swag: number;
  verifiedEvents: number;
  peopleMet: number;
  lastSeen?: number;
};

export async function getCardStats(cardId: string): Promise<CardStats | null> {
  if (!isLive) return null;
  const rows = await rest<
    { swag: number; verified_events: number; people_met: number; last_seen: string | null }[]
  >(`card_stats?card_id=eq.${esc(cardId)}&select=*&limit=1`);
  const r = rows[0];
  if (!r) return null;
  return {
    swag: r.swag ?? 0,
    verifiedEvents: r.verified_events ?? 0,
    peopleMet: r.people_met ?? 0,
    lastSeen: r.last_seen ? new Date(r.last_seen).getTime() : undefined,
  };
}
