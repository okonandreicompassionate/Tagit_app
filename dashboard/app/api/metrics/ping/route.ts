import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * Round-trip time for the cheapest real query PostgREST can run — not a
 * synthetic ping, the actual latency a scan or check-in would see from this
 * server to the database.
 */
export async function GET() {
  const start = performance.now();
  try {
    const { error } = await supabaseAdmin().from('cards').select('id').limit(1);
    const ms = performance.now() - start;
    if (error) return NextResponse.json({ ok: false, ms, error: error.message }, { status: 502 });
    return NextResponse.json({ ok: true, ms: Math.round(ms * 10) / 10, at: Date.now() });
  } catch (err) {
    const ms = performance.now() - start;
    return NextResponse.json(
      { ok: false, ms, error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
