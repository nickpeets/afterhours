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
> - **d3** (black winner photo) is *still* a source grep, and no runtime
>   assertion anywhere in the battery checks that the shipped photo is not
>   black.  Gates 7, 23 and 24 all reach the snap ceremony and assert the SCREEN
>   appears; none look at the pixels.  Logged, not fixed.
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
| 8 | winner photo black | **DEAD** — a real photo on the winner card, confirmed in two windows. |
| 10 | backstage clock skew | **DEAD** — both sides render the same number off one shared deadline. |
| 13 | offerer waits on a ghost | **DEAD** — both halves, the second one live at `b0811.2124` on 2026-08-12.  See below. |
| 1, 2, 11 | host roster split, evaporating bench, count flapping | **UNREACHABLE BY THIS RIG** |
| 5, 6, 7 | her call, chair mislabel, spectator ejected | **NOT REACHED** — live-reachable, simply not reached in this run |
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
- **NOT REACHED** — #5, #6, #7.  Ordinary gaps.  #5 is observable from the host
  window alone; #6 needs one player window in warm-up; #7 needs two windows and
  one discipline rule (nobody touches the losers' windows at show end — the rule
  this run broke).  Run longer and they get scored.
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
  reach the snap ceremony and assert the screen appears; not one looks at the
  pixels.  Runtime was available and nobody wrote it.  Still open.

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
