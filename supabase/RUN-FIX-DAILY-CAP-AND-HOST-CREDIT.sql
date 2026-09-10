-- ============================================================================
-- Tagit — two real scoring bugs, found by review.  RUN THIS ONE.
-- ============================================================================
-- Paste the whole thing into the Supabase SQL editor and press Run once.
--
--   1. The trigger that was supposed to zero same-day REPEAT scans was
--      instead zeroing the reciprocal points on EVERY scan — the scanned
--      person never earned anything, on every scan since the previous
--      migration, not just repeats. Fixed by only counting a same-day row
--      as a genuine prior meeting when it's strictly earlier than this one
--      (a mirrored reciprocal always shares its original's exact
--      timestamp, so this tells the two cases apart).
--   2. A host checking into their own event was credited twice — once as
--      personal attendance, once as hosted attendance (25 points instead
--      of 20). Fixed by excluding the host's own checkins from their host
--      bonus.
--
-- Checked live: the links table is currently empty, so there's no
-- historical data to repair — this just stops it from happening going
-- forward. The trailing recompute is there in case that's changed by the
-- time you run this.
--
-- Safe to run again later: both are create-or-replace.

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

select public.recompute_swag_for(id) from public.cards;

commit;
