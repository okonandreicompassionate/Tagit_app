# The Tag API

Every screen in the app is built on four endpoints. They're plain HTTP against
Supabase's PostgREST layer — no SDK — which is what makes them sellable later:
the same calls work from the app, a web card, a partner's dating app, or curl.

Base URL: `{SUPABASE_URL}/rest/v1`
Auth: send the anon key as both `apikey` and `Authorization: Bearer …`.

## GET /cards?id=eq.{handle}

The one that matters. This is what a scan resolves to.

```bash
curl "$SUPABASE_URL/rest/v1/cards?id=eq.bigsho&select=*" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

```json
[
  {
    "id": "bigsho",
    "name": "Oluwaseun Adebayo",
    "nickname": "Sho",
    "bio": "Prod music. Lagos ↔ Abuja.",
    "avatar": null,
    "socials": { "snap": "bigsho_", "ig": "bigsho", "tiktok": "bigsho" },
    "snap_score": 284500,
    "swag": 1240,
    "created_at": "2026-09-01T10:22:03Z"
  }
]
```

Cards are world-readable by design — a code you show someone is meant to be
resolvable. Nothing private lives on a card.

## POST /cards (upsert)

Creating or editing your own card. Requires a session whose `auth.uid()`
matches `owner`, unless `owner` is null (the anonymous local-first case).

```bash
curl -X POST "$SUPABASE_URL/rest/v1/cards?on_conflict=id" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" \
  -H "Prefer: return=representation,resolution=merge-duplicates" \
  -d '{"id":"bigsho","name":"Oluwaseun Adebayo","socials":{"snap":"bigsho_"}}'
```

`id` must match `^[a-z0-9_.-]{2,40}$` and is immutable once taken — it's baked
into every code already printed or saved on someone else's phone.

## POST /links

Logs a scan. This is the ledger the whole scoring system derives from.

```bash
curl -X POST "$SUPABASE_URL/rest/v1/links" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
  -H "Content-Type: application/json" -H "Prefer: return=minimal" \
  -d '{"from_card":"bigsho","to_card":"tolu","event_id":"evt_flytime","direction":"scanned","points":35}'
```

Two things the client can't cheat:

- A unique index on `(from_card, to_card, created_at::date)` means one scoring
  row per pair per day. Scanning a friend all afternoon farms nothing.
- `cards.swag` is **not** writable. A trigger recomputes it as the sum of that
  card's link points, *and* the column is revoked from the `anon` /
  `authenticated` roles, so a client can't declare its own total on insert
  either. (The trigger alone wasn't enough — that was a real hole, fixed in
  the `20260907120100_rls_and_leaderboards` migration.)

`points` is still calculated client-side today, which is the remaining soft
spot — see *Hardening* below.

## GET /leaderboard and /event_leaderboard

Two views, because they answer different questions. The global board is one row
per card carrying its lifetime `swag`:

```bash
curl "$SUPABASE_URL/rest/v1/leaderboard?order=swag.desc&limit=100" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

The event board scores only the points earned **at that event**, which is the
figure that means anything on an event leaderboard:

```bash
curl "$SUPABASE_URL/rest/v1/event_leaderboard?event_id=eq.evt_flytime&order=swag.desc" \
  -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY"
```

Both views run as their owner rather than the caller
(`security_invoker = false`). That's deliberate and load-bearing: the raw
`links` table stays private under RLS — no client can read who scanned whom —
while these views publish only the aggregates. Built the other way, the view
inherits the caller's RLS, sees no links, and every `tags` count returns 0.

One combined view filtered by `event_id` was the original design and was wrong:
it duplicated anyone who had tagged at more than one event whenever the filter
was absent.

## GET /events?code=eq.{CODE}

Resolves the short code an organiser hands out into an event id.

---

## Selling this later

The natural product is `GET /cards/:handle` as a paid endpoint plus an
"Add on Tag" button other apps embed — every platform with a stranger-meetup
problem (dating, marketplace, event ticketing) needs exactly this lookup.

To get there you'd want, roughly in order:

1. **Move scoring server-side.** Replace the `points` field with a Postgres
   function or Edge Function that prices a link from the ledger. Until then a
   determined user can post inflated points for a real scan.
2. **Rate-limit `POST /links`** per `from_card` (Supabase Edge Function or a
   `pg_cron` sweep) so nobody scripts a leaderboard.
3. **API keys + usage counting** for third parties — a `partners` table, a
   `partner_scans` counter, and Paystack for billing per verified lookup.
4. **A web card at `tag.to/u/:handle`**, so a stock camera app scanning a Tag
   code lands somewhere useful instead of nowhere. This is the cheapest growth
   loop the product has.
