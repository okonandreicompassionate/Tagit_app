/**
 * POST /functions/v1/boost-checkout
 *
 * Starts a Paystack transaction for an event boost and records a pending row
 * in `boosts`. Returns the hosted checkout URL for the app to open.
 *
 * Deploy:
 *   supabase secrets set PAYSTACK_SECRET_KEY=sk_live_or_test_key
 *   supabase functions deploy boost-checkout
 *
 * Two things this function exists to guarantee:
 *  - The Paystack secret never reaches the client.
 *  - The price is decided here, not sent by the app. A client-supplied amount
 *    means a client-chosen amount, which means free boosts.
 */

import { createClient } from 'jsr:@supabase/supabase-js@2';

// The rate card, server-side. Must stay in step with BOOST_TIERS in
// src/lib/eventsApi.ts — this copy is the one that decides what's charged.
const TIERS: Record<number, { amountKobo: number; score: number }> = {
  1: { amountKobo: 100_000, score: 100 },
  3: { amountKobo: 250_000, score: 250 },
  7: { amountKobo: 500_000, score: 500 },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);

  const secret = Deno.env.get('PAYSTACK_SECRET_KEY');
  if (!secret) return json({ error: 'PAYSTACK_SECRET_KEY is not set' }, 500);

  let body: {
    eventId?: string;
    cardId?: string;
    kind?: 'boost' | 'sponsored';
    days?: number;
    email?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  const { eventId, cardId, email } = body;
  const kind = body.kind ?? 'boost';
  const days = Number(body.days);

  if (!eventId || !cardId || !email) {
    return json({ error: 'eventId, cardId and email are required' }, 400);
  }
  const tier = TIERS[days];
  if (!tier) return json({ error: `No boost tier for ${days} days` }, 400);

  // Service role, so we can write `boosts` and the revoked boost columns on
  // `events` — both are deliberately closed to the client.
  const admin = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } }
  );

  // Confirm the caller actually hosts this event before charging them for it.
  const { data: event, error: eventError } = await admin
    .from('events')
    .select('id,host_card,visibility')
    .eq('id', eventId)
    .maybeSingle();

  if (eventError) return json({ error: eventError.message }, 500);
  if (!event) return json({ error: 'Event not found' }, 404);
  if (event.host_card !== cardId) return json({ error: 'Not your event' }, 403);
  if (event.visibility !== 'public') {
    return json({ error: 'Private events cannot be boosted' }, 400);
  }

  const reference = `boost_${eventId}_${Date.now().toString(36)}`;

  const init = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      email,
      amount: tier.amountKobo,
      reference,
      currency: 'NGN',
      // Echoed back on the webhook so it can apply the right boost without
      // trusting anything the client says at that point either.
      metadata: { eventId, cardId, kind, days, score: tier.score },
    }),
  });

  const payload = await init.json().catch(() => null);
  if (!init.ok || !payload?.status) {
    return json({ error: payload?.message ?? 'Paystack rejected the transaction' }, 502);
  }

  const { error: insertError } = await admin.from('boosts').insert({
    event_id: eventId,
    card_id: cardId,
    kind,
    amount_kobo: tier.amountKobo,
    days,
    status: 'pending',
    paystack_ref: reference,
  });
  if (insertError) return json({ error: insertError.message }, 500);

  return json({
    authorization_url: payload.data.authorization_url,
    reference,
  });
});
