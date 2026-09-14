-- Tagit — storage for the dashboard's "AI Context" tab: a long-form written
-- briefing, kept current, that a fresh AI session (or a new human) could
-- read cold and understand the project — what it is, how it's built, what's
-- actually done vs still open, what NOT to redo. The point is continuity
-- surviving a lost conversation, not documentation for its own sake.
--
-- Single mutable row rather than a list like roadmap_items — this is one
-- living document, not a set of items. Fully locked from anon/authenticated,
-- same reasoning as roadmap_items: an internal ops table, only the
-- dashboard's service-role client ever touches it.

begin;

create table if not exists public.ai_context (
  id         text        primary key default 'main' check (id = 'main'),
  content    text        not null default '',
  updated_at timestamptz not null default now()
);

alter table public.ai_context enable row level security;
revoke all on public.ai_context from anon, authenticated;

commit;
