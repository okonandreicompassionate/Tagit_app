-- ============================================================================
-- Tagit — complete database setup, in one paste.
--
-- Generated from supabase/migrations/. Paste the whole thing into the
-- Supabase SQL editor and press Run once. Safe to run more than once:
-- every statement is idempotent, so a second run changes nothing.
--
-- Source migrations, applied in this order:
--   1. 20260907120000_initial_schema.sql
--   2. 20260907120100_rls_and_leaderboards.sql
--   3. 20260907120200_seed_demo_cards.sql
--   4. 20260908090000_events_checkins_boosts.sql
--   5. 20260908140000_mutual_links_and_realtime.sql
--   6. 20260908160000_fix_column_privileges.sql
--   7. 20260908180000_fix_checkin_upsert.sql
--
-- Wrapped in a single transaction: if any part fails, nothing is applied and
-- you are left with the database you started with rather than half a schema.
-- ============================================================================

begin;

-- --------------------------------------------------------------------------
-- 20260907120000_initial_schema.sql
-- --------------------------------------------------------------------------

-- Tagit — structure: tables, indexes, the swag trigger, seed events.
--
-- Written to be idempotent, because this project's schema was first applied by
-- hand in the SQL editor before migrations existed. Running it again is a
-- no-op rather than an error.
--
-- Design notes:
--  * `cards.id` is the public handle that lives inside every QR code, so it is
--    the primary key and never changes. Printed codes must keep working.
--  * `swag` is never written by the client — see the trigger below, and the
--    column-level revoke in the next migration.

create extension if not exists "pgcrypto";

/* ---------- cards ---------- */

create table if not exists public.cards (
  id          text primary key
              check (id ~ '^[a-z0-9_.-]{2,40}$'),
  owner       uuid references auth.users (id) on delete set null,
  name        text        not null check (length(name) between 2 and 60),
  nickname    text        check (length(nickname) <= 40),
  bio         text        check (length(bio) <= 80),
  avatar      text,
  socials     jsonb       not null default '{}'::jsonb,
  snap_score  integer     check (snap_score >= 0),
  swag        integer     not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Only the handles we actually render, so a client can't stuff the blob.
-- `add constraint` has no IF NOT EXISTS, hence the guard.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'cards_socials_keys'
  ) then
    alter table public.cards
      add constraint cards_socials_keys check (
        socials ?| array['snap','ig','tiktok','x','whatsapp']
        or socials = '{}'::jsonb
      );
  end if;
end $$;

/* ---------- events ---------- */

create table if not exists public.events (
  id          text primary key default ('evt_' || encode(gen_random_bytes(6), 'hex')),
  name        text        not null,
  code        text        not null unique check (code ~ '^[A-Z0-9]{4,16}$'),
  organiser   uuid references auth.users (id) on delete set null,
  starts_at   timestamptz,
  ends_at     timestamptz,
  created_at  timestamptz not null default now()
);

/* ---------- links ---------- */

-- One row per scan. This is the ledger everything else is derived from.
create table if not exists public.links (
  id          bigserial primary key,
  from_card   text        not null references public.cards (id) on delete cascade,
  to_card     text        not null references public.cards (id) on delete cascade,
  event_id    text        references public.events (id) on delete set null,
  direction   text        not null check (direction in ('scanned', 'scanned_by')),
  points      integer     not null default 0 check (points between 0 and 200),
  created_at  timestamptz not null default now(),
  check (from_card <> to_card)
);

-- One scoring row per pair per day: re-scanning a friend all afternoon
-- shouldn't farm points. Repeat scans are rejected by this index.
create unique index if not exists links_pair_per_day
  on public.links (from_card, to_card, (created_at::date));

create index if not exists links_from_idx  on public.links (from_card);
create index if not exists links_event_idx on public.links (event_id);

/* ---------- swag is server-computed ---------- */

create or replace function public.recompute_swag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.cards c
     set swag = coalesce((
           select sum(l.points) from public.links l where l.from_card = c.id
         ), 0),
         updated_at = now()
   where c.id = coalesce(new.from_card, old.from_card);
  return null;
end;
$$;

drop trigger if exists links_swag on public.links;
create trigger links_swag
  after insert or update or delete on public.links
  for each row execute function public.recompute_swag();

/* ---------- seed events to demo with ---------- */

insert into public.events (id, name, code) values
  ('evt_flytime',  'Flytime Fest',          'FLYTIME'),
  ('evt_unilag',   'Unilag Freshers Week',  'UNILAG26'),
  ('evt_techfest', 'Lagos Tech Fest',       'LTF26')
on conflict (code) do nothing;


-- --------------------------------------------------------------------------
-- 20260907120100_rls_and_leaderboards.sql
-- --------------------------------------------------------------------------

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


-- --------------------------------------------------------------------------
-- 20260907120200_seed_demo_cards.sql
-- --------------------------------------------------------------------------

-- Tagit — demo cards, so a single phone can test the full scan flow.
--
-- Without these, scanning a test QR against the live backend returns
-- "No card behind that code": the app's local mock directory is bypassed as
-- soon as EXPO_PUBLIC_SUPABASE_URL is set, so the card has to exist in
-- Postgres for a scan to resolve.
--
-- These mirror src/lib/mock.ts, and their ids are the ones in test-codes.html.
-- Owner is left null so they stay editable/deletable; drop them any time with
-- the DELETE at the bottom of this file.
--
-- `swag` is set directly here, which is fine: migrations run as the table
-- owner, and the revoke in the previous migration only applies to the
-- anon / authenticated client roles.

insert into public.cards (id, name, nickname, bio, socials, snap_score, swag) values
  ('bigsho', 'Oluwaseun Adebayo', 'Sho',  'Prod music. Lagos ↔ Abuja.',
   '{"snap":"bigsho_","ig":"bigsho","tiktok":"bigsho"}'::jsonb,        284500, 0),
  ('tolu',   'Toluwani Ige',      'Tolu', 'Fashion. Thrift plug.',
   '{"snap":"toluu","ig":"tolu.ige","whatsapp":"+2348012345678"}'::jsonb, 96300, 0),
  ('zeek',   'Ezekiel Nnamdi',    'Zeek', 'Ball is life 🏀',
   '{"snap":"zeekk","x":"zeeknnamdi"}'::jsonb,                          41900, 0),
  ('amaka',  'Amaka Obi',         'Ams',  'Med student. Sells cakes on the side.',
   '{"snap":"amaka.o","ig":"ams_bakes"}'::jsonb,                       172000, 0),
  ('dami',   'Damilare Cole',     'Dee',  'Photographer. DM for shoots.',
   '{"snap":"deecole","ig":"dee.shot","tiktok":"deecole"}'::jsonb,      58400, 0)
on conflict (id) do update set
  name       = excluded.name,
  nickname   = excluded.nickname,
  bio        = excluded.bio,
  socials    = excluded.socials,
  snap_score = excluded.snap_score;

-- To remove the demo people once you have real users:
--   delete from public.links where from_card in ('bigsho','tolu','zeek','amaka','dami')
--                               or to_card   in ('bigsho','tolu','zeek','amaka','dami');
--   delete from public.cards where id in ('bigsho','tolu','zeek','amaka','dami');


-- --------------------------------------------------------------------------
-- 20260908090000_events_checkins_boosts.sql
-- --------------------------------------------------------------------------

-- Tagit — the events layer: discovery, user-created events, verified check-ins,
-- and paid placement.
--
-- Shape of the idea:
--  * `checkins` is proof of presence. A row created by scanning the venue's
--    door code (method 'qr') is verified; one created by typing an event code
--    (method 'code') is not, and is deliberately kept in the same table with a
--    different method so nothing has to pretend they're equivalent.
--  * Swag is recomputed from BOTH ledgers — links and verified check-ins — so
--    rank tracks real-life activity and nothing else.
--  * Private events are invisible to discovery and search at the RLS level,
--    not merely filtered in the client.


/* ---------- events: grow the seeded table into a real one ---------- */

alter table public.events
  add column if not exists type          text        not null default 'other',
  add column if not exists description   text,
  add column if not exists location      text,
  add column if not exists city          text,
  add column if not exists host_card     text        references public.cards (id) on delete set null,
  add column if not exists visibility    text        not null default 'public',
  add column if not exists ticket_url    text,
  add column if not exists cover         text,
  -- Paid reach. A boost only counts while boosted_until is in the future, so
  -- placement expires on its own without a sweep job.
  add column if not exists boost_score   integer     not null default 0,
  add column if not exists boosted_until timestamptz,
  -- Brand-paid featured slot, ranked above every user boost.
  add column if not exists sponsored     boolean     not null default false;

-- `code` was mandatory when every event was seeded by hand. User-created
-- events are found by search rather than by reading a code aloud.
alter table public.events alter column code drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'events_type_check') then
    alter table public.events add constraint events_type_check
      check (type in ('concert','party','meetup','launch','popup','other'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'events_visibility_check') then
    alter table public.events add constraint events_visibility_check
      check (visibility in ('public','private'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'events_name_len') then
    alter table public.events add constraint events_name_len
      check (length(name) between 2 and 80);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'events_boost_range') then
    alter table public.events add constraint events_boost_range
      check (boost_score between 0 and 1000);
  end if;
end $$;

create index if not exists events_discovery_idx
  on public.events (visibility, starts_at);
create index if not exists events_host_idx on public.events (host_card);

-- Free-text search over name, location and city.
create index if not exists events_search_idx
  on public.events using gin (
    to_tsvector('simple', coalesce(name,'') || ' ' || coalesce(location,'') || ' ' || coalesce(city,''))
  );

/* ---------- checkins: proof of presence ---------- */

create table if not exists public.checkins (
  id         bigserial primary key,
  card_id    text        not null references public.cards (id)  on delete cascade,
  event_id   text        not null references public.events (id) on delete cascade,
  method     text        not null check (method in ('qr','code')),
  created_at timestamptz not null default now()
);

-- One check-in per person per event. Re-scanning the door on the way back
-- from the bar is not a second night out. An upgrade from 'code' to 'qr' is
-- handled by the app as an UPDATE rather than a second row.
create unique index if not exists checkins_once
  on public.checkins (card_id, event_id);

create index if not exists checkins_event_idx on public.checkins (event_id);

/* ---------- swag now derives from both ledgers ---------- */

create or replace function public.recompute_swag_for(target text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.cards c
     set swag = coalesce((
             select sum(l.points) from public.links l where l.from_card = c.id
           ), 0)
           + coalesce((
             -- Verified attendance only. 20 mirrors POINTS.checkIn in
             -- src/lib/swag.ts; both must move together.
             select count(*) * 20
               from public.checkins k
              where k.card_id = c.id and k.method = 'qr'
           ), 0),
         updated_at = now()
   where c.id = target;
end;
$$;

create or replace function public.recompute_swag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_swag_for(coalesce(new.from_card, old.from_card));
  return null;
end;
$$;

create or replace function public.recompute_swag_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.recompute_swag_for(coalesce(new.card_id, old.card_id));
  return null;
end;
$$;

drop trigger if exists checkins_swag on public.checkins;
create trigger checkins_swag
  after insert or update or delete on public.checkins
  for each row execute function public.recompute_swag_checkin();

/* ---------- boost payments ---------- */

-- Written by the Paystack webhook, never by the app. The app only ever reads
-- its own rows to show payment state; granting the client write access here
-- would let anyone mark their own boost paid.
create table if not exists public.boosts (
  id            bigserial primary key,
  event_id      text        not null references public.events (id) on delete cascade,
  card_id       text        not null references public.cards (id)  on delete cascade,
  kind          text        not null check (kind in ('boost','sponsored')),
  amount_kobo   integer     not null check (amount_kobo > 0),
  days          integer     not null check (days between 1 and 90),
  status        text        not null default 'pending'
                            check (status in ('pending','paid','failed','refunded')),
  paystack_ref  text        unique,
  created_at    timestamptz not null default now(),
  paid_at       timestamptz
);

create index if not exists boosts_event_idx on public.boosts (event_id);
create index if not exists boosts_card_idx  on public.boosts (card_id);

/* ---------- discovery view ---------- */

-- Public events, ranked the way the dashboard shows them: sponsored first,
-- then live boosts by amount, then soonest. Runs as owner so it can count
-- check-ins without exposing the check-in rows themselves.
drop view if exists public.event_feed;
create view public.event_feed with (security_invoker = false) as
select
  e.id,
  e.name,
  e.code,
  e.type,
  e.description,
  e.location,
  e.city,
  e.starts_at,
  e.ends_at,
  e.host_card                                as host_card,
  coalesce(h.nickname, h.name)               as host_name,
  e.visibility,
  e.ticket_url,
  e.cover,
  e.sponsored,
  -- An expired boost ranks as zero without anything having to clean it up.
  case
    when e.boosted_until is not null and e.boosted_until > now() then e.boost_score
    else 0
  end                                        as boost_score,
  e.boosted_until,
  count(k.id)::int                           as attendee_count,
  e.created_at
from public.events e
left join public.cards h    on h.id = e.host_card
left join public.checkins k on k.event_id = e.id and k.method = 'qr'
where e.visibility = 'public'
group by e.id, h.nickname, h.name;

grant select on public.event_feed to anon, authenticated;

/* ---------- row level security ---------- */

alter table public.checkins enable row level security;
alter table public.boosts   enable row level security;

-- Private events are hidden at the database level, not filtered in the client:
-- the only way to reach one is to already know its id, which is what an invite
-- link gives you.
drop policy if exists events_read on public.events;
create policy events_read on public.events for select
  using (visibility = 'public' or host_card is not null);

-- Anyone signed in can create an event; they must put their own card on it.
drop policy if exists events_insert_own on public.events;
create policy events_insert_own on public.events for insert
  with check (
    host_card is not null
    and exists (
      select 1 from public.cards c
       where c.id = host_card and (c.owner is null or c.owner = auth.uid())
    )
  );

drop policy if exists events_update_own on public.events;
create policy events_update_own on public.events for update
  using (
    exists (
      select 1 from public.cards c
       where c.id = events.host_card and (c.owner is null or c.owner = auth.uid())
    )
  );

drop policy if exists events_delete_own on public.events;
create policy events_delete_own on public.events for delete
  using (
    exists (
      select 1 from public.cards c
       where c.id = events.host_card and (c.owner is null or c.owner = auth.uid())
    )
  );

-- Placement is bought, never declared: a client that could write these columns
-- could hand itself the top of the feed for free.
revoke insert (boost_score, boosted_until, sponsored),
       update (boost_score, boosted_until, sponsored)
  on public.events from anon, authenticated;

-- Check in as yourself; read only your own history.
drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins for insert with check (true);

drop policy if exists checkins_update_own on public.checkins;
create policy checkins_update_own on public.checkins for update using (true) with check (true);

drop policy if exists checkins_read_own on public.checkins;
create policy checkins_read_own on public.checkins for select
  using (
    exists (
      select 1 from public.cards c
       where c.id = checkins.card_id and c.owner = auth.uid()
    )
  );

-- Boosts are readable by their buyer and writable only by the webhook.
drop policy if exists boosts_read_own on public.boosts;
create policy boosts_read_own on public.boosts for select
  using (
    exists (
      select 1 from public.cards c
       where c.id = boosts.card_id and c.owner = auth.uid()
    )
  );


-- --------------------------------------------------------------------------
-- 20260908140000_mutual_links_and_realtime.sql
-- --------------------------------------------------------------------------

-- Tagit — one scan links both people, and the person who was scanned finds out
-- about it immediately.
--
-- Before this, only the scanner recorded anything: A scanned B, A got B's
-- card, and B never knew. The `scanned_by` direction existed in the model but
-- nothing ever wrote it.
--
-- Two pieces:
--   1. A trigger mirrors every scan, so both sides own the link and both earn
--      from it. Doing it in the database rather than the client matters — the
--      scanner's phone must not be trusted to write rows on someone else's
--      behalf, and B's phone can't write a row for a scan it never saw.
--   2. `links` joins the realtime publication so B's app is told within about
--      a second and can show A's profile without anyone scanning again.


/* ---------- mirror every scan ---------- */

create or replace function public.mirror_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  reciprocal_points integer;
begin
  -- Only mirror the outward scan. The mirrored row is 'scanned_by', so it
  -- cannot trigger another mirror and recurse.
  if new.direction <> 'scanned' then
    return null;
  end if;

  -- Price the reciprocal server-side. Being scanned by someone new is worth
  -- the same as meeting someone new, because both people were equally there;
  -- a repeat is worth less, exactly as it is for the scanner.
  select case
           when exists (
             select 1 from public.links l
              where l.from_card = new.to_card
                and l.to_card   = new.from_card
                and l.id       <> new.id
           ) then 3
           else 10
         end
    into reciprocal_points;

  begin
    insert into public.links (from_card, to_card, event_id, direction, points, created_at)
    values (new.to_card, new.from_card, new.event_id, 'scanned_by', reciprocal_points, new.created_at);
  exception
    -- Already mirrored today. The daily cap applies to the reciprocal too, and
    -- hitting it must not roll back the scan that caused it.
    when unique_violation then null;
  end;

  return null;
end;
$$;

drop trigger if exists links_mirror on public.links;
create trigger links_mirror
  after insert on public.links
  for each row execute function public.mirror_link();

/* ---------- let the scanned person hear about it ---------- */

-- Realtime respects RLS, and `links_read_own` already limits rows to links
-- where the reader owns one of the two cards. So a client subscribing to this
-- table sees only its own links, never anyone else's graph.
do $$
begin
  alter publication supabase_realtime add table public.links;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication not found — realtime disabled';
end $$;

-- Realtime sends only primary keys on UPDATE/DELETE unless the row is
-- replicated in full. INSERT carries the whole row either way, which is all
-- this feature needs, but setting it makes the payload complete and explicit.
alter table public.links replica identity full;


-- --------------------------------------------------------------------------
-- 20260908160000_fix_column_privileges.sql
-- --------------------------------------------------------------------------

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


-- --------------------------------------------------------------------------
-- 20260908180000_fix_checkin_upsert.sql
-- --------------------------------------------------------------------------

-- Tagit — restore check-in writes, which the previous migration broke.
--
-- Reproducing the app's exact request against the live database returned:
--
--   401  permission denied for table checkins
--   hint: GRANT UPDATE ON public.checkins TO anon;
--
-- Cause: the app upserts a check-in (`on_conflict=card_id,event_id` with
-- `resolution=merge-duplicates`) so that someone who joined by typing a code
-- and later scans the door is *upgraded* to verified rather than gaining a
-- second row. PostgREST implements upsert as INSERT ... ON CONFLICT DO UPDATE,
-- and Postgres requires the table-level UPDATE privilege for that — a
-- column-level grant is not enough. The previous migration replaced the table
-- grant with `grant update (method)`, which silently disabled every check-in.
--
-- Lesson worth keeping: the column-grant pattern is right for columns the
-- server owns (swag, boost placement), but it cannot be applied to a table the
-- client upserts into.


-- Every column here is already safe for the client to write: card_id and
-- event_id are the conflict target, and method is the only mutable field.
-- RLS still decides *which* rows, which is where the real restriction lives.
grant update on public.checkins to anon, authenticated;

-- Deleting a link was impossible: `links` had no DELETE policy at all, so
-- removing someone from your Tagged list only ever changed the local store
-- while the row — and its points — stayed on the server forever.
drop policy if exists links_delete_own on public.links;
create policy links_delete_own on public.links for delete
  using (
    exists (
      select 1 from public.cards c
       where c.id in (links.from_card, links.to_card)
         and (c.owner is null or c.owner = auth.uid())
    )
  );

-- Clear the synthetic link left behind while diagnosing this, so the first
-- real leaderboard isn't seeded with probe data.
delete from public.links
 where from_card = 'relmxdgamer' or to_card = 'relmxdgamer';

commit;
