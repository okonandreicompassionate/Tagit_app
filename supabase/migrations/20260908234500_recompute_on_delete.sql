-- ============================================================================
-- Tagit — recompute swag when a link or check-in is deleted.  Minor; not urgent.
-- ============================================================================
-- Found by deleting a link and watching the score stay put: the row goes, the
-- points don't. So "remove from Tagged" leaves the swag it earned behind, and
-- deleted rows keep inflating the leaderboard forever.
--
-- Cause: both recompute triggers read
--
--   coalesce(new.from_card, old.from_card)
--
-- On DELETE, NEW is null. Depending on the Postgres version that either yields
-- NULL — so the update matches no card and silently does nothing, which is
-- what happens here — or raises. Either way the recompute never runs.
--
-- Fix: choose the record from TG_OP rather than hoping coalesce picks it.
--
-- Idempotent.
-- ============================================================================

begin;

create or replace function public.recompute_swag() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target text;
begin
  -- On DELETE the row lives in OLD; on INSERT it lives in NEW. An UPDATE can
  -- move a link between cards, so both ends are recomputed.
  if tg_op = 'DELETE' then
    target := old.from_card;
  else
    target := new.from_card;
  end if;

  perform public.recompute_swag_for(target);

  if tg_op = 'UPDATE' and old.from_card is distinct from new.from_card then
    perform public.recompute_swag_for(old.from_card);
  end if;

  return null;
end;
$$;

create or replace function public.recompute_swag_checkin() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  target text;
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

  return null;
end;
$$;

/* ---------- check-ins could never be deleted either ---------- */

-- Same omission as links: no DELETE policy, so a check-in row is permanent.
-- That also means test rows can't be cleared through the API, which is how a
-- stray check-in ended up on a demo card.
drop policy if exists checkins_delete_own on public.checkins;
create policy checkins_delete_own on public.checkins for delete
  using (
    exists (select 1 from public.cards c
             where c.id = checkins.card_id
               and (c.owner is null or c.owner = auth.uid()))
  );

/* ---------- clear everything left by testing ---------- */

-- The demo cards exist to be scanned in a demo; they should not carry a score
-- from anyone verifying the backend.
delete from public.links
 where from_card in ('bigsho','tolu','zeek','amaka','dami')
    or to_card   in ('bigsho','tolu','zeek','amaka','dami');

delete from public.checkins
 where card_id in ('bigsho','tolu','zeek','amaka','dami');

delete from public.friendships
 where card_a in ('bigsho','tolu','zeek','amaka','dami')
    or card_b in ('bigsho','tolu','zeek','amaka','dami');

/* ---------- give the seeded events real dates ---------- */

-- They were inserted with no start time, so every listing reads "TBC" and the
-- discovery filters have nothing to sort on.
update public.events set starts_at = now() + interval '3 days' + time '19:00'
 where id = 'evt_flytime'   and starts_at is null;
update public.events set starts_at = now() + interval '1 day'  + time '18:00'
 where id = 'evt_unilag'    and starts_at is null;
update public.events set starts_at = now() + interval '9 days' + time '10:00'
 where id = 'evt_techfest'  and starts_at is null;

/* ---------- correct the scores that drifted ---------- */

-- Every card, recomputed from what actually remains. This also clears the
-- points left on the demo cards by testing.
update public.cards c
   set swag = coalesce((select sum(l.points) from public.links l
                         where l.from_card = c.id), 0)
            + coalesce((select count(*) * 20 from public.checkins k
                         where k.card_id = c.id and k.method = 'qr'), 0);

commit;
