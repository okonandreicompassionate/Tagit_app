import { NextResponse } from 'next/server';
import { requireGodApi } from '@/lib/auth-guard';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type ReportRow = {
  id: number;
  reporter: string | null;
  target_card: string | null;
  target_event: string | null;
  reason: string;
  detail: string | null;
  status: 'open' | 'reviewing' | 'actioned' | 'dismissed';
  created_at: string;
};

export type ModerationReport = ReportRow & {
  reporter_name: string | null;
  target_card_name: string | null;
  target_event_name: string | null;
};

/**
 * `reports` has no client-readable policy at all (see migration
 * 20260914150000_block_and_report.sql) — reading the moderation queue has
 * only ever been possible with the service-role key. This is the first
 * thing on the dashboard that actually does it.
 */
export async function GET() {
  const gate = await requireGodApi();
  if ('response' in gate) return gate.response;

  try {
    const db = supabaseAdmin();
    // Sorted client-side below, not here — Postgres would order 'status'
    // alphabetically ('actioned' before 'open'), not by urgency.
    const { data: reports, error } = await db
      .from('reports')
      .select('id,reporter,target_card,target_event,reason,detail,status,created_at')
      .order('created_at', { ascending: false })
      .returns<ReportRow[]>();

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });

    const cardIds = [
      ...new Set(
        (reports ?? []).flatMap((r) => [r.reporter, r.target_card].filter((x): x is string => Boolean(x)))
      ),
    ];
    const eventIds = [...new Set((reports ?? []).map((r) => r.target_event).filter((x): x is string => Boolean(x)))];

    const [cardsRes, eventsRes] = await Promise.all([
      cardIds.length
        ? db.from('cards').select('id,name').in('id', cardIds).returns<{ id: string; name: string }[]>()
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
      eventIds.length
        ? db.from('events').select('id,name').in('id', eventIds).returns<{ id: string; name: string }[]>()
        : Promise.resolve({ data: [] as { id: string; name: string }[], error: null }),
    ]);

    const cardNames = new Map((cardsRes.data ?? []).map((c) => [c.id, c.name]));
    const eventNames = new Map((eventsRes.data ?? []).map((e) => [e.id, e.name]));

    const order = { open: 0, reviewing: 1, actioned: 2, dismissed: 3 };
    const enriched: ModerationReport[] = (reports ?? [])
      .map((r) => ({
        ...r,
        reporter_name: r.reporter ? (cardNames.get(r.reporter) ?? r.reporter) : null,
        target_card_name: r.target_card ? (cardNames.get(r.target_card) ?? r.target_card) : null,
        target_event_name: r.target_event ? (eventNames.get(r.target_event) ?? r.target_event) : null,
      }))
      .sort((a, b) => order[a.status] - order[b.status]);

    return NextResponse.json({ reports: enriched });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
