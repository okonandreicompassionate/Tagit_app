-- ============================================================================
-- Tagit — correct the seeded event times.  Cosmetic, 5 seconds.
-- ============================================================================
-- My mistake in the last file:
--
--   now() + interval '3 days' + time '19:00'
--
-- `+ time '19:00'` adds nineteen *hours* to whatever the clock happens to say,
-- rather than setting the time of day. Run at 07:22 it produced 02:22 the
-- following morning — so Lagos Tech Fest is currently listed at 2am.
--
-- date_trunc drops to midnight first, so the time is then set rather than
-- accumulated.
-- ============================================================================

begin;

update public.events
   set starts_at = date_trunc('day', now() + interval '3 days') + time '19:00'
 where id = 'evt_flytime';

update public.events
   set starts_at = date_trunc('day', now() + interval '1 day') + time '18:00'
 where id = 'evt_unilag';

update public.events
   set starts_at = date_trunc('day', now() + interval '9 days') + time '10:00'
 where id = 'evt_techfest';

commit;
