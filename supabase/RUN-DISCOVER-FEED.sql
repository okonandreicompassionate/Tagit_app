-- ============================================================================
-- Tagit — the personalized, ranked, infinite-scroll feed.  RUN THIS ONE.
-- ============================================================================
-- Paste the whole thing into the Supabase SQL editor and press Run once.
-- The app has been calling public.discover_feed() since v2.1, but this
-- function was only ever written to a migration file locally — it was never
-- actually applied here, so every call has been failing with PGRST202
-- ("function not found"). This is that migration, safe to run as-is.
--
-- Safe to run again later: create or replace, plus a revoke-then-grant, so
-- re-running just puts the same function back rather than erroring.

begin;

create or replace function public.discover_feed(
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
    b.created_at,
    coalesce(friends.n, 0)::int                         as friends_going,

    (
      (case when b.sponsored then 100000 else 0 end)
      + (case when b.boosted_until is not null and b.boosted_until > now()
              then b.boost_score else 0 end)
      + coalesce(friends.n, 0) * 40
      + (case when vt.top_type is not null and vt.top_type = b.type
              then 15 else 0 end)
      + (case when vc.top_city is not null and vc.top_city = b.city
              then 10 else 0 end)
      + (case
           when b.starts_at is null then 0
           when b.starts_at < now() then 0
           else greatest(0, 14 - extract(day from b.starts_at - now()))
         end)
      + (case when b.created_at > now() - interval '48 hours' then 8 else 0 end)
      + least(ln(1 + b.computed_attendee_count) * 3, 15)
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

-- ============================================================================
-- Verify: replace the zero-id with a real card id from your `cards` table
-- (or leave it — an unknown viewer still returns events, just with
-- friends_going always 0). You should get rows back, not an error.
-- ============================================================================
-- select id, name, friends_going, rank_score from public.discover_feed('00000000-0000-0000-0000-000000000000', 0, 5);
