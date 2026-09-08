# Tagit

**The fastest way to add people on Snap in real life.**

Camera-first, like Snapchat: the app opens on the scanner. Point it at
someone's code, their card pops up, one tap deep-links straight into Snapchat
to add them. Swipe left for everyone you've tagged, right for your own code.

Built with Expo (SDK 57) + expo-router + Zustand. Runs end-to-end with **no
backend** — point it at Supabase when you're ready.

## Run it

```bash
npm install
npm start
```

Then scan the QR with Expo Go, or `npm run android` / `npm run ios`.

**Demoing to iPhone users without paying Apple $99/yr:** see
[DEMO.md](DEMO.md). Short version — run `npx expo start --tunnel`, they install
the free Expo Go app and scan. Everything works except the recap PNG export,
which degrades to sharing a link.

The camera needs a real device. In the simulator, use the **DEV · fake a scan**
button on the scanner to exercise the whole flow against the local directory in
`src/lib/mock.ts`.

```bash
npm test        # scoring + streak + payload logic
npm run typecheck
```

## Where things are

```
app/                     screens (expo-router, file = route)
  index.tsx              the one home screen: a 3-pane horizontal pager
  card/[id].tsx          the post-scan sheet — "Add on Snap" lives here
  u/[id].tsx             deep link: tagit://u/:id and tagit.app/u/:id
  onboarding.tsx         card builder, first run
  edit.tsx  events.tsx  leaderboard.tsx  recap.tsx
src/panes/               the three panes of the home screen
  ScannerPane            camera + QR reticle (the default view)
  TaggedPane             who you've met, searchable, "not added" filter
  CodePane               your own Snapcode-style tile
src/lib/
  swag.ts                points, tiers, streaks — the whole game
  payload.ts             what goes in the QR, and how it's parsed
  socials.ts             deep links into Snap/IG/TikTok/X/WhatsApp
  api.ts                 the backend, or the mock when there isn't one
src/store/useTagStore.ts local-first state, persisted to AsyncStorage
supabase/migrations/     Postgres schema, RLS, leaderboard views
docs/API.md              the four endpoints, and how to sell them later
```

## The Snap-first decisions

- **The app opens on the camera.** No home screen, no tab bar — the same
  muscle memory Snapchat already trained this audience on.
- **Snap is the anchor of a card**, not one social among five. It's the
  primary field at onboarding, the handle on your code tile, and the only
  full-width button on the scan sheet. Everything else is a secondary chip.
- **Nobody types a username.** `openSocial()` jumps into the Snapchat app via
  `snapchat://add/:handle`, falling back to the web profile.
- **Snap Score sits on the card** — free social proof that already means
  something here, shown next to your Tagit tier.
- **Codes are short URLs**, not embedded JSON: the code stays low-density so it
  scans fast in bad lighting, and a stock camera app landing on
  `tagit.app/u/:handle` gets a web card instead of nothing.

## The game layer

Scoring lives in one file, `src/lib/swag.ts`, and it's tested.

| | |
|---|---|
| New link | +10 |
| You did the scanning | +5 |
| Ran into them again | +3 |
| Kept a streak alive | +15 |
| First tag at a new event | +25 |

Tiers: **Fresh** → Regular (100) → Connector (300) → **Plug** (750) → Icon
(1500) → **Legend** (3000).

Two details that matter more than the numbers:

- **Streaks count distinct days, not scans.** Re-scanning your friend all
  afternoon is a streak of 1. A gap over 30 days resets it. The flame dims
  rather than disappearing when a streak lapses — "you're about to lose this"
  is the part that pulls people back.
- **The event bonus is once per event, not once per person**, so it rewards
  showing up somewhere new instead of farming one room.

Recap cards render 9:16 with the code printed on them, so a screenshot drops
straight into a Story and is itself a growth loop.

## Wiring up the backend

Schema lives in `supabase/migrations/` and is applied with the Supabase CLI —
no pasting SQL into a dashboard.

```bash
npx supabase login        # browser-based, one time
npm run db:link           # links this folder to the project
npm run db:push           # applies every pending migration
npm run db:status         # what's applied vs pending
```

Then `cp .env.example .env` and fill in the project URL + publishable key.

To change the schema, never edit an applied migration — add one:

```bash
npm run db:new add_something    # writes a timestamped file
npm run db:push
```

Both existing migrations are idempotent, because this project's schema was
first applied by hand before migrations existed. Pushing against a database
that already has it is a no-op rather than an error.

That's it — `src/lib/api.ts` flips from the mock to live automatically
(`isLive`), and the card builder shows which mode you're in.

The schema does three things worth knowing about: `cards.swag` is not
client-writable (a trigger recomputes it from the link ledger, and the column
is revoked from the client role), a unique index caps scoring at one row per
pair per day, and the leaderboard views deliberately run as their owner so the
raw `links` graph stays private while the aggregates are public.

## Known gaps

- **Points are still calculated client-side.** The ledger and the daily cap are
  enforced in Postgres, but a determined user could post inflated `points` for
  a real scan. Moving pricing into a Postgres function is the first thing to do
  before any leaderboard has a prize attached. See `docs/API.md`.
- **Auth is wired but not enforced.** Every install signs in anonymously
  (`src/lib/supabase.ts`) and stamps its uid as the card's `owner`. The RLS
  policies still allow editing an *unclaimed* card, though, so until anonymous
  sign-in is enabled in the dashboard and confirmed working on a device, a card
  with `owner = null` can still be overwritten by anyone. Tightening the policy
  to `with check (owner = auth.uid())` is a one-line migration — but it must
  come *after* auth is verified, or it locks everyone out of their own card.
- **`tagit.app` doesn't exist.** Register it (or change `TAG_HOST` in
  `src/lib/payload.ts`) and put a web card behind `/u/:handle`.
- **No "they scanned me" path.** The `scanned_by` direction is modelled and
  scored, but nothing writes it yet — that needs the backend to push to the
  person who was scanned.
