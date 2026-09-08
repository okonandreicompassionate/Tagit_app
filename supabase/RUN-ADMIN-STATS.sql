-- ============================================================================
-- Tagit — the function the ops dashboard's Database page needs.  RUN THIS.
-- ============================================================================
-- Paste the whole thing into the Supabase SQL editor and press Run once.
-- Safe to run again later — every statement replaces or grants rather than
-- creating something that already exists.
--
-- Depends on nothing you haven't already applied: `friendships` and `boosts`
-- (both referenced in the row-count query near the bottom) are already live
-- in your database from earlier migrations. This file only adds one new
-- function on top of what's there — it does not touch or re-run anything
-- else, so it can't hit the earlier index errors.
--
-- What it does: gives dashboard/app/api/metrics/db a single function to call
-- that returns database size, table sizes, row counts, connection counts, and
-- the slowest queries (if pg_stat_statements is on) — all of it read from
-- Postgres catalogs that anon/authenticated were never meant to see. That's
-- why it's security definer and granted to service_role only: nothing in the
-- Expo app, and no key that ships inside it, can ever call this.
-- ============================================================================

begin;

create or replace function public.admin_db_stats()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
declare
  result jsonb;
  slow_queries jsonb;
  table_sizes jsonb;
  row_counts jsonb;
begin
  -- pg_stat_statements may not be enabled on every project. Degrade to null
  -- rather than fail the whole call — the rest of the stats are still useful
  -- without it, and the dashboard shows a clear "not enabled" message rather
  -- than an error when this happens.
  begin
    select jsonb_agg(row_to_json(t))
      into slow_queries
      from (
        select
          left(query, 140)                as query,
          calls,
          round(mean_exec_time::numeric, 2) as avg_ms,
          round(total_exec_time::numeric, 2) as total_ms
        from pg_stat_statements
        where query not ilike '%pg_stat_statements%'
        order by mean_exec_time desc
        limit 8
      ) t;
  exception
    when undefined_table then
      slow_queries := null;
    when insufficient_privilege then
      slow_queries := null;
  end;

  -- Size of the ten heaviest tables, own schema only.
  select jsonb_agg(row_to_json(t))
    into table_sizes
    from (
      select
        relname                                                  as table_name,
        pg_total_relation_size(c.oid)                             as total_bytes,
        pg_relation_size(c.oid)                                   as table_bytes,
        pg_total_relation_size(c.oid) - pg_relation_size(c.oid)   as index_bytes
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc
      limit 10
    ) t;

  -- Row counts for the tables the dashboard cares about. Exact counts, not
  -- the catalog's planner estimate — these tables are small enough that a
  -- real count is cheap, and an admin page should not show a number that
  -- might be wrong.
  select jsonb_build_object(
           'cards',          (select count(*) from public.cards),
           'events',         (select count(*) from public.events),
           'links',          (select count(*) from public.links),
           'checkins',       (select count(*) from public.checkins),
           'friendships',    (select count(*) from public.friendships),
           'boosts_paid',    (select count(*) from public.boosts where status = 'paid'),
           'boosts_pending', (select count(*) from public.boosts where status = 'pending')
         )
    into row_counts;

  select jsonb_build_object(
           'database_bytes',    pg_database_size(current_database()),
           'active_connections', (
             select count(*) from pg_stat_activity
              where datname = current_database()
           ),
           'max_connections', (
             select setting::int from pg_settings where name = 'max_connections'
           ),
           'table_sizes',                coalesce(table_sizes, '[]'::jsonb),
           'row_counts',                 row_counts,
           'slow_queries',               slow_queries,
           'pg_stat_statements_enabled', (slow_queries is not null),
           'measured_at',                now()
         )
    into result;

  return result;
end;
$$;

-- service_role only. Not anon, not authenticated — the whole point is that
-- nothing shipped inside the app can ever call this.
revoke all on function public.admin_db_stats() from public, anon, authenticated;
grant execute on function public.admin_db_stats() to service_role;

commit;
