# DESIGN — throwables: the server side

STATUS: **NOT RUN IN PRODUCTION.**  Written with `feat/throwables` (step 2 of
the build brief) against the ruling in `DESIGN-throwables-and-mask.md`.  Same
pattern as the 10/6 slug run in `DESIGN-filter-rules.md`: preflight reads
first, one transaction, md5-guarded splice of `ask_question`, refuses on
drift.  The SQL under "The DDL" is the posting.  The dry run at the bottom
was against a throwaway local PostgreSQL 16.15 with a stand-in schema, and
says nothing about production's state — it says the SQL parses, does what it
claims, and guards itself.  Nothing runs in production until Nick's go; when
it has run, the read-back goes under "Run log" and the STATUS line changes.

## What this was written against (Step 1 findings, approved)

- **Throwers** are `spectator` rows, excluding the host by `rooms.host_id`
  (the host has no member row — `backend-double.js` header, ASSUMED there,
  consistent with every read).  **Targets** are `chair` and `kept` (Nick #1:
  kept finalists can be hit).  The Moment is not server-side
  (`rooms.moment_*` does not exist — `DESIGN-filter-rules.md` divergence 1),
  so it is modelled in the double only.
- **Not `room_events`:** its realtime payload carries `user_id`, and clients
  insert into it directly (hearts: `index.html` `from("room_events").insert`).
  Throw state goes on the **target's `room_members` row**; the thrower goes
  in a **new `throw_ledger` table no member can read**.
- **A show is one `rooms` row.**  Rations are keyed to `(room_id,
  thrower_id)` in the ledger — the person, not the membership row, so
  `leave_room` (a hard DELETE of the row) followed by `join_room` does not
  refill them.  `reset_to_preshow` is the same show (Nick #2): same room id,
  same ledger, no refill.
- **No clips** exist anywhere in `index.html` (no recording path, nothing
  under `design/` wires one), so there is nothing to add throws to.
- **Server time:** the page already has `syncServerClock()` / `serverNow()`
  (`index.html:3377`, an RTT-corrected offset from the `server_now` RPC).
  Every throw carries a server `throw_at` / `throw_until`; the client draws
  from those through `serverNow()`.  The double's `clockSkew` is what the
  30-second gate drives.

## rooms.round — READ THIS BEFORE THE SHIELD (Nick #3)

Nick's rule: a shield lasts until `rooms.round` next changes, *if* production
doesn't bump it on every ask.  **It does.**  SOURCE, `ask_question` read back
2026-09-28 (`DESIGN-filter-rules.md` SOURCE section):

    update public.rooms r
       set spotlight_target = v_target, spotlight_question_id = v_qid,
           round = coalesce(r.round,0) + 1,

So `rooms.round` counts ASKS (SPEC.md "PROD FACT (8/9)": "the first ask opens
round 1").  The double's `advance_phase` also bumps it on deciding → spotlight.
What the show calls a "round" — everyone seated asked once — is the client's
`__ASK_CYCLE` set (`askMark` / `askCycleReconcile`, `index.html:2852`),
derived from `room_events` replay; it has **no server column**.  `rooms.cycle`
exists in production (`ask_question` emits `v_r.cycle`) but nothing in this
repo reads or writes it and its meaning is unread.

So "until `rooms.round` next changes" would mean "until the next ask of
anybody", which is probably one question's worth of immunity.  The shield is
**held**: no column, no function, no check in `throw_at`, until Nick rules
which of these it should be — the next ask (`round + 1`), a fixed number of
asks, the rest of the show, or a server-side cycle that would have to be
built first.  Adding it later is one nullable column, one host function and
one `if` in `throw_at`, in a second md5-guarded run.

## How room_members and rooms are writable today (the added rule)

What the repo knows: RLS is on `room_members` and policy
`room_members_select_in_room` lets any member of the room, or its host,
SELECT it (`index.html` `loadRoomState`, the seated read).  The client makes
**no** direct `room_members` write of any kind (gate 71 block 8 scans for it)
and its roster rows arrive over realtime (`subscribeRoom`), so SELECT is
granted to members.  The host DOES write her own `rooms` row directly
(`status:"ended"` ×2 and `host_seen_at` — gate 61 logs them, not fixed), so a
rooms UPDATE policy for the host exists.  **Whether a member UPDATE policy on
`room_members` exists is unread** — preflight 0c below is the read, and
every row it returns goes under "Run log".

The DDL does not depend on the answer.  Two BEFORE triggers refuse any change
to a throw column (and to `rooms.throwables_on`) when `current_user` is an
API role (`anon` / `authenticated` — what PostgREST runs a direct table write
as).  Inside a SECURITY DEFINER function `current_user` is the owner
(`postgres` on every function read so far — preflight 0e confirms), so the
five new functions and the spliced `ask_question` pass, and so does any
role-changing function (seat / pass / sweep / step_down) the wipe half of the
trigger fires under.  Gate 80 block G is the proof through the real page: a
chair's own `sb.from("room_members").update({throw_until: …})` comes back
with the trigger's message and his row is unchanged.

## The rule, in one sentence

A throw is TARGET-ROW state the whole room draws from (`throw_kind`,
`throw_at`, `throw_until`), landed only by `throw_at`, wiped only by setting
`throw_until = now()`, with the thrower and the rations in a table nobody
but the server can read; the client observes and never writes.

## Schema

    alter table room_members
      add column throwables_on boolean not null default true,  -- his opt-in
      add column throw_kind    text null,                      -- what landed last
      add column throw_at      timestamptz null,               -- server start
      add column throw_until   timestamptz null;               -- server expiry
    alter table rooms add column throwables_on boolean not null default true;
    create table throw_ledger (room_id, thrower_id, cls, kind, target_id, at);

**Live** means `now() < throw_until`.  **Cooldown** means `now() <
throw_until + 20s`.  **A wipe is `throw_until = now()`**, applied only where
`throw_until > now()` — a wipe with nothing live changes nothing, so no path
can shorten a cooldown.  Nothing runs at expiry; nothing is a timer.
`throw_kind` / `throw_at` are left behind by a wipe (history), and the client
draws nothing from them once `throw_until` has passed.

`active_members` is `RETURNS SETOF room_members` (divergence 3 in
`DESIGN-filter-rules.md`), so the four columns project through both its
branches with no text change; the seated read is `select *`.  Realtime
carries the member row with the four columns and NO thrower on it.

## The doors (rejection order is the contract; the double keeps it)

- `throw_at(room_id, target, kind)` → `{ok, kind, cls, at, until, cheers_left,
  jeers_left}`.  Order: not authenticated → no room → no such throw → the host
  does not throw → not a member of this room → only the crowd throws →
  throwables are off for this show → no such member → target is not in a
  chair → he has throwables off → a throw is already live → cooling down →
  no cheers/jeers left this show.  The target row is `select … for update`,
  so two throws racing for one chair serialise and the second sees the first.
  Only a landed throw inserts a ledger row; every refusal above is free.
- `throw_counts(room_id)` → the CALLER's own remaining rations plus
  `throw_limits()`.  Added beyond the Step-1 sketch: the tray needs the
  numbers before his first throw and after a leave/rejoin; it reads only rows
  where `thrower_id = auth.uid()`.
- `set_throwables(room_id, on)` — his own switch; off wipes what is on him.
- `host_clear_throw(room_id, user_id)` — any chair, any time.
- `host_set_throwables(room_id, on)` — off wipes every live throw in the room
  and `throw_at` refuses until on.
- `ask_question` — AMENDED by splice: the existing `set filter = null`
  becomes `set filter = null, throw_until = case when … > now() then now()
  else … end` — same statement, same transaction, before the rooms update,
  so realtime carries the wipe ahead of the row that says he is asked.
- the trigger — a row whose role leaves `chair`/`kept` loses its live throw
  (seat / pass / timeout / sweep / step_down / decide_*; `leave_room` deletes
  the row and the throw with it).  chair → kept is not a wipe.
- the numbers: `throw_limits()` = `{cheers:5, jeers:2, live_secs:10,
  cooldown_secs:20}` — one function, the brief's defaults, change it there.

## The DDL

The full text, including the preflight, the read-back and the undo, is the
file this was dry-run from; it is reproduced here verbatim.

```sql
-- ============================================================================
-- THROWABLES — server DDL (feat/throwables, step 2).  NOT RUN IN PRODUCTION.
-- Spec: tools/DESIGN-throwables-and-mask.md (the ruling).  Pattern: the 10/6
-- slug run in tools/DESIGN-filter-rules.md — preflight reads first, one
-- transaction, md5-guarded splice of ask_question, refuses on drift.
-- The shield (host_grant_shield / shield_until_round) is NOT here: it waits
-- on Nick's ruling about rooms.round (see DESIGN-throwables-server.md).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT — read-only, run each on its own FIRST, record the output.
-- ---------------------------------------------------------------------------

-- 0a. ask_question is still the 2026-09-28 post-splice read-back
select md5(pg_get_functiondef('public.ask_question(uuid,bigint,uuid)'::regprocedure))    as ask_question_md5,
       length(pg_get_functiondef('public.ask_question(uuid,bigint,uuid)'::regprocedure)) as ask_question_chars;
-- expect: 48bb7506152d8403ba142aeb7b7db672 | 2509

-- 0b. the throw columns and the ledger do not exist yet
select table_name, column_name from information_schema.columns
 where table_schema = 'public'
   and (column_name like 'throw%' or table_name = 'throw_ledger')
 order by 1, 2;
-- expect: zero rows

-- 0c. HOW room_members AND rooms ARE WRITABLE TODAY (the added rule).
--     Every policy on the two tables, and whether RLS is on at all.
select c.relname, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c where c.oid in ('public.room_members'::regclass, 'public.rooms'::regclass);
select tablename, policyname, cmd, roles, qual, with_check
  from pg_policies
 where schemaname = 'public' and tablename in ('room_members', 'rooms')
 order by tablename, cmd, policyname;
-- expect at least room_members_select_in_room (index.html names it).  Whether
-- an UPDATE policy exists for members is exactly what this answers.  Record
-- every row.  The guard trigger below holds EITHER WAY.

-- 0d. table grants to the API roles (what PostgREST can even attempt)
select grantee, table_name, string_agg(privilege_type, ',' order by privilege_type) as privs
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name in ('room_members', 'rooms')
   and grantee in ('anon', 'authenticated', 'service_role')
 group by 1, 2 order by 2, 1;

-- 0e. function owners — the guard trusts any current_user that is not an
--     API role, which is only sound if every definer function is owned by
--     postgres (the 09-28 ACLs say so; confirm).
select p.proname, pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proacl
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('ask_question','active_members','set_filter','drop_filter','host_clear_filter',
                     'seat_member','keep_member','pass_member','timeout_member','sweep_stale_members',
                     'step_down','join_line','leave_room','decide_keep','decide_pass','decide_clear','seat_pick')
 order by p.proname;
-- expect: owner postgres, prosecdef t, on every row that exists

-- 0f. realtime: which tables the publication carries (throw_ledger must
--     NEVER be added to it)
select pubname, schemaname, tablename from pg_publication_tables
 where pubname = 'supabase_realtime' order by 3;

-- ---------------------------------------------------------------------------
-- 1. THE CHANGE — one transaction.  If Studio runs statements one at a time
--    and anything raises, run `rollback;` before anything else.
-- ---------------------------------------------------------------------------
begin;

-- 1-pre. REFUSE ON DRIFT before touching anything: the same ask_question
--        fingerprint the splice checks, and no throw column / ledger yet.
do $do$
begin
  if md5(pg_get_functiondef('public.ask_question(uuid,bigint,uuid)'::regprocedure)) <> '48bb7506152d8403ba142aeb7b7db672' then
    raise exception 'ask_question is not the 2026-09-28 read-back (% chars, md5 %) - nothing changed; re-read it first',
      length(pg_get_functiondef('public.ask_question(uuid,bigint,uuid)'::regprocedure)),
      md5(pg_get_functiondef('public.ask_question(uuid,bigint,uuid)'::regprocedure));
  end if;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name in ('room_members','rooms')
                and column_name like 'throw%') then
    raise exception 'throw columns already exist - nothing changed; this has run before';
  end if;
  if to_regclass('public.throw_ledger') is not null then
    raise exception 'throw_ledger already exists - nothing changed; this has run before';
  end if;
end
$do$;

-- 1a. the one place the numbers live (brief: "one config object or server
--     constants").  The client reads them off throw_counts(); the double
--     mirrors them as THROW_LIMITS.
create or replace function public.throw_limits()
returns jsonb language sql immutable
as $$ select jsonb_build_object('cheers', 5, 'jeers', 2, 'live_secs', 10, 'cooldown_secs', 20) $$;

-- 1b. the set, closed (the ruling's eight).  cls is derived, never stored on
--     the member row — only the kind is.
create or replace function public.throw_class(kind text)
returns text language sql immutable
as $$ select case when kind in ('petals','hearts','confetti','sparkle') then 'cheer'
                  when kind in ('tomato','pie','boo','cricket')          then 'jeer' end $$;

-- 1c. columns.  Throw state lives on the TARGET's member row (every device
--     draws from it; a late joiner reads it); the host switch on the room.
alter table public.room_members
  add column throwables_on boolean not null default true,   -- his opt-in (default on, ruling)
  add column throw_kind    text null,                       -- what landed last
  add column throw_at      timestamptz null,                -- server start
  add column throw_until   timestamptz null;                -- server expiry; a wipe sets it to now()
alter table public.room_members
  add constraint room_members_throw_kind_curated
    check (throw_kind is null or public.throw_class(throw_kind) is not null);
alter table public.rooms
  add column throwables_on boolean not null default true;

-- 1d. the ledger: rations + anonymity.  RLS on, NO policies, no API grants:
--     no member can read it by any route, and it is not in the realtime
--     publication.  Only throw_at (definer) writes it; only throw_counts
--     (definer) reads it, and only the caller's own rows.
create table public.throw_ledger (
  id         bigserial primary key,
  room_id    uuid not null references public.rooms(id) on delete cascade,
  thrower_id uuid not null,
  cls        text not null check (cls in ('cheer','jeer')),
  kind       text not null check (public.throw_class(kind) = cls),
  target_id  uuid not null,
  at         timestamptz not null default now()
);
create index throw_ledger_ration on public.throw_ledger (room_id, thrower_id, cls);
alter table public.throw_ledger enable row level security;
revoke all on table public.throw_ledger from public, anon, authenticated;
revoke all on sequence public.throw_ledger_id_seq from public, anon, authenticated;

-- 1e. THE GUARD + THE WIPE — one trigger on room_members.
--     Guard: an API role (anon / authenticated — what PostgREST runs a direct
--     table write as) may not change any throw column.  Inside a SECURITY
--     DEFINER function current_user is the owner (postgres), so the five
--     functions below and ask_question pass; a client's own
--     sb.from("room_members").update(...) does not, whatever RLS says.
--     Wipe: a row whose role leaves chair/kept loses its live throw, same
--     instant, whoever moved it (seat/pass/timeout/sweep/step_down/decide_*).
create or replace function public.room_members_throw_guard()
returns trigger language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.throwables_on is distinct from true or new.throw_kind is not null
         or new.throw_at is not null or new.throw_until is not null then
        raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
      end if;
    elsif new.throwables_on is distinct from old.throwables_on
       or new.throw_kind    is distinct from old.throw_kind
       or new.throw_at      is distinct from old.throw_at
       or new.throw_until   is distinct from old.throw_until then
      raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
    end if;
  end if;
  if tg_op = 'UPDATE'
     and old.role in ('chair', 'kept') and new.role not in ('chair', 'kept')
     and new.throw_until is not null and new.throw_until > now() then
    new.throw_until := now();     -- leaving the chair wipes the throw (ruling)
  end if;
  return new;
end $$;
drop trigger if exists room_members_throw_guard on public.room_members;
create trigger room_members_throw_guard
  before insert or update on public.room_members
  for each row execute function public.room_members_throw_guard();

-- the same door on rooms.throwables_on: the host writes her rooms row
-- directly today (status, host_seen_at — gate 61 logs them), so without this
-- she could flip the switch around host_set_throwables.
create or replace function public.rooms_throwables_guard()
returns trigger language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.throwables_on is distinct from old.throwables_on then
    raise exception 'throwables_on changes only through host_set_throwables';
  end if;
  return new;
end $$;
drop trigger if exists rooms_throwables_guard on public.rooms;
create trigger rooms_throwables_guard
  before update on public.rooms
  for each row execute function public.rooms_throwables_guard();

-- 1f. throw_at — the only way a throw lands.  Rejection ORDER is the
--     contract (the double mirrors it word for word): who you are, then the
--     switch, then who he is, then the beat he is in, then your ration.
--     Only a landed throw is charged.  No Moment check: the Moment is not
--     server-side (rooms.moment_* does not exist); the double carries it.
create or replace function public.throw_at(room_id uuid, target uuid, kind text)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_room  rooms%rowtype;
  v_me    room_members%rowtype;
  v_tgt   room_members%rowtype;
  v_cls   text := public.throw_class(kind);
  v_lim   jsonb := public.throw_limits();
  v_now   timestamptz := now();
  v_cheers int; v_jeers int; v_cap int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_room from rooms where id = throw_at.room_id;
  if not found then raise exception 'no room'; end if;
  if v_cls is null then raise exception 'no such throw'; end if;
  if v_room.host_id = v_uid then raise exception 'the host does not throw'; end if;
  select * into v_me from room_members m
    where m.room_id = throw_at.room_id and m.user_id = v_uid;
  if not found or v_me.role = 'gone' then raise exception 'not a member of this room'; end if;
  if v_me.role <> 'spectator' then raise exception 'only the crowd throws'; end if;
  if not v_room.throwables_on then raise exception 'throwables are off for this show'; end if;
  select * into v_tgt from room_members m
    where m.room_id = throw_at.room_id and m.user_id = throw_at.target
    for update;                                  -- one live throw per chair: serialise on his row
  if not found then raise exception 'no such member'; end if;
  if v_tgt.role not in ('chair', 'kept') then raise exception 'target is not in a chair'; end if;
  if not v_tgt.throwables_on then raise exception 'he has throwables off'; end if;
  if v_tgt.throw_until is not null and v_now < v_tgt.throw_until then
    raise exception 'a throw is already live';
  end if;
  if v_tgt.throw_until is not null
     and v_now < v_tgt.throw_until + make_interval(secs => (v_lim->>'cooldown_secs')::int) then
    raise exception 'cooling down';
  end if;
  select count(*) filter (where cls = 'cheer'), count(*) filter (where cls = 'jeer')
    into v_cheers, v_jeers
    from throw_ledger l where l.room_id = throw_at.room_id and l.thrower_id = v_uid;
  v_cap := (v_lim->>(v_cls || 's'))::int;
  if (case v_cls when 'cheer' then v_cheers else v_jeers end) >= v_cap then
    raise exception 'no % left this show', v_cls || 's';
  end if;
  update room_members
     set throw_kind = kind, throw_at = v_now,
         throw_until = v_now + make_interval(secs => (v_lim->>'live_secs')::int)
   where id = v_tgt.id;
  insert into throw_ledger (room_id, thrower_id, cls, kind, target_id, at)
  values (throw_at.room_id, v_uid, v_cls, kind, throw_at.target, v_now);
  if v_cls = 'cheer' then v_cheers := v_cheers + 1; else v_jeers := v_jeers + 1; end if;
  return jsonb_build_object('ok', true, 'kind', kind, 'cls', v_cls,
    'at', v_now, 'until', v_now + make_interval(secs => (v_lim->>'live_secs')::int),
    'cheers_left', (v_lim->>'cheers')::int - v_cheers,
    'jeers_left',  (v_lim->>'jeers')::int  - v_jeers);
end $$;

-- 1g. throw_counts — the caller's OWN remaining rations (the tray needs them
--     before his first throw, and after a leave/rejoin).  Reads only rows
--     where thrower_id = auth.uid(): nobody learns anybody else's throws.
create or replace function public.throw_counts(room_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_lim jsonb := public.throw_limits();
  v_cheers int; v_jeers int;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select count(*) filter (where cls = 'cheer'), count(*) filter (where cls = 'jeer')
    into v_cheers, v_jeers
    from throw_ledger l where l.room_id = throw_counts.room_id and l.thrower_id = v_uid;
  return jsonb_build_object('cheers_left', (v_lim->>'cheers')::int - v_cheers,
                            'jeers_left',  (v_lim->>'jeers')::int  - v_jeers,
                            'limits', v_lim);
end $$;

-- 1h. set_throwables — his own opt-in / opt-out.  Off wipes a live throw on
--     him (ruling: "His opt-out … wipes any throw already on him").
create or replace function public.set_throwables(room_id uuid, "on" boolean)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_row room_members%rowtype;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_row from room_members m
    where m.room_id = set_throwables.room_id and m.user_id = v_uid for update;
  if not found or v_row.role = 'gone' then raise exception 'not a member of this room'; end if;
  update room_members
     set throwables_on = set_throwables."on",
         throw_until = case when not set_throwables."on" and throw_until > now() then now() else throw_until end
   where id = v_row.id;
  return jsonb_build_object('ok', true, 'throwables_on', set_throwables."on");
end $$;

-- 1i. host_clear_throw — the host clears any throw on any chair, any time.
--     A clear with nothing live changes nothing (so it can't shorten a
--     cooldown).
create or replace function public.host_clear_throw(room_id uuid, user_id uuid)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from rooms r
                 where r.id = host_clear_throw.room_id and r.host_id = v_uid) then
    raise exception 'only the host can clear a throw';
  end if;
  if not exists (select 1 from room_members m
                 where m.room_id = host_clear_throw.room_id
                   and m.user_id = host_clear_throw.user_id) then
    raise exception 'no such member';
  end if;
  update room_members set throw_until = now()
   where room_members.room_id = host_clear_throw.room_id
     and room_members.user_id = host_clear_throw.user_id
     and throw_until > now();
  return jsonb_build_object('ok', true);
end $$;

-- 1j. host_set_throwables — the show switch.  Off wipes every live throw in
--     the room and throw_at refuses until it is on again.
create or replace function public.host_set_throwables(room_id uuid, "on" boolean)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  if not exists (select 1 from rooms r
                 where r.id = host_set_throwables.room_id and r.host_id = v_uid) then
    raise exception 'only the host can switch throwables';
  end if;
  update rooms set throwables_on = host_set_throwables."on" where id = host_set_throwables.room_id;
  if not host_set_throwables."on" then
    update room_members set throw_until = now()
     where room_members.room_id = host_set_throwables.room_id and throw_until > now();
  end if;
  return jsonb_build_object('ok', true, 'throwables_on', host_set_throwables."on");
end $$;

-- 1k. grants — the 09-28 shape: no explicit anon, authenticated + service_role
revoke execute on function public.throw_at(uuid,uuid,text)          from anon;
revoke execute on function public.throw_counts(uuid)                from anon;
revoke execute on function public.set_throwables(uuid,boolean)      from anon;
revoke execute on function public.host_clear_throw(uuid,uuid)       from anon;
revoke execute on function public.host_set_throwables(uuid,boolean) from anon;
grant  execute on function public.throw_at(uuid,uuid,text)          to authenticated, service_role;
grant  execute on function public.throw_counts(uuid)                to authenticated, service_role;
grant  execute on function public.set_throwables(uuid,boolean)      to authenticated, service_role;
grant  execute on function public.host_clear_throw(uuid,uuid)       to authenticated, service_role;
grant  execute on function public.host_set_throwables(uuid,boolean) to authenticated, service_role;

-- 1l. ask_question: the ASK wipe, spliced onto the existing filter clear
--     (same statement, same transaction, BEFORE the rooms update — realtime
--     carries the member wipe ahead of the row that says he is asked).  The
--     body is never re-typed: the one fragment is replaced, the result is
--     re-read, and the block rolls back unless after-minus-change = before.
do $do$
declare
  v_sig   constant regprocedure := 'public.ask_question(uuid,bigint,uuid)'::regprocedure;
  v_before text := pg_get_functiondef(v_sig);
  v_old constant text := $a$set filter = null$a$;
  v_new constant text := $a$set filter = null,
         throw_until = case when room_members.throw_until > now() then now() else room_members.throw_until end$a$;
  v_after text;
  v_hits  int;
begin
  if md5(v_before) <> '48bb7506152d8403ba142aeb7b7db672' then
    raise exception 'ask_question is not the 2026-09-28 read-back (% chars, md5 %) - nothing changed; re-read it first',
      length(v_before), md5(v_before);
  end if;
  v_hits := (length(v_before) - length(replace(v_before, v_old, ''))) / length(v_old);
  if v_hits <> 1 then
    raise exception 'the filter-clear fragment occurs % times in ask_question, expected exactly 1 - nothing changed', v_hits;
  end if;
  if position('throw_until' in v_before) > 0 then
    raise exception 'ask_question already mentions throw_until - nothing changed';
  end if;
  execute replace(v_before, v_old, v_new);
  v_after := pg_get_functiondef(v_sig);
  if replace(v_after, v_new, v_old) <> v_before then
    raise exception 'post-check failed: ask_question differs by more than the one fragment - rolling back';
  end if;
  raise notice 'ask_question: % chars md5 %  ->  % chars md5 %',
    length(v_before), md5(v_before), length(v_after), md5(v_after);
end
$do$;

commit;

-- ---------------------------------------------------------------------------
-- 2. READ BACK — read-only, record under "Run log" in the design doc
-- ---------------------------------------------------------------------------
select p.proname, md5(pg_get_functiondef(p.oid)) as md5, length(pg_get_functiondef(p.oid)) as chars,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef, p.proacl
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('ask_question','throw_at','throw_counts','set_throwables','host_clear_throw',
                     'host_set_throwables','throw_limits','throw_class',
                     'room_members_throw_guard','rooms_throwables_guard')
 order by p.proname;
select tgname, tgrelid::regclass, tgenabled from pg_trigger
 where tgname in ('room_members_throw_guard','rooms_throwables_guard');
select table_name, column_name, data_type, column_default, is_nullable from information_schema.columns
 where table_schema = 'public' and (column_name like 'throw%' or table_name = 'throw_ledger') order by 1, 2;
select grantee, privilege_type from information_schema.role_table_grants
 where table_schema = 'public' and table_name = 'throw_ledger';
-- expect: NO anon / authenticated rows
select pubname, tablename from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'throw_ledger';
-- expect: zero rows
select pg_get_functiondef('public.ask_question(uuid,bigint,uuid)'::regprocedure);
-- paste the verbatim text into DESIGN-throwables-server.md SOURCE

-- ---------------------------------------------------------------------------
-- UNDO (one transaction)
-- ---------------------------------------------------------------------------
-- begin;
-- (the same DO block with v_old / v_new swapped and the md5 set to the
--  post-run value recorded above)
-- drop trigger rooms_throwables_guard on public.rooms;
-- drop trigger room_members_throw_guard on public.room_members;
-- drop function public.rooms_throwables_guard(), public.room_members_throw_guard();
-- drop function public.throw_at(uuid,uuid,text), public.throw_counts(uuid),
--               public.set_throwables(uuid,boolean), public.host_clear_throw(uuid,uuid),
--               public.host_set_throwables(uuid,boolean);
-- drop table public.throw_ledger;
-- alter table public.room_members drop constraint room_members_throw_kind_curated;
-- alter table public.room_members drop column throwables_on, drop column throw_kind,
--                                 drop column throw_at, drop column throw_until;
-- alter table public.rooms drop column throwables_on;
-- drop function public.throw_class(text), public.throw_limits();
-- commit;
```

## Dry run — NOT production (2026-10-08)

Against a throwaway local PostgreSQL 16.15 (`initdb`, trust auth) holding a
stand-in: `rooms`, `room_members` (with the four 10/6 filter constraints),
`questions`, `question_decks`, `room_events`, stub `engine_pause_clocks` /
`engine_emit`, a stub `auth.uid()`, roles `anon` / `authenticated` /
`service_role` with Supabase-shaped table grants, RLS on both tables with the
one policy the repo knows (`room_members_select_in_room`) **plus a
permissive member UPDATE policy on purpose** (the worst case for the guard),
and `ask_question` created verbatim from the SOURCE section of
`DESIGN-filter-rules.md`.  The stand-in's `ask_question` is the
whitespace-normalised transcription, so its fingerprint is
`f836e5f0a16b68573216f24043580df9 | 2485`, not production's `48bb… | 2509`;
the dry run substituted that md5 into the guard and nothing else.

- preflight 0a: `f836e5f0a16b68573216f24043580df9 | 2485`
- the change: every statement OK; `NOTICE: ask_question: 2485 chars md5
  f836e5f0… -> 2597 chars md5 9c02d285113266e37e217cc265ab1ba1`; COMMIT
- behaviour, as `authenticated` through the functions: a crowd tomato lands
  with `{jeers_left:1, cheers_left:5}`; a second throw while live → `a throw
  is already live` and the counts are unchanged; `knife` → `no such throw`;
  host → `the host does not throw`; chair → `only the crowd throws`; a bench
  or crowd target → `target is not in a chair`; host clear sets `throw_until`
  to now and a second clear a second later changes nothing; a throw in the
  cooldown → `cooling down` and the wiped tomato is still charged; a kept
  finalist takes a cheer; his `set_throwables(false)` wipes it and the next
  throw at him → `he has throwables off`; `host_set_throwables(false)` wipes
  every live throw and the next throw → `throwables are off for this show`,
  on again allows; the spliced `ask_question` wipes a live throw on the asked
  chair; a role change chair → spectator through a definer function wipes,
  chair → kept does not; five cheers land across five chairs, the sixth →
  `no cheers left this show`, and a delete-and-recreate of the thrower's
  member row leaves `throw_counts` at `cheers_left:0`.
- THE ADDED RULE, as `authenticated` with the permissive update policy in
  place: `update room_members set throw_until = …` / `set throw_kind = 'pie',
  …` / `set throwables_on = false` on his OWN row → `throw state changes only
  through throw_at, set_throwables and host_clear_throw`, row unchanged; `set
  last_seen = now()` on the same row → `UPDATE 1` (the guard is by column).
  The host's `update rooms set throwables_on = false` → `throwables_on
  changes only through host_set_throwables`; her `set host_seen_at = now()`
  → `UPDATE 1`.  A member's `select count(*) from throw_ledger` →
  `permission denied for table throw_ledger`.
- running the change a SECOND time: `ERROR: ask_question is not the
  2026-09-28 read-back (2597 chars, md5 9c02d285…) - nothing changed; re-read
  it first`, from the pre-check, before any DDL.
- read-back: ten functions, owner `postgres`; the five RPCs `prosecdef t` with
  ACL `{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`
  (the 09-28 shape, no `anon`); `throw_ledger` has no `anon` / `authenticated`
  grant.  Stand-in md5s (NOT production's): throw_at
  9a9246f9fce9df3f214641a52573c9e7 / 3008 chars, throw_counts
  f0ffefea3d7d29aaf60360bb595c149f / 754, set_throwables
  474979fb246ea2263c17a3d172d88a15 / 824, host_clear_throw
  c2d049acff03ff73b258d964039b0411 / 935, host_set_throwables
  1552b450127929080a3e9e8d47592496 / 862.  Production's will match these
  for the five new functions if the text is pasted unchanged; `ask_question`'s
  post-splice md5 cannot be predicted (trailing spaces) and the DO block
  prints it.

## The double

`backend-double.js`: member rows carry the four columns, rooms carry
`throwables_on`, `throwLedger` is a Node-side array `table()` refuses to read;
`throw_at` / `throw_counts` / `set_throwables` / `host_clear_throw` /
`host_set_throwables` mirror the rejections above in order; `ask_question`
and `start_moment` wipe inside themselves; `setRole` is the one role writer
and wipes on leaving chair/kept (the trigger's second half); a direct
`room_members` update touching a throw column, or a `rooms` update touching
`throwables_on`, gets the trigger's message.  `THROW_LIMITS` / `THROW_KINDS`
are the server's copies.  The Moment refusal and wipe exist in the double
ONLY (labelled at the call sites).

## Run log

(empty — not run)
