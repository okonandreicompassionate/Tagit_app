-- Tagit — public view counts on events.
--
-- Reach, not proof — unlike attendance and swag, a view count proves
-- nothing and isn't meant to. It's a narrow RPC rather than a client-side
-- UPDATE grant on `events` on purpose: that table already has columns
-- (boost_score, boosted_until, sponsored) the client must never write, and
-- this project has twice been bitten by a table-level grant undoing a
-- column-level protection (see migrations 6, 7, 18) — a scoped function
-- sidesteps the whole class of mistake instead of relying on remembering
-- the right grant shape again.
--
-- event_feed and discover_feed are updated in the SAME migration as the
-- column that backs them — event_feed went five days silently showing the
-- wrong thing once already (migration 13) from exactly this being split
-- across two migrations and the second half forgotten.

begin;

alter table public.events
  add column if not exists view_count integer not null default 0 check (view_count >= 0);

create or replace function public.increment_event_view(p_event text)
returns void language sql security definer set search_path = public as $$
  update public.events set view_count = view_count + 1 where id = p_event;
$$;

revoke all on function public.increment_event_view(text) from public;
grant execute on function public.increment_event_view(text) to anon, authenticated;

create or replace view public.event_feed with (security_invoker = false) as
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
  case
    when e.boosted_until is not null and e.boosted_until > now() then e.boost_score
    else 0
  end                                        as boost_score,
  e.boosted_until,
  count(k.id)::int                           as attendee_count,
  e.created_at,
  e.artwork,
  e.view_count
from public.events e
left join public.cards h    on h.id = e.host_card
left join public.checkins k on k.event_id = e.id and k.method = 'qr'
where e.visibility = 'public'
group by e.id, h.nickname, h.name;

grant select on public.event_feed to anon, authenticated;

-- CREATE OR REPLACE FUNCTION cannot change a RETURNS TABLE signature's
-- column list (unlike CREATE OR REPLACE VIEW, which can add columns) —
-- Postgres refuses with "cannot change return type of existing function"
-- since the row type is defined by the OUT parameters. Drop first.
drop function if exists public.discover_feed(text, int, int);

create function public.discover_feed(
  p_viewer text,
  p_offset int default 0,
  p_limit  int default 20
)
returns table (
  id             text,
  name           text,
  code           text,
  type           text,
  description    text,
  location       text,
  city           text,
  starts_at      timestamptz,
  ends_at        timestamptz,
  host_card      text,
  host_name      text,
  visibility     text,
  ticket_url     text,
  cover          text,
  artwork        text,
  sponsored      boolean,
  boost_score    int,
  boosted_until  timestamptz,
  attendee_count int,
  view_count     int,
  created_at     timestamptz,
  friends_going  int,
  rank_score     numeric
)
language sql
stable
security definer
set search_path = public, pg_catalog
as $$
  with viewer_type as (
    select mode() within group (order by e.type) as top_type
    from public.checkins k
    join public.events e on e.id = k.event_id
    where k.card_id = p_viewer and k.method = 'qr'
  ),
  viewer_city as (
    select mode() within group (order by e.city) as top_city
    from public.checkins k
    join public.events e on e.id = k.event_id
    where k.card_id = p_viewer and k.method = 'qr' and e.city is not null
  ),
  viewer_friends as (
    select case when card_a = p_viewer then card_b else card_a end as friend_id
    from public.friendships
    where status = 'accepted' and (card_a = p_viewer or card_b = p_viewer)
  ),
  base as (
    select
      e.*,
      count(distinct k.card_id)::int as computed_attendee_count
    from public.events e
    left join public.checkins k on k.event_id = e.id and k.method = 'qr'
    where e.visibility = 'public'
      and (e.starts_at is null or e.starts_at >= now() - interval '6 hours')
    group by e.id
  )
  select
    b.id, b.name, b.code, b.type, b.description, b.location, b.city,
    b.starts_at, b.ends_at, b.host_card,
    coalesce(h.nickname, h.name)                      as host_name,
    b.visibility, b.ticket_url, b.cover, b.artwork,
    b.sponsored,
    case when b.boosted_until is not null and b.boosted_until > now()
         then b.boost_score else 0 end                as boost_score,
    b.boosted_until,
    b.computed_attendee_count                          as attendee_count,
    b.view_count,
    b.created_at,
    coalesce(friends.n, 0)::int                         as friends_going,

    ( -- 1. paid, unchanged
      (case when b.sponsored then 100000 else 0 end)
      + (case when b.boosted_until is not null and b.boosted_until > now()
              then b.boost_score else 0 end)

      -- 2. friends going — the strongest organic signal available
      + coalesce(friends.n, 0) * 40

      -- 3. event-type affinity from real history
      + (case when vt.top_type is not null and vt.top_type = b.type
              then 15 else 0 end)

      -- 4. same-city affinity
      + (case when vc.top_city is not null and vc.top_city = b.city
              then 10 else 0 end)

      -- 5. starting soon, decaying with distance; past/TBC score flat
      + (case
           when b.starts_at is null then 0
           when b.starts_at < now() then 0
           else greatest(0, 14 - extract(day from b.starts_at - now()))
         end)

      -- 6. new-listing bump, gone after 48h so it can't be gamed by
      --    re-editing an old event to look fresh
      + (case when b.created_at > now() - interval '48 hours' then 8 else 0 end)

      -- 7. popularity, log-scaled and capped
      + least(ln(1 + b.computed_attendee_count) * 3, 15)

      -- 8. already been — it's done, don't keep leading with it
      - (case when exists (
           select 1 from public.checkins k2
            where k2.card_id = p_viewer and k2.event_id = b.id and k2.method = 'qr'
         ) then 25 else 0 end)
    ) as rank_score

  from base b
  left join public.cards h on h.id = b.host_card
  cross join viewer_type vt
  cross join viewer_city vc
  left join lateral (
    select count(distinct f.friend_id) as n
    from viewer_friends f
    where exists (
      select 1 from public.checkins k3
       where k3.card_id = f.friend_id and k3.event_id = b.id
    ) or exists (
      select 1 from public.links l3
       where l3.from_card = f.friend_id and l3.event_id = b.id
    )
  ) friends on true

  order by rank_score desc, b.starts_at asc nulls last, b.id
  offset p_offset
  limit p_limit;
$$;

revoke all on function public.discover_feed(text, int, int) from public;
grant execute on function public.discover_feed(text, int, int) to anon, authenticated;

commit;
