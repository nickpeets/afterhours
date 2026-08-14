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

> **"GATE 39 COVERS THESE" WAS TRUE OF SIX OF THEM, NOT EIGHT.**  Corrected
> 2026-08-12 after reading the gate instead of the sentence about the gate.
> Two of d1–d8 were held by a SOURCE GREP and nothing else:
>
> - **d2** (spectator ejected) was one assertion that sliced `index.html` at the
>   watchdog and checked `status==="ended"` and `roomEndedUnderUs` appeared
>   within 900 characters.  That proves two identifiers sit near each other in a
>   file.  It cannot prove the branch is reached — and it is fenced behind
>   `DAILY && DAILY_JOINED`, so it is not reached at all unless the client is in
>   the video call, which a grep can never notice.  **Now held by gate 47**,
>   which ages the real watchdog and asserts he lands on the finale.
> - **d3** (black winner photo) was a source grep too, and no runtime assertion
>   anywhere checked that the shipped photo was not black — gates 7, 23 and 24
>   all reach the snap ceremony and assert only that the SCREEN appears.
>   **Now held by gate 48**, which decodes the rendered `<img class="winnerphoto">`
>   and samples it.  Unlike d2 this was source-only **by CHOICE**: `WINNER_PHOTO`
>   is exported nowhere, but the photo is *rendered*, so the shipped artifact
>   was in the DOM the whole time.  Nothing was blocking the assertion.
>
> The lesson generalises past these two: when a gate cannot reach the state a
> claim depends on, it does not fail — it silently downgrades to a source check
> while the battery's check count keeps climbing.  See METHOD's fifth rule.

6.  **d1** — "TAKE THE CHAIR" card during warm-up benches you with a bench toast
    instead of seating you in the chair it names.
7.  **d2** — spectator ejected at show end with no finale card (tab b → bare
    lobby).
8.  **d3** — winner snap photo is a black frame on every winner card; the finale
    snap capture races the video element.
9.  **d4** — hearts self-materialized, 0 → 35 with nobody hearting.
    **ANSWERED 2026-08-12 and the diagnosis was backwards.**  There is no
    server-side seeder (no triggers, no autonomous writer — read from
    production).  The CLIENT has four heart writers, `sendHeart()` inserts
    `room_events` directly rather than through an RPC, and the 0 → 35 jump
    is the ENTRY SEED repainting a backlog.  Gate 39's d4 pin said the
    opposite and could not fail; rewritten in `fix/heart-truth`.
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

**And on 2026-08-12 it was reproduced deliberately, in seconds, which turns the
paragraph above from an argument into a mechanism.**  One benched man, one
hidden tab:

```
ROOM_STATE.members   [{u:c4f781c3, role:"line", seat:null}]   ← the row is right there
roomCounts()         {crowd:0, line:0, bench:0, chairs:0, kept:0, total:1}
```

The row exists and says `line`; the count says zero.  Nothing is wrong with the
app.  `activeRows()` filters on a 60-second freshness window fed by an 8-second
heartbeat, Chrome throttles background timers toward roughly one per minute, and
a throttled heartbeat falls off the edge of that window.  The count is correctly
reporting what the freshness rule can see.

Two things follow.  **Any headcount measured from a throttled tab is void** —
not suspect, void; do not score it, do not average it, do not mention it as
weak evidence.  And **this failure is now triggerable on demand**, so a future
session can confirm in under a minute whether a strange count is the app or the
rig, instead of arguing about it for an hour.

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

> **THE AGENT CANNOT DO THIS, AND THE EARLIER WORDING BLAMED THE WRONG PARTY.**
> This document used to read as though the 2026-08-11 rig was invalid because
> the operator failed to tile.  That is not what happened.  The browser
> extension drives a *tab group*, and a tab group lives in ONE window — the
> instant a tab is pulled out into its own window it leaves the group and the
> agent loses it entirely.  So "five separate windows" and "five windows the
> agent can drive" are mutually exclusive with this tooling.  Every rig the
> agent has ever actually had is five tabs in one window with four of them
> throttled, which is exactly the recorded failure: all tabs `hidden`, rows
> 150–180s stale, `activeRows() === 0`.  It is a **tooling constraint, not a
> setup mistake**, and stating it the other way sends the next session hunting
> for an operator error that does not exist.
>
> **What works instead.**  A screenshot does NOT focus a tab (checked:
> `hidden` stays `true`, `hasFocus` stays `false` after a capture), so the
> agent can never make a window visible by itself.  But `javascript_tool`
> executes in BACKGROUND tabs.  So drive the other participants from the
> background through JS and let a human focus only the ONE window whose timers
> are being measured.  Better still, prefer assertions that do not depend on
> visibility at all — see the flag-vs-render rule in METHOD.
- Record each slot's auth token `expires_at` at the top of the run.  Tokens are
  one hour; a 45-minute run started 20 minutes after sign-in will die mid-show
  and it will look like a bug.
- Use `?session=<slot>` per window so the accounts do not share auth storage.
- **The workspace that owns the battery goes to sleep, and a sleeping workspace
  is not a failing gate.**  The Codespace has an idle timeout.  On the
  2026-08-11 run it raised a "Stop Now / Keep Working" prompt mid-run, the
  wrong button was pressed, and a 42-gate battery died partway with no error
  anywhere — the log simply stopped growing.  Nothing in the output says
  "the machine went away"; it reads exactly like a hung gate.  So: answer Keep
  Working before a long pass, run the battery under `nohup` into a file, and
  treat *a log that has stopped growing* as a dead workspace until proven
  otherwise.  Cost more of that session than any bug in the build did.

---

# SCOREBOARD — live run, 2026-08-11, build `b0811.2124`

Real Supabase, real Daily, five separate browser windows, one account per
window.  Host drove; the agent guided and read back.  Scored against the
thirteen above.

| # | anomaly | verdict |
|---|---|---|
| 3 | ghost row | **DEAD** — one "someone", "+1 IN LINE", one real benched man.  No contradiction. |
| 4 | question reaches host only | **DEAD** — the target sees his own question.  `fix/question-truth` holds in prod. |
| 8 | winner photo black | **DEAD** — a real photo on the winner card, confirmed in two windows, and since 2026-08-12 held by **gate 48**, which decodes the rendered image and samples it.  A regression lock, not a bug proof: it arrived green and its header says so. |
| 10 | backstage clock skew | **DEAD** — both sides render the same number off one shared deadline. |
| 13 | offerer waits on a ghost | **DEAD** — both halves, the second one live at `b0811.2124` on 2026-08-12.  See below. |
| 1, 2, 11 | host roster split, evaporating bench, count flapping | **UNREACHABLE BY THIS RIG** |
| 5, 6 | her call, chair mislabel | **NOT REACHED LIVE, BUT GATED FOR REAL** — #5 is driven end-to-end by gate 19 (hearts seeded, clock armed, leader wins through `decide_keep`, beat lands, plus the tie case); #6 by gate 39's d1 runtime (the tap benches and the verb flips).  A live pass would confirm, not discover. |
| 7 | spectator ejected | **DEAD IN THE HARNESS** — held by **gate 47** since 2026-08-12, which ages the real watchdog and asserts he lands on the finale.  Previously a source grep; see the note under the eight edges. |
| 9, 12 | hearts materialising, rejoin loses video | **NEEDS A RIG THAT DOES NOT EXIST** — see below |

**These three labels mean different things, and the first version of this table
got them wrong.**  It filed all eight as UNREACHABLE BY THIS RIG.  Three of them
are nothing of the sort, and mislabelling them would have told a future reader
not to bother trying.  Corrected here, and the correction is itself the point:

- **UNREACHABLE BY THIS RIG** — #1, #2, #11.  Scoring these needs several
  participants' clients read *simultaneously*, and agent browser tooling
  addresses one tab group, inside which exactly one tab is ever visible.  No
  amount of additional live running fixes that.  A human watching several
  windows *can* score them; an agent driving them cannot.
- **NOT REACHED** — #5, #6, #7 were filed here, and on 2026-08-12 all three were
  found to be genuinely covered in the harness after reading the gates rather
  than the sentences about them (#5 by gate 19, #6 by gate 39's d1 runtime, #7
  by the new gate 47).  A live pass would confirm them, not discover them.

**WHAT A LIVE PASS STILL OWES, AS OF 2026-08-12: one thing.**  Not four.  The
concurrent `line_position` mint order — whether three men benching within
seconds of each other receive positions in the order the server saw them — is
the only claim left that needs real rows, because the double mints from a local
counter and can only replay the ordering a gate wrote.  See SPEC Q46.  That is a
much smaller reason to book five windows than this table implied a day earlier.
- **NEEDS A RIG THAT DOES NOT EXIST** — #9 and #12's transport half.  See the
  open questions at the end of this document.

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

### And then the waiting half died too — live, 2026-08-12

PR #44 unfenced `bsGoodnight`, gate 45 pinned it, and the harness went green.
That is confidence about a double, not about production.  So it was driven on
the real build, against real Supabase and real realtime, host and winner both
backstage and both in the call:

```
BEFORE (her side)  clockOn true · room da7e5100 · chipOn true · clockText 2:18 · backstage true
   he clicks #bs_leave  →  his side: backstage closes, BS_STATE.room null
AFTER  (her side)  clockOn FALSE · room NULL · chipOn FALSE · backstage FALSE
                   winnerWaiting true · clockText frozen at 2:09
                   toast "They slipped out into the night.  Last call.  Goodnight ✦"
   identical across 8 samples, still identical at +71s — no interval survived
```

**#13 is DEAD in both halves.**  The telling was fixed by PR #41, the waiting by
PR #44, and both are now confirmed outside the harness.

**Why this reading survives a hidden tab, which is the part worth keeping.**
Her window was throttled for the whole measurement.  That would have destroyed a
*text-based* reading — and it is the trap this run came closest to falling into,
because a throttled interval that never fires is indistinguishable from a clock
that stopped, and it would have "confirmed" PR #44 for entirely the wrong
reason.  A false green is worse than a false red: nobody re-checks a pass.  The
escape is that `clockOn` and `BS_STATE.room` are flags the app *sets in code*,
not values an interval *renders*.  A throttled interval leaves `clockOn` **true**
and the text stale; what was measured was `clockOn` going **false** and `room`
going **null** — the opposite signature.  The frozen `2:09` is the throttle.
The `false` and the `null` are the fix.

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

## THE TAB CONTRACT — standing rule, read before anything else

Owner's rule, 2026-08-13, verbatim in force.  It sits above every other rule
here because it governs whether any of them reach anyone.  It survives session
resets; a chat does not.

1. **NEVER MORE THAN THREE MINUTES SILENT.**  A one-line heartbeat: what you
   are doing *right now*.  Not a report.  If a single tool call will run longer
   than three minutes and you physically cannot post during it, say so BEFORE
   you start it, with an estimate — *"reading four function bodies through the
   dashboard, back in about ten minutes."*  **Silence is only acceptable when
   it was announced in advance.**
2. **AFTER EVERY POST, READ THE TAB BEFORE CONTINUING.**  The owner may have
   ruled, corrected, or redirected while you were working.  Check for a new
   instruction and follow it before proceeding with what you had planned.  **The
   tab is the authority; your plan is not.**
3. **POST BEFORE A SEQUENCE, NOT ONLY AFTER.**  What you are about to do, and
   how long it will take.
4. **POST AT EVERY CHECKPOINT** — every commit, every measurement, every read
   that changes a conclusion.  Three conclusions reversed mid-stream on the
   night this rule was written, and each was worth knowing immediately rather
   than at the end.
5. **POST WHEN BLOCKED, IMMEDIATELY, AND NAME THE KIND:** Codespace idled /
   Chrome dropped / waiting on a ruling / waiting on the owner.  Four different
   responses are needed and **silence looks identical for all of them.**
6. **SHAPE, EVERY TIME: DID / OBSERVED (raw) / BLOCKED / NEXT.**
7. **IF A RULING IS OUTSTANDING, SAY SO AND KEEP WORKING ON WHAT ISN'T
   BLOCKED.**  Never idle waiting.

**Why three minutes, in the owner's reasoning:** a gate is ~7s, a battery a
couple of minutes, most browser sequences under two.  Three sits just above
routine work, so **a breach means something**.  Below that it would fire
constantly and get ignored.

The failure this rule exists to kill is not slowness — it is an agent going
dark for twenty minutes inside a chain of reasoning that had already turned out
to be wrong twice, while the one party who could have stopped it sat watching a
blank tab.  A finding held back until the end is a finding that arrived after
the decisions it should have changed.

---

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

**The third rule, from the 2026-08-12 run: measure the flag the app SETS, never
the value an interval RENDERS.**

This is what makes a live reading survive a rig you cannot fully control, and it
is the difference between validating a fix and appearing to.

A hidden tab throttles `setInterval` toward one call per minute.  So an interval
that never fires and a countdown that was deliberately stopped look identical on
screen — both show a number that is not moving.  Score the screen and a
throttled tab hands you a **false green** on exactly the fix you came to
validate.  That is the worse direction: a false red gets re-run, a false green
gets believed and built on.

The two are trivially separable at the state layer, because they have opposite
signatures:

| | `clockOn` | rendered text |
|---|---|---|
| throttled interval | still **true** | stale |
| genuinely stopped | flipped **false** | stale |

So: assert on `BS_STATE.clockOn`, on `BS_STATE.room` going `null`, on a class
being removed — things a line of code changed.  Treat rendered text and
screenshots as corroboration, never as the measurement.  Stated generally:

- **A flag is evidence.  A rendering is a symptom.**
- If an assertion would still pass when the tab is merely asleep, it is not an
  assertion.
- When a rig limitation cannot be removed, look for the reading it cannot
  corrupt — that is usually cheaper than fixing the rig, and it is what let
  #13's second half be scored from a throttled window with no asterisk.

**The sixth rule: a production threshold and a gate threshold are different
instruments.**

Production must not refuse a genuinely dim room, so `startWinnerSnap` ships a
photo if THREE sampled pixels are lit.  A gate must fail on the symptom, and a
gate inheriting that same three passes on a 99%-black frame — which is anomaly
d3 nearly intact.  Measured against the fixture the real answer was 243 of 243
lit, so gate 48's bar is 50%: wide against a known fixture, still loud on black.

This is the vacuous assertion wearing a number, and it is harder to spot than a
missing field because it *looks* rigorous — there is a comparison, a constant,
a unit.  Whenever an assertion borrows a threshold from the code it is testing,
ask the only question that matters: **can this number still fail?**

**The seventh rule: say in the header whether a gate was forged against a live
bug or written against working code.**

They are different evidence and a green battery hides the difference.  Gate 47
was forged: the symptom was live, the branch was unreachable, and the red was
real (with a note recording which part of that red was the missing export and
which was the author's own short timeout).  Gate 48 was written against code
that already worked — the fix was two waves old and a live run had confirmed it
— so it is a REGRESSION LOCK, and its header says so in those words.

Neither is worthless and neither is a substitute for the other.  A lock that has
never been red is weaker evidence that the bug is dead; it is perfectly good
evidence that the bug cannot come back quietly.  What is not acceptable is
manufacturing a red by breaking the app to watch a gate fail: that proves the
gate can detect damage you inflicted, which is not the claim anyone cares about.
Say which kind it is and let the reader weigh it.

**The fifth rule: a gate that cannot reach the state does not fail — it
degrades to a grep, and the check count keeps climbing.**

Audited the whole battery for this on 2026-08-12: **24 of 451 `t.ok` sites are
source-only** (roughly 24 of 693 executed checks, ~3.5%).  Most of them are
fine, and the split is what matters:

| kind | count | verdict |
|---|---|---|
| universal negatives — "this pattern appears NOWHERE" | ~13 | **correct tool.** Runtime cannot prove absence; you would have to exercise every path. `parse`, `forbidden`, `safari-scan`, the "gone from the CODE" pins. |
| static pin WITH a runtime companion for the same symptom | ~9 | **belt and braces.** Gate 40 already drives `setFault("auth.getSession", …)` at runtime; gate 42 drives real `TOKEN_REFRESHED`/`SIGNED_OUT`; gate 39's d1 taps the card and watches the row change. The grep guards the mechanism, the runtime proves the consequence. |
| grep standing ALONE — nothing anywhere proves the symptom | **2** | the real finding. |

The two that stood alone:

- **d2, spectator ejected** — source-only **BY NECESSITY**: `HOST_LAST_SEEN` was
  a module-local `let`, so the branch could not be aged from a gate.  Fixed by
  exporting it and writing gate 47.
- **d3, black winner photo** — source-only **BY CHOICE**: gates 7, 23 and 24 all
  reach the snap ceremony and assert the screen appears; not one looked at the
  pixels.  Runtime was available and nobody wrote it.  **Closed by gate 48.**

Both are now shut, and a follow-up re-check confirmed there is no third case:
gate 41 looked like one (its `ahMigrateSlotKey` pin appeared unaccompanied to a
script) but genuinely drives migration at runtime — it seeds a legacy key, calls
the migrator, and asserts both that the key moved and that a live slot is never
clobbered.  The script had missed it because the gate aliases `__lc` to `L`.
**Read the gate, not a grep for the gate** — the same error one level up.

One more shape worth naming, found while writing gate 48: **a threshold can be
vacuous the way a missing field can.**  The first draft inherited the app's own
bar — ship if three sampled pixels are lit.  That is correct for production,
which must not refuse a genuinely dim room; as a *gate* it passes on a 99%-black
frame, which is the d3 symptom nearly intact.  Measuring the fixture (243 of 243
lit) and setting the bar at 50% made it an assertion again.  When an assertion
borrows a production threshold, check whether the number can still fail.

So the battery is not riddled with greps wearing a gate's clothes — the number
is two, not twenty-four.  But the mechanism that produced those two is real, and
it is silent, which is why it is written down as a rule rather than a footnote:

- Before accepting a source-only assertion, ask which of the three kinds it is.
  Only the first is a good answer.
- If the honest answer is "the state is unreachable", **export the state** —
  the same reflex the battery already has for unreachable functions — rather
  than settling for the grep.
- A source grep cannot see a fence.  d2's branch is gated on `DAILY &&
  DAILY_JOINED`; the grep passed for two waves against code no test ever
  entered.

**The fourth rule: assert what the person in the room would complain about,
not what the diff did.**

Three gates in one session asserted the change and missed the consequence, and
that is not three coincidences — it is a property of writing a gate immediately
after writing the fix, while the diff is still the most vivid thing in your head:

| gate | asserted (what the diff did) | missed (what she would notice) |
|---|---|---|
| 44 | he is **told** | her clock kept running on an empty room |
| 46 | the man is **seated** | the show stood still with him in the chair |
| 46 | a tap counter that did not exist | nothing — it could not fail |

The first two are the same shape as each other; the third is the degenerate
case, an assertion with no possible failure. In every one, the thing asserted
was true and the room was still broken.

The correction is to write the assertion from the seat, not from the patch.
She does not care that a row's `role` changed to `chair`; she cares that the
night is moving. He does not care that his tile went to "waiting for…"; he
cares whether anyone is coming back. Before a gate is finished, say out loud
what the person on the other side of the screen would say if it passed and the
feature were still wrong — then assert *that*.

Two habits fall out of it, and both paid off the same night:

- **Prefer the consequence to the mechanism.** "The show advances" survives a
  refactor of how it advances. "`skip_phase` was called" does not, and it is
  also the weaker claim.
- **A pre-agreed explanation for a red gate is a reason to look harder, not a
  licence to stop looking.** Gates 15 and 30 went red on the pick-window
  branch and both the agent and the reviewing model had *already agreed in
  advance* that a red there would be a contract change needing an amendment.
  It was not — it was a real standstill caused by the fix. Taking the
  pre-approved amendment would have converted a live bug into a documented
  contract, with a rationale comment and a second signature making it look
  more rigorous rather than less. Anticipating a failure mode is not the same
  as diagnosing one.

**The eighth rule: a guess written as a comment survives every merge.  Only
measuring kills it.**

Fourth instance in this repo, and the one that got closest to shipping.  The
double's `line_position` note said, in its own words: "NOT MEASURED: whether
production re-mints on a SECOND bench entry — we mint only when null, which
keeps his original place."  Production does the opposite: bench → 250, leave
the bench → null, re-bench → 251.  He goes to the BACK of the queue.  The
measurement happened AFTER the branch was bundled, so the guess rode through
#51 into main and sat in the harness describing behaviour reality disproves.

What makes this one worse than an ordinary stale comment is that it was
HONEST.  It said NOT MEASURED, in capitals, which is exactly what this audit
asks for — and it still misled, because a capitalised caveat does not survive
being skimmed, and the sentence beside it reads as fact to the next session.

- **Write the measurement, or write the question.  Never the guess.**
  "Re-entry: unknown — needs three states read off one man" ages correctly.
  "We mint only when null, which keeps his place" does not.
- A guess needs no maintenance to become a lie: the code moves and the
  sentence stays.  That is why all four instances were found by reading the
  wiring, never by reading the prose.
- If a branch is bundled before the thing is measured, the measurement belongs
  in a follow-up commit ON THAT BRANCH — not in the next one, where it lands
  against a tree that no longer matches what was measured.

**The ninth rule: a runtime assertion over a scene that never enters the path
is a grep with better manners — and it hides better than a grep.**

Gate 39's d4 asserted `!D.events.some(e => e.type === "heart")` and concluded
"the client contains no heart writer".  The scene it ran was a seating flow that
never taps a tile and never opens the draft, so the code it cleared was never
executed.  The assertion could not fail.  Production later proved the conclusion
false in both directions: there is no server-side seeder, and the client has
FOUR heart writers.

**Why this one matters more than the two the fifth rule found.**  Yesterday's
audit swept the battery for source-only assertions and reported "two greps
standing alone, not twenty-four", which read as *the battery has been cleared*.
It had not been.  That audit filtered on **source-only**, and this assertion is
**runtime** — it drives a real page, reads real state, and passes the filter
while being exactly as empty.  The number was right and the reassurance it
carried was wrong.

- **Ask what the scene ENTERS, not what the assertion reads.**  A `t.ok` over
  live state proves nothing if the scenario never reaches the code.
- **Universal negatives need a scene that could produce the positive.**  "No
  hearts were written" is only evidence if something in that scene *could* have
  written one.  Otherwise it is a tautology with a page attached.
- **Say the scope in the message.**  "A full seating flow wrote zero hearts" was
  true; the clause after the dash — "the client contains no heart writer" — was
  a conclusion the scene did not support.  Assertions that smuggle a conclusion
  past their own scope are how a battery lies while every line in it is true.
- And the corollary for anything that asks *does the client do X?*: **search
  direct table writes as well as RPCs.**  `sendHeart()` was invisible to a
  production search of database functions because it never calls one.

**The tenth rule, and it is a workflow rule rather than an evidence one: RUN
THE BATTERY WHERE YOU ARE.**

The battery runs in the agent's own container.  `node tools/lib/run.js
--only=<gate-name>`, Chromium already resolved at `/opt/pw-browsers/chromium`,
one gate green in under seven seconds.  It had been assumed for days that gates
could only run in the Codespace, so every gate was written blind, transferred
through a lossy channel, and only then discovered to be wrong — with a full
45-gate battery as the feedback loop.

**The Codespace is for PUSHING, not for running.**  What it has that the
container does not is a git credential; the git proxy refuses this repo from
here, and that is the *only* thing it is needed for.  Those two facts were
conflated, and the cost was measured in hours.

- Write the gate locally.  Red it locally.  Green it locally.  Transfer ONCE,
  when it says what you mean.
- `--only=<name>` matches `gate.name`, not the filename — `--only=lapse-truth`,
  not `--only=50`.
- A gate that has never run is not a gate.  The local runner removes the last
  excuse for landing one.

The general shape, and the reason this sits in METHOD rather than a README: an
environment limit that was real in one direction (no push) was assumed in every
direction (no run).  Nobody tested the assumption because the workaround worked.
**Ask what a limitation actually blocks, and test that boundary once, rather than
building a workflow around its widest possible reading.**

**The second rule the same run produced: verify state from a source that does
not depend on the tool that reported it.**

Four times in one session the browser-driving tool reported a command as
*failed* when it had in fact executed — PRs #41, #44 and #45 were each created
by a call that returned an error.  Once, the inverse: a merge that reported
nothing wrong genuinely had not run, because the workspace had died underneath
it.  Both directions are one defect, and it is a property of this rig rather
than noise:

- A reported failure is not evidence that nothing happened.  Ask `gh pr list`,
  `git rev-parse origin/main`, the file on disk — never the tool's own report.
- A reported success is not evidence that something happened either.  The same
  check answers both, which is why it is cheap enough to always run.
- Batch the work into one command so there is one thing to verify rather than
  five, and end the batch with the check.

This is the same shape as the false red that opened this section: **trust
state, not the report of what happened to state.**

A worked example of the units trap, from the same session: the deploy was
compared to git by string length and read 352293 against the file's 353464
bytes, which looks like a stale deploy short by 1171.  It was UTF-16 code
units against UTF-8 bytes — the file's `♥ · — ’` are multibyte.  The deploy was
byte-identical.  Comparing two numbers proves nothing until both are in the
same unit.

**The eleventh rule, which is the second rule turned around to face me: A
RENDERING OF STATE IS NOT STATE, AND THAT NOW INCLUDES MY OWN TOOL OUTPUT.**

Transferring a patch on 2026-08-12, two of thirty-eight base64 lines arrived
401 characters long.  The known failure is that the Codespace terminal drops
characters on long lines, so that is what it was recorded as — and it was
wrong.  The terminal typed *exactly* what it was given.  The corruption was
upstream, in the reading: a long-line shell output rendered `VyDVVcz` as
`VyDVlVcz`, and the corruption was retyped faithfully, twice, before anyone
thought to test it.  Confirmed by grepping the real file for both spellings —
one hit, zero hits.

The transfer discipline held.  **The reader failed.**  Rule 2 says do not trust
a tool's report of what it did; this says do not trust a tool's rendering of
what a file *contains* either, and the second is harder to remember because
reading feels like looking rather than like being told.

The standing rule, and it costs nothing:

- **Source long payloads at 100 characters per line, not 400.**  The corruption
  has only ever appeared on long lines.
- **Per-line checksum at both ends.**  Compute the digest list where the file
  is, compare it where the file is going, and name the mismatching line
  numbers.  Two of thirty-eight were wrong and both were found in one pass.
- **Verify the whole artifact after decode**, not just the transport.

**Corollary to rule 11, and it cost two transfers in one night: A STALE
TERMINAL LOOKS EXACTLY LIKE A SLOW ONE.**

Both show you the previous command's output.  A terminal that has silently
stopped accepting input renders perfectly — the prompt is there, the scrollback
is there, and the only thing missing is any evidence that what you typed
arrived.  Waiting longer does not distinguish them, and neither does taking
another screenshot.

**The discriminator is a command whose output could not possibly be the old
one:** the branch name, a line count, a marker echo.  Ask for one thing you can
tell apart, not for the state you were hoping to see.  On 2026-08-12 an entire
25-line payload went nowhere and the screen looked completely normal; reading
back `git rev-parse --abbrev-ref HEAD` and seeing the OLD branch is what caught
it.

The corollary to the corollary: this is why the per-line checksum matters more
than it looks.  It makes a half-delivered payload **detectable** rather than
dangerous.  An interrupted transfer is a nuisance; an interrupted transfer you
cannot detect is a corrupted commit.

**The twelfth rule, and it is the sharpest thing the 2026-08-12 run produced:
A PROVENANCE LABEL IS NOT PROVENANCE.**

`backend-double.js` carried three wrong things at once: a value (`SWEEP_MS` at
45s, from a client comment), a relationship (the sweep firing *before* the
freshness filter, which no one ever wrote down), and a semantic (`join_line`
re-minting a man's place instead of keeping it).  The third was wearing this
label:

> a man who steps off the bench and comes back goes to the BACK of the queue.
> **Measured, not assumed.**

It was not measured.  It was the file describing itself.  The readings behind
it were real — 250, null, 251, off production rows — but they were readings of
a `leave_room`/`join_room` round-trip, generalised into a rule about re-entry
that the server does not have.  The server says the opposite in a comment of
its own: `-- FIFO line order: keep your place if you are already in line`.

Three things make it worth a rule of its own:

1. **It was a guess wearing the costume of the thing that would have caught
   it.**  A line marked "assumed" invites a check.  A line marked "measured"
   closes the question.
2. **It propagated.**  "Back of the queue" went out as a finding to the
   conductor on the strength of this comment, before the server was ever read,
   and had to be retracted.
3. **Its own refutation was in the next paragraph.**  The same comment went on
   to say "the ROW IS DELETED AND RECREATED — the null is a new row, not a
   wiped column," which is the correct mechanism sitting directly beneath a
   conclusion it contradicts.  No new evidence was needed.  Nobody read to the
   end of the comment they were quoting.

The standing rule for the double, and for anything else that models a system
it is not:

- **Every behavioural claim is SOURCE or ASSUMED.  There is no third
  category**, because the third category is where all three defects lived.
- **SOURCE means the artifact and the date**: the function name, the column
  rule, the cron row, read on a stated day.  "Matches production" is not a
  source.
- **ASSUMED is not a confession, it is a work item**, and it is cheap to write.
  The dangerous label is the one that sounds finished.
- **A double is a copy, not a reference.**  A copy that asserts its own
  fidelity is the hardest kind of wrong to see, because the assertion is
  indistinguishable from the evidence right up until someone reads the
  original.

The corollary for gates: a gate written against an unverified double inherits
its fiction. `bench-order-truth` passed before and after `join_line` was
corrected — not because it was robust, but because it injects `line_position`
through fixtures and never calls `join_line` at all.  **It tested ordering and
was named for it; the minting had no gate.**  A green battery is evidence about
the paths it enters, and silence about the rest.

**THE THIRTEENTH RULE, named by the conductor on 2026-08-13 after it was
found from three independent directions in one night — the rpc census, the
gate-53 forge, and the ROOM_STATE reader count.  ONE ITEM, NOT THREE:**

**DECIDE FROM A RENDERING, THEN CALL A DESTRUCTIVE RPC AND DISCARD THE
RESULT.  Two halves, either one survivable; together they erase people.**

- Half A: a decision about YOUR OWN fate read off ROOM_STATE — a rendering
  that can trail the table by a whole sweep (the gate-53 forge: the guard's
  roster read lost a supersede race and consulted a commit from before the
  burial) or a whole role (gate 54 scene 3: screen said line, table said
  spectator, and the hard delete fired anyway).
- Half B: a hard DELETE followed by an unread re-create.  leave_room is a
  hard delete; a discarded join_room after it is a man erased by his own
  client, silently.  Three instances were live on 2026-08-13: the lapse
  recovery (gate 53), the chair step-down and the leave-line toggle (gate
  54).  The sibling swallows — rescind (gate 55), the end_show pair (gate
  56), request_invite (gate 57) — are half B without the delete: an act the
  user believes happened, silently lost.

The fix pattern, factored so it cannot drift: **anything deciding your own
fate reads your own row off the table (`myRowFromTable`, the ONE read);
anything re-creating after a delete reads and retries bounded
(`rejoinRoomBounded`, the ONE re-add), and the terminal failure is LOUD.**
Render-only readers stay on the rendering deliberately — they feed no rpc
and self-heal on the next commit; the six self-fate deciders are the whole
surface, and each is either on the helper or carries a comment saying why
not.  A guard and the branch it guards read the SAME source (gate 54,
scene 4 — fixing the branch onto the table while the guard kept the
rendering reopened, for one commit, the exact demotion the guard exists to
prevent).

**Corollary to rule 13 (conductor, 2026-08-14), THE SHAPE OF PARTIAL
MIGRATION:** when converting one site of a paired derivation, THE PAIR MOVES
TOGETHER or the invariant breaks in between.  The erasure fix moved the
open-chair guard's branch onto the table and left the guard on the
rendering — so the two derivations disagreed, which the guard's own written
invariant explicitly forbids, and for one commit a bench man with a stale
roster read could lose his place to the very tap the guard protects (gate
54, scene 4).  Not a slip: while six sites move one at a time, EVERY
INTERMEDIATE STATE has some pair reading different sources; the invariant
only holds at the ends.  Two sites remain unconverted by reasoned choice
(benchReconcile, the bench-blind render read) — anything future that
converts one of them can reopen exactly this, and their comments say so.

**THE LEDGER GAP, logged 2026-08-13, ruled "worth a line on the list,
though not tonight":** the events that matter most are the ones the ledger
does not record.  `leave_room` deletes with no event, the recovery writes
nothing, and the row itself is the only evidence — which the delete
destroys.  The 200s live observation of 2026-08-12 is formally
UNATTRIBUTED for exactly this reason (two real mechanisms, no trace to
pick between them), and every future incident of this shape will hit the
same wall until deletion writes a ledger fact.  List item, not tonight's
work.

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
