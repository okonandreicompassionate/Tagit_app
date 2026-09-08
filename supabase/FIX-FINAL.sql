-- ============================================================================
-- Tagit — the fix that can't hit the immutable error.  RUN THIS ONE.
-- ============================================================================
-- Nothing from the previous file applied: check-ins still return 401, the
-- reciprocal scan still returns 409, and the friendship table is still empty.
--
-- Both earlier attempts kept an *expression* in an index —
-- `(created_at::date)`, then `((created_at at time zone 'UTC')::date)`. If your
-- Postgres refuses those as non-immutable, no amount of rewriting the
-- expression will help, because the problem is having one at all.
--
-- So this version has no expression index anywhere. The day is stored in an
-- ordinary column, filled by a trigger, and the index is over plain columns —
-- which Postgres cannot object to.
--
-- Idempotent. Re-runs nothing older.
-- ============================================================================

begin;

/* ---------- 1. check-ins (still 401 on the live project) ---------- */

grant update on public.checkins to anon, authenticated;

drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins for insert with check (true);

drop policy if exists checkins_update_own on public.checkins;
create policy checkins_update_own on public.checkins for update
  using (true) with check (true);

drop policy if exists checkins_read_own on public.checkins;
create policy checkins_read_own on public.checkins for select
  using (
    exists (select 1 from public.cards c
             where c.id = checkins.card_id
               and (c.owner is null or c.owner = auth.uid()))
  );

/* ---------- 2. links could never be deleted ---------- */

drop policy if exists links_delete_own on public.links;
create policy links_delete_own on public.links for delete
  using (
    exists (select 1 from public.cards c
             where c.id in (links.from_card, links.to_card)
               and (c.owner is null or c.owner = auth.uid()))
  );

/* ---------- 3. clear test rows BEFORE reindexing ---------- */

-- Done first so the new unique index is built over clean data. A leftover
-- duplicate here would fail the index creation and roll the whole file back.
delete from public.links
 where from_card in ('tolu', 'dami', 'zeek', 'relmxdgamer', 'bigsho', 'amaka')
    or to_card   in ('tolu', 'dami', 'zeek', 'relmxdgamer', 'bigsho', 'amaka');

delete from public.friendships;

/* ---------- 4. the day, as a real column ---------- */

alter table public.links add column if not exists scan_day date;

-- Backfill. `at time zone 'UTC'` is fine in an UPDATE — it is only inside an
-- index that immutability is demanded.
update public.links
   set scan_day = (created_at at time zone 'UTC')::date
 where scan_day is null;

create or replace function public.set_scan_day() returns trigger
language plpgsql set search_path = public as $$
begin
  new.scan_day := (new.created_at at time zone 'UTC')::date;
  return new;
end;
$$;

drop trigger if exists links_scan_day on public.links;
create trigger links_scan_day
  before insert or update of created_at on public.links
  for each row execute function public.set_scan_day();

/* ---------- 5. the cap, over plain columns only ---------- */

-- Per direction, which is the actual fix for mutual scanning: when tolu scans
-- dami, the mirror writes a (dami -> tolu) row. Under the old index that row
-- consumed the single slot for that pair that day, so dami scanning tolu back
-- was rejected — and the friendship never became mutual. A mirrored
-- 'scanned_by' and a real 'scanned' are different facts and may coexist;
-- scanning the same person twice in a day is still capped.
drop index if exists public.links_pair_per_day;
create unique index links_pair_per_day
  on public.links (from_card, to_card, direction, scan_day);

/* ---------- 6. a real scan supersedes its placeholder ---------- */

create or replace function public.mirror_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  reciprocal_points integer;
begin
  if new.direction <> 'scanned' then
    return null;
  end if;

  -- The other side really scanned back, so drop the stand-in written when the
  -- first scan happened. Otherwise one meeting scores twice.
  delete from public.links
   where from_card = new.from_card
     and to_card   = new.to_card
     and direction = 'scanned_by'
     and scan_day  = new.scan_day
     and id       <> new.id;

  -- Don't mirror onto a scan they already made themselves.
  if exists (
    select 1 from public.links l
     where l.from_card = new.to_card
       and l.to_card   = new.from_card
       and l.direction = 'scanned'
       and l.scan_day  = new.scan_day
  ) then
    return null;
  end if;

  select case
           when exists (select 1 from public.links l
                         where l.from_card = new.to_card
                           and l.to_card   = new.from_card
                           and l.id       <> new.id)
           then 3 else 10
         end
    into reciprocal_points;

  begin
    insert into public.links (from_card, to_card, event_id, direction, points, created_at)
    values (new.to_card, new.from_card, new.event_id, 'scanned_by',
            reciprocal_points, new.created_at);
  exception
    when unique_violation then null;
  end;

  return null;
end;
$$;

/* ---------- 7. recompute swag from what's actually left ---------- */

update public.cards c
   set swag = coalesce((select sum(l.points) from public.links l
                         where l.from_card = c.id), 0)
            + coalesce((select count(*) * 20 from public.checkins k
                         where k.card_id = c.id and k.method = 'qr'), 0);

commit;
