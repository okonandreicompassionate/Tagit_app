-- Tagit — actually stop the client writing server-owned columns.
--
-- The earlier migrations tried this:
--
--   revoke insert (swag), update (swag) on public.cards from anon, authenticated;
--
-- and it did nothing. In Postgres, a column-level REVOKE cannot subtract from
-- a table-level grant: if a role holds INSERT on the table, that covers every
-- column, and revoking one column is a no-op. Supabase grants table-wide
-- INSERT/UPDATE to anon and authenticated, so both revokes were decorative.
--
-- Confirmed against the live database by POSTing a card with
-- {"swag": 999999} and reading it straight back — the value stuck.
--
-- The working pattern is the opposite way round: drop the table-level grant,
-- then grant back exactly the columns the client is allowed to write. Anything
-- not listed becomes unwritable, including any column added later, which fails
-- closed rather than open.
--
-- Two holes this closes:
--   * cards.swag — a client could award itself any rank it liked.
--   * events.boost_score / boosted_until / sponsored — a client could put its
--     own event at the top of Discover without paying for it.

begin;

/* ---------- cards: everything except swag ---------- */

revoke insert, update on public.cards from anon, authenticated;

grant insert (id, owner, name, nickname, avatar, socials, snap_score)
  on public.cards to anon, authenticated;

-- `id` is absent on purpose: it is the handle inside every printed code and
-- must never change. `swag` is absent because the triggers own it.
grant update (owner, name, nickname, avatar, socials, snap_score)
  on public.cards to anon, authenticated;

/* ---------- events: everything except paid placement ---------- */

revoke insert, update on public.events from anon, authenticated;

grant insert (id, name, code, type, description, location, city,
              starts_at, ends_at, host_card, visibility, ticket_url, cover)
  on public.events to anon, authenticated;

grant update (name, code, type, description, location, city,
              starts_at, ends_at, visibility, ticket_url, cover)
  on public.events to anon, authenticated;

/* ---------- links and checkins: points are priced server-side ---------- */

-- `points` on a link is still supplied by the client, which remains the last
-- soft spot in scoring: a modified app can post an inflated value for a scan
-- that really happened. The daily unique index caps how often, and the
-- reciprocal is priced by the mirror trigger, so the ceiling is low — but
-- closing it properly means moving pricing into a function, and that is a
-- behaviour change rather than a privilege fix, so it is left for its own
-- migration.
revoke update on public.links from anon, authenticated;
revoke update on public.checkins from anon, authenticated;

-- Upgrading a typed check-in to a scanned one is a legitimate client write.
grant update (method) on public.checkins to anon, authenticated;

commit;
