import { esc, isLive, rest } from './rest';
import type { Card } from '../types';

/**
 * Blocking and reporting.
 *
 * Required rather than optional: Snap's developer policies expect safeguards
 * against harassment and a route for abuse reports. For an app where
 * strangers scan each other in person, they'd be the right thing to build
 * regardless.
 *
 * Enforcement lives in the database — a blocked pair cannot create a link
 * even if a modified client tries — so these functions are the interface to
 * a rule, not the rule itself. See supabase/migrations/20260914150000_block_and_report.sql.
 */

export const REPORT_REASONS = [
  { key: 'harassment', label: 'Harassment or bullying' },
  { key: 'impersonation', label: 'Pretending to be someone else' },
  { key: 'underage', label: 'Seems under 13' },
  { key: 'inappropriate', label: 'Inappropriate photo or name' },
  { key: 'spam', label: 'Spam or scam' },
  { key: 'safety', label: 'Made me feel unsafe' },
  { key: 'other', label: 'Something else' },
] as const;

export type ReportReason = (typeof REPORT_REASONS)[number]['key'];

export async function blockCard(myCardId: string, targetId: string): Promise<boolean> {
  if (!isLive) return true;
  try {
    await rest('blocks?on_conflict=blocker,blocked', {
      method: 'POST',
      headers: { Prefer: 'return=minimal,resolution=ignore-duplicates' },
      body: JSON.stringify({ blocker: myCardId, blocked: targetId }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function unblockCard(myCardId: string, targetId: string): Promise<boolean> {
  if (!isLive) return true;
  try {
    await rest(`blocks?blocker=eq.${esc(myCardId)}&blocked=eq.${esc(targetId)}`, {
      method: 'DELETE',
      headers: { Prefer: 'return=minimal' },
    });
    return true;
  } catch {
    return false;
  }
}

export type BlockedPerson = { card: Card; since: number };

/** The people you've blocked, for the safety screen. */
export async function listBlocked(myCardId: string): Promise<BlockedPerson[]> {
  if (!isLive) return [];

  const rows = await rest<{ blocked: string; created_at: string }[]>(
    `blocks?blocker=eq.${esc(myCardId)}&select=blocked,created_at&order=created_at.desc`
  );
  if (rows.length === 0) return [];

  const cards = await rest<
    {
      id: string;
      name: string;
      nickname: string | null;
      avatar: string | null;
      socials: Card['socials'];
      swag: number;
      created_at: string;
    }[]
  >(
    `cards?id=in.(${rows.map((r) => esc(r.blocked)).join(',')})` +
      '&select=id,name,nickname,avatar,socials,swag,created_at'
  );

  const byId = new Map(cards.map((c) => [c.id, c]));

  return rows
    .map((r): BlockedPerson | null => {
      const c = byId.get(r.blocked);
      if (!c) return null;
      return {
        card: {
          id: c.id,
          name: c.name,
          nickname: c.nickname ?? undefined,
          avatar: c.avatar ?? undefined,
          socials: c.socials ?? {},
          swag: c.swag ?? 0,
          createdAt: new Date(c.created_at).getTime(),
        },
        since: new Date(r.created_at).getTime(),
      };
    })
    .filter((b): b is BlockedPerson => b !== null);
}

export async function reportCard(args: {
  reporterId: string | null;
  targetCardId?: string;
  targetEventId?: string;
  reason: ReportReason;
  detail?: string;
}): Promise<boolean> {
  if (!isLive) return true;
  if (!args.targetCardId && !args.targetEventId) return false;

  try {
    await rest('reports', {
      method: 'POST',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({
        reporter: args.reporterId,
        target_card: args.targetCardId ?? null,
        target_event: args.targetEventId ?? null,
        reason: args.reason,
        detail: args.detail?.trim().slice(0, 1000) || null,
      }),
    });
    return true;
  } catch {
    return false;
  }
}
