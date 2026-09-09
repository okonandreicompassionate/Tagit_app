-- Tagit — stop check-in spam by time, and stop link spam by points instead of
-- by blocking the scan.
--
-- Two separate anti-spam rules, previously missing or wrong:
--
--   1. Check-ins had no time gate at all — `checkins_insert` was `with check
--      (true)`, so a QR check-in "worked" whenever the door code existed,
--      days before or after the event. Now: no earlier than 2 hours before
--      `starts_at`, and no later than `ends_at` when a host has set one.
--      Typed codes ('code' method) are exempt — they never claimed
--      attendance, so there's nothing to spam.
--
--   2. Scanning the same person twice in one day was blocked outright by
--      `links_pair_per_day`, a unique index — the second scan's insert just
--      failed (unique_violation), silently, client-side swallowed. That's
--      backwards: two people running into each other twice in a day is
--      real and should still record, it just shouldn't pay twice. Dropped
--      the index; added a trigger that zeroes `points` on a same-day repeat
--      instead of rejecting the row. Enforced server-side rather than
--      trusted from the client, same reasoning as everywhere else `points`
--      gets written.

begin;

/* ---------- 1. check-in window ---------- */

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

/* ---------- 2. same-day repeat scans: zeroed, not blocked ---------- */

drop index if exists public.links_pair_per_day;

create or replace function public.cap_link_points() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Computed directly from created_at rather than trusting new.scan_day,
  -- which a same-named BEFORE trigger may or may not have filled yet
  -- depending on trigger execution order.
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
