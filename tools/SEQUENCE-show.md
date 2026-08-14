# SEQUENCE — the show as built (REBUILT 2026-08-14 after container loss)

PROVENANCE, per METHOD rule 12.  The first version of this document (commit
d8a9e21, 50 steps, six parts, three gap lists) died with its container before
the push route opened.  This is a REBUILD: the outline comes from the dead
agent's one-block summary preserved in the planner tab; every step below was
then re-read and cited fresh against `index.html` at HEAD `4247458` (merge of
PR #62) on 2026-08-14 by the rebuilding agent.  Labels: **SOURCE(client)**
with a line cite, **SOURCE(double)** citing `tools/lib/backend-double.js`, or
**UNKNOWN** — no fourth category.  Server behaviour that has never been read
from the server is UNKNOWN even when the double models it; the double is a
copy with known divergences, not a reference.

The original's gap numbering is partially lost.  G7 and G10 survive verbatim
in the tab record and keep their numbers; the other gaps listed at the foot
are re-derived from this rebuild's own reads and make no claim to match the
dead agent's numbering.

## PART I — the door (sign-in → lobby → room)

1. Sign-in is Supabase password auth (`signInWithPassword`, 1827).  A signed-in
   host who died owning a live room has it ended on return (1838 ff).
2. First run collects zip + search radius before the lobby shows (2092);
   returning users land on the lobby (2113), which lists live rooms and
   re-renders on any room create/end via the `lobby` realtime channel
   (2214–2216).
3. `roomCounts()` is the ONLY counter feeding lobby cards (2176) — the lobby
   must not count from a different derivation than the room.
4. GO LIVE creates and enters the host's room (2222–2235).
5. Entering any room: `CURRENT_ROOM` set, `AMHOST` derived from
   `r.host_id===ME.id`, server clock synced, lobby hidden (2257–2263).
6. Non-hosts call `join_room` on entry; a duplicate-key error is tolerated
   (2278–2279).  → role `spectator` (crowd).
7. Rejoin/restore: a reload that lands back in the room still holding role
   `line` re-affirms through the ONE bench door (`takeBenchSeat`), reading
   the TABLE not the rendering first — self-fate decider #5 of gate 54's
   census (2286–2294).

## PART II — the bench (the only way toward a chair)

8. `takeBenchSeat` (5361–5383) is the ONE DOOR ONTO THE BENCH — every path
   funnels here: the ♥ TAKE A BENCH SEAT button, the empty-chair tap, and
   rejoin/restore.  Gate 12 asserts structurally that its `join_line` call is
   the only bench-role write site in the file.
9. The headshot is captured and AWAITED before the role write (5373–5374) —
   the crowd's view of the bench IS the photo; a man on file is restored
   silently; a denied camera still seats him with the silhouette.
10. A heartbeat rides the successful join (5380) so the new row reads fresh
    immediately — the wave-8 "evaporating bench seat" fix.
11. Nobody self-seats into a chair, by canon — gate 43 asserts ZERO
    `claim_open_chair` call sites.  SHE seats you, and only she.
12. The bench renders as lanes with hearts, strike pips (dead code — see
    DESIGN-DIFF, half-built surfaces), and a leader halo: "a lone man leads
    nobody, a tie is not a lead, and nobody leads at zero" (2870–2877).
13. Blind mode: the host (and seated men) see silhouettes, never faces
    (2845–2847, CSS 626); faces are the crowd's view.  The server-side md5
    mask in `active_members` is the substrate — **UNKNOWN in its verbatim
    current text; last read from the server 2026-08-13, and the ruled host
    exemption has NOT landed.**

## PART III — curtain up (preshow → showstart)

14. The host's poll sweeps stale members first (`sweep_stale_members`,
    3428–3431) so ghosts never inflate the roster read that follows.
15. Cold start: phase null/preshow, nobody seated, ≥3 in `benchQueue` → the
    curtain-up loop seats the front three, ONE derivation (`benchQueue`) so
    curtain-up and pick-window expiry agree on "who is next" (3437–3446).
16. EVERY RESULT IS READ (3447–3473): `seat_member` raises arrive as resolved
    `{error}`, so each call is read per-man, a failure costs nobody else a
    chair, only a CONFIRMED seat is remembered in `__SEATED_UIDS`, and a
    partial fill is told to her ("Seating: N of 3 chairs filled…").
    Measured 2026-08-13: the old discard-the-result shape hid three faulted
    calls in a row.
17. THE CURTAIN IS HELD unless at least one man actually sat (owner ruling
    2026-08-13, in-code comment 3474–3479): threshold ONE, not three — a
    2-of-3 curtain is a real show with an empty chair.
18. With three chairs filled from preshow, the HOST client calls `start_show`
    (2998–3005), guarded by `__STARTING` against re-entry.
19. `showstart` is a 6-second beat (`LC_SECTION_SECS.showstart`, 3682),
    advanced by the HOST CLIENT'S OWN `setTimeout` calling `skip_phase`
    (3011–3016) — a client-owned timer, in tension with design point 12.
20. Mid-show bench seating — her tap on a bench lane — goes
    `egDecideTap`/lane tap → `hostSeat(uid)` (2993, 3615) → `seat_member`.
    **THIS IS THE SEVENTEEN'S PATH**: the host's roster is masked
    (`active_members` masks other people's line rows to her), so the id her
    client resolves can be a masked md5-as-uuid that matches nobody.
    `seat_member` now RAISES on zero rows (PR #60 / gate 51), so until the
    ruled host exemption lands, mid-show bench seating is LOUDLY broken
    rather than silently.  UNKNOWN: the server's current `seat_member` text
    (last read 2026-08-13).
21. `autoSeatFromLine` (3596–3612) auto-seats from the line while chairs are
    open — but is fenced out of every engine room (`if(EG_ON) return`,
    3598).  Its fence comment cites `claim_open_chair` as the alternative;
    that function does not exist (gap G7, fix queued).

## PART IV — the rounds (spotlight → open floor, ×3)

22. Choosing and answering are the SAME server phase, `spotlight` — the
    difference is whether `spotlight_target` is set (3691–3694).  Choosing
    runs 20s, an answer 30s (`lcSectionTotal`, 3694).
23. CHOOSING: only the host may ask, only in the choosing window
    (`is-choosing` = spotlight with no target, 3097–3098; TAP TO ASK is a
    choosing-beat affordance only, CSS 304–308).  Questions come from
    authored decks: `ask_question` sends a `question_id` and a target
    (4011); no free-typed questions exist.
24. The rotation is legible: ASKED is a fact about (occupant, round), never
    about the chair — derived from `askedThisRound()` for the current
    occupant, only inside the round segment, wiped by deliberation, never
    inherited by a new occupant (3025–3042).  Prod increments `rooms.round`
    on EVERY ask (2646–2647) — so "round" in the row is an ask counter, not
    a show-round counter.  SOURCE(client comment); server text UNKNOWN.
25. Her choosing beat running out flashes the ask affordances themselves
    (`ask-urgent` at ≤6s, 3177–3179).
26. Choosing clock expired with no ask → THE HOUSE PICKS ONE (`__AUTOQ`
    guard, 3204–3230).
27. During his answer, the other two mute to a strip (CSS `is-strip`
    classes; two-up interview shot).  His clock does NOT pause — no pause
    mechanism exists at HEAD (DESIGN-DIFF point 10: unbuilt with no hooks).
28. Open floor is 45s (`openfloor:45`, 3682; `mingle` is its render class,
    3093).  Then back to spotlight — rounds proceed spotlight → openfloor
    → spotlight … into deliberation after round three.  The full ORDER
    ARRAY as a single fact is SOURCE(double) only: `["preshow",
    "showstart", "spotlight", "openfloor", "deliberation", "deciding"]`
    (backend-double.js 420) — `draft` is ABSENT from it (gap G10).  The
    server's real `advance_phase` order is UNKNOWN and is on the SQL read
    list.
29. RULING Q2 (in-code, 5390 ff / 4145 ff): a chair leaving during his own
    answer is passing himself — leaving is NEVER blocked, but it is final
    for the night, and the HOST's client owns the collapse (question card
    down, wipe beat, server target cleared).

## PART V — her call (deliberation → deciding → four exits)

30. Deliberation 60s, then deciding ("HER CALL") 60s (3682) — two phases
    where the design wants one 90s beat.
31. Prod enters `deciding` with a NULL `phase_deadline`; the host client
    arms her OWN 60s window at entry (`EG_DECIDE_ARM`, 3753–3756).  A
    parked 0:00 is a lie, so a dry window renders as no clock rather than
    zero (3710–3713).
32. The decision tray: KEEP ONE / PASS ONE / CLEAR THE DECK / WALK AWAY.
    The option set re-derives on GENUINE roster changes only (role/
    membership signature, 3043–3050) — never freshness flapping.
33. RULING Q5, in code at 3893–3925: HER CALL never silently expires.
    Clock-out = the crowd decides — the heart leader among seated chairs is
    KEPT on the ordinary KEEP path, announced loud.  A tie or an empty
    stage HOLDS the clock until she taps.  The crowd's call is measured
    twice (same leader across two ticks ≥600ms) before it fires, because it
    ends the show.  The generic resolver EXCLUDES `deciding` (3846, 3926 ff)
    — nothing else may advance her call.  **HEARD ENOUGH does not appear on
    the decision tray** (ruled 2026-08-14, final).
34. KEEP ONE → `decide_keep` (4201–4204) → the kept beat, then the ending
    MUST land or be said: `end_show` retried 3× with backoff, and a refusal
    is told to her rather than the rooms row lying `live` (gate 56,
    4205–4222).
35. PASS ONE → `decide_pass` → prod ALSO flips the phase to `draft`
    server-side (client comment 3743–3745; server text UNKNOWN).  The
    client opens its OWN 20s pick window (`LC_PASS_PICK_SECS=20`, 3687;
    `passPickOpen` 4131–4141): the host writes the shared `phase_deadline`
    (host owns her room row), toasts "Chair's open — tap the bench to seat
    his replacement."
36. While the pick window is open it is the ONLY advancing authority
    (wave 5, 3741–3747): the resolver is silenced, the server's draft flip
    must not kill it.  It closes only through its own exits: her tap, its
    expiry, the bench emptying, the chair refilling, or leaving the room.
37. Her tap during the window takes the hostSeat PASS_PICK branch —
    recruitResolve → passPickClear → `skip_phase` → refresh — so the clock
    filling the chair moves the show exactly as her finger would have
    (3860–3879; gates 15 and 30 exist because an earlier draft seated the
    man and stood the show still).
38. Window expiry with a bench: the front of `benchQueue` is auto-seated
    (same ONE derivation as curtain-up).  Expiry with a dry bench:
    `skip_phase`, with the short-handed/bench-dry beat (3880–3885).
39. RULING 2026-08-14, final: a PASS refill starts a FRESH 3-ROUND CYCLE —
    acceptable because the skip is the pacing valve; any change to the skip
    reopens the ruling.  (The as-built cycle reset is NOT yet verified
    against the server's round handling — UNKNOWN, on the SQL read list.)
40. CLEAR THE DECK → confirm → `decide_clear` if 3 are waiting, else
    confirm → `end_show` alone (4110–4116).  WALK AWAY → confirm → the
    end-show flow (4118–4120), the walked-alone finale.
41. The `draft` phase at HEAD is EXIT-ONLY in every artifact read: the
    double's order array omits it (backend-double.js 420); the client's
    draft machinery (`resolve_draft` nudge 3933, `seat_pick` candidate tap
    4280) handles a phase only prod's `decide_pass` enters.  Per the design
    brief the entire draft storm is SUPERSEDED — do not build coverage.

## PART VI — endings (finale → backstage → goodnight)

42. `end_show` ends the rooms row; every client's watcher routes to a
    finale card, never a bare lobby (wave 6 rule, 1446, 5192).
43. Winner path: the snap ceremony (photo decoded and sampled by gate 48 —
    ≥50% lit against a 243/243 fixture), his key warms to hers, backstage.
44. Non-winners: rejected cells go cold; spectators get the finale card —
    an ENDED show is a finale, not a vanished host (3496–3502: the watchdog
    asks the rooms row before concluding).
45. Host-vanished watchdog (non-hosts, in the video call only —
    `DAILY && DAILY_JOINED` fence): the host absent from the call ~80s
    while the room claims live → ask the rooms row; `ended` → finale
    (`roomEndedUnderUs`); genuinely gone → "The host left — that's the
    show. 🌙" and leave (3490–3506).  Gate 47 ages `HOST_LAST_SEEN` for
    real and asserts he lands on the finale.
46. Backstage: both sides in the call, shared deadline, one clock.  A
    departing counterpart retires the tile (`backstage_left` event, PR #41)
    AND stops her clock: `bsGoodnight` is unfenced (PR #44, 4699–4714) —
    "They slipped out into the night." — same beat, same goodnight, every
    phase; only its `BSD_PHASE==="revealed"` contacts guard stands.
    Confirmed live 2026-08-12 by flag reads (`clockOn` false, `BS_STATE.room`
    null), not pixels.
47. Leaving a room routes through `leave_room` — a HARD DELETE with no
    ledger event (the LEDGER GAP, logged 2026-08-13) — and every
    self-fate decision around it reads the TABLE (`myRowFromTable`) with
    bounded loud re-adds (`rejoinRoomBounded`), per rule 13 (gates 53–57).

## GAPS — what this rebuild can and cannot say

Numbering note: G7 and G10 keep the dead agent's numbers (preserved verbatim
in the tab); the rest of the original nine-gap list did not survive and the
items below are this rebuild's own.

- **G7** — `autoSeatFromLine`'s fence comment (3598) cites
  `claim_open_chair`, which exists nowhere.  The fence is right; the reason
  is fiction.  Fix queued.
- **G10** — the double has NO DRAFT ENTRY: `advance_phase` order array
  omits `draft` (backend-double.js 420), so no gate has ever entered the
  draft storm through the front door — rule 9's scene-never-entered hole.
  RESOLVED BY RULING: the phase is scheduled for demolition; do not build
  the entry.
- **R1 (rebuild)** — the server's `advance_phase` order, `seat_pick`,
  `resolve_draft`, `get_draft_view`, `decide_pass`, any other writer of
  `phase='draft'`, and whether `room_members.strikes` exists: ALL UNKNOWN
  at HEAD.  This is the standing ONE-TRIP SQL read list.
- **R2 (rebuild)** — the deciding phase's cycle reset after a PASS refill
  (ruling 3) has no as-built substrate verified: `rooms.round` is an ask
  counter per the client comment (2646–2647), and how a fresh 3-round
  cycle maps onto it is UNKNOWN.
- **R3 (rebuild)** — the client-owned timers (steps 19, 31, 35) are the
  standing tension with design point 12 (server owns every timer).  Four
  cited instances in DESIGN-DIFF point 12.
