-- Tagit — real accounts, friends, private guest lists, and event artwork.
--
-- The lockout this fixes: a card lived only in phone storage with
-- `owner = null`, so losing the local copy meant onboarding ran again, found
-- your own handle already taken, and refused you entry to your own account.
-- Ownership now comes from a signed-in user id, and claiming a handle you
-- already own is how you get back in.

begin;

/* ---------- ownership ---------- */

-- Reclaiming an unowned card is what "log back in" means for everyone who
-- signed up before accounts existed. Once owned, only the owner may write it.
drop policy if exists cards_update_own on public.cards;
create policy cards_update_own on public.cards for update
  using (owner is null or owner = auth.uid())
  -- After the write the card must belong to the writer: an anonymous client
  -- can still edit an unclaimed card, but a signed-in one always takes
  -- ownership rather than leaving it dangling for the next person.
  with check (owner is null or owner = auth.uid());

/* ---------- friends ---------- */

-- One row per pair, stored ordered so (a,b) and (b,a) can't both exist and a
-- lookup never has to check both directions.
create table if not exists public.friendships (
  card_a     text        not null references public.cards (id) on delete cascade,
  card_b     text        not null references public.cards (id) on delete cascade,
  -- A scan creates the pair as 'pending'; either side accepting makes it real.
  status     text        not null default 'pending'
                         check (status in ('pending', 'accepted', 'blocked')),
  -- Who scanned whom, so the other side knows whose request to accept.
  asked_by   text        not null references public.cards (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (card_a, card_b),
  check (card_a < card_b)
);

create index if not exists friendships_b_idx on public.friendships (card_b);

/**
 * Order-independent upsert. Callers pass the pair in any order and this
 * normalises it, so no caller has to remember the ordering rule.
 */
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

  -- Both sides have now scanned each other, which is consent from each of
  -- them — no accept step needed, and no request left hanging.
  update public.friendships
     set status = 'accepted', updated_at = now()
   where card_a = lo and card_b = hi
     and status = 'pending'
     and asked_by <> a;
end;
$$;

-- A scan is a friend request. Mutual scans become a friendship outright.
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
    exists (
      select 1 from public.cards c
       where c.id in (friendships.card_a, friendships.card_b)
         and (c.owner is null or c.owner = auth.uid())
    )
  );

drop policy if exists friendships_write_own on public.friendships;
create policy friendships_write_own on public.friendships for update
  using (
    exists (
      select 1 from public.cards c
       where c.id in (friendships.card_a, friendships.card_b)
         and (c.owner is null or c.owner = auth.uid())
    )
  ) with check (true);

drop policy if exists friendships_delete_own on public.friendships;
create policy friendships_delete_own on public.friendships for delete
  using (
    exists (
      select 1 from public.cards c
       where c.id in (friendships.card_a, friendships.card_b)
         and (c.owner is null or c.owner = auth.uid())
    )
  );

/* ---------- private guest lists ---------- */

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
    exists (
      select 1 from public.cards c
       where c.id in (event_invites.card_id, event_invites.invited_by)
         and (c.owner is null or c.owner = auth.uid())
    )
  );

drop policy if exists invites_write_host on public.event_invites;
create policy invites_write_host on public.event_invites for insert
  with check (
    exists (
      select 1 from public.events e
        join public.cards c on c.id = e.host_card
       where e.id = event_invites.event_id
         and (c.owner is null or c.owner = auth.uid())
    )
  );

drop policy if exists invites_delete_host on public.event_invites;
create policy invites_delete_host on public.event_invites for delete
  using (
    exists (
      select 1 from public.events e
        join public.cards c on c.id = e.host_card
       where e.id = event_invites.event_id
         and (c.owner is null or c.owner = auth.uid())
    )
  );

-- Private events become visible to their guests, not just their host.
drop policy if exists events_read on public.events;
create policy events_read on public.events for select
  using (
    visibility = 'public'
    or exists (
      select 1 from public.cards c
       where c.id = events.host_card and (c.owner is null or c.owner = auth.uid())
    )
    or exists (
      select 1 from public.event_invites i
        join public.cards c on c.id = i.card_id
       where i.event_id = events.id
         and (c.owner is null or c.owner = auth.uid())
    )
  );

/* ---------- artwork ---------- */

-- The feed is artwork-led; without this it's a list with extra scrolling.
alter table public.events add column if not exists artwork text;

grant insert (artwork), update (artwork) on public.events to anon, authenticated;

/* ---------- public profile stats ---------- */

-- Lets one person see another's real record — nights out, people met — without
-- exposing who they met. Aggregates only, and it runs as owner so it can count
-- rows the caller can't read.
drop view if exists public.card_stats;
create view public.card_stats with (security_invoker = false) as
select
  c.id                                                          as card_id,
  c.swag                                                        as swag,
  count(distinct k.event_id) filter (where k.method = 'qr')::int as verified_events,
  count(distinct l.to_card)::int                                as people_met,
  max(k.created_at)                                             as last_seen
from public.cards c
left join public.checkins k on k.card_id  = c.id
left join public.links    l on l.from_card = c.id
group by c.id, c.swag;

grant select on public.card_stats to anon, authenticated;

commit;

-- ============================================================================
-- Artwork storage
-- ============================================================================
-- The feed needs images, and they have to live somewhere public: an event
-- poster is shown to people who may not be signed in, so a signed URL that
-- expires would break the feed rather than protect anything.

begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('artwork', 'artwork', true, 5242880,
        array['image/jpeg','image/png','image/webp'])
on conflict (id) do update
  set public = true,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists artwork_read on storage.objects;
create policy artwork_read on storage.objects for select
  using (bucket_id = 'artwork');

drop policy if exists artwork_write on storage.objects;
create policy artwork_write on storage.objects for insert
  with check (bucket_id = 'artwork');

drop policy if exists artwork_update on storage.objects;
create policy artwork_update on storage.objects for update
  using (bucket_id = 'artwork');

commit;
