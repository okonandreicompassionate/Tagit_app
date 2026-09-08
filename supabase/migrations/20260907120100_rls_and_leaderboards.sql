-- Tagit — row level security, leaderboard views, and column privileges.
--
-- Split from the structure migration because these are the rules rather than
-- the shape, and because probing the live REST API turned up three defects in
-- the first hand-applied version. All three are corrected here:
--
--  1. Editing a card returned 401. The update policy required
--     `owner = auth.uid()`, but with no auth both sides are NULL and
--     NULL = NULL is NULL, not true — so every save after the first was denied.
--
--  2. `swag` was client-writable. The trigger recomputes it from the ledger,
--     but nothing stopped a client declaring `{"swag": 999999}` on insert.
--
--  3. The leaderboard's `tags` count was always 0, and the global board
--     duplicated anyone who had tagged at more than one event.
--
-- Idempotent, so it is safe against the hand-applied schema already in place.

/* ---------- leaderboard views ---------- */

-- These run as their OWNER, not the caller (security_invoker = false), and
-- that is load-bearing: `links` stays private under RLS so no client can read
-- who scanned whom, while these views publish only the aggregates a
-- leaderboard needs. Built the other way, the view inherits the caller's RLS,
-- sees no links, and every count returns 0.

-- GET /rest/v1/leaderboard — global, exactly one row per card.
drop view if exists public.leaderboard;
create view public.leaderboard with (security_invoker = false) as
select
  c.id                               as "cardId",
  coalesce(c.nickname, c.name)       as name,
  coalesce(c.socials->>'snap', c.id) as handle,
  c.avatar                           as avatar,
  c.swag                             as swag,
  count(distinct l.to_card)::int     as tags
from public.cards c
left join public.links l on l.from_card = c.id
group by c.id, c.nickname, c.name, c.socials, c.avatar, c.swag;

-- GET /rest/v1/event_leaderboard?event_id=eq.… — `swag` here is points earned
-- at that event, which is the figure that means something on an event board,
-- not the player's lifetime total.
drop view if exists public.event_leaderboard;
create view public.event_leaderboard with (security_invoker = false) as
select
  l.event_id                         as event_id,
  c.id                               as "cardId",
  coalesce(c.nickname, c.name)       as name,
  coalesce(c.socials->>'snap', c.id) as handle,
  c.avatar                           as avatar,
  coalesce(sum(l.points), 0)::int    as swag,
  count(distinct l.to_card)::int     as tags
from public.links l
join public.cards c on c.id = l.from_card
where l.event_id is not null
group by l.event_id, c.id, c.nickname, c.name, c.socials, c.avatar;

grant select on public.leaderboard       to anon, authenticated;
grant select on public.event_leaderboard to anon, authenticated;

/* ---------- row level security ---------- */

alter table public.cards  enable row level security;
alter table public.events enable row level security;
alter table public.links  enable row level security;

-- A card is public on purpose: scanning a code is how you read one.
drop policy if exists cards_read on public.cards;
create policy cards_read on public.cards for select using (true);

drop policy if exists cards_insert_own on public.cards;
create policy cards_insert_own on public.cards for insert
  with check (owner is null or owner = auth.uid());

-- An unclaimed card (owner is null) is editable by anyone; a claimed one only
-- by its owner. The null branch is what lets the app work before auth exists.
-- It is also the "anyone can overwrite a card" exposure in the README —
-- anonymous sign-in, stamping `owner` at creation, is what closes it.
drop policy if exists cards_update_own on public.cards;
create policy cards_update_own on public.cards for update
  using (owner is null or owner = auth.uid())
  with check (owner is null or owner = auth.uid());

-- Needed by the app's "delete my card and start over" flow.
drop policy if exists cards_delete_own on public.cards;
create policy cards_delete_own on public.cards for delete
  using (owner is null or owner = auth.uid());

drop policy if exists events_read on public.events;
create policy events_read on public.events for select using (true);

-- Anyone can log a scan; nobody can read someone else's graph.
drop policy if exists links_insert on public.links;
create policy links_insert on public.links for insert with check (true);

drop policy if exists links_read_own on public.links;
create policy links_read_own on public.links for select
  using (
    exists (
      select 1 from public.cards c
       where c.id in (links.from_card, links.to_card)
         and c.owner = auth.uid()
    )
  );

/* ---------- swag is server-owned at the privilege level ---------- */

-- Belt and braces: the app no longer sends the column, and now the database
-- rejects it regardless of what any client does.
revoke insert (swag), update (swag) on public.cards from anon, authenticated;

/* ---------- clear rows left by API probing ---------- */

delete from public.links where from_card in ('_selftest', '_cheater', '_probe2')
                            or to_card   in ('_selftest', '_cheater', '_probe2');
delete from public.cards where id in ('_selftest', '_cheater', '_probe2');
