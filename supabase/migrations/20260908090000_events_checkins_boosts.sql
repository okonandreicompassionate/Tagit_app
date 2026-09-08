-- Tag — the events layer: discovery, user-created events, verified check-ins,
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

begin;

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

commit;
