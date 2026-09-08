# Demoing Tagit on iPhones for $0

The honest constraint first: **there is no free way to put a standalone iOS app
on someone else's iPhone.** TestFlight and the App Store both require the Apple
Developer Program at **$99/year**, and Apple doesn't waive it. Sideloading with
a free Apple ID needs a Mac, each device's UDID, and re-signing every 7 days —
useless for real users.

So don't fight that. Demo through **Expo Go** instead, which is a free app on
the App Store. Your users install Expo Go once, open your link, and Tagit runs
inside it — full native camera, real QR scanning, everything.

**Total cost of the demo: $0.** You only pay Apple when you're ready to
actually launch.

---

## What Expo Go can and can't run

Expo Go ships the Expo SDK's own native modules and nothing else. Tagit was
checked against that and now fits, with one exception:

| Feature | In Expo Go |
|---|---|
| Camera + QR scanning | ✅ full native |
| Deep-linking into Snapchat | ✅ |
| Saved cards, streaks, swag, leaderboard | ✅ |
| Your QR code tile | ✅ |
| Photo picker, haptics, clipboard, share sheet | ✅ |
| Recap card **as a PNG export** | ❌ needs the paid build |

The recap card still renders exactly the same — it's already 9:16 with your
code on it, so people screenshot it. The button relabels itself to *Share my
link* and the caption tells them to screenshot. Nothing crashes; it's handled
in [app/recap.tsx](app/recap.tsx) behind `canExportImage`.

That was the only blocker. `expo-blur` was also removed — it wasn't being used.

---

## Step 1 — Stand up Supabase (free, and you need it)

Not optional for a **multi-person** demo. Without a backend, `getCard()` only
knows the five seeded people in `src/lib/mock.ts`, so your phone scanning your
friend's real code gets *"No card behind that code."*

The Supabase free tier covers a demo comfortably.

1. Create a project at supabase.com.
2. Apply the schema with the CLI: `npx supabase login`, then `npm run db:link`
   and `npm run db:push`. Migrations live in `supabase/migrations/`.
3. Settings → API → copy the **Project URL** and the **anon / public** key.
4. `cp .env.example .env` and fill both in.

```
EXPO_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Only the anon key.** Never `service_role` — it bypasses every RLS policy, and
anything named `EXPO_PUBLIC_*` is compiled into the app bundle where anyone can
read it. The anon key is meant to be public; the RLS policies in the schema are
what actually protect the data. If a `service_role` key ever lands in a
`.env`, rotate it in the dashboard.

Confirm it took: open the card editor in the app, bottom line reads
*"Backend: connected"*.

> Caveat worth knowing before you demo: cards are currently created with
> `owner = null` and no auth, so anyone who knows a handle could overwrite that
> card. Fine among friends, not fine in public. See *Known gaps* in the README.

## Step 2 — Pick how they get the app

### Option A · Live demo, in the room (works today, zero setup)

```bash
npx expo start --tunnel
```

A QR code appears in your terminal. iPhone users install **Expo Go** from the
App Store, then scan that QR with the **stock Camera app** — it hands off to
Expo Go and loads Tagit. Android users scan it from inside Expo Go.

The tunnel routes over the internet, so they don't need to be on your WiFi.
Catch: it only lives as long as that terminal is open and your laptop is awake.
Perfect for a pitch or a party, useless for "try it this week."

### Option B · A link that keeps working (free Expo account)

For a persistent link, publish an update and share it:

```bash
npm install --global eas-cli
eas login                      # free account, sign up at expo.dev
eas init                       # links this folder to an Expo project
eas update --branch preview --message "first demo"
```

`eas.json` is already written with `development` / `preview` / `production`
channels. After `eas update`, your project page on expo.dev has the shareable
link that opens in Expo Go — send that around and it stays live without your
laptop.

You'll need to run `eas login` yourself; I can't authenticate as you. Once
`eas init` has run, it writes a project id into `app.json` and everything after
is one command per update.

### Option C · Android users, free and standalone

Android has no Apple tax. A real installable APK, no store, no fee:

```bash
eas build --platform android --profile preview
```

EAS returns a download link; anyone can install the APK directly. Google Play
is $25 **one-time** if you want store distribution later — and this build
includes the PNG recap export, since it's a real build rather than Expo Go.

---

## Step 3 — When you're ready to actually launch iOS

Unavoidable: **$99/year** for the Apple Developer Program. Then:

```bash
eas build --platform ios --profile preview     # TestFlight-able build
eas submit --platform ios
```

EAS builds iOS in the cloud, so you don't need a Mac — but you do need the paid
account before Apple will sign anything for a device. Budget for it at launch,
not now.

---

## The short version

| | Cost | Good for |
|---|---|---|
| Expo Go + `--tunnel` | $0 | Demoing in person, today |
| Expo Go + `eas update` | $0 | A link friends can keep using |
| Android APK via EAS | $0 | Real installable app, full features |
| TestFlight / App Store | $99/yr | Launch |
| Supabase | $0 (free tier) | Required for people to scan each other |

Start with Expo Go and the tunnel. It costs nothing, it works on every iPhone
in the room, and the only thing your users lose is a PNG export they were going
to screenshot anyway.
