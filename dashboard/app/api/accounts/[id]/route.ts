import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

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
