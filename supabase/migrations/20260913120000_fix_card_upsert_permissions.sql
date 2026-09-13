-- Tagit — registration was silently broken for anyone without a session.
--
-- Confirmed live: POSTing a new card with only the anon key (exactly what
-- happens whenever anonymous sign-in is unavailable — disabled in the
-- dashboard, rate-limited, a network hiccup during the auth call) returns
-- 42501 "permission denied for table cards", hinting at a missing
-- table-level UPDATE grant. That's `saveCard()`'s upsert
-- (`cards?on_conflict=id`, `Prefer: resolution=merge-duplicates`) hitting
-- Postgres's `ON CONFLICT DO UPDATE` privilege check, which needs
-- table-level UPDATE — a column-level grant does not satisfy it, the same
-- lesson already learned once for `checkins` and never carried over to
-- `cards` when 20260908160000 locked cards.swag down.
--
-- That migration's actual goal — a client can't write its own swag — is
-- still worth keeping. It just used the wrong tool: column privileges,
-- which are fundamentally incompatible with an upsert path. A trigger that
-- unconditionally restores the server's own value doesn't have that
-- problem, so this restores full table grants and moves the protection
-- there instead.
--
-- This is very likely the actual cause of the friend's card that never
-- reached the server earlier this session — not a network blip, this bug,
-- happening every time anonymous sign-in wasn't available at that moment.

begin;

grant insert, update on public.cards to anon, authenticated;

create or replace function public.protect_card_swag() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    -- A brand new card starts at 0 regardless of what the client sends —
    -- swag is earned through links/checkins, never claimed at signup.
    new.swag := 0;
  else
    -- Server-recomputed only, via recompute_swag_for(). Whatever the client
    -- sent for this column on an update is discarded, not merged.
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
