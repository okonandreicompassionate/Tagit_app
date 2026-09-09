import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type LinkRow = {
  id: number;
  from_card: string;
  to_card: string;
  direction: 'scanned' | 'scanned_by';
  points: number;
  created_at: string;
};
type CheckinRow = { id: number; card_id: string; event_id: string; method: 'qr' | 'code'; created_at: string };

export type ActivityEvent = {
  key: string;
  kind: 'scan' | 'checkin';
  at: string;
  who: string;
  detail: string;
};

/**
 * The last ~60 things that actually happened, across every account — the
 * one view this project has been missing all night. Debugging "why didn't X
 * show up" has meant a fresh curl every time; this is that curl, kept warm.
 * Only 'scanned' links, not their 'scanned_by' mirrors — each real scan
 * already appears once from the scanner's side, showing both would double
 * every row.
 */
export async function GET() {
  try {
    const db = supabaseAdmin();

    const [links, checkins] = await Promise.all([
      db
        .from('links')
        .select('id,from_card,to_card,direction,points,created_at')
        .eq('direction', 'scanned')
        .order('created_at', { ascending: false })
        .limit(30)
        .returns<LinkRow[]>(),
      db
        .from('checkins')
        .select('id,card_id,event_id,method,created_at')
        .order('created_at', { ascending: false })
        .limit(30)
        .returns<CheckinRow[]>(),
    ]);

    const firstError = [links, checkins].find((r) => r.error);
    if (firstError?.error) return NextResponse.json({ error: firstError.error.message }, { status: 502 });

    const ids = new Set<string>();
    for (const l of links.data ?? []) {
      ids.add(l.from_card);
      ids.add(l.to_card);
    }
    for (const c of checkins.data ?? []) ids.add(c.card_id);

    const eventIds = new Set((checkins.data ?? []).map((c) => c.event_id));

    const [{ data: cards }, { data: events }] = await Promise.all([
      ids.size
        ? db.from('cards').select('id,name,nickname').in('id', [...ids])
        : Promise.resolve({ data: [] as { id: string; name: string; nickname: string | null }[] }),
      eventIds.size
        ? db.from('events').select('id,name').in('id', [...eventIds])
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const nameOf = new Map((cards ?? []).map((c) => [c.id, c.nickname || c.name]));
    const eventNameOf = new Map((events ?? []).map((e) => [e.id, e.name]));

    const events_: ActivityEvent[] = [
      ...(links.data ?? []).map((l) => ({
        key: `link-${l.id}`,
        kind: 'scan' as const,
        at: l.created_at,
        who: nameOf.get(l.from_card) ?? l.from_card,
        detail: `scanned ${nameOf.get(l.to_card) ?? l.to_card} · +${l.points}`,
      })),
      ...(checkins.data ?? []).map((c) => ({
        key: `checkin-${c.id}`,
        kind: 'checkin' as const,
        at: c.created_at,
        who: nameOf.get(c.card_id) ?? c.card_id,
        detail: `checked into ${eventNameOf.get(c.event_id) ?? c.event_id} (${c.method})`,
      })),
    ].sort((a, b) => (a.at < b.at ? 1 : -1));

    return NextResponse.json({ events: events_.slice(0, 60) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
