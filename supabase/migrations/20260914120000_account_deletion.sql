-- Tagit — real in-app account deletion.
--
-- Apple requires it, and it's the honest counterpart to "your card follows
-- you". Adapted from the draft at docs/planned/v3/safety-schema.sql: that
-- version also cleans up `blocks` and `reports`, which don't exist yet
-- (block/report ships separately as v3 item 2) — this one is trimmed to the
-- tables actually live today. Extend it with those two deletes when that
-- lands.

begin;

/**
 * Deletes everything belonging to the caller. Runs as definer because the
 * cascade reaches rows the caller cannot address directly — their links from
 * both sides, their check-ins, their friendships. It authorises off
 * auth.uid(), so it can only ever delete the caller's own account.
 */
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  me_id text;
begin
  select id into me_id from public.cards where owner = auth.uid() limit 1;
  if me_id is null then
    raise exception 'no card for this account' using errcode = 'no_data_found';
  end if;

  delete from public.links         where from_card = me_id or to_card = me_id;
  delete from public.checkins      where card_id = me_id;
  delete from public.friendships   where card_a = me_id or card_b = me_id;
  delete from public.event_invites where card_id = me_id;

  -- Events they hosted go too: an event with no host is unmoderated. (The FK
  -- would only null host_card out, which isn't enough on its own.)
  delete from public.events where host_card = me_id;

  delete from public.cards where id = me_id;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

commit;
