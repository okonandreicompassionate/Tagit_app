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

type LinkRow = {
  id: number;
  from_card: string;
  to_card: string;
  event_id: string | null;
  direction: 'scanned' | 'scanned_by';
  points: number;
  created_at: string;
};

type CheckinRow = { id: number; event_id: string; method: 'qr' | 'code'; created_at: string };

type FriendshipRow = {
  card_a: string;
  card_b: string;
  status: 'pending' | 'accepted' | 'blocked';
  asked_by: string;
  created_at: string;
};

type EventRow = { id: string; name: string; visibility: string; starts_at: string | null };

type BoostRow = {
  id: number;
  event_id: string;
  amount_kobo: number;
  status: string;
  created_at: string;
};

/**
 * Everything one account has actually done — the debugging view this whole
 * project has needed by hand all night: is the card really on the server,
 * what links does it really have, which direction, when, worth what. Reads
 * straight from the tables rather than through `event_feed` or the app's own
 * derived state, so nothing here can be wrong in the way a client cache can.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const db = supabaseAdmin();

    const { data: card, error: cardError } = await db
      .from('cards')
      .select('id,name,nickname,avatar,socials,swag,owner,created_at')
      .eq('id', id)
      .maybeSingle<CardRow>();

    if (cardError) return NextResponse.json({ error: cardError.message }, { status: 502 });
    if (!card) return NextResponse.json({ error: 'No card with that id.' }, { status: 404 });

    const [links, checkins, friendships, hostedEvents, boosts] = await Promise.all([
      db
        .from('links')
        .select('id,from_card,to_card,event_id,direction,points,created_at')
        .eq('from_card', id)
        .order('created_at', { ascending: false })
        .limit(200)
        .returns<LinkRow[]>(),
      db
        .from('checkins')
        .select('id,event_id,method,created_at')
        .eq('card_id', id)
        .order('created_at', { ascending: false })
        .limit(100)
        .returns<CheckinRow[]>(),
      db
        .from('friendships')
        .select('card_a,card_b,status,asked_by,created_at')
        .or(`card_a.eq.${id},card_b.eq.${id}`)
        .order('created_at', { ascending: false })
        .returns<FriendshipRow[]>(),
      db
        .from('events')
        .select('id,name,visibility,starts_at')
        .eq('host_card', id)
        .order('starts_at', { ascending: false })
        .returns<EventRow[]>(),
      db
        .from('boosts')
        .select('id,event_id,amount_kobo,status,created_at')
        .eq('card_id', id)
        .order('created_at', { ascending: false })
        .returns<BoostRow[]>(),
    ]);

    const firstError = [links, checkins, friendships, hostedEvents, boosts].find((r) => r.error);
    if (firstError?.error) {
      return NextResponse.json({ error: firstError.error.message }, { status: 502 });
    }

    // The other card in each link/friendship — resolved to a name so the
    // debug view reads as "who", not a wall of ids.
    const otherIds = new Set<string>();
    for (const l of links.data ?? []) otherIds.add(l.to_card);
    for (const f of friendships.data ?? [])
      otherIds.add(f.card_a === id ? f.card_b : f.card_a);
    otherIds.delete(id);

    const { data: otherCards } = otherIds.size
      ? await db.from('cards').select('id,name,nickname').in('id', [...otherIds])
      : { data: [] as { id: string; name: string; nickname: string | null }[] };
    const nameOf = new Map((otherCards ?? []).map((c) => [c.id, c.nickname || c.name]));

    return NextResponse.json({
      card,
      links: (links.data ?? []).map((l) => ({ ...l, otherName: nameOf.get(l.to_card) ?? l.to_card })),
      checkins: checkins.data ?? [],
      friendships: (friendships.data ?? []).map((f) => {
        const otherId = f.card_a === id ? f.card_b : f.card_a;
        return { ...f, otherId, otherName: nameOf.get(otherId) ?? otherId };
      }),
      hostedEvents: hostedEvents.data ?? [],
      boosts: boosts.data ?? [],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

/**
 * Deletes an account — the card and, if it was ever claimed, the auth
 * identity behind it. This is the one place that can actually free up an
 * email or phone number for reuse: deleting only `cards` leaves `auth.users`
 * behind, and Supabase Auth still treats that contact as taken.
 *
 * Cascades do the rest. Every table that references a card was built with
 * `on delete cascade` (links, checkins, friendships, boosts, invites) except
 * `events.host_card`, which is `on delete set null` on purpose — an event
 * someone already checked into shouldn't vanish for them because its host's
 * account got deleted. Nothing here has to re-implement that by hand; it's
 * already the database's own behaviour, this route just triggers it.
 */
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  try {
    const db = supabaseAdmin();

    const { data: card, error: findError } = await db
      .from('cards')
      .select('id,owner')
      .eq('id', id)
      .maybeSingle<{ id: string; owner: string | null }>();

    if (findError) return NextResponse.json({ error: findError.message }, { status: 502 });
    if (!card) return NextResponse.json({ error: 'No card with that id.' }, { status: 404 });

    const { error: deleteError } = await db.from('cards').delete().eq('id', id);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 502 });

    // Best-effort: the card is already gone either way, and a dangling
    // unclaimed auth identity is a much smaller problem than the delete
    // itself failing to look like it worked.
    if (card.owner) {
      const { error: authError } = await db.auth.admin.deleteUser(card.owner);
      if (authError) {
        return NextResponse.json({
          ok: true,
          warning: `Card deleted, but the linked account couldn't be removed: ${authError.message}. The email or phone may still show as taken.`,
        });
      }
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
