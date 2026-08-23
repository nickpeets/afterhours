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
- **NO MEMBER SEATS HIMSELF.  Seating is INITIATED by the host or by the
  engine — never by the man being seated.**  (OWNER RULING, 2026-08-19,
  relayed by Nick in session.  This rule was previously UNWRITTEN: it lived
  only in gate 43's header as "canon (owner ruling, wave 9)", and from there
  was restated in SEQUENCE-show and quoted onward by gate 46.  Three documents
  asserted a rule that appeared in none, which made it unfalsifiable.  It is
  written here now, where it can be read.)

  The rule is about **who initiates**, not about who ends up in a chair.  A man
  reaches a chair without a host tap on three paths, and on none of them does
  he seat himself — all three are the ENGINE acting:

  - **Auto curtain-up** — three on the bench with no host tap seats all three
    and fires `start_show` (below, PRESHOW).
  - **Sole-candidate award** — `engine_award_seat` with `source =
    'sole_candidate'`, reached from `engine_open_draft` when the frozen
    candidate list has exactly one name.  SOURCE(server), read 2026-08-19.
  - **Pick-window autoseat** — `fix/pick-window-autoseat` seats the
    longest-waiting benched man when the pick window expires (Q46, below).

  These are CONSISTENT WITH the rule, not exceptions to it.  Do not read them
  as precedent for a self-seat path.

- **Host tap always wins** — a host tap on a bench lane seats that man
  immediately, in any phase, at any bench count (gates 12, 15).  This is
  **precedence among initiators** — it presupposes that the engine also
  initiates — and it is not an exclusivity rule.
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
- HOST: `eg_skip` (`skip_phase`) walks ONE rung forward, same as everywhere
  else it's visible — deliberation's only next rung happens to be HER CALL,
  so the observed destination is unchanged, but the mechanism is not a
  dedicated straight-jump (RULING REVERSED 2026-08-22 — see Q5).
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

**QUESTION PROPAGATION v2 (8/10, wave 8).**  "History" is SUPERSEDED-ness,
never age: the spotlight card paints on every role — including the target
— unless the room has genuinely moved past that ask (a newer round, or a
phase beyond spotlight with no newer round in the payload).  The poll
path paints from the cached spotlight payload even when the rooms row
carries a null deadline; per-client fetches remain a last resort.  Server
timestamps parse through `parseServerTs` (a zone-naive string is UTC,
never local).  The harness models prod here: lossy per-client realtime
(`muteRealtime`), prod's engine_emit key names and timestamptz-with-space
format (`spotlightShape="prod"` — gates 20/23/37), configurable answer
window.

**HER CALL v2 (8/10, wave 8).**  Prod enters her call with a NULL
phase_deadline.  The client renders a real countdown only while a real
window runs; a dried or absent window is a LABELED holding state ("HER
CALL · HER MOVE") — never a parked 0:00.  When the server sends no
deadline the HOST arms her own her-call window (LC_SECTION_SECS.deciding)
and Q5's crowd-call fires off that arm; a heart tie still holds.  The
decide card's option set derives once at genuine phase entry and
re-derives ONLY on the decide-sig (role/membership); a re-render or
re-apply is not a roster change and may neither flip an option nor wipe
an armed tap-mode.

**EDGES (8/10, wave 8, one ruling each).**  An empty chair says what a
tap does ("OPEN CHAIR · join the bench") — never a mislabeled action.
The host-left watchdog asks the rooms row before ejecting anyone: an
ENDED show routes every role to the finale card.  The winner snap ships
a live, non-black frame or nothing (the card falls back to the avatar).
The client writes hearts only from a tap — no seeder exists client-side.
Backstage runs ONE shared deadline: the host writes `backstage_clock`
the moment both are in the call; both sides render it.  The watcher
count derives from the one membership truth on every client.  videoJoin
settles an in-flight leave before trusting 'already joined', and the
truth cadence re-joins a callless room.  A decline stays secret, but
ABSENCE isn't: leaving the backstage flow (`backstage_left`) closes the
other side's offer window with the goodnight beat.

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

---

# OPEN QUESTIONS — carried out of the 2026-08-11 live run

Three things this run named precisely and did **not** settle.  They are recorded
here so nobody re-derives them, and so nobody mistakes them for work in flight.
None of them is a licence to change behaviour: each names what evidence would
close it.

**Q9 — where do hearts come from when nobody is hearting? — ANSWERED
2026-08-12.**
Anomaly d4 of the b0809.1727 conductor run: hearts went 0 → 35 with nobody
tapping.

- **No server-side seeder exists.**  Read from the production database: zero
  triggers on `room_events` or `room_members`; every heart-adjacent function is
  either `draft_heart` (client-called) or a read (`heartbeat`, `resolve_draft`,
  `get_draft_tallies`, `get_draft_view`, `engine_award_seat`,
  `engine_open_draft`).  Nothing writes hearts autonomously.
- **The client has FOUR heart writers, not zero.**  Every suitor chair, the
  `hostctl` fallback, every bench lane, and the host's own tile all call
  `sendHeart()`; the draft storm calls `draft_heart`.  The stage IS the heart
  button, by design.
- **`sendHeart()` bypasses RPC entirely** — it does
  `sb.from("room_events").insert({type:"heart", …})`.  That is why searching
  database *functions* came back clean: there was no function to find.  Any
  future "does the client write X?" question must search direct table writes as
  well as RPCs.
- **The 0 → 35 jump is the ENTRY SEED, not a writer.**  `loadRoomState` reads
  every prior `room_events` row (limit 200) and repaints the tallies in one
  lump, so a client arriving mid-show sees the whole backlog appear at once
  having tapped nothing.  Gate 39's d4 now drives exactly that: a tap writes one
  row, a self-tap writes none, and a late arrival paints two hearts while
  writing zero.
- **What gate 39 used to say was wrong, and could not fail.**  It asserted "the
  client contains no heart writer" over a seating flow that never taps a tile
  and never opens the draft.  See METHOD rule 9.

**THE RATE QUESTION IS ALSO SETTLED, 2026-08-12, and it was a person.**  Read
directly from production through the app's own session, not asked of anyone:
room `4b7dcab5` is ONE writer, 70 rows, 46.6 seconds.  The gaps between
consecutive writes are

    2.48  0.87  0.40  0.25  1.44  1.27  2.06  1.16  0.77  0.18  1.63  2.75
    1.16  0.70  3.35  then a sustained run at 0.19–0.29 with the odd 0.51

which is a person deciding, and then a person hammering at roughly four taps a
second.  **Nothing sits at 1.00s or 4.00s** — the two cadences the app itself
runs (`egStartTallyPoll` at 1000ms, the roster poll at 4000ms) — and nothing is
periodic at all.  A timer is exact; a render loop is locked to a render; this
warms up, varies, and floors at ~0.18s, which is a thumb.  Two smaller rooms
show the same signature (16 rows in 5.3s, 11 in 7.4s, floors ~0.2s).

So d4 is closed on three instruments that each prove a different thing: **no
server writer** (production function and trigger read), **four client writers all
bound to real taps and none firing twice** (source, then gate 39 at runtime), and
**a human tapping rate** (production timestamps).  The remaining surprise is a
design one rather than a defect: the whole stage is a heart button — her tile,
every chair, every bench lane — so a person fiddling with the screen writes a
heart nearly every time they touch it.

**Q61 — how much of the database's vocabulary reaches a stranger's screen?**
Found while fixing rank 1.1 (the "tell Nick" string).  That string was the only
user-facing text naming the operator, and it is gone with a universal negative
holding it (gate 49).  But the same scan turned up **22 sites** that interpolate
a raw `error.message` straight into `textContent` or `toast()` — "Seat failed:
…", "Couldn't go live: …", "Couldn't join line: …".  Most of the time the reason
is harmless; when it is a Postgres or RLS message it is unreadable to a guest and
it looks like the app is broken open.

Deliberately **not** rewritten tonight: 22 strings is a wide change with real
regression surface on paths gates cover only partly, made hours before a trial
night, and the failure it prevents is embarrassment rather than breakage.

**What would settle it:** a single house rule and one pass — the person sees what
to DO, `console.log` keeps the reason, and gate 49's DOM assertion (the raw
reason appears nowhere a person can read) extended from the setup card to every
sink.  Worth doing *after* the trial night, when the list of strings people
actually hit is evidence rather than a guess.

**Q62 — is a stray touch supposed to be a vote?  (PRODUCT, not a defect.)**
Found while closing Q9, and it is the sharpest thing that came out of it.  **The
entire stage is a heart button**: her tile (`hero_chair`), every suitor chair
(`.heart-tap`), every bench lane (`.lc-lane`), and the draft-storm buttons.  A
guest who touches the screen for any reason — steadying the phone, tapping a face
to see it better, double-tapping out of habit — writes a heart.  Measured in
production: one person at roughly **four taps a second**, 70 rows in 47 seconds.

That is working as built, and the copy invites it ("bang the hearts").  The
question is what it MEANS, because hearts are not decoration: they are the
crowd's signal to the host, and the draft's top-hearts branch can seat a man on
them.  So a stray touch is currently indistinguishable from a vote, and five
strangers holding phones will produce counts nobody intended.

**Deliberately not solved.**  Every fix has a real cost — a press-and-hold costs
the hammering the show is built around; a cooldown makes an enthusiastic room
feel broken; making her tile inert removes the one gesture aimed at her.  This is
an owner's call about what the signal is for, not a bug to be gated.

**What would settle it:** the trial night.  If the counts read as enthusiasm to
the people in the room, it is a feature.  If someone says "I didn't mean to do
that" — even once — it is a control problem, and *that sentence* is the finding.

**Q63 — what a locked phone costs.  ANSWERED 2026-08-12 FROM THE SERVER,
gated RED as gate 50.**
The owner watched a guest's phone lock and the guest come back OUT of the room.
Gate 50 reproduces it and fails on purpose, 6 of 10.  The database was then read
directly (SQL editor, read-only) and **it exonerates itself**.

**THE REAL NUMBERS** — from the function bodies, not from a comment:

| | value | source |
|---|---|---|
| invisible to everyone | `interval '60 seconds'` | `active_members` |
| row marked `gone` | `interval '3 minutes'` | `sweep_stale_members` |
| `line_position` | `nextval('line_position_seq')` | `join_line` |

**45 seconds appears nowhere in the database.**  It existed only in a client
comment (`45s sweep window / 8s = 5 beats of margin`), the harness copied it into
`SWEEP_MS`, and a report leaned on it hard enough to state "the sweep is 1.5
spotlights" as a measurement.  It was not one.

**TWO DEFECTS, ONE SYMPTOM.**

- **Defect 1 — the client destroys a live row.**  `join_line` says, in its own
  comment, `-- FIFO line order: keep your place if you are already in line`, and
  keeps `v_prev_pos` whenever the previous role was still `line`.  **The server
  was built to preserve his place.**  He loses it only because the recovery path
  calls `leave_room` first, deleting the row, so there is no previous role left
  to find.  The client reads an absence meaning STALE (>60s, filtered) as if it
  meant GONE (>180s, swept).  **Client-side, and small.**
- **Defect 2 — a seat is rendered off a liveness window.**  `loadRoomState` is
  the only roster source and it calls `active_members`, which hides him at 60s.
  Between 60s and 180s his row is intact, his `seat_index` is intact, and her
  screen still renders OPEN CHAIR and offers his seat to the crowd.  **Fixing
  defect 1 does nothing for this** — he never reaches the client to be rendered.

**The exception already exists in the code.**  `activeRows` opens with
`if (m.role === "kept") return true;  // a kept man is on stage; staleness
doesn't unseat him`.  The principle that a seat on stage is not a liveness signal
was already written down; it was applied to `kept` and not to `chair`.  So
defect 2 is a render-source question, not an away-state redesign.

**~~NOT BLOCKED ON THE DATABASE. Both defects are client-side.~~ WITHDRAWN
2026-08-12 — the server was read directly and both halves turn on it.**  This
paragraph was written from the double, and the double was wrong about the two
functions the claim rested on.  What the server actually says, read from
`pg_get_functiondef` on 2026-08-12:

| function | text | the double said |
|---|---|---|
| `heartbeat` | `update … set last_seen = now()`, **no role predicate at all** | skipped rows with `role='gone'` |
| `join_room` | inserts only `if v_member is null`; otherwise `-- already a member: refresh presence, keep role (no downgrade)` | revived a `gone` row as `spectator` |
| `active_members` | `where role <> 'gone' and (role = 'kept' or last_seen > now() - interval '60 seconds')` | correct |
| `sweep_stale_members` | `set role='gone' …` — **role only**, `line_position` untouched | correct |
| `join_line` | keeps `v_prev_pos` when `v_prev_role = 'line'` | re-minted every time |
| `leave_room` | hard `DELETE` | correct |

**Nothing on the server ever un-sets `'gone'`.**  Not the beat, not `join_room`.
So past 180s the client's `leave_room` + `join_room` is the only exit that
exists, and it costs the place by construction — the row is destroyed, so the
new row's previous role is not `'line'`.

- **The bench (defect 1) is real and it is server-shaped.**  Three candidate
  fixes, all server-side: the sweep must not bury a benched man at 180s, or
  `join_room` must restore the prior role, or `join_line` must preserve on
  `v_prev_pos` regardless of `v_prev_role`.  **Do not "just remove the
  `leave_room` call"** — removing it strands him at `'gone'` permanently, which
  is worse than losing a turn.  That call is the only thing currently rescuing
  him, and it rescues him badly.
- **The chair (defect 2) is a render-source question, and the source is an
  RPC.**  `loadRoomState` is the only roster read, it calls `active_members`,
  and the exemption is a disjunct in the server's own `WHERE`.  The client
  **never** touches `room_members` directly — 0 occurrences of
  `from("room_members")`, against 8 `from("room_events").insert` and 8
  `from("profiles").select`, so the mechanism for a direct read exists and is
  used elsewhere.  Whether RLS on `room_members` permits a client `select` is
  **the open question**, and it decides client-side vs server-side.  It is not
  assumed here either way.

**Provenance note.**  The withdrawn claim was mine, and it was ruled on by the
conductor from my read of the double.  Neither of us had read the server.  See
METHOD rule 12: a double that reproduces the symptom is not evidence of the
mechanism.

**Still open, and it is the owner's:** should a seat assignment be rendered off a
liveness window at all?  A 60-second window should probably not be able to offer
a man's chair to the crowd — but "how long may a seat outlive its beat" is a
show question, not a correctness one.

**Q12 — does a mid-phase rejoin lose video on a REAL transport?**
Anomaly d7.  Gate 39 covers the reattach *logic* — `videoJoin`'s fast-path guard
reading a dying call's state while the leave was in flight.  It cannot cover the
transport half, because the Daily double is per-window: remote streams are
synthesised locally and media never moves between windows.  **What would settle
it:** a live rejoin against real Daily, mid-phase, with the tiles observed on the
rejoining client.  Until then the logic is gated and the transport is unproven,
and those are different claims.

**Q60 — is a 60-second freshness window right for phones?**
`activeRows()` drops a member 60s after their last beat, against an 8s beat
interval.  A person whose phone backgrounds the app is still in the room and
re-syncs on return, but for that window they are absent from every roster and
their chair reads empty to everyone else.  Whether 60s is the right number is
**unmeasured**.  **What would settle it:** timing real backgrounded devices —
phone lock, incoming call, app switch — against beat delivery, on the platforms
the show actually runs on.  This is tuning, not a disease.  It is explicitly
**not** a mandate to rewrite the presence model: the closed-vs-away distinction
is already implemented (`pagehide`/`beforeunload` leave; `visibilitychange` does
not), and one agent has already mistaken the stale comment above
`bestEffortLeave` for a missing feature.  Measure before touching.

**Q46 — do three men benching at once get `line_position` in the order the
server saw them?**
`fix/pick-window-autoseat` seats the longest-waiting benched man when the pick
window expires, ordering by `line_position`.  Three separate claims sit under
that, and only two of them are settled:

- **Verified in production** — the column exists, is minted at BENCH ENTRY (not
  room join), and increments globally.  Measured 2026-08-12, same man, two
  readings: spectator `line_position null / joined_at 07:44:32`, benched
  `line_position 249 / joined_at unchanged`.
- **Verified in the harness** — gate 46 drives the expiry and curtain-up and
  holds both to the same order, against rows whose positions the gate sets.
- **UNVERIFIED** — that three men tapping the bench *concurrently* receive
  positions in the order the server actually saw them.  The double cannot
  answer this honestly: it mints positions from a local counter, so it would
  only be replaying the ordering the gate wrote.

**ANSWERED IN PART, 2026-08-12, from the database side rather than a rig.**

- **Server-side — SETTLED.**  `join_line` sends only `{room_id}`.  The client
  never supplies `line_position` anywhere; it reads it to sort and nothing else.
  The client-supplied branch is closed outright.
- **Re-entry — SETTLED, and the earlier guess was wrong.**  Measured on one man,
  three states: bench → 250, leave the bench → `line_position` **null**,
  re-bench → **251**.  He goes to the BACK of the queue, not to his old place.
  The mechanism is that leaving runs `leave_room` then `join_room`, so the row
  is deleted and recreated — the null is a new row, not a wiped column.  The
  double models this correctly and its comment now says so.
- **Sequence vs `max()+1` — CLOSED 2026-08-12, and it is a SEQUENCE.**  Read
  from `join_line` directly: `v_pos := nextval('line_position_seq')`.  The
  earlier reasoning — consecutive values with no gaps mildly favouring `max()+1`
  because sequences leak gaps from rollbacks — was a hint pointing the wrong way,
  and it is a good example of why a hint was labelled a hint.  **A sequence
  cannot collide, so the concurrent-mint-order worry below is dead.**
- **And the re-entry measurement was misread.**  bench 250 → leave → null →
  re-bench 251 was never the server re-minting on principle.  `join_line`
  preserves `v_prev_pos` whenever the previous role is still `line`; the new
  number appeared because `leave_room` had DELETED the row first.  The
  measurement was right and the conclusion drawn from it was wrong.
- **Concurrent mint order — CLOSED by the same read.**  A Postgres sequence
  hands out distinct increasing values under concurrency by construction, so
  there is nothing left to race.  The double still mints from a local counter,
  which is fine: it now models a sequence rather than approximating an unknown.

**What would settle the remainder:** either the DDL for `line_position` (a
database question), or three signed-in slots benching within the same second and
then reading the three rows — a sequence cannot collide, application-level
`max()+1` can, and a collision would be a real race and a better finding than a
clean run.  Until then say "column and re-entry verified in production, ordering
verified in harness, concurrent mint order unverified" rather than "bench order
is correct".
