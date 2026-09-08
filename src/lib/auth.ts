import { supabase } from './supabase';

/**
 * Sign-in.
 *
 * The bug this exists to kill: a card used to live only in phone storage with
 * `owner = null`. Lose the local copy — reinstall, new phone, cleared data —
 * and onboarding ran again, found your own handle already taken, and locked
 * you out of your own account. Ownership now belongs to a signed-in user id,
 * so "log back in" means finding the card your id already owns.
 *
 * One field takes either a phone number or an email, and the right Supabase
 * method is chosen from the shape of it. Phone is the better fit for this
 * audience — everyone has a number and nobody forgets it — but it needs an SMS
 * provider configured in Supabase, which costs money. Email works on the
 * default project with no setup. Supporting both means SMS can be switched on
 * later without touching this code.
 */

export type Identifier =
  | { kind: 'phone'; value: string }
  | { kind: 'email'; value: string };

/**
 * Nigerian numbers get typed as 0801…, 234801…, or +234801…. All three mean
 * the same person, and Supabase needs E.164, so normalise rather than reject.
 */
export function normalisePhone(input: string, defaultCountry = '234'): string | null {
  const digits = input.replace(/[^\d+]/g, '');
  if (!digits) return null;

  let n = digits.replace(/^\+/, '');
  if (n.startsWith('0')) n = defaultCountry + n.slice(1);
  else if (!n.startsWith(defaultCountry) && n.length <= 10) n = defaultCountry + n;

  // E.164 allows up to 15 digits; anything shorter than 8 isn't a real number.
  return n.length >= 8 && n.length <= 15 ? `+${n}` : null;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Works out whether someone typed a number or an address. */
export function parseIdentifier(input: string): Identifier | null {
  const value = input.trim();
  if (!value) return null;
  if (EMAIL.test(value)) return { kind: 'email', value: value.toLowerCase() };
  const phone = normalisePhone(value);
  return phone ? { kind: 'phone', value: phone } : null;
}

export type SendResult =
  | { ok: true; kind: Identifier['kind'] }
  | { ok: false; reason: string };

/** Sends the six-digit code. */
export async function sendCode(input: string): Promise<SendResult> {
  if (!supabase) return { ok: false, reason: 'No backend configured.' };

  const id = parseIdentifier(input);
  if (!id) return { ok: false, reason: 'That doesn’t look like a phone number or an email.' };

  const { error } =
    id.kind === 'phone'
      ? await supabase.auth.signInWithOtp({ phone: id.value })
      : await supabase.auth.signInWithOtp({
          email: id.value,
          // No separate sign-up step: first code creates the account.
          options: { shouldCreateUser: true },
        });

  if (!error) return { ok: true, kind: id.kind };

  // The most common failure by far is SMS not being configured on the project.
  // Saying so beats "unsupported phone provider", which nobody can act on.
  const msg = error.message.toLowerCase();
  if (id.kind === 'phone' && (msg.includes('provider') || msg.includes('sms'))) {
    return {
      ok: false,
      reason: 'Text messages aren’t switched on yet. Use an email address for now.',
    };
  }
  if (msg.includes('rate') || msg.includes('too many')) {
    return { ok: false, reason: 'Too many tries. Wait a minute and try again.' };
  }
  return { ok: false, reason: error.message };
}

export type VerifyResult = { ok: true; userId: string } | { ok: false; reason: string };

/** Exchanges the code for a session. */
export async function verifyCode(input: string, code: string): Promise<VerifyResult> {
  if (!supabase) return { ok: false, reason: 'No backend configured.' };

  const id = parseIdentifier(input);
  if (!id) return { ok: false, reason: 'Enter your number or email again.' };

  const token = code.replace(/\D/g, '');
  if (token.length < 4) return { ok: false, reason: 'Enter the code from the message.' };

  const { data, error } = await supabase.auth.verifyOtp(
    id.kind === 'phone'
      ? { phone: id.value, token, type: 'sms' }
      : { email: id.value, token, type: 'email' }
  );

  if (error) {
    const msg = error.message.toLowerCase();
    if (msg.includes('expired')) return { ok: false, reason: 'That code has expired. Send a new one.' };
    if (msg.includes('invalid')) return { ok: false, reason: 'That code isn’t right. Check and try again.' };
    return { ok: false, reason: error.message };
  }

  const userId = data.session?.user?.id;
  return userId ? { ok: true, userId } : { ok: false, reason: 'Sign-in didn’t complete. Try again.' };
}

export async function signOut(): Promise<void> {
  await supabase?.auth.signOut().catch(() => {});
}

/** The signed-in user id, or null. */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.user?.id ?? null;
  } catch {
    return null;
  }
}
