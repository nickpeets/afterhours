# LAST CALL — the show, specified

Authoritative statement of what the show IS.  Sources: the pacing spec
(Nick, 8/5), the rules already encoded in gates 1–16, the beat scripts in
`index.html`, and the invariants established across fix/count-truth,
fix/bench-entry-and-host-seat, fix/video-attach-idempotent, fix/ask-truth,
fix/round-flow, and fix/daily-singleton.  Where the correct behavior is
genuinely undecided this file says **OPEN QUESTION** and lists the options —
it does not invent policy.  The audit (`AUDIT-2026-08-08.md`) scores the code
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
- **PASS is never offered when the pass would leave the show unable to
  continue** (gate 15 covers bench 0; see OPEN QUESTION Q3 for the general
  viability rule).
- **Ask state is (member, round)-scoped** — a chair is furniture; occupants
  bring their own ask state (gate 14).  *Source of truth: see Q4.*
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

- HOST: TAP TO ASK on any un-asked seated chair (CSS `.is-choosing`); ASK
  composer button; drawer (deck → question → target); `eg_skip`.  Fire
  requires `askEligible`: choosing window AND target currently seated.
- CHAIR/CROWD: hearts, chat, gifts.  CHAIR: ↩ LEAVE THE CHAIR (see Q2).
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
- Disruptions: **TARGET leaves mid-answer** — see Q2.  Current mechanics:
  the room's layout degrades (client-side seated-target guard), the server
  target sticks until the section expires.  RIVAL leaves: strip shrinks.
  ASKED state: his mark stays keyed to (him, round) — irrelevant once he's
  not seated; a new occupant of his chair inherits nothing (gate 14).

### OPEN FLOOR (45s)

- Everyone mingles: hearts, chat, gifts.  ASKED badges on chairs that have
  answered this round remain visible **to the whole room** (see Q4 —
  currently only the host's client can render them).
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
  (only if the pass leaves a continuable show — bench truth from
  `roomCounts().bench`; viability rule Q3), **CLEAR THE DECK** (confirm;
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
- Expiry (no decision at all): resolver advances → round+1 spotlight.
  **OPEN QUESTION Q5** — is silently skipping her call acceptable?
- Disruptions: chair leaves mid-deciding → **the card must re-derive PASS
  viability immediately** (audit B — it doesn't).  Bench empties → same.
  All chairs leave → nothing to decide; see Q5.

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
- **The host reloads**: the show must survive a reload.  The zombie rule
  already defines true absence (no `host_seen_at` beat for 120s ends the
  room; watchers exit after 80s of no host presence).  A reload is
  presence, not absence.  **Current code violates this — audit F1.**  See
  Q1 for the intended resume flow.
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

## OPEN QUESTIONS

**Q1 — Host reload/resume.**  The show must survive a host reload, but by
what mechanic?  Options: (a) crash-recovery janitor only ends owned rooms
whose `host_seen_at` is older than the 120s zombie threshold (reuse the
existing rule; reload inside the window resumes silently); (b) a "resume
your show?" prompt on boot with a countdown, ending the room only on
decline/timeout; (c) never auto-end — rely solely on the watcher-side 80s
exit and 120s janitor.  *(a) is the smallest change consistent with the
existing absence rules, but the owner has not chosen.*

**Q2 — May a chair leave during his own answer?**  Options: (a) allowed
any time; leaving as TARGET collapses the segment immediately (target
cleared, `beatTimesUp`-style beat, straight to open floor); (b) LEAVE
disabled for the TARGET during his answer only (the one moment the show is
literally about him); (c) allowed but treated as a pass (he's done for the
show).  Current code is (a) minus the collapse — the segment plays against
a ghost.  No option has been chosen; the live report "leave appears
blocked in spotlight" matches NO code path (audit A) — if blocking is
wanted it must be built deliberately, per (b).

**Q3 — The general PASS-viability rule.**  Established: PASS hidden at
bench 0.  Undecided: the full predicate.  Options: (a) `bench ≥ 1` only
(refill exists; stage may still shrink if seats emptied earlier); (b)
`bench ≥ 1 AND seated ≥ 3` (a pass never fires unless the stage is full —
under-3 stages must refill via draft first); (c) `bench + seated − 1 ≥ 2`
(post-pass cast can still make TV).  Whatever is chosen must be
re-evaluated on EVERY roster change, not at card-open time (audit B).

**Q4 — Source of truth for ask state.**  Ask state must be (member,
round)-scoped AND visible to every role AND survive a host reload.  The
current window-local maps satisfy only the first (audit C).  Options: (a)
derive from `room_events` — `ask_question` writes a `spotlight` event row
(payload: target, round); every client folds events into the maps on entry
(`loadEventHistory`) and live (`handleEvent`); (b) a `rooms.asked_json`
column the host writes; (c) a dedicated table.  (a) uses plumbing that
already exists on every client and needs double parity (the double's
`ask_question` writes no event today).

**Q5 — HER CALL expiry and the empty stage.**  If she never decides, the
resolver silently advances to round+1 — her call evaporates.  If all
chairs leave during deciding, the card offers verbs with no objects.
Options: (a) expiry auto-KEEPs the crowd's heart leader (the crowd
decides); (b) expiry = CLEAR THE DECK semantics (explicit refill-or-end);
(c) expiry loops deciding with an "everyone's waiting" nudge until she
acts (no clock-out).  Empty stage: degrade to draft/refill if anyone
waits, else end-alone — but this needs an owner call.

**Q6 — May a KEPT man be asked in later rounds?**  `askTargets()` includes
`kept` (he's on stage); the show-scope rotation map excludes him only
after his own question.  Options: (a) kept men are done answering — targets
are `chair` only; (b) kept men stay in rotation.  Gate 14 currently
encodes neither explicitly.

**Q7 — Bench-pick window with an emptied bench.**  If the last bench
member leaves during the 20s window, the label still says "PICK FROM THE
BENCH" over nobody until expiry.  Options: (a) close the window and
advance the moment `roomCounts().bench` hits 0; (b) let it expire (current;
harmless but 20s of dead label).
