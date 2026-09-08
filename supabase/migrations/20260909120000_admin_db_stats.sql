-- Tagit — a function the ops dashboard calls to see database health.
--
-- Everything here needs visibility an ordinary role doesn't have: pg_database
-- and pg_stat_activity aren't readable by anon/authenticated, and shouldn't
-- be — they describe the server, not the app's data. So this is
-- security definer, and it is granted to service_role only. The dashboard's
-- Next.js server calls it with the service key; nothing in the Expo app or
-- any browser-facing key can reach it.
--
-- Idempotent, like every migration in this project.

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
  -- without it.
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
        relname                                          as table_name,
        pg_total_relation_size(c.oid)                     as total_bytes,
        pg_relation_size(c.oid)                           as table_bytes,
        pg_total_relation_size(c.oid) - pg_relation_size(c.oid) as index_bytes
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by pg_total_relation_size(c.oid) desc
      limit 10
    ) t;

  -- Row counts for the tables the dashboard actually cares about. Exact
  -- counts, not the catalog's planner estimate — these tables are small
  -- enough that a real count is cheap, and an admin page should not show a
  -- number that might be wrong.
  select jsonb_build_object(
           'cards',        (select count(*) from public.cards),
           'events',       (select count(*) from public.events),
           'links',        (select count(*) from public.links),
           'checkins',     (select count(*) from public.checkins),
           'friendships',  (select count(*) from public.friendships),
           'boosts_paid',  (select count(*) from public.boosts where status = 'paid'),
           'boosts_pending', (select count(*) from public.boosts where status = 'pending')
         )
    into row_counts;

  select jsonb_build_object(
           'database_bytes',   pg_database_size(current_database()),
           'active_connections', (
             select count(*) from pg_stat_activity
              where datname = current_database()
           ),
           'max_connections', (
             select setting::int from pg_settings where name = 'max_connections'
           ),
           'table_sizes',   coalesce(table_sizes, '[]'::jsonb),
           'row_counts',    row_counts,
           'slow_queries',  slow_queries,
           'pg_stat_statements_enabled', (slow_queries is not null),
           'measured_at',   now()
         )
    into result;

  return result;
end;
$$;

revoke all on function public.admin_db_stats() from public, anon, authenticated;
grant execute on function public.admin_db_stats() to service_role;

commit;
