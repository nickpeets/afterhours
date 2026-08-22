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
was named here as the client substrate the 5s-promotion mechanic would stand
on.  **THAT SUBSTRATE IS GONE AS OF fix/truth-in-bench** — see the NEXT UP
entry below.  The promotion mechanic should stand on `nextOffBench` instead,
which is what actually seats a man.

## NEXT UP — the badge named a man the mechanism never seated (FIXED, PR1)

**AS-BUILT before fix/truth-in-bench, SOURCE(client) at HEAD 7ec8e58:** the
NEXT UP badge and the `is-leading` halo were derived from HEARTS — whichever
of the three rendered men held a unique non-zero top score wore it.  The
mechanism that actually empties the bench is `nextOffBench()`, which orders by
`line_position` and reads no hearts at all.  The two could name different men
indefinitely: a loud man wore the badge all night while a quieter, earlier man
took every chair.  It was additionally SILENT on a tie, on a lone bencher and
on an all-zero bench, because it demanded a unique non-zero leader — so the
room's only published claim about who was next was absent through most of a
normal show and wrong through the rest.

**AS-BUILT now:** the badge is lane-bound to the man `nextOffBench()` names.
The lone-man / tie / zero conditions are DELETED rather than ported: under a
globally monotonic column they are not merely wrong, they are irrelevant, and
carrying them forward would imply they still gate something.  When the named
man holds no rendered lane — the line is longer than three — NO badge lights,
with no fallback and no nearest-lane guess.  Gates 58 and 59.

## OUT OF SCOPE, logged not fixed (fix/truth-in-bench)

Three things were found while fixing the above and deliberately left alone.
They are recorded here so that "we looked at this code and shipped" is not
mistaken for "this code is clean".

- **`autoSeatFromLine` — unsorted `line[0]`.**  SOURCE(client), index.html
  3649-3652: it filters `role=="line"` rows out of `activeRows` and takes
  `line[0]`.  `activeRows` returns rows in arbitrary order, so this seats an
  arbitrary man, not the longest-waiting one — a second ordering of exactly
  the kind `nextOffBench` exists to remove.  It is the classic-room path and
  gate 46's static slices do not reach it, which is why it has survived; gate
  46's header now names it as out of scope instead of implicitly denying it.
  Not fixed here because it is a seating-behaviour change outside this PR's
  ruled scope.
- **`is-surging` — dead CSS with no setter.**  SOURCE(client): the rule exists
  (index.html 612-616) and the class is *removed* on the empty-lane branch
  (2908), but nothing anywhere sets it.  The SURGING vocabulary in the
  stylesheet comment describes a feature that was never wired.  Left as-is:
  deleting it is a design question about whether a rate badge is still wanted.
- **Dead locals `tallies` / `leadN`.**  SOURCE(client), index.html 2847-2848:
  computed on every bench render and read by nothing.  They were the hearts
  rule's working set.  Left in place deliberately this PR so the NEXT UP diff
  is exactly the behaviour change and nothing else; they are safe to delete on
  sight in any later commit that touches this block.

## PROMOTION CARD — removed, no substrate ever existed (REMOVED, PR2/fix/dead-surfaces-out)

**PROVENANCE NOTE:** the removal was briefed as going into "DESIGN-DIFF's existing
REMOVED PENDING SUBSTRATE section."  No section carries that exact title in this
document — the nearest analog is HALF-BUILT SURFACES above, which already named
the promotion mechanic's substrate as gone ("Related, banked by the first version
of this doc..."). Filed here as its own section instead of silently inventing a
title that was not actually there, and cross-referenced from HALF-BUILT SURFACES.

**AS-BUILT before fix/dead-surfaces-out, SOURCE(client):** a full "chair rising"
UI — a 0:05 countdown, a RISING pill, and "tap a bench seat to override" copy —
rendered in all three chair slots, gated on `CURRENT_ROOM?.promoting`.  That field
is written nowhere: zero server call sites, and it is not among the columns the
backend double (or, so far as this repo can verify, production) carries on a room
row.  The card, and everything that lit it (`promo`, `isPromo`, the `is-promo` and
`is-promoting` classes, four CSS consumers of those classes, and three copy
branches keyed on `promo` — the bench hint, the watchbar text, and the phase-chip
label), never rendered for anyone, ever.

**REMOVED:** the three `<div class="chair__promo">` blocks (clock + who + sub,
one per seat) and their `0:05` literals; the `promo`/`isPromo` variables; the two
`setText` calls that targeted the card's who/sub spans; the `is-promo` classList
toggle (folding `is-empty`'s condition down to just `!c`); the `is-promoting`
root toggle; the `promo`-keyed branches in the bench-hint note, the watchbar
text, and the phase-chip label; and the CSS — `.chair__promo`/`.chair__promo-
clock`/`.chair__promo-who`/`.chair__promo-sub`/`.chair.is-promo` and its four
consumer rules (the gold phasechip selector, the hostctl-hide selector, the seat
z-index selector, and the blind-bench amber-lane rule).

**JUDGMENT CALL — scope was wider than the literal brief.**  Taking only the
markup and the three setText calls, and leaving `promo`/`isPromo`/`is-promo`/
`is-promoting` alive, would have left CSS rules bound to classes JS would then
never set again — an orphaned surface in the opposite direction from the one
this PR exists to close.  The full reachable chain came out together.  Left
alone, deliberately: the `:not(.is-promo)` guards inside two compound selectors
that gate real features (`.lc-hearttap` visibility, the CHOOSING-beat `.hostctl`
rule) — touching a live selector list to shave a now-provably-dead token was
judged not worth the risk to an active rule; and `is-promoting-out` (the bench
lane "amber trail" CSS, same disease as `is-surging` — zero JS setters — but not
named in this PR's scope), logged fresh below instead.

**WHAT WOULD BE NEEDED TO BRING IT BACK PROPERLY:** a server-side `promoting`
fact — seat, candidate user id, and an absolute deadline timestamp — written by
whatever engine step decides a bench man is rising, and emitted to every client
so the countdown is ONE shared clock rather than a per-client `0:05` literal.
The client would read the deadline (the same pattern `phase_deadline` already
uses for section timers) rather than hardcoding a duration, so a page that
attaches mid-countdown shows the true remaining time instead of a fresh 5
seconds.  Until that fact exists and is written, any card is decoration.

## OUT OF SCOPE, logged not fixed (fix/dead-surfaces-out)

- **`is-promoting-out`** — SOURCE(client): the CSS rule exists (the bench-lane
  "amber trail," under the "K — bench promotion" comment) and nothing anywhere
  sets the class.  Same disease as `is-surging` before this PR removed it, but
  it was not named in this PR's scope, so it was not touched.  Safe to remove
  on sight in a later pass the way `is-surging` was removed in this one.
- **`:not(.is-promo)` guards** — SOURCE(client): two compound selectors
  (`.lc-hearttap` visibility, the CHOOSING-beat `.hostctl` "TAP TO ASK" rule)
  still exclude `.is-promo`, a class nothing sets anymore after this PR.  The
  guard is now a provable no-op.  Left alone because both selectors gate real,
  live behavior on other classes (`is-host`, `is-empty`, `is-strip`, `is-asked`)
  and editing a live selector list to remove a dead token was judged riskier
  than the clutter it leaves behind.
## EVENT PAYLOAD ACTOR CONVENTION (fix/pass-member-actor, 2026-08-22)

pass_member now emits actor:'host' in its event payload (2026-08-22).
Convention is now explicit across both pass paths: pass_member emits
actor:'host', step_down emits actor:'self'.  DDL-only change, no client
code touched.  (This `actor` is a `jsonb_build_object` payload key on the
room_events row -- unrelated to the broken `actor` COLUMN name logged above
under `claim_open_chair`.)
