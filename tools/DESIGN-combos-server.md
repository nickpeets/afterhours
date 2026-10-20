# DESIGN — crowd combos and reaction windows: the server side

STATUS: **NOT RUN IN PRODUCTION.**  Written with `feat/combos-reaction` (PR C of
`DESIGN-overlay-gameplay.md`, ruling 10/11 items 3 and 4).  Same pattern as the
2026-10-08 throwables run (`DESIGN-throwables-server.md`) and the 2026-10-11
Pressure/Crown run (`DESIGN-overlay-server.md`): preflight reads first, one
transaction, md5-guarded, refuses on drift.  The SQL under "The DDL" is what
is proposed; it runs only on Nick's go.  The dry run further down was against
a throwaway local PostgreSQL 16.15 with a stand-in schema.

## What the ruling asks for

3. **Crowd combos.**  3 different crowd members throwing the same polarity at
   the same chair within 5 seconds: STANDING OVATION (cheers: a room-wide
   effect and +1 heart) or BOOED OFF (jeers: a banner over his tile and a
   host-only nudge; no automatic consequence).  Throwers stay anonymous; the
   room sees a count.
4. **Reaction windows.**  For 6 seconds after he finishes answering, every
   throw at him counts double: 2 cracks for a jeer, 2 mended for a rose, 2
   toward a combo.  The ration is still charged once.

And the one rule that changes: while a throw is live, a same-polarity throw
from a *different* crowd member within the 5s combo window is accepted as a
"join" — charged, counted, and it does not restart or stack the overlay.  An
opposite-polarity throw during a live throw is still refused.  His cooldown
starts when the live throw (including any combo effect) ends.

## What was read from production for this (2026-10-11, read-only)

Each `pg_get_functiondef` fetched as hex from Studio so nothing was cut.

- **How an answer ends.**  `ask_question` puts him on the clock
  (`spotlight_target`, a 30s `phase_deadline`).  Two things end it, and both
  finish in the same statement: `advance_phase` (it refuses a nudge before the
  deadline, then `engine_set_phase(.., 'openfloor', now() + 45s)`), and her
  `skip_phase` (`update rooms set phase_deadline = now()`, then
  `advance_phase`).  `spotlight_target` is still his when the phase moves; it
  is cleared only on the way back into `spotlight`.  So **"he finished
  answering" is `rooms.phase` leaving `spotlight` while `spotlight_target` and
  `phase_deadline` are set** — one place, whichever way it ended.
- **`clear_spotlight_target`** (hers) clears the target without moving the
  phase.  That is not an answer ending and opens nothing.
- **Hearts** are `room_events` rows of type `heart` with `payload.target`,
  inserted by the client that sent them (`room_events_insert_own`), with the
  sender in `user_id`.  `room_events.user_id` is nullable (FK to
  `auth.users`), the table has no trigger, and it is in the realtime
  publication.  `engine_emit` writes `auth.uid()` into `user_id` — using it
  for the ovation's heart would have named the third thrower to the whole
  room, so the heart is inserted directly with `user_id` NULL.
- **`throw_at`** is still the 10/8 text (md5 2d89b8e0…): any throw at a chair
  with a live throw is refused, and the crack arithmetic and the crown's block
  sit in the member trigger (10/11).
- Every function in these paths is SECURITY DEFINER owned by `postgres`; the
  three overlay trigger functions are not (they run as whoever fires them).

## The rules as built

| Setting | Default | Where |
|---|---|---|
| Combo window | 5s from the throw that LANDED | `throw_limits()` -> `combo_secs` |
| Combo count | 3 | `throw_limits()` -> `combo_n` |
| What counts | one per accepted throw; 2 inside his reaction window | `throw_n` on his row |
| A join | same polarity (any kind), a thrower not already in this throw | `throw_at` |
| The same thrower again | refused (`a throw is already live`), not charged | `throw_at`, from the ledger |
| Opposite polarity while live | refused as before | `throw_at` |
| After the window closes (5s to 10s) | refused as before | `throw_at` |
| A join is a landed throw | yes: charged once, a jeer cracks, a rose mends | `throw_at` |
| The combo fires | once per live throw; later joiners are still accepted | `throw_combo_at` on his row |
| The combo's effect | 4s, inside the live throw; his cooldown starts after | `combo_fx_secs`; `throw_until` |
| Ovation bonus | +1 heart, a `room_events` row with NO sender | `ovation_hearts` |
| Booed off | no server consequence at all | — |
| Reaction window | 6s from the phase leaving `spotlight` with him on the clock | `react_secs`; `rooms_overlay_round` |
| Reaction multiplier | ×2: cracks, mends and the combo count | `react_mult` |
| The ration in the window | charged once | `throw_at` |
| His cooldown in his window | does not apply (a live throw still does) | `throw_at` |
| The crown's block | unchanged in words; now refused before the ration | `throw_at` |

## What the spec left open, and what was built

1. **Is a join a landed throw?**  Built: yes.  It is charged, so it cracks or
   mends like any other.  Three jeers that make BOOED OFF are also three
   cracks: his frame shatters with it.
2. **When does the 5 seconds start?**  Built: at the throw that landed.
3. **The same thrower's second throw.**  Built: refused and not charged
   (the spec says a join is "from a different crowd member"), not
   accepted-and-ignored.
4. **A fourth thrower after the combo has fired.**  Built: accepted as a
   join (charged, cracks) but the combo does not fire again.
5. **Does the reaction window lift his cooldown?**  The spec does not say.
   Built: yes, for him, for his six seconds.  Without it the window is dead
   whenever anything was thrown in the last 30 seconds of his answer.  A
   LIVE throw still blocks the other polarity, window or not.
6. **Who gives the ovation's heart?**  Nobody: `user_id` NULL.
7. **What the room's count is.**  The weighted count (`throw_n`), so one
   throw in his window shows ×2.

## Why throw_at is replaced, and the member trigger shrinks

On 10/11 the crack arithmetic and the crown's block were put in the member
trigger so that `throw_at` did not have to be replaced.  A join breaks that
arrangement: it does not move `throw_at` on his row (the overlay must not
restart), so the trigger cannot see it, and the trigger cannot know the
JOINER'S kind (a rose joining a heart burst mends; the row still says
`hearts`).  So this run replaces `throw_at`, and "what a landed throw does" —
the crown's refusal, the weight, the cracks, the count, the combo, the heart —
is now in that one function.  The trigger goes back to what it was on 10/8
(guard + wipe) plus the columns added since and the reset of his cracks when
he leaves the chair.

The order of refusals in `throw_at` is unchanged, with the crown placed with
"who he is": not authenticated, no room, no such throw, the host does not
throw, not a member, only the crowd throws, throwables off for the show, no
such member, not in a chair, he has throwables off, **he wears the crown this
round**, a throw is already live (unless it is a join), cooling down (unless
it is his window), no cheers/jeers left.

No engine function is touched: `ask_question`, `advance_phase`, `skip_phase`,
`engine_set_phase`, `decide_pass`, `decide_clear` and `engine_award_seat` are
read in the preflight and left byte-identical.

## The DDL

```sql
-- ============================================================================
-- CROWD COMBOS AND REACTION WINDOWS — server DDL (feat/combos-reaction, PR C
-- of tools/DESIGN-overlay-gameplay.md, ruling 10/11 items 3 and 4).
-- NOT RUN IN PRODUCTION.  Pattern: the 2026-10-08 throwables run and the
-- 2026-10-11 Pressure/Crown run — preflight reads first, one transaction,
-- md5-guarded, refuses on drift.
--
-- WHAT CHANGES
--   * throw_at() is REPLACED (the first time since 10/8).  It keeps every
--     refusal it has, in the same order, and gains:
--       - THE JOIN: while a throw is live on him, a same-polarity throw from
--         a DIFFERENT crowd member inside the combo window (5s from the
--         landing) is accepted.  It is charged to that thrower and counts
--         toward the combo; it does not restart or stack the overlay.
--         Anything else while a throw is live is refused as before.
--       - THE COMBO: when the count for the live throw reaches 3 it fires,
--         once.  Cheers: STANDING OVATION, +1 heart to him.  Jeers: BOOED OFF.
--       - THE REACTION WINDOW: for 6s after his answer ends, a throw at him
--         counts double — toward cracks, mends and the combo.  The thrower's
--         ration is charged once.  The chair's cooldown does not apply to
--         him inside his window (a live throw still does).
--       - the crown's block and the cracks move INTO throw_at from the
--         member trigger (one place for "what a landed throw does").
--   * room_members_throw_guard (ours, 10/11) goes back to guard + wipe: the
--     crown block and the crack arithmetic leave it; it learns the two new
--     columns.  Leaving the chair still resets his cracks.
--   * rooms_overlay_round (ours, 10/11) also opens the reaction window: the
--     phase LEAVING 'spotlight' with a man on the clock (advance_phase at his
--     deadline, or her skip_phase) stamps rooms.react_user / react_until.
--   * rooms_throwables_guard (ours) refuses a client's direct write of them.
--   * throw_limits() gains six keys.  Two columns on room_members, two on
--     rooms.
-- NO ENGINE FUNCTION IS TOUCHED: ask_question, advance_phase, skip_phase,
-- engine_set_phase, decide_pass, decide_clear, engine_award_seat are read in
-- the preflight and left byte-identical.
--
-- ANONYMITY: the thrower is still only in throw_ledger (RLS on, no policies,
-- not published).  The room sees a COUNT on his row (throw_n), never a name.
-- The ovation's heart is a room_events row with user_id NULL.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0. PREFLIGHT — read-only, run each on its own FIRST, record the output.
-- ---------------------------------------------------------------------------

-- 0a. the functions this run replaces, and the ones it relies on but does NOT
--     change, are still what was read on 2026-10-11
select p.proname, md5(pg_get_functiondef(p.oid)) as md5, length(pg_get_functiondef(p.oid)) as chars
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('throw_at','throw_limits','room_members_throw_guard','rooms_throwables_guard',
                     'rooms_overlay_round','throw_class','throw_counts','ask_question','advance_phase',
                     'skip_phase','engine_set_phase','decide_pass','decide_clear','engine_award_seat')
 order by 1;
-- expect:
--   advance_phase            cf40a21d901322ac721e118f0c339bd4  2060   (not changed; ends an answer at its deadline)
--   ask_question             e7eab394ff015d05b862af2488edf4c8  2621   (not changed)
--   decide_clear             0db37ccaae1c450c2006c47ff2bf0dc7  1139   (not changed)
--   decide_pass              7c5c0cf140f5fc08cbfcca92bfd8b834  1210   (not changed)
--   engine_award_seat        6689d96db3caec67f13da7ae2d2b95bd  3134   (not changed)
--   engine_set_phase         075f5544c8d330ba4e150a996e779399   882   (not changed; the one statement that moves the phase)
--   room_members_throw_guard f1ac023562851e459c0ec07027cc2929  2060   (REPLACED)
--   rooms_overlay_round      ea08f4f65a326fa485c0864c1e81baa1  1675   (REPLACED)
--   rooms_throwables_guard   5edf06ffc53bd1934d8efef19541855a   534   (REPLACED)
--   skip_phase               bba5b9b022983b355cc378d75d8aa0be   985   (not changed; she moves on)
--   throw_at                 2d89b8e0fff960634f280523015ed916  3120   (REPLACED)
--   throw_class              7c2314efd4215c0d3083ea1b6fe9fa0e   289   (not changed)
--   throw_counts             f0ffefea3d7d29aaf60360bb595c149f   754   (not changed; hands throw_limits() to the client)
--   throw_limits             d01ea3ffd5b39afc59953e613b1ca2ff   275   (REPLACED)

-- 0b. the new columns do not exist yet
select table_name, column_name from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'room_members' and column_name in ('throw_n','throw_combo_at'))
     or (table_name = 'rooms' and column_name in ('react_user','react_until')));
-- expect: zero rows

-- 0c. the columns this run reads exist with the types it assumes
select table_name, column_name, data_type, is_nullable from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'rooms' and column_name in ('phase','phase_deadline','spotlight_target','crown_user'))
     or (table_name = 'room_members' and column_name in ('cracks','throw_at','throw_until','throw_kind'))
     or (table_name = 'room_events' and column_name in ('user_id','type','payload'))
     or (table_name = 'throw_ledger' and column_name in ('thrower_id','target_id','at')))
 order by 1, 2;
-- expect: room_events payload jsonb YES / type text YES / user_id uuid YES  (user_id nullable: the ovation's heart has no sender)
--         room_members cracks integer NO / throw_at, throw_until timestamptz YES / throw_kind text YES
--         rooms crown_user uuid YES / phase text NO / phase_deadline timestamptz YES / spotlight_target uuid YES
--         throw_ledger at timestamptz NO / target_id uuid NO / thrower_id uuid NO

-- 0d. the triggers on the tables today (expect exactly these three; none on
--     room_events — the ovation's heart is inserted there)
select c.relname, t.tgname, t.tgenabled
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal and c.relname in ('rooms','room_members','room_events','throw_ledger')
 order by 1, 2;
-- expect: room_members | room_members_throw_guard | O
--         rooms        | rooms_overlay_round      | O
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
      ('throw_at',                 '2d89b8e0fff960634f280523015ed916'),
      ('throw_limits',             'd01ea3ffd5b39afc59953e613b1ca2ff'),
      ('room_members_throw_guard', 'f1ac023562851e459c0ec07027cc2929'),
      ('rooms_throwables_guard',   '5edf06ffc53bd1934d8efef19541855a'),
      ('rooms_overlay_round',      'ea08f4f65a326fa485c0864c1e81baa1'),
      ('throw_class',              '7c2314efd4215c0d3083ea1b6fe9fa0e'),
      ('engine_set_phase',         '075f5544c8d330ba4e150a996e779399'),
      ('advance_phase',            'cf40a21d901322ac721e118f0c339bd4'),
      ('skip_phase',               'bba5b9b022983b355cc378d75d8aa0be')
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
                and ((table_name = 'room_members' and column_name in ('throw_n','throw_combo_at'))
                  or (table_name = 'rooms' and column_name in ('react_user','react_until')))) then
    raise exception 'throw_n / throw_combo_at / react_user / react_until already exist - nothing changed; this has run before';
  end if;
end
$do$;

-- 1a. the numbers, in the one place they already live.  Six keys added; the
--     six already there are unchanged.  throw_counts() hands this to the client.
create or replace function public.throw_limits()
returns jsonb language sql immutable
as $$ select jsonb_build_object('cheers', 5, 'jeers', 2, 'live_secs', 10, 'cooldown_secs', 20,
                               'cracks_to_shatter', 3, 'rose_mends', 1,
                               'combo_secs', 5, 'combo_n', 3, 'combo_fx_secs', 4, 'ovation_hearts', 1,
                               'react_secs', 6, 'react_mult', 2) $$;

-- 1b. columns.  The count and the combo live on HIS member row, beside the
--     throw they belong to (every device draws his tile from that row); the
--     reaction window is the room's (one man is on the clock at a time).
alter table public.room_members
  add column throw_n        integer not null default 0,    -- the live throw's count toward a combo (a throw in his reaction window counts react_mult)
  add column throw_combo_at timestamptz null;              -- when the live throw's combo fired (null: it has not)
alter table public.room_members
  add constraint room_members_throw_n_floor check (throw_n >= 0);
alter table public.rooms
  add column react_user  uuid null,                        -- whose answer just ended
  add column react_until timestamptz null;                 -- his reaction window closes (server time)

-- 1c. THE MEMBER TRIGGER — back to what it was on 10/8 (guard + wipe), with
--     every column since: a client may not write cracks, throw_n or
--     throw_combo_at; leaving the chair wipes the throw and resets his cracks.
--     The crown's block and the crack arithmetic are now in throw_at (1e).
create or replace function public.room_members_throw_guard()
returns trigger language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.throwables_on is distinct from true or new.throw_kind is not null
         or new.throw_at is not null or new.throw_until is not null
         or new.cracks is distinct from 0
         or new.throw_n is distinct from 0 or new.throw_combo_at is not null then
        raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
      end if;
    elsif new.throwables_on  is distinct from old.throwables_on
       or new.throw_kind     is distinct from old.throw_kind
       or new.throw_at       is distinct from old.throw_at
       or new.throw_until    is distinct from old.throw_until
       or new.cracks         is distinct from old.cracks
       or new.throw_n        is distinct from old.throw_n
       or new.throw_combo_at is distinct from old.throw_combo_at then
      raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
    end if;
  end if;
  if tg_op = 'UPDATE'
     and old.role in ('chair', 'kept') and new.role not in ('chair', 'kept') then
    if new.throw_until is not null and new.throw_until > now() then
      new.throw_until := now();   -- leaving the chair wipes the throw (ruling, 10/8)
    end if;
    new.cracks := 0;              -- and the frame he leaves is clean for the next man
  end if;
  return new;
end $$;

-- 1d. THE ROOMS GUARD learns the reaction window: the host writes her rooms
--     row directly, so without this she could open a window around the show.
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
  if current_user in ('anon', 'authenticated')
     and (new.react_user is distinct from old.react_user or new.react_until is distinct from old.react_until) then
    raise exception 'the reaction window opens when an answer ends, never written';
  end if;
  return new;
end $$;

-- 1e. throw_at — the only way a throw lands, and now the only place that
--     says what a landed throw DOES.  Rejection ORDER is the contract (the
--     double mirrors it word for word): who you are, then the switch, then
--     who he is (the crown is part of who he is), then the beat he is in,
--     then your ration.  Only an accepted throw is charged, and once.
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
  v_react boolean := false;   -- he is inside his reaction window
  v_w     int := 1;           -- what this throw counts for (react_mult inside the window)
  v_join  boolean := false;   -- this throw joins the live one
  v_n     int;                -- the live throw's count after this one
  v_fire  boolean := false;   -- this throw fires the combo
  v_cracks int;
  v_at    timestamptz; v_until timestamptz;
begin
  if v_uid is null then raise exception 'not authenticated'; end if;
  select * into v_room from rooms where id = throw_at.room_id;
  if not found then raise exception 'no room'; end if;
  if v_cls is null then raise exception 'no such throw'; end if;
  if v_room.host_id = v_uid then raise exception 'the host does not throw'; end if;
  select * into v_me from room_members m
    where m.room_id = throw_at.room_id and m.user_id = v_uid
    for update;                                  -- one ration per thrower: two of his throws can't race past it
  if not found or v_me.role = 'gone' then raise exception 'not a member of this room'; end if;
  if v_me.role <> 'spectator' then raise exception 'only the crowd throws'; end if;
  if not v_room.throwables_on then raise exception 'throwables are off for this show'; end if;
  select * into v_tgt from room_members m
    where m.room_id = throw_at.room_id and m.user_id = throw_at.target
    for update;                                  -- one live throw per chair, and one count: serialise on his row
  if not found then raise exception 'no such member'; end if;
  if v_tgt.role not in ('chair', 'kept') then raise exception 'target is not in a chair'; end if;
  if not v_tgt.throwables_on then raise exception 'he has throwables off'; end if;
  if v_cls = 'jeer' and v_room.crown_user is not distinct from throw_at.target then
    raise exception 'he wears the crown this round';   -- the crown blocks jeers; cheers land
  end if;

  v_react := v_room.react_user is not distinct from throw_at.target
             and v_room.react_until is not null and v_now < v_room.react_until;
  if v_react then v_w := (v_lim->>'react_mult')::int; end if;

  if v_tgt.throw_until is not null and v_now < v_tgt.throw_until then
    -- THE JOIN: same polarity, inside the combo window, and a thrower who is
    -- not already in this one.  Anything else is what it always was.
    if public.throw_class(v_tgt.throw_kind) is distinct from v_cls
       or v_tgt.throw_at is null
       or v_now >= v_tgt.throw_at + make_interval(secs => (v_lim->>'combo_secs')::int)
       or exists (select 1 from throw_ledger l
                   where l.room_id = throw_at.room_id and l.target_id = throw_at.target
                     and l.thrower_id = v_uid and l.at >= v_tgt.throw_at) then
      raise exception 'a throw is already live';
    end if;
    v_join := true;
  elsif v_tgt.throw_until is not null and not v_react
     and v_now < v_tgt.throw_until + make_interval(secs => (v_lim->>'cooldown_secs')::int) then
    raise exception 'cooling down';              -- (not inside his reaction window: the room is meant to react)
  end if;

  select count(*) filter (where cls = 'cheer'), count(*) filter (where cls = 'jeer')
    into v_cheers, v_jeers
    from throw_ledger l where l.room_id = throw_at.room_id and l.thrower_id = v_uid;
  v_cap := (v_lim->>(v_cls || 's'))::int;
  if (case v_cls when 'cheer' then v_cheers else v_jeers end) >= v_cap then
    raise exception 'no % left this show', v_cls || 's';
  end if;

  -- THE PRESSURE: a jeer cracks his frame, a rose mends it — by what this throw counts for
  v_cracks := case
    when v_cls = 'jeer'  then least((v_lim->>'cracks_to_shatter')::int, coalesce(v_tgt.cracks, 0) + v_w)
    when kind = 'petals' then greatest(0, coalesce(v_tgt.cracks, 0) - (v_lim->>'rose_mends')::int * v_w)
    else coalesce(v_tgt.cracks, 0) end;

  if v_join then
    v_n     := coalesce(v_tgt.throw_n, 0) + v_w;
    v_fire  := v_tgt.throw_combo_at is null and v_n >= (v_lim->>'combo_n')::int;
    v_at    := v_tgt.throw_at;
    v_until := case when v_fire
                    then greatest(v_tgt.throw_until, v_now + make_interval(secs => (v_lim->>'combo_fx_secs')::int))
                    else v_tgt.throw_until end;  -- the combo's effect is part of the live throw: his cooldown starts after it
    update room_members
       set throw_n = v_n,
           throw_combo_at = case when v_fire then v_now else throw_combo_at end,
           throw_until = v_until,
           cracks = v_cracks
     where id = v_tgt.id;                        -- throw_kind and throw_at do NOT move: the overlay does not restart
  else
    v_n     := v_w;
    v_fire  := v_n >= (v_lim->>'combo_n')::int;
    v_at    := v_now;
    v_until := v_now + make_interval(secs => (v_lim->>'live_secs')::int);
    update room_members
       set throw_kind = kind, throw_at = v_at, throw_until = v_until,
           throw_n = v_n,
           throw_combo_at = case when v_fire then v_now else null end,
           cracks = v_cracks
     where id = v_tgt.id;
  end if;

  insert into throw_ledger (room_id, thrower_id, cls, kind, target_id, at)
  values (throw_at.room_id, v_uid, v_cls, kind, throw_at.target, v_now);   -- once, whatever it counted for
  if v_cls = 'cheer' then v_cheers := v_cheers + 1; else v_jeers := v_jeers + 1; end if;

  -- STANDING OVATION: his heart(s), once per combo (v_fire is true exactly
  -- once per live throw, under his row lock).  No sender: user_id is NULL.
  if v_fire and v_cls = 'cheer' then
    insert into room_events (room_id, user_id, type, payload)
    select throw_at.room_id, null, 'heart', jsonb_build_object('target', throw_at.target, 'ovation', true)
      from generate_series(1, (v_lim->>'ovation_hearts')::int);
  end if;

  return jsonb_build_object('ok', true, 'kind', kind, 'cls', v_cls,
    'at', v_at, 'until', v_until,
    'joined', v_join, 'n', v_n, 'counted', v_w,
    'combo', (v_fire or (v_join and v_tgt.throw_combo_at is not null)),
    'cheers_left', (v_lim->>'cheers')::int - v_cheers,
    'jeers_left',  (v_lim->>'jeers')::int  - v_jeers);
end $$;

-- 1f. THE ROOMS TRIGGER also opens the reaction window.  The 10/11 function
--     with two additions: a fresh show clears the window, and the phase
--     LEAVING 'spotlight' while a man was on the clock opens his.  That one
--     statement is engine_set_phase's, reached from advance_phase (his
--     deadline passed) and from skip_phase (she moves on) — both end at the
--     same update, so both open the same window.
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
    new.react_user := null; new.react_until := null;
    update public.room_members m set cracks = 0 where m.room_id = new.id and m.cracks <> 0;
    return new;
  end if;

  if old.phase = 'spotlight' and old.spotlight_target is not null and old.phase_deadline is not null then
    new.react_user  := old.spotlight_target;     -- his answer just ended
    new.react_until := now() + make_interval(secs => (public.throw_limits()->>'react_secs')::int);
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

commit;

-- ---------------------------------------------------------------------------
-- 2. READ BACK — after the commit, record every row.
-- ---------------------------------------------------------------------------
select p.proname, md5(pg_get_functiondef(p.oid)) as md5, length(pg_get_functiondef(p.oid)) as chars,
       pg_get_userbyid(p.proowner) as owner, p.prosecdef
  from pg_proc p
 where p.pronamespace = 'public'::regnamespace
   and p.proname in ('throw_at','throw_limits','room_members_throw_guard','rooms_throwables_guard',
                     'rooms_overlay_round','throw_class','throw_counts','ask_question','advance_phase',
                     'skip_phase','engine_set_phase','decide_pass','decide_clear','engine_award_seat')
 order by 1;
-- expect (from the dry run): the five REPLACED functions as listed in
--   tools/DESIGN-combos-server.md; the other nine UNCHANGED from 0a;
--   throw_at still owned by postgres with prosecdef = true.
select public.throw_limits();
select has_function_privilege('authenticated', 'public.throw_at(uuid,uuid,text)', 'execute') as authenticated_can_throw,
       has_function_privilege('anon', 'public.throw_at(uuid,uuid,text)', 'execute') as anon_can_call;
-- expect: the same two values as before the run (create or replace keeps grants)
select c.relname, t.tgname, t.tgenabled
  from pg_trigger t join pg_class c on c.oid = t.tgrelid
 where not t.tgisinternal and c.relname in ('rooms','room_members','room_events') order by 1, 2;
select table_name, column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public'
   and ((table_name = 'room_members' and column_name in ('throw_n','throw_combo_at'))
     or (table_name = 'rooms' and column_name in ('react_user','react_until')))
 order by 1, 2;

-- ---------------------------------------------------------------------------
-- 3. UNDO — only if asked.  Puts the five functions back to their text of
--    2026-10-11 (throw_at: the 10/8 text, verbatim from
--    tools/DESIGN-throwables-server.md; the other four: verbatim from
--    tools/DESIGN-overlay-server.md) and drops the four columns.  Hearts an
--    ovation already awarded stay (they are ordinary heart rows).
-- ---------------------------------------------------------------------------
-- begin;
-- create or replace function public.throw_at(room_id uuid, target uuid, kind text)
-- returns jsonb language plpgsql security definer set search_path = public
-- as $$
-- declare
--   v_uid   uuid := auth.uid();
--   v_room  rooms%rowtype;
--   v_me    room_members%rowtype;
--   v_tgt   room_members%rowtype;
--   v_cls   text := public.throw_class(kind);
--   v_lim   jsonb := public.throw_limits();
--   v_now   timestamptz := now();
--   v_cheers int; v_jeers int; v_cap int;
-- begin
--   if v_uid is null then raise exception 'not authenticated'; end if;
--   select * into v_room from rooms where id = throw_at.room_id;
--   if not found then raise exception 'no room'; end if;
--   if v_cls is null then raise exception 'no such throw'; end if;
--   if v_room.host_id = v_uid then raise exception 'the host does not throw'; end if;
--   select * into v_me from room_members m
--     where m.room_id = throw_at.room_id and m.user_id = v_uid
--     for update;                                  -- one ration per thrower: two of his throws can't race past it
--   if not found or v_me.role = 'gone' then raise exception 'not a member of this room'; end if;
--   if v_me.role <> 'spectator' then raise exception 'only the crowd throws'; end if;
--   if not v_room.throwables_on then raise exception 'throwables are off for this show'; end if;
--   select * into v_tgt from room_members m
--     where m.room_id = throw_at.room_id and m.user_id = throw_at.target
--     for update;                                  -- one live throw per chair: serialise on his row
--   if not found then raise exception 'no such member'; end if;
--   if v_tgt.role not in ('chair', 'kept') then raise exception 'target is not in a chair'; end if;
--   if not v_tgt.throwables_on then raise exception 'he has throwables off'; end if;
--   if v_tgt.throw_until is not null and v_now < v_tgt.throw_until then
--     raise exception 'a throw is already live';
--   end if;
--   if v_tgt.throw_until is not null
--      and v_now < v_tgt.throw_until + make_interval(secs => (v_lim->>'cooldown_secs')::int) then
--     raise exception 'cooling down';
--   end if;
--   select count(*) filter (where cls = 'cheer'), count(*) filter (where cls = 'jeer')
--     into v_cheers, v_jeers
--     from throw_ledger l where l.room_id = throw_at.room_id and l.thrower_id = v_uid;
--   v_cap := (v_lim->>(v_cls || 's'))::int;
--   if (case v_cls when 'cheer' then v_cheers else v_jeers end) >= v_cap then
--     raise exception 'no % left this show', v_cls || 's';
--   end if;
--   update room_members
--      set throw_kind = kind, throw_at = v_now,
--          throw_until = v_now + make_interval(secs => (v_lim->>'live_secs')::int)
--    where id = v_tgt.id;
--   insert into throw_ledger (room_id, thrower_id, cls, kind, target_id, at)
--   values (throw_at.room_id, v_uid, v_cls, kind, throw_at.target, v_now);
--   if v_cls = 'cheer' then v_cheers := v_cheers + 1; else v_jeers := v_jeers + 1; end if;
--   return jsonb_build_object('ok', true, 'kind', kind, 'cls', v_cls,
--     'at', v_now, 'until', v_now + make_interval(secs => (v_lim->>'live_secs')::int),
--     'cheers_left', (v_lim->>'cheers')::int - v_cheers,
--     'jeers_left',  (v_lim->>'jeers')::int  - v_jeers);
-- end $$;
-- create or replace function public.throw_limits()
-- returns jsonb language sql immutable
-- as $$ select jsonb_build_object('cheers', 5, 'jeers', 2, 'live_secs', 10, 'cooldown_secs', 20,
--                                'cracks_to_shatter', 3, 'rose_mends', 1) $$;
-- create or replace function public.room_members_throw_guard()
-- returns trigger language plpgsql
-- as $$
-- declare v_lim jsonb;
-- begin
--   if current_user in ('anon', 'authenticated') then
--     if tg_op = 'INSERT' then
--       if new.throwables_on is distinct from true or new.throw_kind is not null
--          or new.throw_at is not null or new.throw_until is not null
--          or new.cracks is distinct from 0 then
--         raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
--       end if;
--     elsif new.throwables_on is distinct from old.throwables_on
--        or new.throw_kind    is distinct from old.throw_kind
--        or new.throw_at      is distinct from old.throw_at
--        or new.throw_until   is distinct from old.throw_until
--        or new.cracks        is distinct from old.cracks then
--       raise exception 'throw state changes only through throw_at, set_throwables and host_clear_throw';
--     end if;
--   end if;
--   if tg_op = 'UPDATE' then
--     if new.throw_at is not null and new.throw_at is distinct from old.throw_at then
--       if public.throw_class(new.throw_kind) = 'jeer' then
--         if exists (select 1 from public.rooms r
--                     where r.id = new.room_id and r.crown_user = new.user_id) then
--           raise exception 'he wears the crown this round';
--         end if;
--         v_lim := public.throw_limits();
--         new.cracks := least((v_lim->>'cracks_to_shatter')::int, coalesce(old.cracks, 0) + 1);
--       elsif new.throw_kind = 'petals' then
--         v_lim := public.throw_limits();
--         new.cracks := greatest(0, coalesce(old.cracks, 0) - (v_lim->>'rose_mends')::int);
--       end if;
--     end if;
--     if old.role in ('chair', 'kept') and new.role not in ('chair', 'kept') then
--       if new.throw_until is not null and new.throw_until > now() then
--         new.throw_until := now();   -- leaving the chair wipes the throw (ruling, 10/8)
--       end if;
--       new.cracks := 0;              -- and the frame he leaves is clean for the next man
--     end if;
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
--   if current_user in ('anon', 'authenticated')
--      and new.crown_user is distinct from old.crown_user then
--     raise exception 'the crown is awarded at her call, never written';
--   end if;
--   return new;
-- end $$;
-- create or replace function public.rooms_overlay_round()
-- returns trigger language plpgsql
-- as $$
-- declare
--   v_max int; v_n int; v_top uuid; v_held boolean;
-- begin
--   if current_user in ('anon', 'authenticated') then return new; end if;
--   if new.phase is not distinct from old.phase then return new; end if;
--
--   if new.phase in ('preshow', 'showstart') then
--     new.crown_user := null;
--     update public.room_members m set cracks = 0 where m.room_id = new.id and m.cracks <> 0;
--     return new;
--   end if;
--
--   if old.phase is distinct from 'deciding' or new.phase = 'ended' then return new; end if;
--
--   with seated as (
--     select m.user_id,
--            (select count(*) from public.room_events e
--              where e.room_id = new.id and e.type = 'heart'
--                and e.payload->>'target' = m.user_id::text)::int as h
--       from public.room_members m
--      where m.room_id = new.id and m.role in ('chair', 'kept')
--        and coalesce(m.seated_at, '-infinity'::timestamptz) < now()
--   )
--   select max(s.h),
--          count(*) filter (where s.h = (select max(h) from seated)),
--          (array_agg(s.user_id order by s.h desc))[1]
--     into v_max, v_n, v_top
--     from seated s;
--
--   if v_max is not null and v_max > 0 and v_n = 1 then
--     new.crown_user := v_top;
--   else
--     select exists (select 1 from public.room_members m
--                     where m.room_id = new.id and m.user_id = old.crown_user
--                       and m.role in ('chair', 'kept'))
--       into v_held;
--     new.crown_user := case when v_held then old.crown_user else null end;
--   end if;
--
--   update public.room_members m set cracks = 0 where m.room_id = new.id and m.cracks <> 0;
--   return new;
-- end $$;
-- alter table public.room_members drop constraint room_members_throw_n_floor;
-- alter table public.room_members drop column throw_n, drop column throw_combo_at;
-- alter table public.rooms drop column react_user, drop column react_until;
-- commit;
```

## Dry run — NOT production (2026-10-11)

A throwaway local PostgreSQL 16.15.  The stand-in schema is production's
column list as read 2026-10-11.  Loaded first, in order: the 10/8 throwables
DDL and the 10/11 Pressure/Crown change — so **the five functions this run
replaces start from production's exact md5s** (`throw_at` 2d89b8e0…,
`throw_limits` d01ea3ff…, `room_members_throw_guard` f1ac0235…,
`rooms_throwables_guard` 5edf06ff…, `rooms_overlay_round` ea08f4f6…, and
`throw_class` 7c2314ef… which it reads).  `engine_set_phase`, `advance_phase`,
`skip_phase` and `ask_question` are stand-ins (production's statements as
read, without the draft resolver and the clock pause), so for the dry run
ONLY the three pinned stand-ins' expected md5s were swapped for the
stand-ins'; the production values in the SQL above are what preflight 0a must
show on the day.

What ran, in order:

1. the change block: clean, no notices.
2. the behaviour test (42 checks, through `throw_at` as an `authenticated`
   caller, and through `ask_question` / `skip_phase` / `advance_phase` for an
   answer's end; time is moved by back-dating the row and its ledger rows):

```
  1 | PASS | a throw lands as it always did: count 1, no combo
  2 | PASS | a second crowd member's cheer while it is live is a JOIN (a different kind of cheer counts: same polarity)
  3 | PASS | ...and the overlay does not restart or stack: throw_at, throw_until and the kind on his row have not moved
  4 | PASS | TWO throwers do not fire a combo
  5 | PASS | the SAME thrower again is refused and not charged — one man cannot make a crowd
  6 | PASS | an OPPOSITE-polarity throw while it is live is refused as before, and not charged
  7 | PASS | the THIRD different thrower fires the combo: STANDING OVATION
  8 | PASS | ...and he gets +1 heart: one room_events row, type heart, his id as target, NO sender
  9 | PASS | a fourth joiner is accepted and charged, but the combo fires ONCE: still exactly one heart
 10 | PASS | rations: every accepted throw is charged once to its own thrower; the refused ones cost nothing
 11 | PASS | ANONYMITY: no thrower's id is on his row or in any room event — the room has a count (throw_n = 4), never a name
 12 | PASS | the combo's effect is inside the live throw: his cooldown starts after it
 13 | PASS | (a jeer lands on b: 1 crack)
 14 | PASS | six seconds in, the combo window (5s) has closed: a same-polarity throw is refused again though the throw is still live
 15 | PASS | when the live throw ends his cooldown starts, as before
 16 | PASS | two jeers from two throwers on c: joined, 2 cracks (a join is a landed jeer), no combo
 17 | PASS | the third different jeer: BOOED OFF fires, and his frame is at 3 cracks (shattered)
 18 | PASS | ...with NO automatic consequence: no heart, no event, he is still in his chair — it informs her
 19 | PASS | she skips a spotlight nobody was asked in: no reaction window opens
 20 | PASS | (she asks a: he is on the clock, no window yet)
 21 | PASS | a jeer DURING his answer counts once (1 crack)
 22 | PASS | SHE MOVES ON (skip_phase): his reaction window opens — react_user is him, react_until is six seconds out
 23 | PASS | inside the window a jeer counts DOUBLE: 2 cracks (1 -> 3), 2 toward the combo
 24 | PASS | ...and the thrower's ration is charged ONCE for it (w6: the boo on c and this tomato — 2 jeers, none left)
 25 | PASS | a second thrower in the window: 2 + 2 = 4, the combo fires on TWO throwers; cracks stay capped at 3
 26 | PASS | the window is HIS: a jeer at another man in the same six seconds counts once
 27 | PASS | (b, outside any window, is cooling down as before)
 28 | PASS | inside his window his cooldown does not apply, and a ROSE mends double (3 -> 1)
 29 | PASS | ...but a live throw still refuses the opposite polarity, window or not
 30 | PASS | the window EXPIRES: a jeer a moment later counts once (1 -> 2)
 31 | PASS | ...and his cooldown applies again
 32 | PASS | (mid-answer: advance_phase is a no-op and no window is open)
 33 | PASS | HIS CLOCK RUNS OUT (advance_phase): the same window opens for him
 34 | PASS | cheers in his window: two throwers make a STANDING OVATION, and the heart lands exactly once
 35 | PASS | the open floor ending opens no new window
 36 | PASS | a jeer at the crown holder is refused in the same words, uncharged
 37 | PASS | a cheer at the crown holder lands
 38 | PASS | the crown's refusal comes BEFORE the thrower's ration (w6 has no jeers left and still hears about the crown)
 39 | PASS | a chair's direct write of his own count, or of a combo, is refused with the guard's words
 40 | PASS | the host cannot open a window around the show, and her heartbeat write still passes: the reaction window opens when an answer ends, never written
 41 | PASS | leaving the chair still wipes the live throw and resets his cracks
 42 | PASS | start_show: no reaction window carried over
```

3. the change block a second time: **refused** (`throw_at is not the
   2026-10-11 read-back`), nothing changed.
4. read back after the change:

| function | md5 | chars |
|---|---|---|
| room_members_throw_guard | 56f33abb1db2201b43706b706e0164ab | 1541 |
| rooms_overlay_round | 2d9db4597351bc83d0a6eacfef998fd1 | 2018 |
| rooms_throwables_guard | 32b8a0d52ee8d7f5eeb65ad9d1593931 | 790 |
| throw_at | 41e9ad3ba3b2bd97107df44661a75364 | 6539 |
| throw_limits | febae2733d50339f4170e66577a2e68f | 443 |
| throw_class | 7c2314efd4215c0d3083ea1b6fe9fa0e | 289 (unchanged) |
| throw_counts | f0ffefea3d7d29aaf60360bb595c149f | 754 (unchanged) |

   `throw_at` is still SECURITY DEFINER and `authenticated` can still execute
   it (`create or replace` keeps both).
5. **the 10/11 Pressure/Crown test, re-run after this change: 35 of 35.**
   One line of it had to change, by the new rule: its "refused jeer" was a
   different thrower's jeer during a live jeer, which is now a join; it is
   the same thrower's again.
6. the undo block: the five functions are back at their 2026-10-11 md5s
   (2d89b8e0…, d01ea3ff…, f1ac0235…, 5edf06ff…, ea08f4f6…), the four columns
   are gone, and the 10/11 test passes exactly as it was written (35 of 35).
7. drift: `throw_class()` altered by hand, then the change block — **refused**
   naming `throw_class`; no new column exists after and `throw_at` is
   untouched.
8. five deliberate breaks of the SQL, each run against the same 42 checks:
   the distinct-thrower rule removed (5 checks red, 5 6 7 9 10); the combo
   allowed to fire again (1 red, 9: a second heart); the window not doubling
   (5 red, 23 25 28 30 34); the opposite polarity allowed to join (7 red);
   the window never expiring (2 red, 30 31).  All were put back; the file
   above is the one that passed.

NOT covered by the dry run: production's real `advance_phase` / `skip_phase` /
`engine_set_phase` firing the trigger (the stand-ins run the same rooms
statements in the same order), two throws racing for his row (the row lock is
the 10/8 one, proven then with eight concurrent `psql`s), RLS, and realtime
carrying the four new columns and the sender-less heart.  The phone test in
the PR is the behavioural proof.

## The double

`tools/lib/backend-double.js` mirrors the above: `throw_n` / `throw_combo_at`
on the member row, `react_user` / `react_until` on the room; its `throw_at`
is the SQL's statement for statement (the same refusals in the same order,
the join, the weight, the cracks, the once-only fire, the heart with no
sender); `setPhase()` opens the window where the phase leaves `spotlight`
with a man on the clock; the two guards refuse a direct client write of any
of the four columns with the SQL's words.  WHAT THE DOUBLE FAKES: it has no
`engine_set_phase` (its `advance_phase` / `skip_phase` share one walker that
ends in `setPhase`), and its clock is the test's.  Gate 89 is the proof
through the real page.

## Run log

**Ran in production 2026-10-13**, pasted by Nick into the Supabase SQL editor.

- Preflight: 16 of 16 ok.  All 14 functions were at their 2026-10-11 md5s,
  none of the four columns existed, and the three triggers were as expected.
- The change block: success.
- Read-back: the four columns exist, `throw_limits()` carries
  `combo_secs=5 combo_n=3 combo_fx_secs=4 ovation_hearts=1 react_secs=6
  react_mult=2`, `throw_at` is owned by postgres with security definer,
  `authenticated` can still execute it, the three triggers are on, and the
  nine untouched functions read back byte-identical.
- The five replaced functions read back with md5s that differ from the dry
  run's, because the copy that was pasted had its comments removed (and some
  whitespace changed in transit).  A second read-back that ignores comments
  and whitespace (`regexp_replace` on `prosrc`, plus arguments, result,
  security definer, volatility and `proconfig`) matched the reviewed SQL
  above on all five: 5 of 5 ok.  So production runs exactly this code.

Production's md5s for the replaced functions are now (first 8 characters, as
read; **re-read the full values before anything guards on them**):

| function | md5 (prefix) |
|---|---|
| room_members_throw_guard | 94f2be86 |
| rooms_overlay_round | 1f6b11bd |
| rooms_throwables_guard | 425cf769 |
| throw_at | 01e0c8f6 |
| throw_limits | 8beec689 |

The undo block above guards on the dry run's md5s and would refuse as written;
re-read the full values and put them in its guard first if it is ever needed.

**Ran in production 2026-10-20** (ruling Nick 10/20, after the first crew
rehearsal: a tomato stayed on the tile too long) — `live_secs` 10 → **4**.
Guarded on production's full `throw_limits` md5
`8beec68940c408580481a4ced42529fc` (446 chars — the reflowed 10/13 paste; the
dry run's `febae273…/443` was never what production held, and the first
attempt guarded on it refused correctly).  After: `throw_limits` md5
**`677f9cddef6e5eeb178437347ccf8223`**, `throw_limits()->>'live_secs' = 4`.
Nothing else in the function changed.  The client reads the number from
`throw_counts()` on join (THROWABLES.live_secs), so the next show lands
tomatoes for 4s.  The client default and the double still say 10: the
throwables / overlay-art / combos-reaction gates time their checks against
10s (and combos-reaction asserts the combo window closes before the throw —
with live_secs 4 the 5s combo window now outlasts the tomato; the combo
still lands, it just can finish after the first splat has faded).  Known
parity gap, deliberate: a follow-up should have those gates read
THROW_LIMITS.live_secs instead of 10, then the double can follow production.

| function | md5 | chars |
|---|---|---|
| throw_limits | 677f9cddef6e5eeb178437347ccf8223 | (2026-10-20, live_secs 4) |
