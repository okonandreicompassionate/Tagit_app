-- ============================================================================
-- Tagit — registration silently broken for anyone without a session.  RUN THIS ONE.
-- ============================================================================
-- Paste the whole thing into the Supabase SQL editor and press Run once.
--
-- Confirmed live: creating a new card fails with 42501 "permission denied
-- for table cards" whenever the request has no real session (anonymous
-- sign-in disabled, rate-limited, or briefly unavailable) — the upsert
-- saveCard() uses needs a table-level UPDATE grant, and cards.swag was
-- locked down to column-level grants only, which don't satisfy that. This
-- restores the table grant and moves the "client can't set its own swag"
-- protection to a trigger instead, which doesn't have that problem.
--
-- IMPORTANT — this alone is not enough. Also go to:
--   Supabase Dashboard → Authentication → Sign In / Providers → Anonymous
-- and make sure it's switched ON. It's currently OFF, confirmed live —
-- that's the immediate cause of every signup failing right now. This SQL
-- fixes the part that would still be broken even with it back on.
--
-- Safe to run again later: create-or-replace, drop-if-exists throughout.

begin;

grant insert, update on public.cards to anon, authenticated;

create or replace function public.protect_card_swag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.swag := 0;
  else
    new.swag := old.swag;
  end if;
  return new;
end;
$$;

drop trigger if exists cards_protect_swag on public.cards;
create trigger cards_protect_swag
  before insert or update on public.cards
  for each row execute function public.protect_card_swag();

commit;

-- ============================================================================
-- Verify: this should succeed and return a row (previously failed 42501).
-- Delete the test row after with:
--   delete from public.cards where id = 'diag_test_regonly';
-- ============================================================================
-- select * from public.cards where id = 'diag_test_regonly';
