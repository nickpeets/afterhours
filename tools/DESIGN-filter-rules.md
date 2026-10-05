# DESIGN — filter show rules: the server side

STATUS: RUN IN PRODUCTION 2026-09-28 (Supabase project doqtfyxgzlfvglfdkphx,
branch main).  Written with `feat/filter-rules` (step 2 of 3, stacked on #83,
PR #84).  This repo has no migrations directory and no `.sql` under version
control: every server function so far was posted to the advisor and run in
Supabase Studio after its own explicit go (gate 61's header, gate 63's header,
`DESIGN-presence-vs-role.md`).  This document was that posting for the filter
rules; the text under SOURCE at the bottom is what production returned from
`pg_get_functiondef` after the run, md5-verified, and is the only SOURCE here.
The design text in the middle is kept as written for the record.

## Production divergences from the design text and the double (2026-09-28)

1. `set_filter` has NO moment check.  `rooms.moment_a` / `rooms.moment_b` do
   not exist in production (information_schema returned zero `moment%`
   columns) and the Moment is not built.  The double keeps its check;
   production gets one only when the Moment is designed for the server.
   Nothing named `start_moment` / `end_moment` / `rooms.moment_*` was run.
2. All three new functions carry `set search_path = public`, matching the two
   production functions read back before the run (`ask_question`,
   `active_members` both have `SET search_path TO 'public'`).
3. `active_members` was NOT re-issued.  Production is `RETURNS SETOF
   room_members` (language sql) and both branches return the whole row
   (`jsonb_populate_record(m, …)` / `else m`), so the two new columns are
   projected in both branches with no text change.  Verified read-only after
   the columns landed: `select user_id, role, filter, filter_pick from
   active_members('4b7dcab5-d680-4121-8759-dd0ba03492c9')` → one `kept` row,
   `filter` NULL, `filter_pick` NULL.  The design paragraph below assuming a
   hand-listed column set was wrong for production.
4. `ask_question` was amended by a server-side splice, not by re-typing the
   body: a `DO` block took the live `pg_get_functiondef` text, required the
   `update public.rooms r / set spotlight_target …` anchor to occur exactly
   once and the clear to be absent, executed the text with the one statement
   inserted before the anchor, then re-read the function and raised (rolling
   back) unless `replace(after, insertion, '') = before`.  The inserted
   statement uses the locals production already copies its params into
   (`v_room`, `v_target`), not `ask_question.room_id`.
   Before: 2375 chars, 52 lines, md5 66860c4974d630f94845ba2552a0cd5c.
   After: 2509 chars, 57 lines, md5 48bb7506152d8403ba142aeb7b7db672;
   after minus the insertion = 2375 chars, md5 66860c4974d630f94845ba2552a0cd5c.
5. Grants.  Production `ask_question` / `active_members` ACL is
   `{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}`.
   Default privileges gave the three new functions an extra explicit
   `anon=X/postgres`; it was revoked and `authenticated, service_role`
   re-granted so all five ACLs are identical (20 rows, 4 entries each).
6. Double vs production, `host_clear_filter`: the double raises `no room`
   for a missing room before the host check; the design text (and so
   production) folds that case into `only the host can force a filter off`.
   Pre-existing in the design text, not introduced by the run.

## Run log 2026-09-28

Order run in Studio: columns → constraints → set_filter → drop_filter →
host_clear_filter → grants → ask_question splice.  Every statement returned
`Success. No rows returned`.  Read-back of the three new functions matched
the DDL byte-for-byte by md5 (set_filter de4678378f689f78ffd688bf129aaf3a /
1203 chars; drop_filter 1be6391da4050754d353fd47927773eb / 655;
host_clear_filter 085c42224f992309862e936c7e0eec7f / 913).  Rejection order
and messages checked against the double by `position()` of each `raise
exception` in the read-back text: strictly increasing per function, every
message present, the one ABSENT being `filter not allowed during a moment`
(divergence 1).

Battery for the branch tip b0928.0950 (PR #84 body): container 68 gates ·
1072 checks · all clean; Codespace 68 gates · 1072 checks · all clean on run
2.  Run 1 in the Codespace had gate 44 (backstage-exit) crash on a tile-mount
timeout; it passed 11/11 twice in isolation and on run 2.  Logged as a timing
flake, not chased in this task.

## Lens looks (feat/camera-kit, 2026-10-05) — NO DDL WRITTEN, NOTHING RUN

`feat/camera-kit` adds a second kind of filter SOURCE on the client (a Snap
Camera Kit lens, `CAMKIT` in `index.html`) and changes nothing on the server.
The client ships inert (no SDK address, no token, no looks), so there is no
lens slug to allow yet.  When Nick picks the first looks, each slug has to
pass the SAME three places a teal look does, and nothing else changes shape:

1. `room_members_filter_curated` and `room_members_filter_pick_curated` — the
   two CHECK constraints above; drop and re-add each with the wider list.
2. `set_filter` — the `if name not in ('grade','noir')` line.  Read
   `pg_get_functiondef('set_filter'::regproc)` first and splice, the way
   `ask_question` was amended (divergence 4 above); re-read and md5 after.
3. Order: constraints → function → confirm grants unchanged (divergence 5).

`drop_filter`, `host_clear_filter` and the clear inside `ask_question` act on
the field whatever it holds, so they need no change.  Token pricing (the
design's "✦20") is not designed for the server and is not part of this.

Until that DDL runs, production answers a lens slug with `no such filter`
(gate 78 block 0 asserts exactly that through the real tile).  The double
models the widening per test with `allowFilterLook(slug)` — a stand-in for
DDL that has NOT been run, labelled as such at every call site (gates 75, 77,
78).  It is not evidence about production.

## The rule, in one sentence

A look is room state the whole room must agree on (every tile paints a badge
from it), so it is a SERVER-OWNED member field with four doors; the client
observes and never writes.

## Schema

    alter table room_members
      add column filter      text null,   -- the look he is publishing right now
      add column filter_pick text null;   -- the ONE look he committed to this show

Two columns on purpose.  `filter_pick` is set once by `set_filter` and is
never cleared by any drop — it IS the one-per-show lock.  `filter` is what
he publishes now; every strip clears it and leaves the pick.  A drop, an ask,
a moment, a host force-off all leave `filter_pick` behind, which is exactly
"he can't pick a new one".  (It also leaves the door open for the design's
frame-3 note — "Fox Ears resumes automatically if the moment ends with time
left on his pick" — without a schema change.  That resume is NOT built; see
the PR body's doc-vs-brief list.)

The curated rack is a CHECK, not an application-side hope:

    alter table room_members
      add constraint room_members_filter_curated
        check (filter is null or filter in ('grade','noir')),
      add constraint room_members_filter_pick_curated
        check (filter_pick is null or filter_pick in ('grade','noir'));

Free tier only.  The amber ✦ set (face-tracked) is step 3 + token gating and
is not in this list; when it lands, it widens this constraint and adds the
token check inside `set_filter` — nothing else changes shape.

`active_members` must PROJECT the two columns (the client's seated read is
`select *` and gets them for free; the RPC path for bench rows does not).
Read its current body first; add `filter, filter_pick` to its return set and
to the masked branch's row shape.  Do not touch the freshness filter.
(2026-09-28: production returns `SETOF room_members`, so this needed no
change — divergence 3 above.)

## The four doors

Rejection ORDER is part of the contract (the double keeps it): the beat he is
in — asked, paired — is named before the standing lock, so the message says
why NOW rather than why ever.

    create or replace function set_filter(room_id uuid, name text)
    returns jsonb language plpgsql security definer as $$
    declare
      v_uid  uuid := auth.uid();
      v_room rooms%rowtype;
      v_row  room_members%rowtype;
    begin
      if v_uid is null then raise exception 'not authenticated'; end if;
      select * into v_room from rooms where id = room_id;
      if not found then raise exception 'no room'; end if;
      select * into v_row from room_members m
        where m.room_id = set_filter.room_id and m.user_id = v_uid;
      if not found or v_row.role = 'gone' then
        raise exception 'not a member of this room';
      end if;
      if name not in ('grade','noir') then raise exception 'no such filter'; end if;
      if v_room.spotlight_target = v_uid then
        raise exception 'filter not allowed while asked';
      end if;
      if v_room.moment_a = v_uid or v_room.moment_b = v_uid then
        raise exception 'filter not allowed during a moment';
      end if;
      if v_row.filter_pick is not null then
        raise exception 'filter locked for this show';
      end if;
      update room_members set filter = name, filter_pick = name
        where id = v_row.id;
      return jsonb_build_object('ok', true, 'filter', name);
    end $$;

    create or replace function drop_filter(room_id uuid)
    returns jsonb language plpgsql security definer as $$
    declare v_uid uuid := auth.uid();
    begin
      if v_uid is null then raise exception 'not authenticated'; end if;
      if not exists (select 1 from room_members m
                     where m.room_id = drop_filter.room_id and m.user_id = v_uid) then
        raise exception 'not a member of this room';
      end if;
      update room_members set filter = null              -- filter_pick STAYS
        where room_members.room_id = drop_filter.room_id and user_id = v_uid;
      return jsonb_build_object('ok', true);
    end $$;

    create or replace function host_clear_filter(room_id uuid, user_id uuid)
    returns jsonb language plpgsql security definer as $$
    declare v_uid uuid := auth.uid();
    begin
      if v_uid is null then raise exception 'not authenticated'; end if;
      if not exists (select 1 from rooms r
                     where r.id = host_clear_filter.room_id and r.host_id = v_uid) then
        raise exception 'only the host can force a filter off';
      end if;
      if not exists (select 1 from room_members m
                     where m.room_id = host_clear_filter.room_id
                       and m.user_id = host_clear_filter.user_id) then
        raise exception 'no such member';
      end if;
      update room_members set filter = null
        where room_members.room_id = host_clear_filter.room_id
          and room_members.user_id = host_clear_filter.user_id;
      return jsonb_build_object('ok', true);
    end $$;

## The clear inside `ask_question` — an AMENDMENT, not a new function

`ask_question` lives in SQL (`index.html:4063` calls it; SPEC 8/9 and the
double's SOURCE notes describe it: returns jsonb, no-ops when a spotlight is
already running, increments `rooms.round`, sets a 30s answer deadline,
pauses chair clocks, emits the `spotlight` ledger event).  Its body has NOT
been read for this branch.  Before editing: `select pg_get_functiondef
('ask_question'::regproc)`, and post the verbatim text.  Then add ONE
statement, inside the function, BEFORE the `update rooms set
spotlight_target = …` it already contains, in the same transaction:

      update room_members set filter = null
        where room_members.room_id = ask_question.room_id
          and room_members.user_id = ask_question.target;

Before the rooms update, so realtime (which delivers in commit/WAL order)
carries the member clear ahead of the row that says he is asked; and inside
the function so no client can ever observe asked=true with the field still
set.  The client folds the member row's filter columns synchronously off the
realtime payload (`filterFoldMemberRow`) for the same reason from its side.
Gate 71 block 5 fails on either being out of order (both mutations tried,
both caught, 2026-09-28).

## The Moment — NO PRODUCTION COUNTERPART, do not write this yet

The Moment (`design/Last Call Moment.dc.html`, Discovery H3) is not built:
no RPC, no `rooms` column, no client path, nothing in SPEC.md.  The double
carries a seam — `rooms.moment_a`, `rooms.moment_b`, `start_moment(room_id,
target?)` (pair = caller + target, default the host) and `end_moment` — so
that "both faces go bare the instant the moment starts, atomically with the
pairing" is a proven property of whatever function eventually owns the
start.  When the Moment is designed for the server, its start function
inherits ONE requirement from here: clear `filter` for every member row in
the pair in the same statement block that records the pairing, before the
rooms row is updated.  Nothing here should be run until that design exists.

## What the client does NOT do

- never writes `filter` or `filter_pick` (gate 61's widened scan, gate 71
  block 8: zero raw `room_members` writes of any kind in source)
- never decides a look is off: `filterReconcile()` compares the pipeline
  with MY row's `filter` and calls step 1's `filterStart`/`filterStop` to
  match; nothing else in the client calls either (gate 71 static)
- never offers a per-viewer toggle — one published track, one appearance
- the step-1 `?filter=grade` URL opt-in is retired in this branch (gate 70
  block 7 now proves it does nothing)

## SOURCE — read back from production with `pg_get_functiondef`, 2026-09-28

The three new functions below are byte-identical to what production returns
(md5s in the run log).  `ask_question` is shown from a screenshot transcription
of the read-back, which is whitespace-normalised (production has trailing
spaces on a few lines: 2509 chars in production vs 2485 here); its content
is exact and the splice post-check above is the byte-level proof.  The
`active_members` read-back is unchanged from before the run and is not
repeated here.

### set_filter

    CREATE OR REPLACE FUNCTION public.set_filter(room_id uuid, name text)
     RETURNS jsonb
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public'
    AS $function$
    declare
      v_uid  uuid := auth.uid();
      v_room rooms%rowtype;
      v_row  room_members%rowtype;
    begin
      if v_uid is null then raise exception 'not authenticated'; end if;
      select * into v_room from rooms where id = room_id;
      if not found then raise exception 'no room'; end if;
      select * into v_row from room_members m
        where m.room_id = set_filter.room_id and m.user_id = v_uid;
      if not found or v_row.role = 'gone' then
        raise exception 'not a member of this room';
      end if;
      if name not in ('grade','noir') then raise exception 'no such filter'; end if;
      if v_room.spotlight_target = v_uid then
        raise exception 'filter not allowed while asked';
      end if;
      -- moment check intentionally absent in production: rooms.moment_a/b do not exist (the Moment is not built)
      if v_row.filter_pick is not null then
        raise exception 'filter locked for this show';
      end if;
      update room_members set filter = name, filter_pick = name
        where id = v_row.id;
      return jsonb_build_object('ok', true, 'filter', name);
    end $function$
    
### drop_filter

    CREATE OR REPLACE FUNCTION public.drop_filter(room_id uuid)
     RETURNS jsonb
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public'
    AS $function$
    declare v_uid uuid := auth.uid();
    begin
      if v_uid is null then raise exception 'not authenticated'; end if;
      if not exists (select 1 from room_members m
                     where m.room_id = drop_filter.room_id and m.user_id = v_uid) then
        raise exception 'not a member of this room';
      end if;
      update room_members set filter = null              -- filter_pick STAYS
        where room_members.room_id = drop_filter.room_id and user_id = v_uid;
      return jsonb_build_object('ok', true);
    end $function$
    
### host_clear_filter

    CREATE OR REPLACE FUNCTION public.host_clear_filter(room_id uuid, user_id uuid)
     RETURNS jsonb
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public'
    AS $function$
    declare v_uid uuid := auth.uid();
    begin
      if v_uid is null then raise exception 'not authenticated'; end if;
      if not exists (select 1 from rooms r
                     where r.id = host_clear_filter.room_id and r.host_id = v_uid) then
        raise exception 'only the host can force a filter off';
      end if;
      if not exists (select 1 from room_members m
                     where m.room_id = host_clear_filter.room_id
                       and m.user_id = host_clear_filter.user_id) then
        raise exception 'no such member';
      end if;
      update room_members set filter = null
        where room_members.room_id = host_clear_filter.room_id
          and room_members.user_id = host_clear_filter.user_id;
      return jsonb_build_object('ok', true);
    end $function$
    
### ask_question (amended; the `update public.room_members` block is the one addition)

    CREATE OR REPLACE FUNCTION public.ask_question(room_id uuid, question_id bigint, target uuid)
     RETURNS jsonb
     LANGUAGE plpgsql
     SECURITY DEFINER
     SET search_path TO 'public'
    AS $function$
    declare v_room uuid := room_id; v_qid bigint := question_id; v_target uuid := target;
            v_r public.rooms; v_q public.questions; v_deck public.question_decks;
            v_deadline timestamptz; v_paused int;
    begin
      if auth.uid() is null then raise exception 'not authenticated'; end if;
      select * into v_r from public.rooms r where r.id = v_room for update;
      if v_r.id is null then raise exception 'room not found'; end if;
      if v_r.host_id is distinct from auth.uid() then raise exception 'not host'; end if;
      if v_r.phase <> 'spotlight' then raise exception 'not in spotlight (phase=%)', v_r.phase; end if;
      if v_r.phase_deadline is not null then
        return jsonb_build_object('noop', true, 'reason', 'spotlight already running',
                                  'deadline', v_r.phase_deadline);
      end if;
    
      select * into v_q from public.questions q where q.id = v_qid;
      if v_q.id is null then raise exception 'question not found'; end if;
      select * into v_deck from public.question_decks d where d.id = v_q.deck_id;
    
      if not exists (select 1 from public.room_members m
                     where m.room_id = v_room and m.user_id = v_target and m.role = 'chair') then
        raise exception 'target is not in a chair';
      end if;
    
      v_paused := public.engine_pause_clocks(v_room);
      v_deadline := now() + interval '30 seconds';
    
      update public.room_members
         set filter = null
       where room_members.room_id = v_room
         and room_members.user_id = v_target;
    
      update public.rooms r
         set spotlight_target = v_target, spotlight_question_id = v_qid,
             round = coalesce(r.round,0) + 1,
             deck_id = coalesce(r.deck_id, v_q.deck_id)
       where r.id = v_room
       returning * into v_r;
    
      perform public.engine_emit(v_room, 'spotlight', jsonb_build_object(
        'target_user', v_target, 'target', v_target,
        'question_id', v_qid, 'text', v_q.text,
        'deck_id', v_q.deck_id, 'deck', v_deck.name, 'emoji', v_deck.emoji,
        'round', v_r.round, 'cycle', v_r.cycle, 'deadline', v_deadline,
        'clocks_paused', v_paused));
    
      update public.rooms r set phase_deadline = v_deadline where r.id = v_room;
    
      return jsonb_build_object('phase','spotlight','deadline', v_deadline, 'round', v_r.round,
        'target', v_target, 'question_id', v_qid, 'clocks_paused', v_paused);
    end $function$
    
