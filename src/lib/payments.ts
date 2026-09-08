import { isLive } from './rest';
import { authToken } from './supabase';

/**
 * Paystack checkout, via an Edge Function.
 *
 * The app never touches the Paystack secret key. Initialising a transaction
 * requires it, and anything shipped in the bundle is readable by anyone — so
 * the flow is: app asks the Edge Function for a checkout URL, the function
 * signs the request with the secret held server-side, and the app just opens
 * the URL it gets back.
 *
 * Payment is confirmed by Paystack's webhook, never by the app reporting
 * success. A client that could mark its own boost paid would make the whole
 * thing free.
 */

const URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');

export class PaymentsNotConfigured extends Error {
  constructor() {
    super('Boost payments are not set up yet');
    this.name = 'PaymentsNotConfigured';
  }
}

export type CheckoutRequest = {
  eventId: string;
  cardId: string;
  kind: 'boost' | 'sponsored';
  days: number;
  amountKobo: number;
  email: string;
};

export type Checkout = {
  /** Paystack-hosted page to open in a browser. */
  authorizationUrl: string;
  reference: string;
};

export async function createBoostCheckout(req: CheckoutRequest): Promise<Checkout> {
  if (!isLive || !URL) throw new PaymentsNotConfigured();

  const token = await authToken();
  const res = await fetch(`${URL}/functions/v1/boost-checkout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(req),
  });

  // 404 means the function hasn't been deployed — worth distinguishing from a
  // genuine payment failure, because the fix is completely different.
  if (res.status === 404) throw new PaymentsNotConfigured();
  if (!res.ok) throw new Error(await res.text().catch(() => 'Checkout failed'));

  const body = (await res.json()) as {
    authorization_url?: string;
    reference?: string;
  };
  if (!body.authorization_url || !body.reference) throw new Error('Checkout response malformed');

  return { authorizationUrl: body.authorization_url, reference: body.reference };
}
