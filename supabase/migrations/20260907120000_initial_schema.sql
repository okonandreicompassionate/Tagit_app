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
-- The date expression is pinned to UTC because casting a timestamptz to a
-- date depends on the server's TimeZone setting, which makes it STABLE rather
-- than IMMUTABLE — and Postgres may refuse a non-immutable index expression.
create unique index if not exists links_pair_per_day
  on public.links (from_card, to_card, (((created_at at time zone 'UTC'))::date));

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
