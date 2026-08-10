# LAST CALL — the show, specified

Authoritative statement of what the show IS.  Sources: the pacing spec
(Nick, 8/5), the rules already encoded in gates 1–16, the beat scripts in
`index.html`, and the invariants established across fix/count-truth,
fix/bench-entry-and-host-seat, fix/video-attach-idempotent, fix/ask-truth,
fix/round-flow, and fix/daily-singleton.  Where the correct behavior is
genuinely undecided this file said OPEN QUESTION; all seven were ruled on
8/8 — see RULINGS at the end.  The audit (`AUDIT-2026-08-08.md`) scores the code
against this document.

## The prime invariant

**The show must always be able to reach HER CALL with one winner drawn from
the three original chairs — or degrade gracefully and explicitly when it
can't.**  Every control rule below serves this: nothing the host is offered
may strand the show below a viable cast without an explicit, named ending
(KEEP → winner; CLEAR THE DECK → refill or end-alone; WALK → end-alone).
"Silently unable to continue" is never a legal state.

## Standing invariants (phase-independent)

- **Bench faces are the crowd's secret.**  Host and chairs see silhouettes
  and hearts, never faces or names of benched men (gates 6, 12).
- **The host has no membership row** and counts +1 in every total;
  `roomCounts()` is the ONE headcount derivation (gate 11).
- **Every bench entry goes through the headshot gate** — `takeBenchSeat()`
  is the one door; rejoin with a face on file is silent (gate 12).
- **Host tap always wins** — a host tap on a bench lane seats that man
  immediately, in any phase, at any bench count (gates 12, 15).
- **PASS is offered iff the bench can refill the chair** — `bench ≥ 1`,
  full stop (RULING Q3 v2, 8/9 — the old "post-pass seated ≥ 2" arm is
  DELETED: the live run proved it produces an open chair with nobody in
  line and a dead recruitment card, exactly the boring room the rule
  exists to prevent).  Re-derived on GENUINE roster changes (role or
  membership) — never on freshness flapping; the decide card's option set
  is otherwise stable within a phase.
- **Ask coverage is per-CYCLE fairness** (RULING, 8/9 wave 4): every
  seated man is asked once before anyone is asked twice; the rotation is
  the host's GUIDE, never a hard gate — she can override.  The ASKED pill
  means "asked this cycle" and clears only when a new cycle begins
  (everyone seated has been asked) — NOT on prod's per-ask round
  increment.  The round popup and every "who's up" affordance derive from
  the same coverage set.  A chair is furniture; a new occupant's slate is
  clean (gate 14).  Source of truth: **room_events** — clients replay on
  entry; no window-local authority (RULING Q4, 8/8).
- **One Daily instance per page**, created once, destroyed before any new
  create (gate 16).  Attach budget: ≤1 srcObject assignment per genuine
  stream change, 0 re-parents, no orphaned tiles (gates 8, 13).
- **Pass is final for the show.**  A passed man watches; he cannot re-enter
  the line (`join_line` refuses; `I_WAS_PASSED`).
- **Users never see internal diagnostics.**  At most show-formatted states
  ("finding your camera…").  The raw log exists only behind `?debug=1`.
  *(Spec position per owner, 8/8 — code does not yet comply; audit D.)*
- **The battery is the law**: every rule here that is testable is a gate or
  is scheduled to become one (see audit branch plan).

## Cast of roles

| role | meaning |
|---|---|
| HOST | owns the room; no membership row; drives the show |
| CHAIR | seated suitor (roles `chair`); TARGET = the chair in the spotlight, RIVAL = other chairs |
| KEPT | won a KEEP; on stage, staleness-immune, camera stays live |
| BENCH | `role='line'`; face captured, hidden from host/chairs |
| CROWD | `role='spectator'`; hearts, gifts, chat |
| PASSED | spectator with `I_WAS_PASSED`; may watch, never re-enter |
| GUEST | unauthenticated: auth screen only, no room access (gate 9) |

## The pacing spec

```
preshow → showstart(6s) → ┌ spotlight-choosing (~10s of the 30)
                          │ spotlight-answer  (~25–30s)
                          │ open floor        (45s)      × 3 rounds
                          └────────────────────────
        → deliberation(60s) → HER CALL (deciding, 60s)
              KEEP → winner → backstage → finale
              PASS → bench-pick window (20s, its own clock) → next round
              CLEAR → refill from bench (≥3 waiting) or end alone
              WALK → end alone
```

Section clocks: `LC_SECTION_SECS` {showstart 6, spotlight 30, openfloor 45,
deliberation 60, deciding 60} + `LC_PASS_PICK_SECS` 20.  Beats are 0.8–2.0s
(`beatTimesUp` 800ms … `beatHousePicks` 2000ms); the longest beat, 2000ms, is
the ceiling for any segue's dead air (gate 15's segue budget).

---

## Phase-by-phase

Legend for every phase: **Can do** (per role) · **Disabled & why** ·
**Timer expiry** · **Disruptions** (chair leaves / bench leaves / host
reload / chair reload / network drop).

### PRESHOW (`phase='preshow'` or engine dormant)

- HOST: sees blind bench; tap a lane → seat that man (host-tap-wins).
  LAST CALL button hidden until engine-off/kept rules say otherwise.
- CROWD: ♥ TAKE A BENCH SEAT (headshot gate) or empty-chair tap (same
  door).  Hearts/chat/gifts live.
- BENCH: ↩ LEAVE THE BENCH (leave_room → rejoin as crowd).
- Disabled: TAP TO ASK (no show), decide card (no show), skip (no show).
- Auto: 3 benched with no host tap → automatic curtain-up seats all three
  and `start_show` fires (both mechanics coexist, gate 12).
- Expiry: none (preshow has no clock; chair seat-clocks read ⏸ under the
  engine).
- Disruptions: benign — roster edits only.

### SHOWSTART (6s splash)

- Everyone: watch the cast card.  Chat live.
- HOST: `eg_skip` ("she's heard enough ▸") available.
- Disabled: asking (choosing window not open — `askEligible` false); the
  splash is a beat, not a resting place.
- Expiry: host client auto-advances to spotlight after ~6s (`__SPLASH_ADV`).
- Disruptions: chair leaving here shrinks the cast card next render; host
  reload — see Q1.

### SPOTLIGHT — CHOOSING (`spotlight`, no target)

The only window where an ask may be placed (gate 14).

> **PROD FACT (8/9, from the live `ask_question` source):** the prod RPC
> returns jsonb, **increments `rooms.round` per ask** (rounds count asks:
> the first ask opens round 1), sets a **30s `phase_deadline`** for the
> answer, pauses the chair clocks via `engine_pause_clocks`, **noops when
> a spotlight is already running**, and emits the `spotlight` room_event
> via `engine_emit` — the ask ledger was live server-side before PR #12;
> the client fold completed it.  The battery double models the same
> semantics (aligned in fix/segment-collapse).

- HOST: TAP TO ASK on any un-asked seated chair (CSS `.is-choosing`); ASK
  composer button; drawer (deck → question → target); `eg_skip`.  Fire
  requires `askEligible`: choosing window AND target currently seated.
- CHAIR/CROWD: hearts, chat, gifts.  CHAIR: ↩ LEAVE THE CHAIR (never blocked — RULING Q2).
- Disabled: TAP TO ASK on an already-asked chair (`:not(.is-asked)`),
  decide card, PASS.
- Expiry: choosing clock out → **the house picks**: random question, first
  unasked chair in seat order (`beatHousePicks`), ask fires through the
  same `egFireSpotlight` door.
- Disruptions: target-to-be leaves → he's simply not in `askTargets()`;
  rotation skips him.  All chairs leave → house pick refuses ("Nobody's in
  a chair yet"), section expires to open floor.

### SPOTLIGHT — ANSWER (`spotlight`, target set)

- TARGET: answers on camera; his cell takes the split; foot slot shows the
  question context.  RIVALS: collapse to one muted strip.
- HOST/CROWD: hearts to any chair, chat, gifts.
- Disabled: asking (target already set — `askEligible` false); TAP TO ASK
  hidden on the target's cell.
- Expiry: `beatTimesUp` → advance to open floor.
- Disruptions: **TARGET leaves mid-answer** = passing himself: he's out
  (pass-final, like any pass), the segment collapses immediately — target
  cleared, question card down, wipe beat — and the pick window opens per
  the Q7-compliant flow, falling back to an ordinary advance when the
  bench is empty (RULING Q2, implemented in fix/segment-collapse,
  gate 20).  A NON-target chair leaving vacates the seat and the segment
  continues; PASS viability re-derives live (RULING Q3).  RIVAL leaves: strip shrinks.
  ASKED state: his mark stays keyed to (him, round) — irrelevant once he's
  not seated; a new occupant of his chair inherits nothing (gate 14).

### OPEN FLOOR (45s)

- Everyone mingles: hearts, chat, gifts.  ASKED badges on chairs that have
  answered this round remain visible **to the whole room**, derived from
  the room_events ledger on every client (RULING Q4).
- HOST: `eg_skip`.
- Expiry: → next round's spotlight (rounds 1–2) or deliberation (round 3).
- Disruptions: chair leaves → seat wiped next render; his ASKED mark dies
  with the round.

### DELIBERATION (60s)

- All ask visuals wiped (gate 14).  Hearts/chat/gifts live.
- HOST: `eg_skip` → HER CALL.
- Expiry: → HER CALL.
- Disruptions: chair leaves → the deciding roster shrinks — the decide card
  must re-derive when it opens (audit B).

### HER CALL (`deciding`, 60s)

- HOST decide card: **KEEP ONE** (always — it's the win), **PASS ONE**
  (only if the bench can refill: `bench ≥ 1` — RULING Q3 v2, derived from
  `roomCounts()` on genuine roster changes), **CLEAR THE DECK** (confirm;
  <3 waiting = explicit end-alone warning), **…end the night alone**.
- CHAIR/CROWD: drumroll ("SHE'S DECIDING"); hearts/chat.
- Disabled: `eg_skip` (her call is not skippable — the resolver advances at
  the deadline instead), asking.
- KEEP: `beatKept` (holds for her tap) → `end_show(winner)` → backstage →
  finale.  The show is over; this is the canonical win.
- PASS: `decide_pass` → wipe beat on the chair → **bench-pick window** at
  once (segue ≤2000ms):
  - Shared `phase_deadline` extension of 20s — every client's resolver
    holds; host-local `PASS_PICK` marker labels the pill.
  - Host tap on a bench lane seats the replacement immediately and the
    show advances to the next round at once.
  - No tap → window expires → ordinary resolver advances; the chair rides
    empty into the next round and the draft/claim path may fill it.
  - The decide card stays down while the window is open.
- Expiry (no decision at all): **HER CALL never silently expires**
  (RULING Q5).  Clock-out = the crowd decides: the heart leader among the
  seated chairs is KEPT, announced with a loud beat, and the show ends on
  the ordinary KEEP path.  A heart tie (or an empty stage — no leader
  exists) holds the clock until she taps; true host absence remains the
  janitor's business.
- Disruptions: chair leaves mid-deciding → the card re-derives PASS
  viability immediately (RULING Q3).  Bench empties mid-pick-window → the
  window closes early with a beat line and the show advances at once
  (RULING Q7).  All chairs leave → no heart leader exists → the clock
  holds (RULING Q5).

### DRAFT STORM (`draft`)

- An open chair with people waiting: crowd hearts the silhouettes, host
  taps to seat or the top hearts win at `resolve_draft`.  Recruiting
  variant when nobody waits: next join takes the seat.
- Identity-safe: host sees MYSTERY N silhouettes only.
- Expiry: `resolve_draft`.

### ENDED / BACKSTAGE / FINALE

- KEEP path: winner + host go backstage (separate Daily room, main call
  destroyed first — singleton discipline).  Camera cut → decision window →
  winner photo → finale board for everyone.
- Walked/alone: `beatAlone`, everyone to the lobby.
- Room `status='ended'` under anyone → `roomEndedUnderUs`: photo-wait if
  there's a winner, plain exit if not.

---

## Disruptive events — the cross-phase contract

- **A chair leaves mid-round**: his seat is wiped next render; video tile
  follows the roster-change sweep (≤1 sweep, no orphans); his ask state
  dies with the round; counts derive from `roomCounts()` everywhere.
  Decide/ask affordances that referenced him must re-derive from the live
  roster (audit A/B).
- **A bench member leaves**: lane disappears (stable order for the rest);
  NEXT UP halo re-derives; any PASS affordance must re-check viability;
  an open bench-pick window with an emptied bench simply expires into the
  ordinary advance.
- **The host reloads**: a reload NEVER ends the show (RULING Q1).
  Presence is defined by the existing absence rules alone — watchers exit
  after 80s without the host; the 120s zombie janitor ends truly
  abandoned rooms.  A booting host who finds his own live room rejoins
  it: host UI, phase, and clocks restore from server state.
- **A chair reloads**: membership row persists; re-entry re-affirms
  silently (bench: silent `takeBenchSeat`, gate 12); role and seat
  unchanged if within the freshness window; camera republishes via the
  join preflight (audit E).
- **Network drop**: heartbeat stops → after 45s the sweep marks the row
  `gone`; after 60s `roomCounts`/`active_members` stop counting it; KEPT
  is immune.  Recovery = the same silent re-affirm as reload.

---

## Diagnostics (owner position, 8/8)

Users NEVER see internal diagnostics.  The full status log (`vdbg`) is
reachable only behind `?debug=1`.  User-visible video states are
show-formatted only — at most: "finding your camera…", "reconnecting
video…", "video couldn't start — refresh to retry".  Every current `vdbg`
message is classified in audit finding D as hide / translate / debug-only.

## Camera lifecycle (intended)

```
join → (roster truth already loaded) → publish decision made ONCE:
  host: video+audio on;  seated suitor: video on;  everyone else: off
→ verify the local track actually came up (state='playable')
→ blur is cosmetic and strictly after video works (native constraint first,
  processor blur opt-in ?blur=1 only) — a blur failure can never take the
  camera down
→ steady state: publish follows seat state via syncLocalPublish
```
The 6s watchdog + device fallback is a LAST resort for hardware surprises,
not a step the common path relies on (audit E).

---

## RULINGS (final policy — 8/8, replacing the audit's open questions)

**Q1 — Host reload.**  A reload NEVER ends the show.  Presence is defined
by the existing 80s (watcher exit) / 120s (zombie janitor) absence rules
only.  A booting host who finds his own live room rejoins it; host UI,
phase, and clocks restore from server state.

**Q2 — A chair leaving during his own answer = passing himself.**  He's
out (pass-final), the segment collapses immediately, and the bench-pick
window opens.  LEAVE is never blocked, in any phase, for any role.

**Q3 v2 (8/9, overrides the 8/8 ruling).**  PASS is offered iff
`bench ≥ 1`.  Full stop.  The "post-pass seated ≥ 2" arm is DELETED — the
live run proved it opens a chair with nobody in line and parks the show
on a dead recruitment card.  The predicate re-derives on GENUINE roster
changes (role/membership), never on freshness flapping — the decide
card's option set is stable within a phase otherwise.

**Q4 — Ask state's source of truth is room_events.**  Clients replay the
ledger on entry and fold live events; the window-local maps are a cache of
the ledger, never the authority.

**Q5 — HER CALL never silently expires.**  Clock-out = the crowd decides:
the heart leader among seated chairs is KEPT, announced with a loud beat,
ending the show on the ordinary KEEP path.  A heart tie holds the clock
until she taps.  (No leader exists on an empty stage — the clock holds
there too; the janitor still bounds true absence.)

**Q6 — Kept men stay in the ask rotation.**  Kept = safe, not done.

**Q7 — The pick window closes early when the bench empties**, with a beat
line, and the show advances immediately.

**OPEN-CHAIR RECRUITMENT (8/9, from the live run).**  An open chair with
an EMPTY bench is still reachable (a chair leaves — RULING Q2).  The show
is never parked on "A CHAIR IS OPEN 0:00": the recruitment card runs a
REAL countdown (`LC_PASS_PICK_SECS`); anyone taking the seat or the bench
resolves it; on expiry the show moves on SHORT-HANDED with the remaining
chairs and a beat line says so.

**PICK-WINDOW AUTHORITY (8/9, wave 5).**  While a pick/recruit window is
open, its timer is the ONLY advancing authority: no resolver, section
clock, draft auto-resolve, or server phase flip may advance the show or
close the window — only her tap, the window's own expiry, the bench
emptying, the chair refilling, or leaving the room.  The header clock
tracks the ACTIVE window, labeled.

**"SHE'S HEARD ENOUGH" (8/9, wave 5).**  Host only.  Visible during the
ANSWER (spotlight with a live target), OPEN FLOOR, and DELIBERATION —
never during choosing, showstart, her call, a pick window, or the draft.
One press = she's done listening: the show goes STRAIGHT to her call
(deciding, fresh 60s clock, spotlight cleared).  Debounced — the control
disarms on press until the phase changes; one fire per segment.

**QUESTION PROPAGATION (8/9).**  Every role renders the spotlight
question from the SAME realtime `spotlight` room_event — the payload
carries the question text and the answer deadline (prod `engine_emit`
already ships them) — never from a per-client fetch race.  Cross-role
skew budget: one render tick.

**BACKSTAGE PRESENCE (8/10, wave 6, from the live run).**  The winner's
room renders CALL truth, not roster truth:

- **A tile means a JOINED participant.**  The backstage tile list is
  derived from the Daily call's participants — never from the room row.
  Until the counterpart has actually joined the call, their side is an
  explicit labeled waiting state in show language ("waiting for Jack's
  Room…"), visually distinct from a live frame — never an empty black
  tile implying presence.  A side that leaves the call reverts to its
  waiting state; its stale video does not linger.
- **The private-time clock starts only when BOTH sides are in the call.**
  Nobody burns the 3:00 waiting alone.  Entry, first join, and rejoin do
  not start it; the presence sync starts it the moment host AND winner
  are both among the call's participants.
- **Entry is identical on desktop and mobile, for host and winner.**
  There is ONE post-show door per screen: when the closing card paints,
  any held beat leaves the stage (a held CTA buried under another surface
  is dead pixels the user can still see).  The photo wait may not strand
  anyone — the 4s truth poll folds an overdue wait even if the timer was
  throttled.  The double-tap zoom-block may never eat a tap: only a true
  same-spot double-tap on a passive surface is prevented.
- **A failed backstage join is SAID, on the backstage surface, in show
  language, with a visible retry.**  No toast-and-eject to the lobby, no
  silent black frame.  Retry re-runs the ONE join path (`bsAttemptJoin`)
  that first entry uses.

**MEMBERSHIP TRUTH (8/10, wave 8, from the conductor run).**  One row
filter, two truth channels, idempotent writes:

- **`activeRows` is the ONE row filter.**  Counts, the chair grid, the
  bench strip, and every derived predicate read the same fresh-filtered
  rows.  The strip may never show a man the count excludes (the ghost
  "someone" beside "0 IN LINE").
- **The ledger patches the roster.**  seat/keep/pass/timeout events are
  role facts; every client folds them into its rows (an event is proof of
  life).  A roster read that reflects a state OLDER than a folded event
  loses for that row (`rosterOverlay`); the patch retires when a newer
  read arrives.  A client whose reads fail or go stale still converges ≤
  one fold — the host's window may never run a private show.
- **Roster read failures are SAID** after three consecutive misses, in
  show language.  Never a silent stale window.
- **Seating is idempotent.**  The cold-start/auto-seat loop seats a member
  at most once (re-checked against his current row); a seat event that
  changes nothing (same man, same seat, no unseat between) folds without
  a feed line.  Nine duplicate "took a chair" lines was the live run.
- **The optimistic bench verb closes its loop.**  The CONFIRMED row
  settles it within one sync: confirmed → silent; absent → the verb
  reverts and it is said ("That seat didn't take — try again").  A
  join_line rides with an immediate heartbeat so the new row is born
  fresh.
