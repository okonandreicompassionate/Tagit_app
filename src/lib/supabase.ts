import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Identity for the app.
 *
 * Every install signs in anonymously, which gives it a stable `auth.uid()`.
 * That uid is stamped on a card as its `owner`, and the RLS policies key off
 * it — which is what stops anyone who knows a handle from overwriting someone
 * else's card. No email, no password, no sign-up screen: the user never sees
 * that this happened.
 *
 * Anonymous sign-in has to be enabled in the Supabase dashboard
 * (Authentication → Sign In / Providers → Anonymous). If it isn't, every
 * function here degrades to "no session" and the app carries on using the
 * publishable key exactly as before — a dashboard toggle should never brick
 * the client.
 */

// Static dot access: Expo only inlines EXPO_PUBLIC_* this way.
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const supabase: SupabaseClient | null =
  URL && KEY
    ? createClient(URL, KEY, {
        auth: {
          storage: AsyncStorage,
          autoRefreshToken: true,
          persistSession: true,
          // No URL-based session handoff in React Native; leaving this on
          // makes the client look for a browser hash that never exists.
          detectSessionInUrl: false,
        },
      })
    : null;

/** Cached so concurrent callers share one in-flight sign-in. */
let pending: Promise<string | null> | null = null;

/**
 * Returns this install's user id, signing in anonymously the first time.
 * Null means auth is unavailable — the caller should carry on unauthenticated.
 */
export async function ensureUserId(): Promise<string | null> {
  if (!supabase) return null;
  if (pending) return pending;

  pending = (async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session?.user?.id) return data.session.user.id;

      const { data: signed, error } = await supabase.auth.signInAnonymously();
      if (error) {
        if (__DEV__) {
          console.warn(
            '[auth] anonymous sign-in unavailable — continuing without a session. ' +
              'Enable it under Authentication → Sign In / Providers → Anonymous. ' +
              error.message
          );
        }
        return null;
      }
      return signed.session?.user?.id ?? null;
    } catch (err) {
      if (__DEV__) console.warn('[auth] sign-in failed:', err);
      return null;
    } finally {
      // Let a later call retry: a failure here is usually transient (offline
      // at launch), and caching null forever would strand the install.
      pending = null;
    }
  })();

  return pending;
}

/**
 * The bearer token for REST calls. Falls back to the publishable key so
 * requests still authenticate (as `anon`) when there's no session.
 */
export async function authToken(): Promise<string | undefined> {
  if (!supabase) return KEY;
  try {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? KEY;
  } catch {
    return KEY;
  }
}
