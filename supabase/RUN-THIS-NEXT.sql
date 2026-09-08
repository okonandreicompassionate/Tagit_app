-- ============================================================================
-- Tagit — accounts, friends, guest lists, artwork.  RUN THIS ONE.
-- ============================================================================
-- Standalone on purpose. Everything before this is already applied to your
-- project, and re-running it is what produced the "non-immutable" error — so
-- this file touches no existing index and re-creates no earlier table.
--
-- Safe to run more than once.
-- ============================================================================

begin;

/* ---------- 1. repair the daily-cap index if it's the unsafe kind ---------- */

-- `created_at::date` on a timestamptz depends on the server's TimeZone
-- setting, which makes it STABLE rather than IMMUTABLE — and Postgres is
-- entitled to refuse it in an index. It was accepted here, but it is the only
-- expression index in the schema and therefore the only candidate for that
-- error, so this rebuilds it with an explicitly immutable form.
--
-- Runs only if the current definition is the unsafe one; if yours is already
-- fine, this block does nothing.
do $$
declare
  def text;
begin
  select indexdef into def
    from pg_indexes
   where schemaname = 'public' and indexname = 'links_pair_per_day';

  if def is not null and def like '%created_at)::date%' then
    drop index if exists public.links_pair_per_day;
    create unique index links_pair_per_day
      on public.links (from_card, to_card, (((created_at at time zone 'UTC'))::date));
    raise notice 'links_pair_per_day rebuilt with an immutable expression';
  end if;
end $$;

/* ---------- 2. ownership: how "log back in" works ---------- */

drop policy if exists cards_update_own on public.cards;
create policy cards_update_own on public.cards for update
  using (owner is null or owner = auth.uid())
  with check (owner is null or owner = auth.uid());

/* ---------- 3. friends ---------- */

-- One row per pair, stored ordered, so (a,b) and (b,a) can't both exist.
create table if not exists public.friendships (
  card_a     text        not null references public.cards (id) on delete cascade,
  card_b     text        not null references public.cards (id) on delete cascade,
  status     text        not null default 'pending'
                         check (status in ('pending', 'accepted', 'blocked')),
  asked_by   text        not null references public.cards (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (card_a, card_b),
  check (card_a < card_b)
);

create index if not exists friendships_b_idx on public.friendships (card_b);

create or replace function public.request_friendship(a text, b text)
returns void language plpgsql security definer set search_path = public as $$
declare
  lo text := least(a, b);
  hi text := greatest(a, b);
begin
  if a = b then return; end if;

  insert into public.friendships (card_a, card_b, asked_by, status)
  values (lo, hi, a, 'pending')
  on conflict (card_a, card_b) do nothing;

  -- Both sides have scanned each other, which is consent from each of them —
  -- so it becomes a friendship with no accept step and nothing left hanging.
  update public.friendships
     set status = 'accepted', updated_at = now()
   where card_a = lo and card_b = hi
     and status = 'pending'
     and asked_by <> a;
end;
$$;

create or replace function public.link_friendship() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.direction = 'scanned' then
    perform public.request_friendship(new.from_card, new.to_card);
  end if;
  return null;
end;
$$;

drop trigger if exists links_friendship on public.links;
create trigger links_friendship
  after insert on public.links
  for each row execute function public.link_friendship();

alter table public.friendships enable row level security;

drop policy if exists friendships_read_own on public.friendships;
create policy friendships_read_own on public.friendships for select
  using (
    exists (select 1 from public.cards c
             where c.id in (friendships.card_a, friendships.card_b)
               and (c.owner is null or c.owner = auth.uid()))
  );

drop policy if exists friendships_write_own on public.friendships;
create policy friendships_write_own on public.friendships for update
  using (
    exists (select 1 from public.cards c
             where c.id in (friendships.card_a, friendships.card_b)
               and (c.owner is null or c.owner = auth.uid()))
  ) with check (true);

drop policy if exists friendships_delete_own on public.friendships;
create policy friendships_delete_own on public.friendships for delete
  using (
    exists (select 1 from public.cards c
             where c.id in (friendships.card_a, friendships.card_b)
               and (c.owner is null or c.owner = auth.uid()))
  );

/* ---------- 4. private guest lists ---------- */

create table if not exists public.event_invites (
  event_id   text        not null references public.events (id) on delete cascade,
  card_id    text        not null references public.cards (id)  on delete cascade,
  invited_by text        references public.cards (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (event_id, card_id)
);

create index if not exists event_invites_card_idx on public.event_invites (card_id);

alter table public.event_invites enable row level security;

drop policy if exists invites_read on public.event_invites;
create policy invites_read on public.event_invites for select
  using (
    exists (select 1 from public.cards c
             where c.id in (event_invites.card_id, event_invites.invited_by)
               and (c.owner is null or c.owner = auth.uid()))
  );

drop policy if exists invites_write_host on public.event_invites;
create policy invites_write_host on public.event_invites for insert
  with check (
    exists (select 1 from public.events e
              join public.cards c on c.id = e.host_card
             where e.id = event_invites.event_id
               and (c.owner is null or c.owner = auth.uid()))
  );

drop policy if exists invites_delete_host on public.event_invites;
create policy invites_delete_host on public.event_invites for delete
  using (
    exists (select 1 from public.events e
              join public.cards c on c.id = e.host_card
             where e.id = event_invites.event_id
               and (c.owner is null or c.owner = auth.uid()))
  );

-- An invite is what grants visibility, rather than the client filtering a list
-- it could already read.
drop policy if exists events_read on public.events;
create policy events_read on public.events for select
  using (
    visibility = 'public'
    or exists (select 1 from public.cards c
                where c.id = events.host_card
                  and (c.owner is null or c.owner = auth.uid()))
    or exists (select 1 from public.event_invites i
                 join public.cards c on c.id = i.card_id
                where i.event_id = events.id
                  and (c.owner is null or c.owner = auth.uid()))
  );

/* ---------- 5. artwork column ---------- */

alter table public.events add column if not exists artwork text;
grant insert (artwork), update (artwork) on public.events to anon, authenticated;

/* ---------- 6. public profile stats ---------- */

-- Counts only. Lets one person see another's real record without exposing who
-- they met, and runs as owner so it can count rows the caller can't read.
drop view if exists public.card_stats;
create view public.card_stats with (security_invoker = false) as
select
  c.id                                                           as card_id,
  c.swag                                                         as swag,
  count(distinct k.event_id) filter (where k.method = 'qr')::int as verified_events,
  count(distinct l.to_card)::int                                 as people_met,
  max(k.created_at)                                              as last_seen
from public.cards c
left join public.checkins k on k.card_id   = c.id
left join public.links    l on l.from_card = c.id
group by c.id, c.swag;

grant select on public.card_stats to anon, authenticated;

commit;

-- ============================================================================
-- 7. Artwork storage — separate, and allowed to fail
-- ============================================================================
-- Storage lives in a schema the SQL editor may not own. If these statements
-- are refused, everything above still applies; only poster uploads are
-- unavailable, and the bucket can be created from the Storage tab instead.

do $$
begin
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('artwork', 'artwork', true, 5242880,
          array['image/jpeg','image/png','image/webp'])
  on conflict (id) do update
    set public = true,
        file_size_limit = excluded.file_size_limit,
        allowed_mime_types = excluded.allowed_mime_types;
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Could not create the artwork bucket — make it in the Storage tab (public).';
end $$;

do $$
begin
  drop policy if exists artwork_read on storage.objects;
  create policy artwork_read on storage.objects for select using (bucket_id = 'artwork');

  drop policy if exists artwork_write on storage.objects;
  create policy artwork_write on storage.objects for insert with check (bucket_id = 'artwork');

  drop policy if exists artwork_update on storage.objects;
  create policy artwork_update on storage.objects for update using (bucket_id = 'artwork');
exception
  when insufficient_privilege or undefined_table then
    raise notice 'Could not set artwork storage policies — set them in the Storage tab.';
end $$;
