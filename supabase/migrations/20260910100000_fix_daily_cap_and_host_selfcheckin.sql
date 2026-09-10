-- Tagit — two real bugs found by review, both live right now:
--
--   1. cap_link_points() (20260909150000) zeroed EVERY reciprocal
--      'scanned_by' row, not just same-day repeats. Cause: it matched any
--      other same-day row for the pair, in either direction, with only
--      `l.id <> new.id` to exclude itself — and mirror_link()'s AFTER
--      INSERT trigger inserts the reciprocal row inside the same
--      transaction, with created_at copied verbatim from the original. That
--      original row (already committed, different id) always matched, so
--      the mirror always got zeroed. Net effect: the scanned person never
--      earned points from being scanned, on every single scan since this
--      shipped — not just same-day repeats, defeating the entire "both
--      sides earn" feature from 20260908140000.
--
--      Fix: only same-day rows STRICTLY EARLIER than this one count as a
--      genuine prior meeting. A mirror pair shares its original's exact
--      created_at, so `l.created_at < new.created_at` correctly excludes
--      "this is my own reciprocal" while still catching a real second scan
--      later the same day (which does have a later created_at).
--
--   2. recompute_swag_for() (20260910090000) credited a host who checks
--      into their own event twice: once as verified personal attendance
--      (+20) and again as hosted attendance (+5), netting 25 instead of
--      the intended 20. The host-bonus subquery never excluded the host's
--      own checkin rows.
--
-- Both existing functions are create-or-replace'd in place; no new tables,
-- no data migration beyond a full swag recompute so past self-checkins and
-- same-day scans correct themselves immediately rather than waiting on the
-- next unrelated write.

begin;

create or replace function public.cap_link_points() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.links l
     where (l.created_at at time zone 'UTC')::date =
           (new.created_at at time zone 'UTC')::date
       and l.created_at < new.created_at
       and ((l.from_card = new.from_card and l.to_card = new.to_card)
         or (l.from_card = new.to_card and l.to_card = new.from_card))
       and l.id <> new.id
  ) then
    new.points := 0;
  end if;
  return new;
end;
$$;

create or replace function public.recompute_swag_for(target text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update public.cards c
     set swag = coalesce((
             select sum(l.points) from public.links l where l.from_card = c.id
           ), 0)
           + coalesce((
             select count(*) * 20
               from public.checkins k
              where k.card_id = c.id and k.method = 'qr'
           ), 0)
           + coalesce((
             -- Excludes the host's own checkins now — a host scanning into
             -- their own event is one attendance, not two kinds of it.
             select count(*) * 5
               from public.checkins k
               join public.events e on e.id = k.event_id
              where e.host_card = c.id and k.method = 'qr'
                and k.card_id <> e.host_card
           ), 0),
         updated_at = now()
   where c.id = target;
end;
$$;

-- Corrects every card's swag immediately: past same-day scans that were
-- wrongly zeroed, and past host self-checkins that were double-credited.
select public.recompute_swag_for(id) from public.cards;

commit;
