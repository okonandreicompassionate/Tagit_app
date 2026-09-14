-- Tagit — real per-admin accounts, replacing the single shared password.
--
-- Same lockdown pattern as roadmap_items/ai_context: RLS enabled, revoke all
-- from anon/authenticated — this is an internal ops table, only the
-- dashboard's own service-role client ever touches it, and password_hash
-- must never be reachable through the app's public API keys regardless of
-- what any policy says (the revoke is what actually matters; RLS-enabled-
-- with-no-policies is belt-and-braces on top of it).
--
-- `role` is the whole point of finishing this: 'god' is the super-admin
-- tier that can invite other admins and reach admin-only tooling (the
-- moderation queue, for a start); 'admin' is everyone else. Passwords are
-- PBKDF2 (dashboard/lib/adminAuth.ts, Web Crypto — same Edge-compatibility
-- reasoning as lib/session.ts), never stored or transmitted in the clear
-- past the login request itself.

begin;

create table if not exists public.admins (
  id            uuid        primary key default gen_random_uuid(),
  email         text        not null unique,
  password_hash text        not null,
  role          text        not null default 'admin' check (role in ('admin', 'god')),
  created_at    timestamptz not null default now(),
  created_by    uuid        references public.admins (id) on delete set null
);

alter table public.admins enable row level security;
revoke all on public.admins from anon, authenticated;

commit;
