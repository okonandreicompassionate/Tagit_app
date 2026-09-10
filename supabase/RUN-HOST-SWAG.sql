-- ============================================================================
-- Tagit — hosts earn swag from their event's attendance.  RUN THIS ONE.
-- ============================================================================
-- Paste the whole thing into the Supabase SQL editor and press Run once.
-- Safe to run again later: create-or-replace throughout, and the backfill
-- at the bottom is idempotent (recomputing from scratch each time).
--
-- The more people scan into your event, the more it adds to your own swag —
-- hosting well is its own kind of popularity, not just the thing that lets
-- other people earn points. Previously `recompute_swag_for()` only summed a
-- card's own links and check-ins; nothing credited the host of an event for
-- checkins they didn't personally make.
--
-- Rate is deliberately a fraction of POINTS.checkIn (20), not the same
-- number — crediting the host the full 20 per attendee would let one big
-- event trivially dominate the leaderboard over months of someone else's
-- real personal scanning. 5 mirrors src/lib/swag.ts's POINTS.hostedAttendee;
-- both must move together, same convention as the existing checkIn mirror
-- below.

begin;

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
           ), 0)
           + coalesce((
             -- Verified check-ins at events this card hosts. 5 mirrors
             -- POINTS.hostedAttendee in src/lib/swag.ts.
             select count(*) * 5
               from public.checkins k
               join public.events e on e.id = k.event_id
              where e.host_card = c.id and k.method = 'qr'
           ), 0),
         updated_at = now()
   where c.id = target;
end;
$$;

-- Extended, not replaced from scratch: keeps the TG_OP-based DELETE fix from
-- 20260908234500_recompute_on_delete.sql, adds a recompute for the event's
-- host alongside the check-in owner's own.
create or replace function public.recompute_swag_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target text;
  host   text;
begin
  if tg_op = 'DELETE' then
    target := old.card_id;
  else
    target := new.card_id;
  end if;

  perform public.recompute_swag_for(target);

  if tg_op = 'UPDATE' and old.card_id is distinct from new.card_id then
    perform public.recompute_swag_for(old.card_id);
  end if;

  select e.host_card into host
    from public.events e
   where e.id = coalesce(new.event_id, old.event_id);

  if host is not null and host <> target then
    perform public.recompute_swag_for(host);
  end if;

  return null;
end;
$$;

-- Backfill: hosts with existing attendance before this migration pick up
-- their credit immediately rather than waiting on the next check-in.
select public.recompute_swag_for(id) from public.cards;

commit;
