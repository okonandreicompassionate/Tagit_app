import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Wraps the admin_db_stats() Postgres function — see
 * supabase/migrations/20260909120000_admin_db_stats.sql in the main repo.
 * That function is granted to service_role only, which is the only thing
 * this route holds and the reason this has to run server-side.
 */
export async function GET() {
  try {
    const { data, error } = await supabaseAdmin().rpc('admin_db_stats');
    if (error) {
      // The likely first-run failure: the migration hasn't been applied yet.
      const hint = error.message.includes('does not exist')
        ? ' Run supabase/migrations/20260909120000_admin_db_stats.sql against your project.'
        : '';
      return NextResponse.json({ error: error.message + hint }, { status: 502 });
    }
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
