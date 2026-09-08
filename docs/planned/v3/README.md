# v3 drafts — not wired up

Written before we decided to plan v3 rather than build it. Nothing here runs:

- `safety-schema.sql` is **out of** `supabase/migrations/` on purpose. Left
  there it would be swept into `setup.sql` and applied by the next push.
- The `.draft` extensions keep the TypeScript out of the build. Rename to
  `.ts` / `.tsx` and move back into `src/lib/` and `app/` when v3 starts.

See [../../V3.md](../../V3.md) for what these are part of.
