-- Tag — demo cards, so a single phone can test the full scan flow.
--
-- Without these, scanning a test QR against the live backend returns
-- "No card behind that code": the app's local mock directory is bypassed as
-- soon as EXPO_PUBLIC_SUPABASE_URL is set, so the card has to exist in
-- Postgres for a scan to resolve.
--
-- These mirror src/lib/mock.ts, and their ids are the ones in test-codes.html.
-- Owner is left null so they stay editable/deletable; drop them any time with
-- the DELETE at the bottom of this file.
--
-- `swag` is set directly here, which is fine: migrations run as the table
-- owner, and the revoke in the previous migration only applies to the
-- anon / authenticated client roles.

insert into public.cards (id, name, nickname, bio, socials, snap_score, swag) values
  ('bigsho', 'Oluwaseun Adebayo', 'Sho',  'Prod music. Lagos ↔ Abuja.',
   '{"snap":"bigsho_","ig":"bigsho","tiktok":"bigsho"}'::jsonb,        284500, 0),
  ('tolu',   'Toluwani Ige',      'Tolu', 'Fashion. Thrift plug.',
   '{"snap":"toluu","ig":"tolu.ige","whatsapp":"+2348012345678"}'::jsonb, 96300, 0),
  ('zeek',   'Ezekiel Nnamdi',    'Zeek', 'Ball is life 🏀',
   '{"snap":"zeekk","x":"zeeknnamdi"}'::jsonb,                          41900, 0),
  ('amaka',  'Amaka Obi',         'Ams',  'Med student. Sells cakes on the side.',
   '{"snap":"amaka.o","ig":"ams_bakes"}'::jsonb,                       172000, 0),
  ('dami',   'Damilare Cole',     'Dee',  'Photographer. DM for shoots.',
   '{"snap":"deecole","ig":"dee.shot","tiktok":"deecole"}'::jsonb,      58400, 0)
on conflict (id) do update set
  name       = excluded.name,
  nickname   = excluded.nickname,
  bio        = excluded.bio,
  socials    = excluded.socials,
  snap_score = excluded.snap_score;

-- To remove the demo people once you have real users:
--   delete from public.links where from_card in ('bigsho','tolu','zeek','amaka','dami')
--                               or to_card   in ('bigsho','tolu','zeek','amaka','dami');
--   delete from public.cards where id in ('bigsho','tolu','zeek','amaka','dami');
