-- Tagit — close the PUBLIC execute grant on delete_my_account().
--
-- PostgreSQL grants EXECUTE on a new function to PUBLIC by default unless
-- explicitly revoked — the previous migration granted `authenticated` but
-- never revoked that default, so the anon key could call the RPC too. Live
-- curl checks confirmed this isn't exploitable (auth.uid() is null without a
-- signed session JWT, and the function's own `owner = auth.uid()` lookup
-- never matches null), but it doesn't match intent, and it's the same class
-- of grant mistake that broke the cards upsert earlier — worth closing
-- rather than leaving as a loose end.

begin;

revoke execute on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;

commit;
