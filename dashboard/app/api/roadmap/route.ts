import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export type RoadmapItem = {
  id: number;
  title: string;
  detail: string | null;
  status: 'idea' | 'planned' | 'building' | 'shipped';
  created_at: string;
  updated_at: string;
};

/**
 * `roadmap_items` — internal-only, locked from anon/authenticated (see
 * `20260909160000_admin_roadmap.sql`). This is the one table in the whole
 * project that's never read through the Expo app; it exists purely so "what
 * am I building next" lives somewhere other than a chat transcript.
 */
export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('roadmap_items')
      .select('*')
      .order('status', { ascending: true })
      .order('created_at', { ascending: false })
      .returns<RoadmapItem[]>();

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ items: data ?? [] });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const title = String(body.title ?? '').trim();
    const detail = typeof body.detail === 'string' ? body.detail.trim() : '';

    if (title.length < 1 || title.length > 120) {
      return NextResponse.json({ error: 'Title must be 1–120 characters.' }, { status: 400 });
    }

    const db = supabaseAdmin();
    // See the matching comment in api/accounts/route.ts POST — no generated
    // Database type wired up, so insert()'s payload type is `never` without
    // this escape hatch.
    const { data, error } = await db
      .from('roadmap_items')
      .insert({ title, detail: detail || null } as never)
      .select('*')
      .single<RoadmapItem>();

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ item: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
