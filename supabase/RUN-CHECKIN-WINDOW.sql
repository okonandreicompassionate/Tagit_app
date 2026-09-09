-- ============================================================================
-- Tagit — check-in time window + same-day scan points.  RUN THIS ONE.
-- ============================================================================
-- Paste the whole thing into the Supabase SQL editor and press Run once.
--
--   1. QR check-ins now only count from 2 hours before an event's start
--      time through its end time (if the host set one) — closes the "check
--      in whenever" spam hole. Typed codes are unaffected.
--   2. Scanning the same person twice in one day used to be blocked
--      outright (a unique index made the second scan's insert silently
--      fail). Now it's allowed and just worth 0 points the second time —
--      real meetings still record, they just don't pay twice.
--
-- Safe to run again later: every statement replaces, drops-if-exists, or
-- creates-or-replaces.

begin;

drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins for insert
  with check (
    method <> 'qr'
    or exists (
      select 1 from public.events e
       where e.id = checkins.event_id
         and (e.starts_at is null or now() >= e.starts_at - interval '2 hours')
         and (e.ends_at   is null or now() <= e.ends_at)
    )
  );

drop index if exists public.links_pair_per_day;

create or replace function public.cap_link_points() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.links l
     where (l.created_at at time zone 'UTC')::date =
           (new.created_at at time zone 'UTC')::date
       and ((l.from_card = new.from_card and l.to_card = new.to_card)
         or (l.from_card = new.to_card and l.to_card = new.from_card))
       and l.id <> new.id
  ) then
    new.points := 0;
  end if;
  return new;
end;
$$;

drop trigger if exists links_cap_points on public.links;
create trigger links_cap_points
  before insert on public.links
  for each row execute function public.cap_link_points();

commit;
