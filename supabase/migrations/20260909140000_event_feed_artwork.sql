-- Tagit — event_feed was missing `artwork`.
--
-- The view was created before `artwork` existed on `events` (added a
-- migration later) and nothing ever brought it back in. Every screen that
-- reads through this view — the Events list, and the swipe feed for anyone
-- signed out — has been rendering the generated gradient instead of real
-- event artwork, even for events that have artwork uploaded. `discover_feed`
-- was unaffected: it reads `events` directly, not this view.
--
-- Appending the column at the end (not reordering) is required — Postgres
-- only lets CREATE OR REPLACE VIEW add columns, never move or remove one.

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
