# CONDUCTOR RUN — b0809.1727 — the thirteen anomalies

**Provenance.** This list was produced by the five-tab live conductor run at
build `b0809.1727` and was never committed.  It survived only in the project's
conversation history and had to be recovered from there on 2026-08-11, at which
point a subsequent agent could not find it in the repo and nearly scored a run
against a list it would have had to invent.  It is written down here so that
cannot happen a third time.  Waves 8 and 9 were both shaped by this list; it is
a primary artifact and belongs in the repo.

It is **not** the same document as `tools/AUDIT-2026-08-08.md` (the static
read-through audit, findings F1–F…).  That one is a code audit.  This one is a
record of what actually happened in front of five browsers.

---

## The three membership diseases (wave 8 branch A / gate 36)

1. **HOST ROSTER SPLIT** — server seated 3 (four player tabs unanimous); the
   host tab alone read them as `line`×3 for >30s, survived a full re-auth, and
   her cold-start auto-seat re-fired every ~4s writing 9–10 duplicate "took a
   chair" feed lines.  Converged only when the engine advanced phase.
2. **EVAPORATING BENCH ROW** — tab b's bench join optimistically transitioned
   the acting UI three times while the server never kept the row.  UI said
   benched, roster said spectator, no error surfaced.
3. **GHOST ROW** — a stale `line`-role row (`56b7`) rendered as a masked
   "someone" on every tab all night, beside a contradicting "0 IN LINE" label.

## Branch B / gate 37

4. **QUESTION REACHES HOST ONLY** — the spotlight question text rendered on the
   HOST tab only; target and all other roles never displayed it (4/5 missing).
   A regression — wave 3 had fixed this and gate 23 passed.

## Branch C / gate 38

5. **HER CALL, THREE FACES** — PASS ONE appeared then VANISHED on re-render
   (option set unstable within the phase); the clock sat parked at 0:00 with
   `phase_deadline` null; Q5's clock-out/crowd-call machinery never fired
   despite distinct hearts.

## The eight edges (branch D / gate 39)

6.  **d1** — "TAKE THE CHAIR" card during warm-up benches you with a bench toast
    instead of seating you in the chair it names.
7.  **d2** — spectator ejected at show end with no finale card (tab b → bare
    lobby).
8.  **d3** — winner snap photo is a black frame on every winner card; the finale
    snap capture races the video element.
9.  **d4** — hearts self-materialized, 0 → 35 with nobody hearting.
10. **d5** — backstage clock skew ~16s; each side runs its own 3:00.
11. **d6** — watcher count flapping, 6 vs 1 across tabs within seconds.
12. **d7** — mid-phase rejoin loses all video; b re-entered during her call and
    got four dark tiles.
13. **d8** — post-decline, the offerer waits out the full window unaware her
    counterpart is gone.

## Also banked that run, not in the thirteen

- Host reload dropped the auth session instead of rejoining her live room, and
  Chrome autofilled a **different account's** email into the sign-in form.
- The acting tab doesn't show its own bench card for a few seconds after
  benching (self-view lag).

---

# RIG REQUIREMENTS — read this before running a conductor pass

**Run each participant in a SEPARATE, UNMINIMIZED BROWSER WINDOW.  Never as
multiple tabs in one window.**

This is not a preference.  A tabs-in-one-window rig manufactures the exact
symptoms this list is trying to measure, and it cost a full run on 2026-08-11
before the cause was found.

## Why

**`activeRows()` has a 60-second freshness window**; `startHeartbeat()` beats
every 8s on a `setInterval`.  In one window only one tab is ever foreground, and
a hidden tab's beats do not keep pace with that window, so its row ages out of
every roster while the person is still sitting there.

**A correction worth recording, because getting it wrong cost an hour.**  The
doc comment above `bestEffortLeave()` reads:

```
/* best-effort clean exit: fire leave_room when the tab closes or is hidden,
   so members don't ghost for 60s waiting on the freshness window */
```

That comment is **stale and wrong**.  The actual wiring, thirteen lines below
it, is the opposite and says so:

```js
// only on REAL page teardown — NOT on tab-hide. deleting the membership row on
// visibility loss cut off all realtime delivery (RLS needs the row) and broke
// chat/gifts for any viewer whose tab was ever backgrounded.
window.addEventListener("pagehide",(e)=>{ if(!e.persisted) bestEffortLeave(); });
window.addEventListener("beforeunload",bestEffortLeave);
```

`bestEffortLeave` is bound to `pagehide` and `beforeunload` **only**.  A hidden
tab is not removed from the room, and `visibilitychange → visible` re-syncs room
truth, beats first to preserve the role rather than re-joining (which would
reset bench → spectator), and re-enters only if the 45s sweep already marked the
row gone.  The closed-vs-away distinction is already built.  On 2026-08-11 an
agent read the stale comment, believed it, and nearly opened a wave 9 branch to
reimplement behaviour that was already there.  **Fix the comment.**

The mechanism behind the stale rows is therefore heartbeat pacing in hidden
tabs, not membership deletion — and note that it is *observed but not fully
explained*: intensive timer throttling normally requires several minutes hidden,
while the collapse below happened at ~150 seconds.  Treat the rig rule as
empirical.

## What it looks like when you get this wrong

Observed 2026-08-11 at `b0811.2124`, ~150 seconds into an otherwise clean show
(curtain-up had seated 3, 2 benched, all six clients agreeing
`{line:2, bench:2, chairs:3, total:6}`):

```
counts {crowd:0, line:0, bench:0, chairs:0, kept:0, total:1}   ← on EVERY client
ROOM_STATE.members still held 5 rows with real roles
"0 IN LINE" beside a populated bench · three blank chairs · watch count 1
document.hidden === true on every tab
```

That is a manufactured reading of anomalies **2, 3, 11 and 12** — evaporating
rows, ghost rows, flapping counts, dark tiles — none of which the app was
actually committing.

## What it does NOT explain

Anomaly **1 (host roster split)** is not reachable this way.  Its signature is
the HOST disagreeing with four player tabs **that agreed with each other**;
timer throttling degrades every client alike and cannot produce that asymmetry.
Branch A's headline finding stands.  Anomalies **2** and **11** are the ones
this confound casts genuine doubt on, and they should be re-measured on a
correct rig before any further work is built on them.

Anomalies that are independent of visibility — the host auth drop, foreign
`line` rows belonging to no signed-in account — remain scoreable from a bad rig,
but nothing about membership counts does.

## Checklist

- One window per participant, tiled so **none is minimized or fully covered**.
  `document.visibilityState` stays `"visible"` for an unminimized window even
  when it is not the focused one; that is the whole trick.
- Before starting, assert `document.hidden === false` in every window.
- Record each slot's auth token `expires_at` at the top of the run.  Tokens are
  one hour; a 45-minute run started 20 minutes after sign-in will die mid-show
  and it will look like a bug.
- Use `?session=<slot>` per window so the accounts do not share auth storage.

---

# SCOREBOARD — live run, 2026-08-11, build `b0811.2124`

Real Supabase, real Daily, five separate browser windows, one account per
window.  Host drove; the agent guided and read back.  Scored against the
thirteen above.

| # | anomaly | verdict |
|---|---|---|
| 3 | ghost row | **DEAD** — one "someone", "+1 IN LINE", one real benched man.  No contradiction. |
| 4 | question reaches host only | **DEAD** — the target sees his own question.  `fix/question-truth` holds in prod. |
| 8 | winner photo black | **DEAD** — a real photo on the winner card, confirmed in two windows. |
| 10 | backstage clock skew | **DEAD** — both sides render the same number off one shared deadline. |
| 13 | offerer waits on a ghost | **PARTIAL** — see below. |
| 1, 2, 5, 6, 9, 11, 12 | membership / counts / video | **UNREACHABLE BY THIS RIG** |
| 7 | spectator ejected at show end | **NOT REACHED** — measurement contaminated by the operator. |

**UNREACHABLE BY THIS RIG is not NOT REACHED.**  It does not mean run longer.
Scoring the membership set requires reading several participants' clients
*simultaneously*, and the browser tooling available to an agent addresses only
one tab group — inside which exactly one tab is ever visible.  No amount of
additional live running fixes that.  Whatever covers those seven has to be a
harness gate or a rig that does not yet exist.  Do not read them as unfinished
work.

## #13 — the half that was still alive, and why the harness was blind to it

The anomaly is two claims in one sentence: the offerer is *unaware* her
counterpart is gone, and she *waits out the full window*.

- **Unaware — DEAD.**  Her tile returned to "waiting for …" the instant he
  left.  That is `bsPeerLeft()` from PR #41 working in production.
- **Waits out the window — ALIVE.**  Her clock kept running on an empty room.

`bsGoodnight()` — the thing that actually closes the window — was still fenced
behind `BSD_PHASE==="deciding"`.  Outside that phase the fix retires the tile
and says the line, and never stops her clock.  The telling was fixed; the
waiting was not.

Gate 44 asserts that she is **told**, which is exactly the half that was right.
A harness gate written against the half you already understand cannot fail on
the half you don't.  This is the clearest argument in this document for keeping
a live run in the loop.

**Owner ruling, 2026-08-11: the clock stops.**  An empty winner's room running a
three-minute countdown is the room lying to her.  `bsGoodnight` fires on
last-counterpart-departure regardless of phase — the `deciding` fence was about
the decision, never about whether an empty room keeps a clock.  Same beat, same
goodnight, unfenced.  **Wave 9 branch 1**, and its gate must assert *both*
halves of #13: she is told **and** her clock stops.

## Also validated live

Both fixes shipped 2026-08-11 held in production, not merely in the harness:

- **PR #40 `fix/bench-take`** — a benched man tapped OPEN CHAIR and **stayed
  benched**.  Gate 43 measured `role after tap: spectator` on unfixed main.
- **PR #41 `fix/backstage-exit`** — the departing peer's tile was retired off
  the `backstage_left` event.

---

# METHOD — read this before running a live pass

**On a live rig, establish the action before interpreting the pixels.**

The 2026-08-11 run produced four confident findings that were all wrong, and
every one failed the same way: a cause was inferred from a screenshot without
first establishing what had just been clicked.

1. *"Hidden means gone."*  Quoted a stale doc comment instead of the listener
   thirteen lines below it.  Nearly opened a branch to rebuild existing
   behaviour.
2. *"A stranger's email is autofilled."*  It was the host's own address,
   offered by the browser's password manager on a blank form.
3. *"Anomaly #0 reproduced, sharper."*  Built on a tab pointed at a session slot
   nobody had signed into.
4. *"#7 spectator ejected — ALIVE."*  Three players were sitting in a bare
   lobby because the operator had sent them there.

Each was retracted within minutes of the underlying state being checked.  After
the rule above was adopted mid-run, the following five verdicts required no
correction.

Practical form:

- Before scoring anything, ask what the operator just did.  "What did you click?"
  costs one line and prevents a false finding.
- Prefer a state you can query (`role`, a button's label, a count) over a state
  you infer from an image.
- A screenshot proves what is on screen.  It never proves why.
- When an observation and a comment disagree, the listener wins.  Read the
  wiring.

A wrong finding is more expensive than a missing one: it gets a branch, a gate,
and a merge before anyone checks it.

---

# CARRIED OUT OF THE 2026-08-11 RUN

**A retracted finding, kept on the record so it is not rediscovered.**  That run
first reported "hidden means gone" and a proposed wave 9 branch to split closed
from away.  Both were **wrong** — see the correction above.  The behaviour was
already implemented and the report was based on a stale comment rather than the
wiring.  The branch was cancelled before anything was built.  The lesson is
cheap and general: *quote the listener, not the comment above it.*

**What actually remains open, stated at its true size:**

1. **The stale comment above `bestEffortLeave()`** misdescribes the code and has
   now produced one wrong diagnosis.  One-line fix.
2. **Is a 60-second freshness window right for phones?**  `activeRows()` drops a
   member 60s after their last beat, against an 8s beat interval.  A person
   whose phone backgrounds the app is still in the room and will re-sync on
   return, but for that window they are absent from every roster and their chair
   reads empty to everyone.  Whether 60s is the right number is a **tuning
   question that needs measurement on real devices** — not a disease, and
   explicitly not a licence to rewrite the presence model.
