-- ============================================================================
-- Tagit — event banners weren't showing.  RUN THIS ONE.
-- ============================================================================
-- Paste the whole thing into the Supabase SQL editor and press Run once.
--
-- Root cause: the `event_feed` view was created before `artwork` existed as
-- a column on `events`, and nothing ever added it back into the view. Every
-- screen that reads through event_feed — the Events list, and the swipe feed
-- for anyone signed out — has been showing the generated gradient instead of
-- real artwork, even for events that have artwork uploaded (two of yours do,
-- right now, and neither is showing). The personalized swipe feed
-- (discover_feed) was never affected — it reads the events table directly.
--
-- Safe to run again later: create or replace, so re-running just puts the
-- same view back.

begin;

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
  e.artwork
from public.events e
left join public.cards h    on h.id = e.host_card
left join public.checkins k on k.event_id = e.id and k.method = 'qr'
where e.visibility = 'public'
group by e.id, h.nickname, h.name;

grant select on public.event_feed to anon, authenticated;

commit;

-- ============================================================================
-- Verify: this should now return real URLs for the two events that have
-- artwork (evt_a4073433d6c9, evt_c22429e0d990), not null.
-- ============================================================================
-- select id, name, artwork from public.event_feed order by created_at desc limit 5;
