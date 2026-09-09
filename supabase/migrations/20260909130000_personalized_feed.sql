-- Tagit — a ranked, paginated discovery feed, personalized per viewer.
--
-- `event_feed` (existing) answers "what's public and upcoming, sorted by who
-- paid." This answers a different question: "what should *this person*
-- specifically see first" — and it's honest about what it's allowed to know.
--
-- The one signal no generic events app can claim: verified friends actually
-- going. Everything below composes around that, in order of how much trust
-- it deserves:
--
--   1. Paid placement       — the existing rule, untouched. Advertisers paid
--                              for the top slot; nothing personal outranks it.
--   2. Friends going         — count of the viewer's ACCEPTED friends with a
--                              real check-in or scan tied to this event. Real
--                              signal, because friendship here only exists
--                              from a mutual scan in the first place.
--   3. What you actually go to — event type, taken from the viewer's own
--                              verified check-in history (mode of type),
--                              same idea as `about.ts`'s topTypes, ported
--                              server-side so it can drive ranking.
--   4. Where you actually are — same idea, by city.
--   5. Starting soon         — a event tonight matters more than one next
--                              month; decays as the date moves further out.
--   6. New listings          — a small, time-limited bump so a fresh event
--                              isn't buried under one with a head start.
--   7. Popularity             — log-scaled and capped, so a few huge events
--                              can't drown out everything else (no
--                              rich-get-richer spiral).
--   8. Already been           — a small penalty once you've verified
--                              attendance; it's done, stop pushing it at you.
--
-- Returns aggregates only (a friend *count*, never who) — the same privacy
-- bar as `card_stats`. security definer is what lets it read across other
-- people's checkins/links/friendships to compute that count; nothing it
-- returns exposes a single row of anyone else's activity.

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
    -- The event type the viewer actually shows up to most, from verified
    -- check-ins only — an unverified "joined by code" says nothing real
    -- about a person's taste.
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
      -- Upcoming, or already underway tonight — not stale.
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

-- Every user calls this for their own feed. Safe to expose: the only thing a
-- caller learns about anyone else is an aggregate count on an event, never a
-- row of who-did-what. `p_viewer` is a public handle, not a secret, the same
-- way `request_friendship(a, b)` already takes explicit ids elsewhere in this
-- schema rather than deriving everything from auth.uid().
revoke all on function public.discover_feed(text, int, int) from public;
grant execute on function public.discover_feed(text, int, int) to anon, authenticated;

commit;
