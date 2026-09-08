/**
 * POST /functions/v1/paystack-webhook
 *
 * The only thing allowed to mark a boost paid, and the only thing allowed to
 * write the placement columns on `events`.
 *
 * Deploy:
 *   supabase functions deploy paystack-webhook --no-verify-jwt
 *   # then add the URL under Paystack Dashboard → Settings → API & Webhooks
 *
 * `--no-verify-jwt` is required because Paystack calls this without a Supabase
 * token. Authenticity comes from the HMAC signature instead — which is why the
 * signature check below is not optional and must run before anything is read
 * out of the body.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

/** Constant-time compare, so a mismatch can't be found by timing the reply. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacSha512Hex(key: string, message: string): Promise<string> {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-512' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(message));
  return [...new Uint8Array(signature)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('Method not allowed', { status: 405 });

  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return new Response('Not configured', { status: 500 });

  // Read the body as text: the signature is over the exact bytes sent, so
  // parsing and re-serialising would change what we verify.
  const raw = await req.text();
  const signature = req.headers.get('x-paystack-signature') ?? '';
  const expected = await hmacSha512Hex(secret, raw);

  if (!safeEqual(signature, expected)) {
    return new Response('Invalid signature', { status: 401 });
  }

  let event: {
    event?: string;
    data?: { reference?: string; amount?: number; metadata?: Record<string, unknown> };
  };
  try {
    event = JSON.parse(raw);
  } catch {
    return new Response('Invalid JSON', { status: 400 });
  }

  // Acknowledge anything we don't act on: Paystack retries non-2xx, and we
  // don't want it hammering us over events we deliberately ignore.
  if (event.event !== 'charge.success') return new Response('Ignored', { status: 200 });

  const reference = event.data?.reference;
  if (!reference) return new Response('Missing reference', { status: 400 });

  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Look the boost up by reference rather than trusting the metadata: the row
  // was written by us when checkout started, so it is the trustworthy copy of
  // what was actually bought.
  const { data: boost, error } = await admin
    .from('boosts')
    .select('id,event_id,kind,days,status')
    .eq('paystack_ref', reference)
    .maybeSingle();

  if (error) return new Response(error.message, { status: 500 });
  if (!boost) return new Response('Unknown reference', { status: 200 });
  // Idempotent: Paystack can deliver the same event more than once, and a
  // replay must not extend a boost a second time.
  if (boost.status === 'paid') return new Response('Already applied', { status: 200 });

  const SCORES: Record<number, number> = { 1: 100, 3: 250, 7: 500 };
  const score = SCORES[boost.days] ?? 100;
  const until = new Date(Date.now() + boost.days * 86_400_000).toISOString();

  const { error: eventError } = await admin
    .from('events')
    .update(
      boost.kind === 'sponsored'
        ? { sponsored: true, boost_score: score, boosted_until: until }
        : { boost_score: score, boosted_until: until }
    )
    .eq('id', boost.event_id);
  if (eventError) return new Response(eventError.message, { status: 500 });

  const { error: paidError } = await admin
    .from('boosts')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', boost.id);
  if (paidError) return new Response(paidError.message, { status: 500 });

  return new Response('OK', { status: 200 });
});
