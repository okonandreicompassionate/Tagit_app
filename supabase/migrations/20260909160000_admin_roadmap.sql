-- Tagit — storage for the dashboard's Roadmap tab: features you want to
-- build and their status, editable from the admin UI instead of hand-editing
-- docs/ROADMAP.md for anything short-lived or still being decided.
--
-- Fully locked from anon/authenticated — this is an internal ops table, not
-- part of the app's own schema, and nothing in the Expo app or a public key
-- should ever be able to read or write it. Only the dashboard's service-role
-- client touches it, which bypasses RLS entirely regardless of policy —
-- the revoke is what actually matters here, RLS is belt-and-braces.

begin;

create table if not exists public.roadmap_items (
  id          bigserial   primary key,
  title       text        not null check (length(title) between 1 and 120),
  detail      text,
  status      text        not null default 'idea'
                          check (status in ('idea', 'planned', 'building', 'shipped')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists roadmap_items_status_idx on public.roadmap_items (status, created_at desc);

alter table public.roadmap_items enable row level security;
revoke all on public.roadmap_items from anon, authenticated;

commit;
