import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

export type AiContext = {
  id: 'main';
  content: string;
  updated_at: string;
};

export async function GET() {
  try {
    const db = supabaseAdmin();
    const { data, error } = await db
      .from('ai_context')
      .select('*')
      .eq('id', 'main')
      .maybeSingle<AiContext>();

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    // No row yet on a fresh project — an empty draft, not an error.
    return NextResponse.json({ item: data ?? { id: 'main', content: '', updated_at: null } });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const content = typeof body.content === 'string' ? body.content : '';

    if (content.length > 200_000) {
      return NextResponse.json({ error: 'That got long — trim it under 200,000 characters.' }, { status: 400 });
    }

    const db = supabaseAdmin();
    const { data, error } = await db
      .from('ai_context')
      .upsert({ id: 'main', content, updated_at: new Date().toISOString() } as never)
      .select('*')
      .single<AiContext>();

    if (error) return NextResponse.json({ error: error.message }, { status: 502 });
    return NextResponse.json({ item: data });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unknown error' },
      { status: 500 }
    );
  }
}
