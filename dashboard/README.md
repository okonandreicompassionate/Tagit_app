# Tagit ops — the real admin dashboard

A separate Next.js app, deployed on its own (Vercel), not part of the Expo
project. It exists because `admin/index.html` (Phase 0 in
[../docs/ADMIN.md](../docs/ADMIN.md)) reads the database as an ordinary
signed-out user — RLS correctly hides scans, check-ins, friendships and
payments from it. Seeing those needs a server holding the `service_role` key,
which a static page can never safely hold. This is that server.

## What's here

- **Overview** (`/`) — full visibility: every event (public and private),
  every boost payment and its status, the real leaderboard. Polls every 20s.
- **Database** (`/database`) — the metrics you asked for: live query latency
  (polled every 5s, with a sparkline), database size and row counts (polled
  every 30s), active vs. max connections, table sizes, the slowest queries if
  `pg_stat_statements` is enabled, and usage against Supabase's published plan
  limits so you can see how close you are to needing to upgrade.
- A single shared password gates the whole thing. No per-person accounts yet —
  see "Scaling this up" below for when that's worth adding.

## Running it locally

```bash
cd dashboard
npm install
cp .env.example .env.local   # fill in the values below
npm run dev
```

### Environment variables

| Variable | Where it comes from | Notes |
|---|---|---|
| `SUPABASE_URL` | Supabase → Project Settings → API | Same value as the Expo app's `EXPO_PUBLIC_SUPABASE_URL` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → Project Settings → API | **Secret.** Bypasses every RLS policy. Never prefix with `NEXT_PUBLIC_`, never put it in the Expo app, never commit it |
| `SUPABASE_PLAN` | `free` or `pro` | Only changes which limit numbers the Database page shows as ceilings |
| `ADMIN_PASSWORD` | You choose it | Gates the whole dashboard — treat it as a production secret |
| `SESSION_SECRET` | Generate once | `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

## The one migration this depends on

`GET /api/metrics/db` calls a Postgres function that doesn't exist until you
run:

```
../supabase/migrations/20260909120000_admin_db_stats.sql
```

against your project (same process as every other migration in
`docs/../supabase/`). It's granted to `service_role` only — nothing in the
Expo app or any public key can call it. Until it's applied, the Database page
shows a clear "run this migration" message rather than failing silently.

## Deploying to Vercel

```bash
cd dashboard
npx vercel
```

Or import the repo in the Vercel dashboard and set **Root Directory** to
`dashboard`. Either way, set the five environment variables above under
Project → Settings → Environment Variables before the first real deploy —
`next build` succeeds without them (nothing reads them at build time), but
every page will show connection errors until they're set.

## Design decisions worth knowing

- **Polling, not a websocket.** Supabase Realtime subscribes to *row changes*
  in the app's own tables — that's what `IncomingLinkWatcher` uses in the Expo
  app. "How big is the database right now" isn't a row change, it's a
  question worth re-asking on an interval. Each metric polls at the interval
  that matches its cost: ping every 5s because it's nearly free, DB stats
  every 30s because it runs real queries against `pg_stat_activity` and
  `pg_class`. Polling pauses while the tab is hidden.
- **A shared password, not per-person accounts.** Enough for "me and my
  team" reading a dashboard together. It stops being enough the moment you
  need to know *who* took an action — see Phase 2 in ADMIN.md for the
  audit-log design that per-person auth would unlock.
- **`session.ts` uses Web Crypto, not `node:crypto`.** `middleware.ts` runs on
  the Edge Runtime, which has no access to Node's crypto module at all — the
  build fails outright if you try. Web Crypto (`crypto.subtle`) works in both
  the Edge Runtime and modern Node, so one implementation covers everywhere
  this file is imported. Found by actually running `next build`, not assumed.
- **Every route that touches Supabase wraps the call in try/catch itself.**
  `supabaseAdmin()` throws synchronously when the service key is missing —
  left uncaught in a Route Handler, Next's default error handler returns an
  *empty* body in production, and the client's `res.json()` fails with a
  confusing parse error instead of the clear message this is supposed to
  show. There's no framework-level default that produces a clean JSON error;
  each route earns that behaviour itself. Verified by killing the service key
  and checking the actual HTTP response, not just reading the code.
- **The two usage-bar cards show "Not measured yet" rather than 0%** when
  there's no data — a database that hasn't been measured and a database
  that's verified empty are different facts, and showing "0.0%" for the first
  one would quietly claim a measurement that never happened.

## Scaling this up

Everything below is the honest next step, not built yet:

- **Per-person admin accounts.** Swap the shared password for Supabase Auth
  with an allow-list of admin emails (Phase 1's original design in
  `../docs/ADMIN.md`). Needed once "who did this" matters.
- **Actions, with an audit log.** Unlist an event, zero someone's swag, issue
  a refund — Phase 2 in ADMIN.md has the schema and the reasoning for why
  `reason` should be a required field on every action.
- **Alerting.** Right now a problem shows up here only if someone has this
  page open. A cron hitting `/api/metrics/db` and paging on `active_connections
  > 90% of max` or `database_bytes > 90% of plan` turns this from a page you
  check into a system that tells you.
