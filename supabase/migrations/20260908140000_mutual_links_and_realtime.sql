-- Tagit — one scan links both people, and the person who was scanned finds out
-- about it immediately.
--
-- Before this, only the scanner recorded anything: A scanned B, A got B's
-- card, and B never knew. The `scanned_by` direction existed in the model but
-- nothing ever wrote it.
--
-- Two pieces:
--   1. A trigger mirrors every scan, so both sides own the link and both earn
--      from it. Doing it in the database rather than the client matters — the
--      scanner's phone must not be trusted to write rows on someone else's
--      behalf, and B's phone can't write a row for a scan it never saw.
--   2. `links` joins the realtime publication so B's app is told within about
--      a second and can show A's profile without anyone scanning again.

begin;

/* ---------- mirror every scan ---------- */

create or replace function public.mirror_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  reciprocal_points integer;
begin
  -- Only mirror the outward scan. The mirrored row is 'scanned_by', so it
  -- cannot trigger another mirror and recurse.
  if new.direction <> 'scanned' then
    return null;
  end if;

  -- Price the reciprocal server-side. Being scanned by someone new is worth
  -- the same as meeting someone new, because both people were equally there;
  -- a repeat is worth less, exactly as it is for the scanner.
  select case
           when exists (
             select 1 from public.links l
              where l.from_card = new.to_card
                and l.to_card   = new.from_card
                and l.id       <> new.id
           ) then 3
           else 10
         end
    into reciprocal_points;

  begin
    insert into public.links (from_card, to_card, event_id, direction, points, created_at)
    values (new.to_card, new.from_card, new.event_id, 'scanned_by', reciprocal_points, new.created_at);
  exception
    -- Already mirrored today. The daily cap applies to the reciprocal too, and
    -- hitting it must not roll back the scan that caused it.
    when unique_violation then null;
  end;

  return null;
end;
$$;

drop trigger if exists links_mirror on public.links;
create trigger links_mirror
  after insert on public.links
  for each row execute function public.mirror_link();

/* ---------- let the scanned person hear about it ---------- */

-- Realtime respects RLS, and `links_read_own` already limits rows to links
-- where the reader owns one of the two cards. So a client subscribing to this
-- table sees only its own links, never anyone else's graph.
do $$
begin
  alter publication supabase_realtime add table public.links;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication not found — realtime disabled';
end $$;

-- Realtime sends only primary keys on UPDATE/DELETE unless the row is
-- replicated in full. INSERT carries the whole row either way, which is all
-- this feature needs, but setting it makes the payload complete and explicit.
alter table public.links replica identity full;

commit;
