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
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Seeds a card — and, when an email is given, a real signed-in identity
 * behind it. Without one this is an unclaimed card, same shape as the demo
 * rows (nobody can actually open the app as them). With one, it's created
 * pre-confirmed (`email_confirm: true`) via the admin API, so the real app's
 * `signInWithOtp` works against it immediately — no inbox needed to send the
 * first code, since the account already exists and is verified.
 *
 * Auth user created before the card, deliberately: if the card insert then
 * fails (handle taken), the just-created auth user is torn back down rather
 * than left behind as a claimed-but-cardless account sitting on that email.
 */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const id = String(body.id ?? '').trim().toLowerCase();
    const name = String(body.name ?? '').trim();
    const snap = typeof body.snap === 'string' ? body.snap.trim().replace(/^@+/, '') : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!HANDLE_RE.test(id)) {
      return NextResponse.json(
        { error: 'Handle must be 2–40 characters: lowercase letters, numbers, _ . -' },
        { status: 400 }
      );
    }
    if (name.length < 2 || name.length > 60) {
      return NextResponse.json({ error: 'Name must be 2–60 characters.' }, { status: 400 });
    }
    if (email && !EMAIL_RE.test(email)) {
      return NextResponse.json({ error: 'That email address doesn’t look right.' }, { status: 400 });
    }

    const db = supabaseAdmin();

    let owner: string | null = null;
    if (email) {
      const { data: created, error: authError } = await db.auth.admin.createUser({
        email,
        email_confirm: true,
      });
      if (authError) {
        const taken = authError.status === 422 || /already/i.test(authError.message);
        return NextResponse.json(
          { error: taken ? `${email} already has an account.` : authError.message },
          { status: taken ? 409 : 502 }
        );
      }
      owner = created.user.id;
    }

    // Same "no generated Database type" gap as the .returns<T[]>() calls
    // above, on the write side instead — without it, insert()'s payload type
    // resolves to `never` rather than accepting an arbitrary row.
    const { data, error } = await db
      .from('cards')
      .insert({ id, name, socials: snap ? { snap } : {}, owner } as never)
      .select('id,name,nickname,avatar,socials,swag,owner,created_at')
      .single<CardRow>();

    if (error) {
      if (owner) await db.auth.admin.deleteUser(owner).catch(() => {});
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
