# DESIGN DIFF — intent vs as-built (REBUILT 2026-08-14 after container loss)

PROVENANCE, per METHOD rule 12 — read this before quoting anything below.

- This document was first written 2026-08-13 (commit b9a9c74) by an agent whose
  container died before the push route opened.  That commit is GONE — it exists
  on no branch.  This is a REBUILD from the planner tab's record, by an agent
  who has never opened the design zip.
- Every DESIGN-side claim is **SOURCE(design-relay)**: the planner's reading of
  Nick's design zip (README + 10-screen walkthrough + room/episode/draft
  files), relayed verbatim into the tab 2026-08-13/14.  Not one design file has
  been read by the author of this rebuild.  Before any DESIGN line drives a
  commit, someone re-reads the actual file — Nick can attach the zip to the
  executing agent's panel.
- Every AS-BUILT claim is **SOURCE(client)**: read and string-verified by the
  rebuilding agent against `index.html` at HEAD `4247458` (merge of PR #62),
  2026-08-14.  Line numbers are at that HEAD.
- Battery at this HEAD: 54 gates · 782 checks · all clean (b0814.2203 stamp).

## HEADLINE — THE DRAFT STORM IS SUPERSEDED BY DESIGN

README, verbatim via relay: "The bench replaces the draft storm... The old
15-second reveal storm existed to manufacture stakes for a dark line... Only
the modal is gone."  The built S6 draft storm is the OLD design.  The intended
mechanic: chair opens → 5-SECOND override window for her → bench leader rises
on a camera-flip → next in line drops onto the bench, FIFO shift.  No modal,
no 15s tallies.

Consequence, already ruled: G10 (the double has no draft entry) resolves as DO
NOT BUILD the entry — the phase is scheduled for demolition, not coverage.
All draft-storm coverage work is HELD.

## THE TWELVE POINTS, design → as-built

1. **Chair-empty handling** — DESIGN: 15s HOLD, clock frozen, cell reads
   RECONNECTING in amber, NEVER "TAKE THE CHAIR" — "she didn't pass him, and
   the room must not be told she did."  The 15s hold IS gate 50's named
   legibility artifact, spec'd.  AS-BUILT: **DIVERGES.**  #58 shipped a
   60s–180s AWAY hold: between 60s and 180s he keeps the seat and the tile
   carries `is-away` / "· AWAY" (index.html 2534, 2568, 2777–2782).  No 15s
   window, no frozen clock, no RECONNECTING copy anywhere ("TAKE THE CHAIR"
   has zero hits at HEAD; empty cells render OPEN CHAIR, 1227/1260/1293).
   **RULED — see foot, ruling 1: 15 seconds flat.**
2. **Promotion** — DESIGN: 5s override; she taps a bench SEAT (a position,
   resolved server-side) — the `seat_pick` shape, not `seat_member(uid)`.
   The seventeen's design-correct fix.  AS-BUILT: **DIVERGES.**  Her tap
   resolves client-side to a uid and calls `hostSeat(uid)` → `seat_member`
   (tap 2993, hostSeat 3638) — the exact path the seventeen died on.
   `seat_pick` appears only in the contract comment (3688) and the draft
   candidate flow (4303).
3. **Show start** — DESIGN: 3s beat.  AS-BUILT: **DIVERGES.**  6s
   (`LC_SECTION_SECS` 3705: `showstart:6`), and it is advanced by the HOST
   CLIENT'S OWN `setTimeout` calling `skip_phase` (3011–3016).
4. **Deliberation** — DESIGN: ONE 90s phase.  AS-BUILT: **DIVERGES.**  Two
   phases: `deliberation:60` + `deciding:60` (3705).
5. **PASS ONE** — DESIGN: one blind refill then a FRESH 3-ROUND CYCLE.
   AS-BUILT: **DIVERGES.**  A 20s host pick window (`LC_PASS_PICK_SECS=20`,
   3710; `passPickOpen` 4154–4164 writes the shared deadline) AND a server
   flip to `draft` (via prod `decide_pass`, 3766), no cycle reset.
   **RULED — see foot, ruling 3: fresh cycle stands.**
6. **CLEAR THE DECK** — DESIGN: confirm → three blind refills, seated one at
   a time.  AS-BUILT: **DIVERGES.**  Confirm → `decide_clear` (4138) only if
   3 are waiting, else confirm → `end_show` alone (4133–4135).
7. **WALK AWAY** — DESIGN: confirm → "walked alone" finale.  AS-BUILT:
   **MATCHES in shape.**  `eg_dwalk` routes to the end-show flow (4143);
   ends the night alone.
8. **Strikes** — DESIGN: lose a promotion = keep place + strike; 3 strikes =
   removed, cannot rejoin tonight; SERVER owns counts.  AS-BUILT: **NOT
   BUILT — and HALF-BUILT on the surface**, which is worse than absent: the
   bench lane renders strike pips off `m.strikes` and flags `is-lastlife` at
   2+ (2855–2861), but NOTHING writes `strikes` anywhere — not the client,
   not the double (repo-wide grep at HEAD: the only hits are the three
   render lines).  UI wired to server state that does not exist.
9. **Visibility is permanent** — DESIGN: she sees the bench as silhouettes +
   live heart counts for the WHOLE show, never faces; chairs and crowd see
   faces; behind the front 3, count only.  The mask is design intent,
   permanently.  AS-BUILT: **MATCHES in direction.**  Blind-mode rendering
   (CSS 626 "she picks blind: silhouettes + live counts, never faces";
   silhouette lanes 1324/1334; blind toggle 2845) over the server-side md5
   mask in `active_members`.  The ruled host exemption is TACTICAL (unblocks
   her tap today); the strategic endpoint is server-resolved picks (point 2).
10. **Spotlight mechanics** — DESIGN: target's shot clock PAUSES during his
    answer; gifts and floor-holds disabled during spotlights; host can skip
    any timed phase.  AS-BUILT: **PARTIAL.**  `skip_phase` exists and is
    used (3014).  No clock-pause mechanism found at HEAD (no pause writer on
    the section clock) — so the design's "answering never eats audition time"
    rule is not half-built, it is UNBUILT WITH NO HOOKS: new substrate is
    required before it can exist.  **RULED — see foot, ruling 2: "any timed
    phase" is corrected to "any timed phase EXCEPT the call."**
11. **Questions** — DESIGN: no free-typed questions anywhere; she picks
    authored decks at GO LIVE.  AS-BUILT: **MATCHES.**  `ask_question` sends
    a `question_id` from the picked deck (4034); contract tables
    `question_decks`/`questions` (3689).
12. **Server owns every timer and every consequential outcome**, including
    who is seated on expiry; the client renders and sends intent.  AS-BUILT:
    **DIVERGES, repeatedly.**  Showstart advanced by the host client's timer
    (3011–3016); `deciding` arrives with NO server deadline and her client
    arms its own (3776); the pass-pick window deadline is written by the
    host client (4157–4159); the KEEP ending is a client-side retry loop
    around `end_show` (4228 ff).

## FOOT — THE THREE CONTRADICTIONS, RULED (Nick, 2026-08-14, via planner tab)

All three were open when this doc was first written.  All three are now ruled,
final; recorded here verbatim from the tab:

1. **THE HOLD IS 15 SECONDS, FLAT.**  "You have to be ready to play the game
   and be present to win someone's attention."  No lock-vs-close distinction,
   no back-of-bench mercy path: 15 seconds, clock frozen, RECONNECTING amber,
   and past the window the seat converts.  The design's table stands as
   written.  This supersedes the 60s/180s thresholds as PRODUCT intent — the
   server-side implementation (chairHold semantics vs today's sweep) is a
   build item, not a ruling item, and does NOT block the host exemption.
2. **Q5 STANDS.**  HEARD ENOUGH does not appear on the decision tray.  She
   chooses, or the clock hands it to the crowd — the skip speeds her TOWARD
   the verdict, never past it.  The design's "host can skip any timed phase"
   is corrected to "any timed phase EXCEPT the call"; Q5's language in
   SPEC.md is the ruled contract and this diff cites it.
3. **A PASS REFILL STARTS A FRESH 3-ROUND CYCLE.**  "New face, fresh 3 rounds
   gives a chair a chance to contrast himself against the other two.  She can
   speed up the process at any time."  The reset is only acceptable BECAUSE
   the skip exists — the skip is the pacing valve — so ANY future change to
   the skip reopens this ruling.

## HALF-BUILT SURFACES — UI wired to server state that does not exist

Three instances at HEAD, all string-verified 2026-08-14:

- **Strike pips** (point 8): render at 2855–2861, `is-lastlife` at 2+, zero
  writers of `strikes` in the repo, including `tools/lib/backend-double.js`.
  Stated flatly so the next reader is not fooled by a mockup: `m.strikes` is
  undefined on every row the client will ever receive, so the pips can never
  render meaningfully and the 2+ check is dead code wearing finished UI.  The
  system does not half-work; it half-renders.
- **The rivals' "mute"** (point 10's neighbour, found on the planner's flag
  2026-08-14): the spotlight two-up collapse is real behaviour (2808–2830
  drives `is-strip`/`is-gone` off `phase==="spotlight" && spotTarget`), but
  the strip's own label — "muted until the answer lands" — is copy over
  unmuted audio.  `setLocalAudio` is seat-scoped only (`syncLocalPublish`
  5932: publish = host or seated, spotlight-blind) and subscriptions are
  always `audio: true` (6147).  The room hears the rivals while the UI says
  it doesn't.  The design's "gifts and floor-holds disabled during
  spotlights" has the same no-substrate status as the clock pause.
- **`claim_open_chair`** — **CORRECTED 2026-08-19, SOURCE(server).**  This
  entry previously denied that the function existed.  It exists:
  `public.claim_open_chair(room_id uuid) returns boolean`, SECURITY DEFINER,
  read from Supabase Studio as role `postgres` on 2026-08-19.  It refuses on
  four conditions — room not live, caller not already on the bench, phase not
  preshow, three chairs already taken — and seats the CALLER, keyed to the
  authenticated user, with no target argument.
  It is UNREACHABLE: zero client call sites, which gate 43 locks at zero.
  It is also BROKEN: its final ledger write names a `room_events` column the
  table does not have (the table has `user_id`; the function names `actor`).
  **INFERRED, not observed** — a call that reaches that write raises, and the
  raise aborts the whole call, so the seat write rolls back with it.  Failure
  is "errors and nothing happens", never "seated with a silent ledger".
  Observing the raise costs a write, so it was not observed and is not claimed
  as such.  `autoSeatFromLine`'s fence comment (3598–3621) now carries this
  reason instead of the old one.
  **THE MECHANISM IS THE POINT:** gate 43's zero-call-sites assertion is why
  this was never found.  A gate that documents a fence also hides what is
  behind it — nothing executed the path, so nothing reported it.

  **PENDING SERVER CHANGE — DROP, NOT REPAIR.  Logged, not scheduled; not this
  wave and not a client PR's to execute.**  With the seating-authority rule now
  written into SPEC (no member seats himself; seating is initiated by the host
  or the engine), `claim_open_chair` is not merely dead housekeeping — it is
  the only path in the system where a user's own action would put him in a
  chair, which the ruled design forbids.  Repairing it would build a design
  violation on purpose and leave a loaded gun for whoever calls it in six
  months; the fact that it currently raises is the only thing that has ever
  stopped it.  Recommendation is therefore DROP.  Two conditions before anyone
  acts: the drop is a WRITE against production and needs its own explicit go,
  and the reasoning must rest on SPEC's rule as now written rather than on gate
  43's header, which is where this claim used to live unverifiable.

Related, banked by the first version of this doc: the bench leader/tie logic
(2870–2877 — "a lone man leads nobody, a tie is not a lead, nobody leads at
zero") is the client substrate the 5s-promotion mechanic will stand on.
