# DESIGN — filter show rules: the server side (PENDING PRODUCTION DDL)

STATUS: written with `feat/filter-rules` (step 2 of 3, stacked on #83),
2026-09-28.  NOT applied to production.  This repo has no migrations
directory and no `.sql` under version control: every server function so far
was posted to the advisor and run in Supabase Studio after its own explicit
go (gate 61's header, gate 63's header, `DESIGN-presence-vs-role.md`).  This
document is that posting for the filter rules — the same shape as the
presence design doc, and nothing below is SOURCE until it has been run and
read back with `pg_get_functiondef`.

The local double (`tools/lib/backend-double.js`) models exactly what is
written here — the two columns, the four functions, the rejection order and
messages, and the clear inside `ask_question` — so gate 71 is green against
the DOUBLE, not against production.  When this DDL runs, read every function
back verbatim and diff it against the double before calling the branch proven
on the server.

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
