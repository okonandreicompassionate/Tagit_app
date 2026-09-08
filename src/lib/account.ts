import type { Card } from '../types';
import { esc, isLive, rest } from './rest';
import { currentUserId } from './auth';

/**
 * Tying a card to an account, and getting back into one.
 *
 * Three cases have to be told apart, and conflating them is what caused the
 * original lockout:
 *
 *   yours      — a card this account already owns. Sign in, get it back.
 *   claimable  — a card with no owner. Made before accounts existed, so the
 *                first person to sign in and claim it is treated as the owner.
 *   taken      — a card owned by somebody else. The only case that should ever
 *                refuse you, and previously *every* case did.
 */

type Row = {
  id: string;
  name: string;
  nickname: string | null;
  avatar: string | null;
  socials: Card['socials'];
  snap_score: number | null;
  swag: number;
  owner: string | null;
  created_at: string;
};

const SELECT = 'id,name,nickname,avatar,socials,snap_score,swag,owner,created_at';

const toCard = (r: Row): Card => ({
  id: r.id,
  name: r.name,
  nickname: r.nickname ?? undefined,
  avatar: r.avatar ?? undefined,
  socials: r.socials ?? {},
  snapScore: r.snap_score ?? undefined,
  swag: r.swag ?? 0,
  createdAt: new Date(r.created_at).getTime(),
});

/** The card this account owns, if it has one. This is "log back in". */
export async function myCard(): Promise<Card | null> {
  if (!isLive) return null;
  const uid = await currentUserId();
  if (!uid) return null;

  const rows = await rest<Row[]>(`cards?owner=eq.${esc(uid)}&select=${SELECT}&limit=1`);
  return rows[0] ? toCard(rows[0]) : null;
}

export type HandleState =
  | { state: 'free' }
  | { state: 'yours'; card: Card }
  | { state: 'claimable'; card: Card }
  | { state: 'taken' };

/**
 * What would happen if this account tried to use this handle.
 *
 * Replaces the old boolean `isHandleFree`, which returned false for a card you
 * already owned and shut you out of your own account.
 */
export async function checkHandle(handle: string): Promise<HandleState> {
  if (!isLive) return { state: 'free' };

  const id = handle.trim().toLowerCase();
  const rows = await rest<Row[]>(`cards?id=eq.${esc(id)}&select=${SELECT}&limit=1`);
  const row = rows[0];
  if (!row) return { state: 'free' };

  const uid = await currentUserId();
  if (row.owner && uid && row.owner === uid) return { state: 'yours', card: toCard(row) };
  if (row.owner) return { state: 'taken' };
  return { state: 'claimable', card: toCard(row) };
}

/**
 * Stamps this account onto a card.
 *
 * Safe to call on a card you already own. It cannot steal one: the RLS policy
 * only permits the write when the row is unowned or already yours, so a
 * `taken` card fails at the database rather than relying on this check.
 */
export async function claimCard(cardId: string): Promise<boolean> {
  if (!isLive) return true;
  const uid = await currentUserId();
  if (!uid) return false;

  try {
    await rest(`cards?id=eq.${esc(cardId)}`, {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ owner: uid }),
    });
    return true;
  } catch {
    return false;
  }
}
