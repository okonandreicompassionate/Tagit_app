import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

type CardRow = {
  id: string;
  name: string;
  nickname: string | null;
  avatar: string | null;
  socials: Record<string, string> | null;
  swag: number;
  owner: string | null;
  created_at: string;
};

export type AccountRow = CardRow & { links: number; checkins: number };

/**
 * Every card, with the service key — the same list a public page could show
 * (`cards_read` is `using (true)`), but paired here with `owner` so the
 * dashboard can tell a claimed account from an unclaimed seed/demo row, and
 * with per-card link/checkin counts so a delete isn't a blind guess at what
 * it's actually removing.
 */
export async function GET() {
  try {
    const db = supabaseAdmin();

    const { data: cards, error } = await db
      .from('cards')
      .select('id,name,nickname,avatar,socials,swag,owner,created_at')
      .order('created_at', { ascending: false })
      .returns<CardRow[]>();

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });

    // Two count-only queries rather than one per card — a card list in the
    // hundreds shouldn't mean hundreds of round trips.
    const [linkCounts, checkinCounts] = await Promise.all([
      db.from('links').select('from_card').returns<{ from_card: string }[]>(),
      db.from('checkins').select('card_id').returns<{ card_id: string }[]>(),
    ]);

    const linkTally = new Map<string, number>();
    for (const l of linkCounts.data ?? []) linkTally.set(l.from_card, (linkTally.get(l.from_card) ?? 0) + 1);
    const checkinTally = new Map<string, number>();
    for (const c of checkinCounts.data ?? [])
      checkinTally.set(c.card_id, (checkinTally.get(c.card_id) ?? 0) + 1);

    const rows: AccountRow[] = (cards ?? []).map((c) => ({
      ...c,
      links: linkTally.get(c.id) ?? 0,
      checkins: checkinTally.get(c.id) ?? 0,
    }));

    return NextResponse.json({ accounts: rows });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

const HANDLE_RE = /^[a-z0-9_.-]{2,40}$/;

/**
 * Seeds a card directly — no phone, no email, no auth at all, same shape as
 * the demo cards already in the table (`owner` stays null until someone
 * actually signs into it from the app). For testing flows that need a second
 * or third real card to scan without roping in another real phone.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id ?? '').trim().toLowerCase();
    const name = String(body.name ?? '').trim();
    const snap = typeof body.snap === 'string' ? body.snap.trim().replace(/^@+/, '') : '';

    if (!HANDLE_RE.test(id)) {
      return NextResponse.json(
        { error: 'Handle must be 2–40 characters: lowercase letters, numbers, _ . -' },
        { status: 400 }
      );
    }
    if (name.length < 2 || name.length > 60) {
      return NextResponse.json({ error: 'Name must be 2–60 characters.' }, { status: 400 });
    }

    const db = supabaseAdmin();
    // Same "no generated Database type" gap as the .returns<T[]>() calls
    // above, on the write side instead — without it, insert()'s payload type
    // resolves to `never` rather than accepting an arbitrary row.
    const { data, error } = await db
      .from('cards')
      .insert({ id, name, socials: snap ? { snap } : {} } as never)
      .select('id,name,nickname,avatar,socials,swag,owner,created_at')
      .single<CardRow>();

    if (error) {
      const taken = error.code === '23505';
      return NextResponse.json(
        { error: taken ? `@${id} is already taken.` : error.message },
        { status: taken ? 409 : 502 }
      );
    }

    return NextResponse.json({ account: { ...data, links: 0, checkins: 0 } as AccountRow });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
