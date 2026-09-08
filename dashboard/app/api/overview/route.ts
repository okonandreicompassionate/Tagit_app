import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

// No generated Database type is wired up (there's no build step producing
// one from the Expo app's schema), so supabase-js can't infer row shapes from
// the select string alone — without a Database generic it falls back to
// `never` for some of these. `.returns<T[]>()` tells it what's actually
// coming back; the source of truth for these columns is still the migrations.
type EventRow = {
  id: string;
  name: string;
  type: string;
  visibility: 'public' | 'private';
  starts_at: string | null;
  location: string | null;
  city: string | null;
  host_card: string | null;
  sponsored: boolean;
  boost_score: number;
  boosted_until: string | null;
};

type LeaderRow = { cardId: string; name: string; handle: string; swag: number; tags: number };

type BoostRow = {
  id: number;
  event_id: string;
  card_id: string;
  kind: string;
  amount_kobo: number;
  days: number;
  status: 'pending' | 'paid' | 'failed' | 'refunded';
  created_at: string;
  paid_at: string | null;
};

/**
 * Everything the public admin/index.html (Phase 0) couldn't show, because it
 * only ever reads as an ordinary signed-out user. This route holds the
 * service key, so it sees private events, real check-in counts straight from
 * the table, and payments — none of which RLS lets the public key touch.
 */
export async function GET() {
  // supabaseAdmin() throws synchronously when the service key isn't
  // configured. Left uncaught, Next's default error handler returns an empty
  // body in production — the client's `res.json()` then fails with a
  // confusing parse error instead of the clear message this is supposed to
  // show. Every route that can fail needs its own try/catch; there's no
  // framework-level default that produces a clean JSON error body here.
  try {
    const db = supabaseAdmin();

    const [events, leaderboard, boosts, cards, checkins, links] = await Promise.all([
      db
        .from('events')
        .select('id,name,type,visibility,starts_at,location,city,host_card,sponsored,boost_score,boosted_until')
        .order('starts_at', { ascending: true, nullsFirst: false })
        .limit(200)
        .returns<EventRow[]>(),
      db.from('leaderboard').select('*').order('swag', { ascending: false }).limit(50).returns<LeaderRow[]>(),
      db
        .from('boosts')
        .select('id,event_id,card_id,kind,amount_kobo,days,status,created_at,paid_at')
        .order('created_at', { ascending: false })
        .limit(50)
        .returns<BoostRow[]>(),
      db.from('cards').select('id', { count: 'exact', head: true }),
      db.from('checkins').select('id', { count: 'exact', head: true }),
      db.from('links').select('id', { count: 'exact', head: true }),
    ]);

    const firstError = [events, leaderboard, boosts, cards, checkins, links].find((r) => r.error);
    if (firstError?.error) {
      return NextResponse.json({ error: firstError.error.message }, { status: 502 });
    }

    const paidKobo = (boosts.data ?? [])
      .filter((b) => b.status === 'paid')
      .reduce((sum, b) => sum + (b.amount_kobo ?? 0), 0);

    return NextResponse.json({
      totals: {
        cards: cards.count ?? 0,
        events: events.data?.length ?? 0,
        checkins: checkins.count ?? 0,
        links: links.count ?? 0,
        revenueNaira: paidKobo / 100,
      },
      events: events.data ?? [],
      leaderboard: leaderboard.data ?? [],
      boosts: boosts.data ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
