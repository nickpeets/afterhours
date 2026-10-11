# DESIGN — the Pressure and the Crown: the server side

STATUS: **NOT RUN IN PRODUCTION.**  Written with `feat/pressure-crown` (PR B of
`DESIGN-overlay-gameplay.md`, ruling 10/11 items 2 and 5-Crown).  Same pattern
as the 2026-10-08 throwables run in `DESIGN-throwables-server.md`: preflight
reads first, one transaction, md5-guarded, refuses on drift.  The SQL under
"The DDL" is what is proposed; it runs only on Nick's go.  The dry run further
down was against a throwaway local PostgreSQL 16.15 with a stand-in schema.

## Nick's rulings (2026-10-11, asked and answered)

1. **A round is one full pass to HER CALL** — not one ask.  Cracks reset at
   her call; the crown is awarded at her call and worn until the next.
2. **The crown** goes on his running heart total, and needs at least one heart
   and a clear lead.
3. **Only Rose petals mends** a crack.  The other three cheers mend nothing.
4. **There is no shield** (10/8: launched without it), so the crown is the
   only thing that blocks a jeer.

## What "her call" is on the server (read from production, 2026-10-11)

Read verbatim from Studio (read-only), each `pg_get_functiondef` fetched as
hex so nothing was cut:

- `advance_phase`: openfloor -> deliberation when `round >= 3`, else back to
  spotlight; deliberation -> `deciding` with a NULL deadline.  The room then
  sits in `deciding` until she acts.  (It also **refuses a nudge before the
  deadline** — `if now() < v_r.phase_deadline then return noop` — which is why
  the fast-clocked phone found by gate 87 ended an answer only in the harness:
  the double lacked that line.  The double now models it for non-host callers.)
- `decide_pass(room, target)`: `pass_member`, then `engine_open_draft(room,
  seat, 1)`.  `decide_clear(room)`: every chair passed, then
  `engine_open_draft`.
- `engine_open_draft`: nobody waiting -> `engine_set_phase(.., 'draft', ..)`
  (recruiting); exactly one man waiting -> `engine_award_seat` in the same
  transaction, which seats him and goes to `engine_set_phase(.., 'spotlight',
  null, {awaiting_question:true})`; otherwise the storm, phase `draft`.
- `decide_keep`: `keep_member`, `end_show`, phase `ended`.

So **"her call is made" is `rooms.phase` leaving `deciding` for anything but
`ended`**, and it happens inside her own `decide_pass` / `decide_clear`
transaction in every branch — an empty bench included.  That is the one moment
the rooms trigger acts on.  `rooms.round` counts ASKS inside a round
(`ask_question`: `round = coalesce(r.round,0) + 1`; the on-screen "ROUND 2"
card) and is not used; `rooms.cycle` is not used either.

Columns as read (information_schema): `rooms.phase text`,
`room_members.seated_at timestamptz`, `room_members.role text`,
`room_events (id bigint, room_id uuid, user_id uuid, type text, payload jsonb,
created_at timestamptz default now())`.  Triggers on the two tables today:
exactly `room_members_throw_guard` and `rooms_throwables_guard`, both enabled.

## The rule, in one sentence

His cracks are a number on his own member row that only a LANDED throw can
move (a jeer +1 up to the shatter threshold, a rose -1 down to 0), the crown
is one uuid on the room that only her call can set, and a jeer at the crown
holder is refused before it is charged; the client observes both and writes
neither.

## Why no engine function is touched

`throw_at`, `ask_question`, `decide_pass`, `decide_clear` and
`engine_award_seat` are read in the preflight and left byte-identical.
Everything hangs off the two triggers the 10/8 run already installed, plus one
new one:

- **Cracks and the crown's block live in `room_members_throw_guard`**, the
  BEFORE trigger on the member row.  "A throw landed" is `throw_at` changing
  to a new stamp; `throw_at()` is the only writer of that column (the same
  trigger refuses every API role), and a wipe only ever moves `throw_until`.
  Raising there aborts `throw_at()` before its ledger insert, so a jeer the
  crown refuses is not charged — "only landed throws cost anything" holds.
  Consequence for the ORDER of refusals: the crown's "he wears the crown this
  round" comes after `throw_at`'s own (live, cooling, ration).  The tray says
  it first, client-side, so a thrower rarely meets the server's.
- **Her call lives in a new BEFORE UPDATE trigger on `rooms`**,
  `rooms_overlay_round`, which acts only when the phase leaves `deciding` (or
  goes to preshow / showstart) and only for the show's own definer functions.
- **`rooms_throwables_guard` learns `crown_user`**, because the host writes
  her own rooms row directly (`rooms_update_host`, read 10/8).

Who can win the crown falls out of the order inside her call.  The man she
passed has already left his chair when the phase moves, so he is not counted.
The man `engine_award_seat` seats in the same transaction has `seated_at` =
that transaction's `now()`, and the trigger counts only `seated_at < now()`,
so he is not counted until he has sat a round.

PR C (combos, reaction windows) will have to change `throw_at` itself; that
is its own md5-guarded run.

## Defaults as built (all in `throw_limits()` or stated here)

| Setting | Default | Where |
|---|---|---|
| Cracks to shatter | 3 | `throw_limits()` -> `cracks_to_shatter` |
| A rose mends | 1 crack; "a rose" is the `petals` throw only | `throw_limits()` -> `rose_mends`; the trigger |
| Cracks past the threshold | not counted: the count stops at 3, so one rose un-shatters | the trigger's `least(...)` |
| Shatter | no consequence: no function reads the count | — |
| Round | one full pass to her call (the phase leaves `deciding`, not to `ended`) | `rooms_overlay_round` |
| Crown contenders | men in a chair (chair or kept) when her call is made, who were seated before it | `seated_at < now()` |
| Crown hearts | his running total in the room (`room_events` type `heart`, `payload.target`) — the number on his tile | the same count `engine_open_draft` reads |
| Crown needs | a clear lead and at least one heart | `v_max > 0 and v_n = 1` |
| Crown tie | the holder keeps it if he is still in a chair; otherwise nobody (so round 1 tied is no crown) | the `else` branch |
| Crown blocks | jeers only; cheers land | the member trigger |
| Leaving the chair | resets his cracks | the member trigger |
| A KEEP (the show ends) | awards nothing, resets nothing | `new.phase = 'ended'` returns early |
| A fresh show (preshow / showstart) | no crown, no cracks | `rooms_overlay_round` |

## The DDL

```sql
-- ============================================================================
-- THE PRESSURE AND THE CROWN — server DDL (feat/pressure-crown, PR B of
-- tools/DESIGN-overlay-gameplay.md, ruling 10/11 items 2 and 5-Crown).
-- NOT RUN IN PRODUCTION.  Pattern: the 2026-10-08 throwables run
-- (tools/DESIGN-throwables-server.md) — preflight reads first, one
-- transaction, md5-guarded, refuses on drift.
--
-- WHAT A "ROUND" IS (Nick's ruling, 2026-10-11): one full pass to HER CALL.
-- Cracks reset at her call; the crown is awarded at her call and worn until
-- the next.  On the server "her call is made" is rooms.phase LEAVING
-- 'deciding' for anything but 'ended': decide_pass and decide_clear each send
-- the room to the draft (engine_open_draft -> 'draft') or, when one man is
-- waiting, straight through engine_award_seat to 'spotlight' (all four read
-- verbatim from Studio 2026-10-11).  decide_keep ends the show ('ended') and
-- awards nothing.  rooms.round counts ASKS inside a round and is not used.
--
-- NO ENGINE FUNCTION IS TOUCHED.  ask_question, throw_at, decide_pass,
-- decide_clear and engine_award_seat are read in the preflight and left
-- byte-identical.  The whole change is two columns, the two throwables
-- trigger functions (ours, from 10/8), throw_limits(), and one new trigger
-- on rooms:
--   * a jeer that LANDS adds a crack to his row; a rose that lands mends one
--     — in the member trigger, at the one statement throw_at lands a throw
--     with, so it is inside throw_at's transaction and its refusals;
--   * a jeer at the crown holder is refused there too, before it is charged;
--   * when the phase leaves 'deciding', the rooms trigger names the next
--     crown holder from hearts and resets every crack in the room.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT — read-only, run each on its own FIRST, record the output.
-- ---------------------------------------------------------------------------

-- 0a. the functions this run replaces, and the ones it relies on but does NOT
--     change, are still what was read on 2026-10-11
select p.proname, md5(pg_get_functiondef(p.oid)) as md5, length(pg_get_functiondef(p.oid)) as chars
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('throw_limits','room_members_throw_guard','rooms_throwables_guard',
                     'throw_at','ask_question','decide_pass','decide_clear','decide_keep',
                     'engine_award_seat','start_show','reset_to_preshow')
 order by 1;
-- expect:
--   ask_question             e7eab394ff015d05b862af2488edf4c8  2621   (not changed)
--   decide_clear             0db37ccaae1c450c2006c47ff2bf0dc7  1139   (not changed; her call: clear the deck)
--   decide_keep              c59780e1822640bef4796375d536fd55  1010   (not changed; ends the show)
--   decide_pass              7c5c0cf140f5fc08cbfcca92bfd8b834  1210   (not changed; her call: pass one)
--   engine_award_seat        6689d96db3caec67f13da7ae2d2b95bd  3134   (not changed; the refill)
--   reset_to_preshow         b6aa27c5052a7a6d3aa3ad3cc85e6ef2   818   (not changed)
--   room_members_throw_guard 35ab1411f492782eb961aae3878e7392  1130   (REPLACED)
--   rooms_throwables_guard   dfdef710af209e2b12cdf45afb481799   345   (REPLACED)
--   start_show               be6672f982a3738d74347ca499b56757  1102   (not changed)
--   throw_at                 2d89b8e0fff960634f280523015ed916  3120   (not changed)
--   throw_limits             77a819eb64491e24708b3b7d002027c1   203   (REPLACED)

-- 0b. the new columns and the new trigger do not exist yet
select table_name, column_name from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'room_members' and column_name = 'cracks')
     or (table_name = 'rooms' and column_name = 'crown_user'));
select tgname from pg_trigger where tgname = 'rooms_overlay_round' and not tgisinternal;
-- expect: zero rows, twice

-- 0c. the columns the round trigger reads exist with the types it assumes
select table_name, column_name, data_type from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'rooms' and column_name in ('phase'))
     or (table_name = 'room_members' and column_name in ('seated_at','role'))
     or (table_name = 'room_events' and column_name in ('type','payload')))
 order by 1, 2;
-- expect: room_events payload jsonb / type text;
--         room_members role text / seated_at timestamptz; rooms phase text

-- 0d. the triggers on the two tables today (expect exactly the two guards)
select c.relname, t.tgname, t.tgenabled
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal and c.relname in ('rooms','room_members')
 order by 1, 2;
-- expect: room_members | room_members_throw_guard | O
--         rooms        | rooms_throwables_guard   | O

-- ---------------------------------------------------------------------------
-- 1. THE CHANGE — one transaction.  If Studio runs statements one at a time
--    and anything raises, run `rollback;` before anything else.
-- ---------------------------------------------------------------------------
begin;

-- 1-pre. REFUSE ON DRIFT before touching anything.
do $do$
declare r record;
begin
  for r in
    select * from (values
      ('throw_limits',             '77a819eb64491e24708b3b7d002027c1'),
      ('room_members_throw_guard', '35ab1411f492782eb961aae3878e7392'),
      ('rooms_throwables_guard',   'dfdef710af209e2b12cdf45afb481799'),
      ('throw_at',                 '2d89b8e0fff960634f280523015ed916'),
      ('decide_pass',              '7c5c0cf140f5fc08cbfcca92bfd8b834'),
      ('decide_clear',             '0db37ccaae1c450c2006c47ff2bf0dc7')
    ) as v(fn, want)
  loop
    if (select count(*) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.fn) <> 1 then
      raise exception '% is missing or overloaded - nothing changed; re-read it first', r.fn;
    end if;
    if (select md5(pg_get_functiondef(p.oid)) from pg_proc p
         where p.pronamespace = 'public'::regnamespace and p.proname = r.fn) <> r.want then
      raise exception '% is not the 2026-10-11 read-back (md5 %) - nothing changed; re-read it first', r.fn,
        (select md5(pg_get_functiondef(p.oid)) from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname = r.fn);
    end if;
  end loop;
  if exists (select 1 from information_schema.columns
              where table_schema = 'public'
                and ((table_name = 'room_members' and column_name = 'cracks')
                  or (table_name = 'rooms' and column_name = 'crown_user'))) then
    raise exception 'cracks / crown_user already exist - nothing changed; this has run before';
  end if;
  if exists (select 1 from pg_trigger where tgname = 'rooms_overlay_round' and not tgisinternal) then
    raise exception 'rooms_overlay_round already exists - nothing changed; this has run before';
  end if;
end
$do$;

-- 1a. the numbers, in the one place they already live.  Two keys added; the
--     four from 10/8 are unchanged.  throw_counts() hands this to the client.
create or replace function public.throw_limits()
returns jsonb language sql immutable
as $$ select jsonb_build_object('cheers', 5, 'jeers', 2, 'live_secs', 10, 'cooldown_secs', 20,
                               'cracks_to_shatter', 3, 'rose_mends', 1) $$;

-- 1b. columns.  Cracks live on HIS member row (every device draws his frame
--     from it, like the throw itself); the crown is the room's.
alter table public.room_members
  add column cracks integer not null default 0;        -- landed jeers this round, minus roses, 0..cracks_to_shatter
alter table public.room_members
  add constraint room_members_cracks_floor check (cracks >= 0);
alter table public.rooms
  add column crown_user uuid null;                      -- who wears the crown until her next call (null: nobody)

-- 1c. THE MEMBER TRIGGER — the 10/8 guard and wipe, plus the Pressure and
--     the crown's block.  Same function, same trigger, same guard message.
--     "A throw landed" is: throw_at changed to a new stamp.  throw_at() is the
--     only thing that sets it (the guard above refuses everyone else), and a
--     wipe only ever moves throw_until, so no other door can add or mend a
--     crack.  Raising here aborts throw_at before its ledger insert: a jeer
--     the crown refuses is not charged.
create or replace function public.room_members_throw_guard()
returns trigger language plpgsql
as $$
declare v_lim jsonb;
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.throwables_on is distinct from true or new.throw_kind is not null
         or new.throw_at is not null or new.throw_until is not null
         or new.cracks is distinct from 0 then
        raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
      end if;
    elsif new.throwables_on is distinct from old.throwables_on
       or new.throw_kind    is distinct from old.throw_kind
       or new.throw_at      is distinct from old.throw_at
       or new.throw_until   is distinct from old.throw_until
       or new.cracks        is distinct from old.cracks then
      raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
    end if;
  end if;
  if tg_op = 'UPDATE' then
    if new.throw_at is not null and new.throw_at is distinct from old.throw_at then
      if public.throw_class(new.throw_kind) = 'jeer' then
        if exists (select 1 from public.rooms r
                    where r.id = new.room_id and r.crown_user = new.user_id) then
          raise exception 'he wears the crown this round';
        end if;
        v_lim := public.throw_limits();
        new.cracks := least((v_lim->>'cracks_to_shatter')::int, coalesce(old.cracks, 0) + 1);
      elsif new.throw_kind = 'petals' then
        v_lim := public.throw_limits();
        new.cracks := greatest(0, coalesce(old.cracks, 0) - (v_lim->>'rose_mends')::int);
      end if;
    end if;
    if old.role in ('chair', 'kept') and new.role not in ('chair', 'kept') then
      if new.throw_until is not null and new.throw_until > now() then
        new.throw_until := now();   -- leaving the chair wipes the throw (ruling, 10/8)
      end if;
      new.cracks := 0;              -- and the frame he leaves is clean for the next man
    end if;
  end if;
  return new;
end $$;

-- 1d. THE ROOMS GUARD learns the crown: the host writes her rooms row
--     directly (status, host_seen_at), so without this she could crown a
--     man around the show.
create or replace function public.rooms_throwables_guard()
returns trigger language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated')
     and new.throwables_on is distinct from old.throwables_on then
    raise exception 'throwables_on changes only through host_set_throwables';
  end if;
  if current_user in ('anon', 'authenticated')
     and new.crown_user is distinct from old.crown_user then
    raise exception 'the crown is awarded at her call, never written';
  end if;
  return new;
end $$;

-- 1e. HER CALL TURNS THE ROUND OVER — a BEFORE UPDATE trigger on rooms.  It
--     acts on two things only, and only for the show's own (definer)
--     functions:
--       * the phase goes to preshow or showstart: a fresh show, nothing
--         carries over (start_show, reset_to_preshow);
--       * the phase LEAVES 'deciding' for anything but 'ended': her call is
--         made (decide_pass / decide_clear).  The crown goes to the man with
--         the most hearts among the men still in a chair — a clear lead and
--         at least one heart; on a tie the holder keeps it if he is still in
--         a chair, otherwise nobody wears it.  Then every crack in the room
--         resets.
--     Hearts are room_events rows (type 'heart', payload.target) — his
--     running total in the room, the number on his tile, the same count
--     engine_open_draft already reads.
--     WHO IS A CONTENDER: the man she just passed is not (pass_member has
--     already taken his chair when the phase moves).  The man seated in this
--     very call is not either: when one man is waiting, decide_pass seats
--     him through engine_award_seat in the SAME transaction, so his
--     seated_at is this transaction's now() — "seated_at < now()" leaves him
--     out and keeps everyone seated before her call.
create or replace function public.rooms_overlay_round()
returns trigger language plpgsql
as $$
declare
  v_max int; v_n int; v_top uuid; v_held boolean;
begin
  if current_user in ('anon', 'authenticated') then return new; end if;
  if new.phase is not distinct from old.phase then return new; end if;

  if new.phase in ('preshow', 'showstart') then
    new.crown_user := null;
    update public.room_members m set cracks = 0 where m.room_id = new.id and m.cracks <> 0;
    return new;
  end if;

  if old.phase is distinct from 'deciding' or new.phase = 'ended' then return new; end if;

  with seated as (
    select m.user_id,
           (select count(*) from public.room_events e
             where e.room_id = new.id and e.type = 'heart'
               and e.payload->>'target' = m.user_id::text)::int as h
      from public.room_members m
     where m.room_id = new.id and m.role in ('chair', 'kept')
       and coalesce(m.seated_at, '-infinity'::timestamptz) < now()
  )
  select max(s.h),
         count(*) filter (where s.h = (select max(h) from seated)),
         (array_agg(s.user_id order by s.h desc))[1]
    into v_max, v_n, v_top
    from seated s;

  if v_max is not null and v_max > 0 and v_n = 1 then
    new.crown_user := v_top;
  else
    select exists (select 1 from public.room_members m
                    where m.room_id = new.id and m.user_id = old.crown_user
                      and m.role in ('chair', 'kept'))
      into v_held;
    new.crown_user := case when v_held then old.crown_user else null end;
  end if;

  update public.room_members m set cracks = 0 where m.room_id = new.id and m.cracks <> 0;
  return new;
end $$;
create trigger rooms_overlay_round
  before update on public.rooms
  for each row execute function public.rooms_overlay_round();
-- (BEFORE triggers fire in name order: rooms_overlay_round, then
--  rooms_throwables_guard.  For an API role the first returns at once and the
--  guard sees the row exactly as the client wrote it.)

commit;

-- ---------------------------------------------------------------------------
-- 2. READ BACK — after the commit, record every row.
-- ---------------------------------------------------------------------------
select p.proname, md5(pg_get_functiondef(p.oid)) as md5, length(pg_get_functiondef(p.oid)) as chars,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('throw_limits','room_members_throw_guard','rooms_throwables_guard','rooms_overlay_round',
                     'throw_at','ask_question','decide_pass','decide_clear','engine_award_seat','start_show')
 order by 1;
-- expect (from the dry run): room_members_throw_guard / rooms_throwables_guard /
--   throw_limits / rooms_overlay_round as listed in tools/DESIGN-overlay-server.md;
--   throw_at, ask_question, decide_pass, decide_clear, engine_award_seat,
--   start_show UNCHANGED from 0a.
select public.throw_limits();
select c.relname, t.tgname, t.tgenabled
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal and c.relname in ('rooms','room_members') order by 1, 2;
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'room_members' and column_name = 'cracks')
     or (table_name = 'rooms' and column_name = 'crown_user'));

-- ---------------------------------------------------------------------------
-- 3. UNDO — only if asked.  Puts the three functions back to their 10/8 text
--    (verbatim from tools/DESIGN-throwables-server.md) and drops what 1 added.
-- ---------------------------------------------------------------------------
-- begin;
-- drop trigger if exists rooms_overlay_round on public.rooms;
-- drop function if exists public.rooms_overlay_round();
-- create or replace function public.throw_limits()
-- returns jsonb language sql immutable
-- as $$ select jsonb_build_object('cheers', 5, 'jeers', 2, 'live_secs', 10, 'cooldown_secs', 20) $$;
-- create or replace function public.room_members_throw_guard()
-- returns trigger language plpgsql
-- as $$
-- begin
--   if current_user in ('anon', 'authenticated') then
--     if tg_op = 'INSERT' then
--       if new.throwables_on is distinct from true or new.throw_kind is not null
--          or new.throw_at is not null or new.throw_until is not null then
--         raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
--       end if;
--     elsif new.throwables_on is distinct from old.throwables_on
--        or new.throw_kind    is distinct from old.throw_kind
--        or new.throw_at      is distinct from old.throw_at
--        or new.throw_until   is distinct from old.throw_until then
--       raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
--     end if;
--   end if;
--   if tg_op = 'UPDATE'
--      and old.role in ('chair', 'kept') and new.role not in ('chair', 'kept')
--      and new.throw_until is not null and new.throw_until > now() then
--     new.throw_until := now();     -- leaving the chair wipes the throw (ruling)
--   end if;
--   return new;
-- end $$;
-- create or replace function public.rooms_throwables_guard()
-- returns trigger language plpgsql
-- as $$
-- begin
--   if current_user in ('anon', 'authenticated')
--      and new.throwables_on is distinct from old.throwables_on then
--     raise exception 'throwables_on changes only through host_set_throwables';
--   end if;
--   return new;
-- end $$;
-- alter table public.room_members drop constraint room_members_cracks_floor;
-- alter table public.room_members drop column cracks;
-- alter table public.rooms drop column crown_user;
-- commit;
```

## Dry run — NOT production (2026-10-11)

A throwaway local PostgreSQL 16.15.  The stand-in schema is production's
column list as read 2026-10-11; the 10/8 throwables DDL (sections 1a-1k of
`DESIGN-throwables-server.md`) was loaded first, and **every function it
creates came out with production's md5** — `throw_at` 2d89b8e0…, `throw_limits`
77a819eb…, `room_members_throw_guard` 35ab1411…, `rooms_throwables_guard`
dfdef710… — so the drift guard was tested against the real fingerprints of
the three functions this run replaces.  `decide_pass`, `decide_clear`,
`engine_open_draft`, `engine_award_seat`, `engine_set_phase` and `start_show`
are stand-ins (production's rooms and member statements without the draft's
vote machinery), so for the dry run ONLY the two pinned stand-ins' expected
md5s (`decide_pass`, `decide_clear`) were swapped for the stand-ins'; the
production values in the SQL above are what preflight 0a must show on the day.

What ran, in order:

1. the change block: clean, no notices.
2. the behaviour test (35 checks, through `throw_at` as an `authenticated`
   caller where a caller matters, and through `decide_pass` / `decide_clear` /
   `decide_keep` for her call):

```
  1 | PASS | a landed jeer adds a crack (1)
  2 | PASS | a second jeer: 2
  3 | PASS | a REFUSED jeer adds no crack and is not charged
  4 | PASS | a third jeer: 3 (shattered)
  5 | PASS | a fourth jeer lands but the count stays at cracks_to_shatter (3)
  6 | PASS | a heart burst (a cheer that is not a rose) mends nothing
  7 | PASS | a rose mends one (3 -> 2)
  8 | PASS | a rose on a clean frame stays at 0 (floor)
  9 | PASS | nobody else's frame moved
 10 | PASS | a wipe (throw_until = now) leaves the cracks: they persist across the ASK wipe
 11 | PASS | a chair's own direct write of cracks is refused with the guard's words: throw state changes only through throw_at, set_throwables and host_clear_throw
 12 | PASS | ...and his cracks are unchanged
 13 | PASS | leaving the chair resets his cracks
 14 | PASS | her call has begun: no crown yet, the cracks still stand
 15 | PASS | (decide_pass seated the waiting man and went back to the floor, as production does with one candidate)
 16 | PASS | HER CALL IS MADE: the crown goes to the clear hearts leader among the men still in a chair
 17 | PASS | ...not to the man seated in this very call, though he has more hearts
 18 | PASS | ...and every crack in the room is reset
 19 | PASS | a jeer at the crown holder is refused
 20 | PASS | ...is not charged, and nothing landed
 21 | PASS | a cheer at the crown holder lands
 22 | PASS | a jeer at anybody else still lands
 23 | PASS | the host's direct rooms write of crown_user is refused, her heartbeat write is not: the crown is awarded at her call, never written
 24 | PASS | (b carries a crack into the asks)
 25 | PASS | an ASK, the open floor and deliberation reset nothing and move no crown
 26 | PASS | (nobody on the bench: decide_pass leaves the room in the draft)
 27 | PASS | her next call: the man seated last round has now sat a round, and his 40 hearts take the crown — with an empty bench too
 28 | PASS | ...and the cracks reset again
 29 | PASS | hearts tied at the top: the holder keeps the crown
 30 | PASS | a new clear leader takes the crown
 31 | PASS | she passes the holder and the rest are tied: nobody wears it
 32 | PASS | a KEEP (the phase goes to ended) awards nothing and resets nothing
 33 | PASS | start_show: no crown, no cracks
 34 | PASS | round 1, hearts tied: no crown
 35 | PASS | decide_clear is her call too: nobody has a heart, so no crown, and the cracks reset
```

3. the change block a second time: **refused**, nothing changed.
4. read back after the change:

| function | md5 | chars |
|---|---|---|
| room_members_throw_guard | f1ac023562851e459c0ec07027cc2929 | 2060 |
| rooms_overlay_round | ea08f4f65a326fa485c0864c1e81baa1 | 1675 |
| rooms_throwables_guard | 5edf06ffc53bd1934d8efef19541855a | 534 |
| throw_limits | d01ea3ffd5b39afc59953e613b1ca2ff | 275 |
| throw_at | 2d89b8e0fff960634f280523015ed916 | 3120 (unchanged) |

5. the undo block: the three functions are back at their 10/8 md5s
   (35ab1411…, dfdef710…, 77a819eb…), `rooms_overlay_round` is gone, both new
   columns are gone.
6. drift: `throw_limits()` altered by hand, then the change block —
   **refused** naming `throw_limits`, and neither new column exists after.
7. two deliberate breaks of the SQL, each run against the same 35 checks:
   her call not resetting the cracks turned 4 checks red (18, 19, 28, 35);
   the member trigger not refusing a jeer at the crown holder turned 3 red
   (19, 20, 21).  Both were put back; the file above is the one that passed.

NOT covered by the dry run: production's real `decide_pass` / `decide_clear` /
`engine_award_seat` firing the new trigger (the stand-ins run the same rooms
and member statements in the same order), the draft storm, RLS, and realtime
carrying the two new columns.  The phone test in the PR is the behavioural
proof.

## The double

`tools/lib/backend-double.js` mirrors the above: `cracks` and `seated_at` on
the member row, `crown_user` on the room; `landOnRow()` is the member
trigger's landing half and is called by `throw_at` after all of its own
refusals; `setRole()` resets cracks when a man leaves his chair;
`overlayFresh()` / `overlayHerCall()` are the rooms trigger's two halves; the
two guards refuse a direct client write of either column with the SQL's words.
WHAT THE DOUBLE FAKES: production moves the phase inside `decide_pass` /
`decide_clear` (to the draft, or through `engine_award_seat` to the floor).
The double has no draft, so its phase leaves `deciding` a beat later, when the
show walks on; `decide_pass` / `decide_clear` stamp the moment and the
contenders are frozen there, the same set production's `seated_at < now()`
sees.  Gate 88 is the proof through the real page.

## Run log

Not run.
