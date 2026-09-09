-- ============================================================================
-- Tagit — the "you were just scanned" popup isn't firing.  RUN THIS ONE.
-- ============================================================================
-- Paste the whole thing into the Supabase SQL editor and press Run once.
--
-- Suspected root cause, same shape as the last two bugs tonight: a migration
-- was written locally to add `links` to the Realtime publication, but it may
-- never have actually been applied to this project. Without that, a scan
-- writes to the database fine, but nothing is ever pushed to the scanned
-- person's phone — the app has no way to find out short of asking again.
--
-- Deliberately NOT re-running the whole original migration file here — a
-- later migration replaced its mirror_link() trigger function with an
-- improved version (day-based dedupe, correct reciprocal pricing), and
-- re-running the older definition from this file would silently regress it.
-- This is only the Realtime half, which nothing since has touched.
--
-- Safe to run again later: both statements are idempotent.

begin;

do $$
begin
  alter publication supabase_realtime add table public.links;
exception
  when duplicate_object then null;
  when undefined_object then
    raise notice 'supabase_realtime publication not found — realtime disabled';
end $$;

-- INSERT already carries the full row either way; this just makes it
-- explicit and keeps UPDATE/DELETE payloads complete too.
alter table public.links replica identity full;

commit;

-- ============================================================================
-- Verify: should return exactly one row (public | links). If it returns
-- nothing, the supabase_realtime publication itself doesn't exist on this
-- project — that's a project-level Realtime setting, not something SQL can
-- fix, and would need checking in Database → Replication in the dashboard.
-- ============================================================================
-- select schemaname, tablename from pg_publication_tables
--  where pubname = 'supabase_realtime' and tablename = 'links';
