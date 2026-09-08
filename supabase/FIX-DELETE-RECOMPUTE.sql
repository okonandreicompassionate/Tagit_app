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

/* ---------- correct the scores that drifted ---------- */

-- Every card, recomputed from what actually remains. This also clears the
-- points left on the demo cards by testing.
update public.cards c
   set swag = coalesce((select sum(l.points) from public.links l
                         where l.from_card = c.id), 0)
            + coalesce((select count(*) * 20 from public.checkins k
                         where k.card_id = c.id and k.method = 'qr'), 0);

commit;
