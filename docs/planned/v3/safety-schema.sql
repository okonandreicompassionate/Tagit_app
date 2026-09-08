-- Tagit — blocking, reporting, and account deletion.
--
-- Written for platform review as much as for users. A social app aimed at
-- teenagers, where strangers scan each other in person, needs a way to make
-- someone go away and a way to tell us about them — Snap's developer policies
-- require safeguards against harassment and action on abuse reports, and
-- Apple requires in-app account deletion.
--
-- The design point: blocking is enforced in the database, not the client. A
-- blocked pair cannot create a link even if a modified app tries, because the
-- rule lives in a trigger rather than in a screen.

begin;

/* ---------- blocks ---------- */

create table if not exists public.blocks (
  blocker    text        not null references public.cards (id) on delete cascade,
  blocked    text        not null references public.cards (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create index if not exists blocks_blocked_idx on public.blocks (blocked);

alter table public.blocks enable row level security;

-- You can see and manage only your own blocks. Deliberately *not* readable by
-- the blocked person: telling someone they've been blocked invites exactly the
-- escalation blocking exists to prevent.
drop policy if exists blocks_own on public.blocks;
create policy blocks_own on public.blocks for select
  using (
    exists (select 1 from public.cards c
             where c.id = blocks.blocker
               and (c.owner is null or c.owner = auth.uid()))
  );

drop policy if exists blocks_insert_own on public.blocks;
create policy blocks_insert_own on public.blocks for insert
  with check (
    exists (select 1 from public.cards c
             where c.id = blocks.blocker
               and (c.owner is null or c.owner = auth.uid()))
  );

drop policy if exists blocks_delete_own on public.blocks;
create policy blocks_delete_own on public.blocks for delete
  using (
    exists (select 1 from public.cards c
             where c.id = blocks.blocker
               and (c.owner is null or c.owner = auth.uid()))
  );

/**
 * Blocking is mutual in effect: neither side can link to the other, whoever
 * pressed the button. Enforced here so a modified client cannot route around
 * it, and so the mirror trigger can't recreate the link from the other side.
 */
create or replace function public.reject_blocked_link() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1 from public.blocks b
     where (b.blocker = new.from_card and b.blocked = new.to_card)
        or (b.blocker = new.to_card   and b.blocked = new.from_card)
  ) then
    raise exception 'blocked' using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists links_reject_blocked on public.links;
create trigger links_reject_blocked
  before insert on public.links
  for each row execute function public.reject_blocked_link();

/** Blocking someone removes the friendship and the history in both directions. */
create or replace function public.apply_block() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.friendships
   where (card_a = least(new.blocker, new.blocked)
          and card_b = greatest(new.blocker, new.blocked));

  delete from public.links
   where (from_card = new.blocker and to_card = new.blocked)
      or (from_card = new.blocked and to_card = new.blocker);

  return null;
end;
$$;

drop trigger if exists blocks_apply on public.blocks;
create trigger blocks_apply
  after insert on public.blocks
  for each row execute function public.apply_block();

/* ---------- reports ---------- */

create table if not exists public.reports (
  id          bigserial   primary key,
  reporter    text        references public.cards (id) on delete set null,
  -- What is being reported. Exactly one of these is set.
  target_card text        references public.cards (id)  on delete cascade,
  target_event text       references public.events (id) on delete cascade,
  reason      text        not null
              check (reason in ('harassment','impersonation','underage',
                                'spam','inappropriate','safety','other')),
  detail      text        check (length(detail) <= 1000),
  status      text        not null default 'open'
              check (status in ('open','reviewing','actioned','dismissed')),
  created_at  timestamptz not null default now(),
  check (num_nonnulls(target_card, target_event) = 1)
);

create index if not exists reports_status_idx on public.reports (status, created_at desc);

alter table public.reports enable row level security;

-- Anyone can file one. Nobody can read the queue from the app: reports are
-- read by whoever moderates, through a server that holds the service key.
drop policy if exists reports_insert on public.reports;
create policy reports_insert on public.reports for insert with check (true);

drop policy if exists reports_read_own on public.reports;
create policy reports_read_own on public.reports for select
  using (
    exists (select 1 from public.cards c
             where c.id = reports.reporter
               and (c.owner is null or c.owner = auth.uid()))
  );

/* ---------- hide blocked people from discovery ---------- */

-- Someone you've blocked should not appear in search results. The view runs as
-- owner so it can read the blocks of the caller without exposing the table.
create or replace function public.is_blocked_pair(a text, b text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.blocks
     where (blocker = a and blocked = b) or (blocker = b and blocked = a)
  );
$$;

/* ---------- account deletion ---------- */

/**
 * Deletes everything belonging to the caller. Apple requires in-app account
 * deletion, and it is the honest counterpart to "your card follows you".
 *
 * Runs as definer because the cascade reaches rows the caller cannot address
 * directly — their links from both sides, their check-ins, their friendships.
 * It authorises off auth.uid(), so it can only ever delete the caller's own.
 */
create or replace function public.delete_my_account()
returns void language plpgsql security definer set search_path = public as $$
declare
  me_id text;
begin
  select id into me_id from public.cards where owner = auth.uid() limit 1;
  if me_id is null then
    raise exception 'no card for this account' using errcode = 'no_data_found';
  end if;

  delete from public.links       where from_card = me_id or to_card = me_id;
  delete from public.checkins    where card_id = me_id;
  delete from public.friendships where card_a = me_id or card_b = me_id;
  delete from public.blocks      where blocker = me_id or blocked = me_id;
  delete from public.event_invites where card_id = me_id;

  -- Events they hosted go too: an event with no host is unmoderated.
  delete from public.events where host_card = me_id;

  -- Reports they filed are kept, with the reporter detached. Deleting an
  -- account must not erase a safety report someone else may depend on.
  update public.reports set reporter = null where reporter = me_id;

  delete from public.cards where id = me_id;
end;
$$;

grant execute on function public.delete_my_account() to authenticated;

commit;
