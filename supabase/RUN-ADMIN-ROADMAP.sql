-- ============================================================================
-- Tagit — storage for the dashboard's Roadmap tab.  RUN THIS ONE.
-- ============================================================================
-- Paste the whole thing into the Supabase SQL editor and press Run once.
-- Locked from anon/authenticated entirely — only the dashboard's
-- service-role client (never the Expo app, never a public key) touches it.
--
-- Safe to run again later: create-if-not-exists throughout.

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
