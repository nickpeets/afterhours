# DESIGN — presence separate from role (RULED IN PART, migration unscheduled)

STATUS: proposal RULED IN PART, 2026-08-14 — the conductor answered the three
open questions and added a fourth (rulings recorded at the bottom).  Still
not applied anywhere; the migration itself remains unscheduled.  Nothing
below is SOURCE; it is a plan derived from SOURCE reads.

## The disease, restated from the reads

SOURCE (pg_get_functiondef, 2026-08-13): `role` carries two unrelated facts —
what a member IS in the show (spectator / line / chair / kept) and whether his
phone is ALIVE ('gone'). The moment presence stamps itself onto role, the
original role is destroyed. That single overwrite is the root of three open
items:

1. the recovery trio — the only door back from 'gone' is delete-and-recreate
   (client workaround shipped on `fix/recovery-truth`, labelled as such);
2. the bench position loss — the deleted-and-recreated row has no
   `prev_role='line'` for `join_line` to preserve;
3. gate 53's whole scenario, plus the two sibling trios found in the rpc
   census (pass-demotion L5257-58, leave-line toggle L5275-76) which use the
   same delete-then-hope shape for the same reason.

## The change (one migration, four function edits)

### Schema

    alter table room_members add column gone_at timestamptz null;

`role` keeps exactly its show meanings. Presence lives in `gone_at`
(null = not buried) plus the existing `last_seen`.

Backfill for rows currently buried:

    update room_members set gone_at = now(), role = 'spectator'
      where role = 'gone';

(role='spectator' because the original role was destroyed at burial — that
information is already lost; spectator is the only honest floor. After this
migration no new row can lose its role this way.)

Optionally, once no code writes it: a CHECK that role never takes the value
'gone' again.

### Functions (against the verbatim reads of 2026-08-13)

- `sweep_stale_members`: instead of `set role='gone'`,
  `set gone_at = now()` on the same predicate (stale 3 min, not kept,
  not already buried: `gone_at is null`). ROLE IS NEVER TOUCHED.
- `heartbeat`: `set last_seen = now(), gone_at = null` — THIS is the revive
  path the server never had, and it is one line. A phone that comes back and
  beats is back, role intact, bench position intact.
- `active_members`: replace `role <> 'gone'` with `gone_at is null`; the
  freshness disjunction `(role='kept' or last_seen > …60s)` is unchanged;
  the md5 mask on other people's line rows is unchanged.
- `join_room`: else-branch becomes `set last_seen = now(), gone_at = null` —
  same "no downgrade" contract, but a corpse revives instead of staying a
  corpse.

`join_line`, `leave_room`, `seat_member`, `keep_member`, `pass_member`:
untouched. `join_line`'s prev_pos preservation starts working for swept men
for free, because their row still says `prev_role='line'`.

### What it retires

- The entire client recovery workaround block (delete-then-verify) collapses
  to: heartbeat, reload state. The block is already labelled for deletion.
- The two sibling trios stop being erasure risks in the swept case (their
  deliberate leave→join demotion use remains, and remains a separate
  read-your-results question — NOT addressed here).
- Gate 53's scenario becomes unreachable on the server; the gate flips to
  locking the revive contract instead (heartbeat un-buries, role survives a
  burial round-trip).
- The bench item closes: swept-and-returned keeps his place in line.

### Double changes (same commit as the gates that assert it)

`backend-double.js`: members rows gain `gone_at`; sweep/heartbeat/
active_members/join_room mirror the four edits above, each labelled SOURCE
once the real functions are read back post-migration. FRESH_MS/SWEEP_MS
unchanged.

### Rollout order (so no moment mixes the two worlds)

1. migration + four functions in one SQL transaction (server first — old
   clients keep working: they never see 'gone' rows today and still won't;
   their delete-and-recreate recovery still works, it is just no longer the
   only door);
2. read back all four with pg_get_functiondef, paste into the double with
   SOURCE labels;
3. new gates red-then-green: revive-truth (heartbeat un-buries with role and
   seat/prev_pos intact), sweep-truth (burial preserves role);
4. client: delete the recovery workaround block, gate 53 rewritten to the
   revive contract;
5. only then consider the sibling trios' remaining (deliberate-demotion)
   result-reading.

## Questions and RULINGS (conductor, 2026-08-14)

- Q-a RULED: the backfill CLEARS gone_at, scoped to CURRENTLY LIVE ROOMS
  only — and the migration says explicitly that older buried rows STAY
  buried.  (Supersedes the spectator-floor proposal above.)
- Q-b RULED: do NOT couple the #58 seated-read to gone_at.  Verbatim: "#58
  is the 60s freshness window, gone_at is the 180s burial, two thresholds
  two bugs, and a man between 61s and 179s is still hidden after gone_at
  ships."  The seated-read workaround retires on its own merits or not at
  all.
- Q-c RULED, WIDENED: the catalog check covers readers AND WRITERS of
  role='gone', server and client, before the migration runs.
- Q-d NEW (conductor's addition, to be answered in this doc before the
  migration): what happens to a row buried when the show then ENDS —
  gone_at set, heartbeat no longer running, nothing clears it.  Unanswered;
  blocks the migration until it is.
- Q-e RULED (Nick, 2026-08-14, via planner tab): THE HOLD IS 15 SECONDS,
  FLAT — "You have to be ready to play the game and be present to win
  someone's attention."  The 60s/180s chairHold thresholds are design
  decisions superseded as PRODUCT intent, not tuning constants; for the
  CHAIR, SPEC Q60's freshness question is answered by intent — 15s WITH a
  visible held state (clock frozen, RECONNECTING amber), a different
  contract.  Server-side implementation (chairHold semantics vs today's
  sweep) is a build item, not a ruling item; it does NOT block the host
  exemption.  [Composed at rebuild 2026-08-14 from the tab's verbatim
  ruling; the dead commit's exact Q-e wording did not survive.]
