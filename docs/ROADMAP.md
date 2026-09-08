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

## Suggested order

1. **Fix check-in** — migration ready, one paste. *(done, needs running)*
2. **Confirm event creation** now the schema exists.
3. **Phone OTP auth + account recovery** — unblocks everything social.
4. **Friends.**
5. **Recent / Friends tabs + full profiles.**
6. **Private guest lists.**
7. **Time picker + visible errors.**
8. **Deploy Paystack, surface Boost.**
9. **Artwork + the feed.**
10. **Snapchat Login Kit** — start the review application early; it waits on
    someone else's timeline, so file it before you need it.

Steps 3–5 are one coherent chunk and should probably ship together as one
build.
