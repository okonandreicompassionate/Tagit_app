import { authToken } from './supabase';

/**
 * One thin layer over the backend, talked to with plain `fetch` against
 * Supabase's PostgREST endpoint — no SDK for data. The same calls work from a
 * web card, a partner app, or curl, which is what makes the API sellable.
 *
 * With no env vars set, callers fall through to their local mock data so the
 * app runs end-to-end before a backend exists.
 */

// Expo inlines EXPO_PUBLIC_* at build time, but only via static dot access —
// destructuring or bracket notation silently doesn't get replaced.
// Either key name works: Supabase renamed the legacy "anon" JWT to
// "publishable" (sb_publishable_…), and both authenticate the same way here.
const URL = process.env.EXPO_PUBLIC_SUPABASE_URL?.replace(/\/$/, '');
const KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isLive = Boolean(URL && KEY);

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status?: number
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function rest<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isLive) throw new ApiError('No backend configured');

  // `apikey` identifies the project; the bearer carries the user's session when
  // there is one, which is what populates auth.uid() for the RLS policies.
  // Without a session it falls back to the publishable key and acts as `anon`.
  const token = await authToken();

  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY!,
      Authorization: `Bearer ${token ?? KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...init.headers,
    },
  });

  if (!res.ok) {
    throw new ApiError(await res.text().catch(() => res.statusText), res.status);
  }

  // 204, or `Prefer: return=minimal`, come back with no body at all.
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** PostgREST reserves a few characters inside filter values. */
export const esc = (value: string) => encodeURIComponent(value);
