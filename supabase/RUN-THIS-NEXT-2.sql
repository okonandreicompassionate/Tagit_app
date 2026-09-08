-- ============================================================================
-- Tagit — the last three fixes.  RUN THIS.
-- ============================================================================
-- Verifying the live database after the last paste found three things. Two are
-- real bugs, one is a gap left when the earlier combined file rolled back.
--
-- Standalone and idempotent, like the last one. Re-runs nothing older.
-- ============================================================================

begin;

/* ---------- 1. check-in is still dead ---------- */

-- The grant that fixes this was inside the combined file that rolled back, so
-- it never applied. Right now every check-in fails:
--
--   401  new row violates row-level security policy for table "checkins"
--
-- The app upserts a check-in so that someone who typed the event code and
-- later scans the door is *upgraded* to verified rather than counted twice.
-- PostgREST implements that as INSERT ... ON CONFLICT DO UPDATE, which needs
-- the table-level UPDATE privilege — a column grant is not enough.
grant update on public.checkins to anon, authenticated;

drop policy if exists checkins_insert on public.checkins;
create policy checkins_insert on public.checkins for insert with check (true);

drop policy if exists checkins_update_own on public.checkins;
create policy checkins_update_own on public.checkins for update
  using (true) with check (true);

/* ---------- 2. links could never be deleted ---------- */

-- `links` had no DELETE policy, so "remove from Tagged" only ever changed the
-- phone while the row — and its points — stayed on the server forever.
drop policy if exists links_delete_own on public.links;
create policy links_delete_own on public.links for delete
  using (
    exists (select 1 from public.cards c
             where c.id in (links.from_card, links.to_card)
               and (c.owner is null or c.owner = auth.uid()))
  );

/* ---------- 3. the mirror blocked the reciprocal scan ---------- */

-- Found by testing the actual flow: tolu scans dami, then dami scans tolu, and
-- the second scan is rejected with 409.
--
-- Why: when tolu scans dami, the mirror trigger writes a (dami → tolu) row so
-- both sides own the link. That row occupies the one slot the daily unique
-- index allows for (dami, tolu, today) — so when dami genuinely scans tolu,
-- the real scan is refused and the friendship is never promoted to accepted.
--
-- Mutual scanning is the core of the whole friends model, and my own mirror
-- was preventing it.
--
-- Fix: the cap is per direction. A mirrored 'scanned_by' and a real 'scanned'
-- are different facts and may coexist for the same pair on the same day —
-- while re-scanning the same person twice in a day is still capped, which is
-- what the index is for.

drop index if exists public.links_pair_per_day;
create unique index links_pair_per_day
  on public.links (from_card, to_card, direction, (((created_at at time zone 'UTC'))::date));

-- With the cap now per direction, one meeting could be scored twice: once for
-- the mirror and again for the real scan. So a real scan supersedes the mirror
-- it would otherwise duplicate — the mirror was only ever a stand-in for a
-- scan that hadn't happened yet.
create or replace function public.mirror_link() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  reciprocal_points integer;
  today date := (new.created_at at time zone 'UTC')::date;
begin
  if new.direction = 'scanned' then
    -- This person really scanned back. Drop the placeholder written when the
    -- other side scanned them, so the meeting is scored once each way.
    delete from public.links
     where from_card = new.from_card
       and to_card   = new.to_card
       and direction = 'scanned_by'
       and (created_at at time zone 'UTC')::date = today
       and id <> new.id;

    -- Don't mirror onto a real scan the other person already made.
    if exists (
      select 1 from public.links l
       where l.from_card = new.to_card
         and l.to_card   = new.from_card
         and l.direction = 'scanned'
         and (l.created_at at time zone 'UTC')::date = today
    ) then
      return null;
    end if;

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
      values (new.to_card, new.from_card, new.event_id, 'scanned_by',
              reciprocal_points, new.created_at);
    exception
      when unique_violation then null;
    end;
  end if;

  return null;
end;
$$;

/* ---------- 4. clear the rows left by testing ---------- */

delete from public.links
 where from_card in ('tolu', 'dami', 'zeek', 'relmxdgamer')
    or to_card   in ('tolu', 'dami', 'zeek', 'relmxdgamer');

delete from public.friendships
 where card_a in ('tolu', 'dami', 'zeek', 'relmxdgamer')
    or card_b in ('tolu', 'dami', 'zeek', 'relmxdgamer');

-- The triggers recompute swag on delete, but do it explicitly so nothing is
-- left over from a row that was removed before the trigger existed.
update public.cards c
   set swag = coalesce((select sum(l.points) from public.links l
                         where l.from_card = c.id), 0)
            + coalesce((select count(*) * 20 from public.checkins k
                         where k.card_id = c.id and k.method = 'qr'), 0);

commit;
