import { createClient } from '@supabase/supabase-js';

/**
 * The service_role client. This is the whole reason the dashboard has to be a
 * server, not a static page: this key bypasses row-level security entirely,
 * which is exactly what's needed to see scans, check-ins, private events and
 * payments — none of which the public key can read, by design.
 *
 * Imported only from Route Handlers and Server Components. Next.js keeps
 * anything without a NEXT_PUBLIC_ prefix out of the client bundle, but the
 * discipline still matters: never pass this client, or anything it returns
 * unfiltered, into a Client Component.
 */
let client: ReturnType<typeof createClient> | null = null;

export function supabaseAdmin() {
  if (client) return client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error(
      'SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set. ' +
        'Copy .env.example to .env.local for local dev, or set them in ' +
        'Vercel -> Project -> Settings -> Environment Variables.'
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
