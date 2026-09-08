-- Tagit — restore check-in writes, which the previous migration broke.
--
-- Reproducing the app's exact request against the live database returned:
--
--   401  permission denied for table checkins
--   hint: GRANT UPDATE ON public.checkins TO anon;
--
-- Cause: the app upserts a check-in (`on_conflict=card_id,event_id` with
-- `resolution=merge-duplicates`) so that someone who joined by typing a code
-- and later scans the door is *upgraded* to verified rather than gaining a
-- second row. PostgREST implements upsert as INSERT ... ON CONFLICT DO UPDATE,
-- and Postgres requires the table-level UPDATE privilege for that — a
-- column-level grant is not enough. The previous migration replaced the table
-- grant with `grant update (method)`, which silently disabled every check-in.
--
-- Lesson worth keeping: the column-grant pattern is right for columns the
-- server owns (swag, boost placement), but it cannot be applied to a table the
-- client upserts into.

begin;

-- Every column here is already safe for the client to write: card_id and
-- event_id are the conflict target, and method is the only mutable field.
-- RLS still decides *which* rows, which is where the real restriction lives.
grant update on public.checkins to anon, authenticated;

-- Deleting a link was impossible: `links` had no DELETE policy at all, so
-- removing someone from your Tagged list only ever changed the local store
-- while the row — and its points — stayed on the server forever.
drop policy if exists links_delete_own on public.links;
create policy links_delete_own on public.links for delete
  using (
    exists (
      select 1 from public.cards c
       where c.id in (links.from_card, links.to_card)
         and (c.owner is null or c.owner = auth.uid())
    )
  );

-- Clear the synthetic link left behind while diagnosing this, so the first
-- real leaderboard isn't seeded with probe data.
delete from public.links
 where from_card = 'relmxdgamer' or to_card = 'relmxdgamer';

commit;
