# Admin dashboard — plan

Planning only. Nothing here is built yet; this exists so that when we do build
it, the shape is already argued out and the security decisions aren't made in a
hurry.

## Who it's for

Two or three people, not a support department. That shapes everything: no
ticketing system, no permissions matrix, no workflow engine. It needs to answer
four questions fast, on a laptop, possibly at a venue on bad WiFi.

1. **Is it working right now?** — tonight's events, check-ins landing, errors.
2. **Did we get paid?** — boosts, and whether Paystack actually confirmed them.
3. **Is anyone abusing it?** — inflated ranks, fake events, mass scanning.
4. **Is it growing?** — do people come back to a second event.

---

## The one hard rule

**The `service_role` key must never reach a browser.**

It bypasses every RLS policy in the database. Anything holding it can read
every user's social graph and rewrite anyone's rank. That rules out the fastest
option — a static page with the key in it — permanently, no matter how private
the URL is or how much of a hurry we're in.

So an admin UI is either:

- **Supabase Studio**, where the key never leaves Supabase's own servers, or
- **A server-rendered app**, where the key lives in server environment
  variables and the browser only ever sees results.

There is no third option that is both safe and quick, and it's worth deciding
this once rather than relitigating it under pressure.

---

## Phase 0 — this week, zero build

Supabase Studio plus a handful of saved views. Free, immediate, and enough for
a technical founder. Not enough for a non-technical teammate, which is the
trigger for Phase 1.

These views are safe to expose to admins only — none is granted to `anon`.

```sql
-- Tonight: what's on, and whether check-ins are landing.
create or replace view admin_tonight as
select e.id, e.name, e.city, e.starts_at,
       count(distinct k.card_id) filter (where k.method = 'qr') as verified,
       count(distinct k.card_id) filter (where k.method = 'code') as joined_by_code,
       count(distinct l.id) as scans
from events e
left join checkins k on k.event_id = e.id
left join links l    on l.event_id = e.id
where e.starts_at between now() - interval '12 hours' and now() + interval '24 hours'
group by e.id
order by e.starts_at;

-- Money: every boost, and whether the webhook ever confirmed it.
create or replace view admin_boosts as
select b.id, b.created_at, b.status, b.amount_kobo / 100 as naira,
       b.days, b.kind, e.name as event, c.name as buyer,
       b.paid_at, b.paystack_ref,
       -- Pending for more than 15 minutes almost always means the webhook
       -- isn't reaching us, not that the buyer abandoned checkout.
       (b.status = 'pending' and b.created_at < now() - interval '15 minutes') as likely_webhook_failure
from boosts b
join events e on e.id = b.event_id
join cards  c on c.id = b.card_id
order by b.created_at desc;

-- Abuse: rank that didn't come from plausible behaviour.
create or replace view admin_rank_outliers as
select c.id, c.name, c.swag,
       count(distinct l.to_card)   as people,
       count(distinct k.event_id)  as events,
       max(l.points)               as biggest_single_scan,
       -- Meeting more than ~15 people at one event is possible; 60 is not.
       round(count(l.id)::numeric / nullif(count(distinct l.event_id), 0), 1) as scans_per_event
from cards c
left join links l    on l.from_card = c.id
left join checkins k on k.card_id = c.id and k.method = 'qr'
group by c.id
having c.swag > 500
order by scans_per_event desc nulls last;

-- Growth: the only retention number that matters early.
create or replace view admin_return_rate as
select count(*) filter (where events >= 2)::numeric
       / nullif(count(*), 0) as returned_for_a_second_event,
       count(*) as users_with_any_event
from (
  select card_id, count(distinct event_id) as events
  from checkins where method = 'qr'
  group by card_id
) t;
```

**Do not grant these to `anon`.** Create them, then read them in Studio only.

---

## Phase 1 — read-only dashboard

Built when a non-technical teammate needs it, and not before.

**Stack:** Next.js on Vercel. Not a choice about taste — it's the one that
keeps the service key server-side by default (route handlers / server
components) while staying a single deploy. Supabase Auth for login, with an
allow-list of admin emails. Reuse the same Tailwind palette as
`landing/` so it looks like the product.

**Four screens, matching the four questions:**

| Screen | Shows | Refresh |
|---|---|---|
| Tonight | Live events, check-ins per event, scans in the last hour | 30s |
| Money | Boosts, revenue this month, stuck-pending alerts | On load |
| People | Search a card, see their events and rank, no social graph | On demand |
| Growth | Installs → onboarded → first scan → second event | Daily |

**One rule for the People screen:** admins should see *counts*, not who scanned
whom. There's no operational reason to read someone's social graph, and once
the UI exists someone will use it. Build the restraint in rather than relying
on it.

---

## Phase 2 — actions

Every action needs an audit row. Not for compliance theatre — for the moment
in six months when a rank is wrong and nobody remembers who changed it.

```sql
create table admin_actions (
  id          bigserial primary key,
  admin_email text        not null,
  action      text        not null,   -- 'takedown' | 'unlist' | 'zero_swag' | 'refund' | 'feature'
  target_kind text        not null,   -- 'event' | 'card' | 'boost'
  target_id   text        not null,
  reason      text        not null,   -- required, not optional
  created_at  timestamptz not null default now()
);
```

Actions worth having, in order of how soon they'll be needed:

1. **Unlist an event** (hide from Discover, don't delete). Reversible, which is
   why it comes before deletion.
2. **Feature an event** — someone has to flip `sponsored` when a brand pays
   outside the self-serve flow. Currently nothing can.
3. **Zero someone's swag** — the answer to a farmed leaderboard.
4. **Refund a boost** — Paystack refund plus setting `boosted_until` to now.
5. **Delete an event / card** — last resort, after unlisting.

Make `reason` a required field. It costs the admin four seconds and it's the
only thing that makes the audit log worth reading.

---

## Phase 3 — abuse detection

Only once there's enough traffic for patterns to exist. Signals worth watching,
cheapest first:

- **Scans per event per person.** The daily unique index already caps repeat
  pairs; this catches breadth rather than depth.
- **Check-ins with no scans.** Someone tapping every door code they can find
  to farm the +20, without meeting anyone.
- **Events with check-ins but no host presence.** A fake event created to mint
  check-in points.
- **Cards created in bursts** from one IP — needs request logging we don't
  currently keep.

---

## What we can't answer yet

Worth reading before designing screens, because several obvious questions have
no data behind them today.

- **Snap adds aren't measured.** `addedOnSnap` is local to each phone and never
  syncs. That means *the core conversion of the entire app* — did the scan
  actually turn into a Snap friendship — is invisible. Fixing this is a schema
  change and probably matters more than the dashboard itself.
- **No install or session telemetry at all.** The growth funnel above can't be
  built past "has a card". No analytics SDK is wired up.
- **No `reports` table.** Users cannot report anyone, so moderation is entirely
  reactive to things we happen to notice.
- **No admin role.** There's no `is_admin` flag or admin claim; Phase 1 needs
  one before it can have a login.
- **`links.points` is still client-supplied.** Rank is directionally right but
  not evidential. Any dashboard number derived from swag inherits that.
- **Check-ins have no location.** We trust the door code was scanned at the
  door. Someone could photograph it and share it in a group chat. Geofencing
  the check-in would close that, at the cost of a location permission.

---

## Open questions

1. Does the team need this before or after the first real event? Phase 0 may
   carry us through the first few.
2. Is anyone on the team non-technical? That single answer decides whether
   Phase 1 is needed at all or whether Studio is enough for months.
3. Do we want moderation to be reactive (respond to reports) or proactive
   (review new public events before listing)? Proactive is a lot more work and
   needs a queue.
4. Should admins be able to see the social graph at all? Recommend no.
