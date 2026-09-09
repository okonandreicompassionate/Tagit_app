# What's next — from the first real device test

Everything below came out of actually using the app on a phone. That one
session found more than every automated check combined, which is worth
remembering.

Ordered by what unblocks what, not by how visible each thing is.

---

## 0. Two bugs, diagnosed

### Check-in was silently dead — my fault

Reproducing the app's exact request against the live database:

```
POST /rest/v1/checkins  →  401  permission denied for table checkins
```

The column-privilege migration replaced the table-level UPDATE grant with
`grant update (method)`. But the app *upserts* a check-in so that someone who
typed the code and later scans the door gets upgraded to verified instead of
duplicated — and Postgres requires table-level UPDATE for
`INSERT ... ON CONFLICT DO UPDATE`. A column grant is not enough.

Fixed in `20260908180000_fix_checkin_upsert.sql`. The column-grant pattern is
right for columns the server owns; it cannot be used on a table the client
upserts into.

### Event creation — server is fine, client isn't

Sending exactly what the app sends returns **201 Created**. So the schema, the
RLS policy and the privileges all accept it. The failure is in the app or in
when it was tested — most likely the phone was used before the SQL had been
run, when the `events` table had no `host_card` or `type` columns at all.

**Needs one thing from you:** try creating an event again now that the
database is set up. If it still fails, the next step is an on-screen error
instead of a silent one — see §5.

---

## 1. Sign-in — the real blocker

> *"i created an acc with my snap it kinda didnt allow me login again"*

This is the most important thing in the list, and it's not a missing feature —
it's a **lockout bug** with a specific cause.

There is no account. A card lives in `AsyncStorage` on one phone, and the
Postgres row has `owner = null`. So when the local copy goes (reinstall,
cleared data, second phone), onboarding runs again, asks for your Snap handle,
calls `isHandleFree('relmxdgamer')` — which is **false, because your own card
is already there** — and refuses you. You are locked out of your own handle by
the check meant to stop impersonation.

### The fix, in two layers

**Layer 1 — real accounts (build first).** Supabase Auth, so a card belongs to
a user id rather than a phone.

| Method | Cost | Fit |
|---|---|---|
| **Phone OTP** | SMS credits (~₦4/msg) | Best fit for the audience — everyone has a number, nobody forgets it |
| Email magic link | Free tier, then SMTP | Cheap, but teenagers don't check email |
| Snapchat Login Kit | Free | Perfect brand fit — see Layer 2 |

Recommend **phone OTP**, with the handle claim moving to: *signed in and your
uid owns this card* → let them in; *card exists with a different owner* →
refuse. That turns `isHandleFree` from a lockout into a real ownership check.

**Layer 2 — "Continue with Snapchat" (plan, don't block on it).** Snap's Login
Kit is exactly what you described: it returns the display name and Bitmoji, so
Snap is verified rather than typed, and Instagram/TikTok stay optional.

The catch: it needs an app registered on Snap's developer portal and **review
before production**, plus a native SDK. It is not a same-day change, and it
cannot be the only way in — some users won't have Snapchat. Build phone OTP
first, add Snap as the fast path.

### Account recovery, whatever we choose

Needed regardless: "this is my handle, let me back in." With auth, that becomes
signing in and finding the card already owned by you.

---

## 2. Friends — required by three other features

> *"tagit friends is a must"*

Right now "friends" is implicit: anyone in your Tagged list. That isn't enough,
because private-event invites need a real, two-sided list.

**Model:** a `friendships` table with a mutual flag. A scan already creates a
link both ways, so **a scan can imply a friend request that the other side
accepts** — no separate add flow, and it stays true to "you had to have met."

```
friendships(card_a, card_b, status, created_at)   -- 'pending' | 'accepted'
```

Store the pair ordered (`least`, `greatest`) so one row serves both directions.

Depends on: §1, because friendship without accounts is meaningless.

---

## 3. Recently scanned, and viewing people

> *"add a recently scanned and friends option ... then view thier info"*

Mostly presentation over data that already exists. The Tagged pane becomes two
tabs — **Recent** (ordered by last scan) and **Friends** (accepted only) — and
tapping anyone opens their full card.

Small but real gap: the profile sheet currently shows what *you* recorded. It
should show *their* derived profile — nights out, badges, tier — which means
`getCard` returning their check-in counts. One view, server-side.

---

## 4. Private events with a guest list

> *"the private noway to select ppl in ur friends list"*

Today `visibility` is a two-way switch and private means "unlisted". You want
private to mean **invited**.

```
event_invites(event_id, card_id, invited_by, created_at)
```

RLS: a private event is readable if you host it *or* you're invited. Picker on
the create screen sources from §2.

Depends on: §2.

---

## 5. Event creation: time picker, and errors you can see

> *"add a time filter to choose time when creating event and also why is it not saving"*

- Replace the three presets with a real date **and time** picker
  (`@react-native-community/datetimepicker`, which Expo supports).
- **Show failures.** Right now a failed create sets a message that's easy to
  miss, and a failed *sync* is swallowed entirely. Any write that doesn't reach
  the server should say so on screen. This is why the bug above was invisible.

---

## 5b. A door code that survives being printed

> *"event creation shld make qrs that are printable and sharable to easily go
> round showing clearly the event name"*

`app/event/door.tsx` already exists and does part of this: full-screen QR,
event name underneath, screen forced to max brightness, Copy link and Share
buttons. What it doesn't do is leave the phone — Share currently sends a text
link, not an image, so there's nothing to actually print or tape to a wall.

- **Export as an image.** The same `react-native-view-shot` pattern already
  used in `app/recap.tsx` (`captureCard`, gated behind `canExportImage` since
  the module isn't in Expo Go) applies directly here: capture the door-code
  view to a PNG, then `Sharing.shareAsync` it — from there "print" is just
  whatever the OS share sheet already offers (AirPrint, Google Print, save to
  Files/Photos and print from anywhere).
- **Design it as a poster, not a screen.** Today the event name sits *under*
  a QR sized for a phone display. A printable version wants the name leading
  — large, above the code — since a flyer is read from a few feet away, not
  held six inches from someone's face. Worth a `layout="poster"` variant of
  the same screen rather than a second one: same data, different proportions.
- **Surface it earlier.** Right now this is one tap deep from event detail
  (host-only → "Show the door code"). Offering it straight from the create
  flow — "Event made. Here's your door code" — turns a step people currently
  have to go hunting for into part of finishing the form.

---

## 6. Boost, reachable

> *"no option to pay to show more ppl"*

The screen exists but is only reachable from an event you host, and it refuses
to run because the Paystack functions aren't deployed. Needs:

1. `supabase secrets set PAYSTACK_SECRET_KEY=...`
2. `supabase functions deploy boost-checkout paystack-webhook`
3. A **Boost** entry point on your own events in the Mine tab, not buried.

---

## 7. The event feed

> *"a feed for users to browse through events like the artwork and shii very seperately like tiktok"*

Full-screen, vertically paged, one event per screen, swipe for the next —
artwork-led rather than list-led.

This needs the thing we don't have: **event artwork**. A TikTok-style feed with
no images is just a list with more scrolling. So it needs a Supabase Storage
bucket, an image picker on the create screen, and a fallback for events without
art. That's the real work; the pager itself is straightforward.

Sits as a fourth pane, or a tab inside Events.

---

## 8. Kill the dummy data

> *"make all data dynamic no useless dummies"*

`src/lib/mock.ts` exists so the app runs with no backend. Now that there's a
backend, it's a liability — five fake people who look real.

- Delete the five demo cards from the database.
- Keep the mock module but only for `__DEV__` and tests, never a live build.
- The three seeded events are genuinely useful for demos; make them real or
  delete them.

---

## 9. Delete account

> *"add a delete acc too delete the tagit acc so i can maybe use the email
> again"*

Logged, not built. Real complexity, not just a button: deleting the
`auth.users` row needs the Supabase admin API (service role), which a client
app can never safely hold — this has to be a Supabase Edge Function the app
calls, not a direct client delete. That function then needs to actually
untangle a card from everything referencing it (`links` both directions,
`checkins`, `friendships`, hosted `events`, `boosts`) — decide per table
whether that means cascade-delete or anonymize-and-keep (an event you hosted
probably shouldn't vanish for everyone who already checked in, for instance).
Freeing the email/phone specifically means the deletion has to reach
`auth.users`, not just `cards` — deleting only the card and leaving the auth
identity behind would still block re-signup with the same contact.

## 10. A dev/admin screen for seeding and resetting test data

> *"add a dev screen to the admin let it be able to seed database add in
> users and manipulate shii maybe handy for testing... maybe to clear all
> users and events like start arsh with only table"*

Logged, not built. Useful, but the destructive half ("clear all users and
events") needs real guardrails before it exists at all — a wipe button in a
shared admin dashboard is one misclick from deleting a live user's real
data, not just test rows. Worth scoping as: gated behind a service-role-only
Edge Function (never the anon key), a hard confirmation step, and ideally
scoped to rows tagged as seed/test data specifically rather than "everything
in the table" — the existing seeded-cards cleanup in
`20260908234500_recompute_on_delete.sql` (`delete ... where id in
('bigsho','tolu',...)`) is the pattern: explicit, named, never a blanket
`delete from table`.

## 11. A page explaining how the ranking algorithm works

> *"hope you got my algorithm ready create a page on how it works"*

The algorithm itself shipped and is live — `discover_feed()` in
`supabase/migrations/20260909130000_personalized_feed.sql`, walked through
in that file's own header comment (paid placement, then friends going, type
and city affinity, urgency, new-listing bump, popularity, already-been
penalty, in that order). What's logged as not-yet-built is a *user-facing*
page explaining this in plain language — likely reachable from the feed
screen itself ("Why am I seeing this?" or a static "How ranking works"
screen), written for someone who's never read a scoring formula, not a copy
of the SQL comment.

## 12. Hosts earn swag from their event's attendance

> *"the more ppl scan ur event as a user adds to ur swag points"*

Logged, not built. Currently `cards.swag` only sums a card's own `links` and
`checkins` — nothing credits the host when someone else checks into their
event. Shape of the fix: extend `recompute_swag_for()` (or a sibling
function) to also sum something like `checkins.qr-method count for events
hosted by this card`, and wire it into the same triggers that already fire
on checkin insert/delete so it stays live rather than needing a manual
recompute. Worth deciding a per-checkin value before building it — reusing
`POINTS.checkIn` (20) directly could make a well-attended event worth an
enormous, leaderboard-dominating amount very fast; a smaller or diminishing
rate is probably right, not a decision to make silently while writing the
migration.

## 13. Notifications, and a broader "make swag feel like status" pass

> *"swag point is your popularity makes u famous on the app make it social
> media ish big names get credit... inportantly add notifications for
> everything"*

Logged, deliberately not scoped yet — both pieces are too open-ended to
build blind:

- **Notifications "for everything"** could mean an in-app list (a bell icon,
  a feed of "X added you", "Y scanned you", "your event got N check-ins"),
  real push notifications (needs Expo push tokens, a sender, and decisions
  about which events actually warrant interrupting someone), or both. These
  have very different build costs and user-facing tradeoffs — worth a short
  back-and-forth on which events matter and whether push is in scope before
  writing a notifications table.
- **"Social media-ish, big names get credit"** reads as a product direction
  (public profiles/leaderboards that read as status, not just a number) more
  than a single feature — the tier system and leaderboard already exist
  toward this; what's unclear is what "credit" should concretely look like
  beyond that (a public follower-count-style number? verified-host badges?
  something else). Needs a concrete spec, not a guess, before it's buildable.

## 14. Multiple admins, with roles — you as super admin

> *"make way for other admins later in the future but im super super god
> admin"*

Logged, deliberately not built tonight — it's a real prerequisite chain, not
a field to add. The dashboard's whole auth model right now
(`dashboard/lib/session.ts`) is one shared password for anyone who knows it —
there's no concept of *which* admin is looking at it, on purpose, per that
file's own doc comment ("gates one shared password for a small team, not a
multi-user auth system"). A `role` column only means something once there's
a distinct identity to hang it off, so the real order of work is:

1. Give each admin their own login (simplest: an `admins` table — email,
   password hash or a magic-link flow, `role` in `('super_admin', 'admin')`
   — swap the single `ADMIN_PASSWORD` check in `lib/session.ts` for a lookup
   against it).
2. Seed you as `super_admin` first.
3. Gate the actually-dangerous actions (Accounts → Delete, and whatever the
   dev/seed screen in §10 ends up doing) behind `role = 'super_admin'`;
   regular admins get read access plus the safe writes.
4. An "Invite an admin" screen — super-admin-only — for adding the rest of
   the team later, which is the concrete version of "make way for other
   admins."

Doing this properly (password hashing, session-per-admin, not accidentally
locking out the only login) is real, careful work — worth its own pass
rather than a rushed addition next to tonight's other changes. Once
`roadmap_items` exists (run `supabase/RUN-ADMIN-ROADMAP.sql`), this belongs
in the dashboard's own Roadmap tab as a `planned` card instead of here.

---

## Status — verified against the live project, 2026-09-09

Checked directly rather than assumed: queried the database and EAS, not just
read the code.

**Done:**
- Check-in (fixed, confirmed live).
- Event creation (device-confirmed).
- Email sign-in — code arrives, verifies, session created. Went through
  custom SMTP (Gmail app password) after the free-tier template lock made
  the built-in mailer a dead end at 2 emails/hour project-wide.
- Friends (mutual scan → friendship, verified live).
- Recent / Friends tabs, private guest lists, real date+time picker, visible
  create-event errors.
- The event feed (`app/feed.tsx`) — renders, falls back to a generated
  gradient per event with no poster.
- APK build is current and correctly labelled `0.2.0` (build
  `9b9274a1`, finished 9/8 21:43).

**Not done — confirmed by checking, not guessing:**
- **The `artwork` Storage bucket doesn't exist.** `GET /storage/v1/bucket/artwork`
  → `404 Bucket not found`. Event posters can't upload until it's created
  (Storage tab → new bucket → name `artwork` → public) — the SQL editor
  can't do this part, per the note in `RUN-ADMIN-STATS.sql`'s sibling files.
- **Paystack was never deployed.** `boosts` table is empty — not one row,
  paid or pending. §6 below is unstarted, not broken.
- **§5b, printable door codes** — just logged, nothing built yet.
- **Snapchat Login Kit** — not filed. Still blocked on a privacy policy and
  block/report, per `docs/V3.md`.
- **The dashboard (`dashboard/`)** — built, tested locally, not deployed.
  Needs `npx vercel` and the env vars from its README; I have no Vercel
  access to do this part.
