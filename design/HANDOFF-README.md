# Handoff: Last Call — Complete App

_Rev 5 — adds the Moment (paid one-on-one beat), which supersedes the fixed floor hold._

## Overview
**Last Call** (lastcall.love) is a mobile-first live video dating game show. One
**host** ("contestant") broadcasts; up to three **suitors** occupy chairs with shot
clocks; a **line** of suitors waits; **spectators** chat, send hearts and gifts, and
earn credits. This package covers the whole app: the pre-room pages, the live room in
every role, the paid one-on-one Moment, the episode engine that turns it into a game,
and a POV storyboard.

## About the Design Files
These files are **design references created in HTML** — prototypes showing intended look
and behavior, **not production code to copy directly**. Recreate them in the target
codebase's environment (React, Vue, SwiftUI, native) using its established patterns. If
no environment exists yet, choose the framework and implement there.

**`lastcall-theme.css` is the exception** — it is written as integration-ready CSS keyed
to the app's existing IDs and classes. Drop it in, or translate it wholesale.

## Fidelity
**High-fidelity.** Final colors, type, spacing, states and interaction behavior. Every
measurement was verified against the rendered DOM.

---

## HARD CONSTRAINTS (non-negotiable)
1. **Dark base is mandatory** — live video sits on it.
2. **All text over video** carries `text-shadow: 0 1px 4px rgba(0,0,0,.95)`. Assume a
   worst-case bright, busy frame behind every label.
3. **Touch targets ≥ 44px.** A transform on a button scales its hit box — put decorative
   transforms on an inner glyph element, never the button. (This bit us twice: a
   `scaleY(.82)` heart silently became a 36px target.)
4. **Mobile-first 390×844**; desktop is a centered 520px column.
5. **Nothing occludes her face zone** — the center-upper third of the video.
6. **`#rt_hero` never reflows** — not for the keyboard, not for chat volume, nothing.
7. **Safety (🛡) is always visible, always first in the rail, same position in every role
   and every phase** — including keyboard-open and during spotlights. Never credit-gated.
8. **Single source of truth for content.** Never inject text or glyphs via CSS
   `content:` that the markup already provides — it double-renders. Decorative marks are
   real elements (`.cclock__pause`, `.lc-floor__sep`, `.lc-strip__*`).
9. **⛨ (U+26E8) has no glyph** in common stacks and renders as tofu. Use **🛡** (U+1F6E1).

---

## THE ROOM ARCHITECTURE — panel + bench (current default)
A **2×2 playing surface** (host top-left + three chairs, 168px cells) with **three
square 116px bench cells** directly beneath it. Seven faces, two clearly-ranked tiers,
every face carrying a live heart count.

**Hard rule: the playing surface is never more than 4 cells and the bench never more
than 3.** The failure mode in crowded live rooms is not headcount — it's a flat grid
where nothing is ranked. Nine equal tiles are wallpaper; four big scored cells over
three small scored cells is a hierarchy you read in one glance.

**Two lamps, not two badges.** At equal cell size a ring is a label and light is a
place, so her cell is lit **warm** (rose-gold key from upper-left, warm floor bounce,
and a glow that spills *past* the frame) while all three chairs share one **cool**
flat teal key, contained inside the frame. The spill is the tell: no chair ever lights
outside its own border, and a suitor's own cell stays cool even in his view — he
doesn't get to borrow her light by sitting down.

**Conventions taken from live multi-guest reference:** per-cell heart chips in the
upper-left (the crowd already reads a grid as a leaderboard), name plaques as
bottom-edge pills with inline status icons, host tag + ring on the top-left cell,
grid density adapting to occupancy (one suitor → a single tall row, not two dead
quadrants), and **the empty seat rendered as the join CTA itself** — "TAKE THE CHAIR ·
she picks from the bench" — rather than a dashed placeholder. Camera-off in a chair
renders as our styled silhouette, never a hollow avatar bubble.

**The teal "+" means joinable and only that.** It never appears on a chair that is
occupied-but-muted (one-line strip treatment) or mid-promotion (gold countdown). A
join glyph on a reserved seat tells the room the opposite of the truth.

**Spotlight breaks the quad to a two-up split** — her left, target right, both 305px,
the interview shot — with the other two chairs collapsed to a muted 46px strip so
nobody vanishes. One `grid-template` interpolation drives it, so video never pops.
The bench does not move and keeps earning throughout.

### The bench replaces the draft storm
The old 15-second reveal storm existed to manufacture stakes for a dark line: reveal
four strangers, panic-tap, done. That's a **burst**, and bursts are what make a live
room feel busy and empty at once — ninety seconds of nothing, fifteen of noise.

A permanently scored bench replaces the burst with a slow build. Someone joins, takes
a bench seat, and starts earning immediately, so by the time a chair opens the crowd
has been invested for minutes. **The promotion becomes a payoff instead of an event:**
chair opens → she gets **5 seconds** to override → the bench leader rises on the
camera-flip → the next in line drops onto the bench. No modal, no countdown takeover.

What survives from the storm: she still **picks blind** (the bench renders to her as
silhouettes with live counts, never faces), hearts are still the crowd's only signal
that reaches her, and **strike pips** still ride each bench card. Only the modal is gone.

*Risk to watch:* a permanent bench means three people wait publicly, which is a worse
seat than an invisible queue — you can be visibly ignored. The three-strike rule caps
how long anyone rots there, and the leader carries a NEXT UP tag so waiting reads as
progress. If bench retention tests badly, rotate it every round instead of on promotion.

## THE VISIBILITY MODEL

| Can see → | Host | Chairs | Bench (front 3) | Rest of line |
|---|---|---|---|---|
| **Host** | — | full | **silhouettes + live ♥** | count only |
| **Chairs** | full | full | **faces + ♥** | count only |
| **Room / spectators** | full | full | **faces + ♥** | count only |

The room and the chairs see the bench in full; **she sees the same three as silhouettes
with live counts and never faces.** Hearts are therefore the only signal that crosses to
her, and the crowd effectively casts the show — continuously, not in bursts. Behind the
front three, the queue is just a number to everyone.

**Mutes layer on top of visibility, never under.** A spotlight or a paid floor hold blurs
a chair for *everyone* at once, and a blurred chair's heart count hides — you can't back
who you can't see. **The bench is never blurred**, or the crowd loses its job.

### A chair can empty itself — four different answers
The server cannot tell a dropped signal from a rage-quit for the first few seconds, so
every case starts the same way and diverges on what happens next.

| How it empties | Hold | Cost |
|---|---|---|
| **Connection drops** | 15s, his shot clock frozen | **None.** Back inside the window and he resumes exactly where he was, hearts intact. A tunnel is not a forfeit. |
| **He closes the app** | 15s (indistinguishable at first) | **Out for the night.** Forfeit — removed from the line, cannot rejoin. Deliberately harsher than losing a promotion: bailing mid-round costs her a round. |
| **He was the one answering** | spotlight cancels at once | **Question returned to the deck unused.** Don't run the clock down on an empty cell, and don't burn her material on someone who left. Open floor resumes early. |
| **He taps LEAVE CHAIR** | none — he told us | **One strike**, keeps his place in line. The honest exit costs least. |

Two design rules inside that:
- **The held cell reads RECONNECTING in amber, never "TAKE THE CHAIR."** She didn't pass
  him, and the room must not be told she did. The teal "+" still means joinable only.
- **The show does not pause.** Her round continues around the held cell — stopping it
  would punish everyone present for one person's exit.

### The line is FIFO, and strikes cost you it
Order, never popularity. The three bench seats are simply whoever queued first, and a
promotion **never reorders them** — hearts decide who gets *seated* off the bench, not
where anyone stands. When one rises the rest **shift left** one slot (a translate, never a
re-sort) and the next in line drops onto the bench.

Lose a promotion → keep your place, take a strike. **Third strike → removed from the line,
cannot rejoin tonight.** That stops a permanent loser clogging the front of a FIFO queue,
and it gives the crowd a reason to save someone on their last life (`.is-lastlife`
reddens the pips and appends "· LAST LIFE"). Server owns strike counts and removal.

---

## THE MOMENT — paid one-on-one beat (replaces the floor hold)
Twenty seconds where a chair buys the host's undivided attention **without leaving the
quad.** The fixed 15s/10✦ floor hold described elsewhere in this package is retired —
two overlapping paid mutes in one phase was one too many, and this version fixes the
floor hold's real flaw: it broadcast the purchase to the whole room.

**What actually happens:** the host and the buyer each independently apply
`updateReceiveSettings` on the *other two* chairs — those two blur and mute, but only
on the host's and the buyer's own feeds. Every other chair, the bench, and the crowd
keep the room exactly as it was: full audio, full video, no idea who bought anything
beyond one ambient signal.

- **One per show, 20 seconds, open floor only.** A token, not a ✦ line-item — spent
  once, gone for the night.
- **The only room-wide tell is a header pill: "THE FLOOR IS TAKEN 0:08."** Amber (the
  paid/credit hue), ambient rather than an alert, and it never names the buyer.
- **She can decline for free.** An ✕ is live from second zero — refunds his token,
  tells him nothing but that it ended. Without it, a stranger holds her attention for
  ten seconds she can't opt out of, which is the exact dynamic the app exists to avoid.
- **At 0:10 the control flips to END EARLY** (his call, no refund either way) — a
  decline is a refusal, an end is a wrap.
- **Lock at T-20 remaining in the phase, with a queue-for-next-floor offer**, never a
  truncation — selling 20 seconds and delivering 6 is a refund conversation, and letting
  a purchase override the show's own clock breaks the rule everything else rests on.
  Round 3's open floor (90s deliberation) has no next phase to queue into — arm it
  early there or lose it.
- **Both mutes are real and independent.** One can succeed without the other; if either
  fails to apply in time, drop the moment and refund rather than run it half-blocked.

**Superseded:** the floor-hold button, popover and room-wide mute in
`Last Call Room.dc.html` / `lastcall-theme.css` (`.lc-floorbtn`, `.lc-floor__pop`).
The blur/mute visual carries forward — scoped to two viewers instead of broadcast to
the room — but the entry point needs replacing with the Moment's own (see
`Last Call Moment.dc.html` frame 0, the `✦ MOMENT` CTA in the same slot as every other
primary room action).

---

## THE EPISODE LOOP
```
PRE-SHOW → [3 chairs fill] → SHOW START (3s) →
R1 SPOTLIGHT 30s → OPEN FLOOR 45s →
R2 SPOTLIGHT 30s → OPEN FLOOR 45s →
R3 SPOTLIGHT 30s → DELIBERATION 90s →
DECISION ─ KEEP ONE        → the win → finale → backstage
         ├ PASS ONE        → 1 blind refill → fresh 3-round cycle
         ├ CLEAR THE DECK  → confirm → 3 blind refills → fresh cycle
         └ WALK AWAY       → confirm → "walked alone" finale
```
**The server owns every phase timer, every transition, and every consequential outcome**
(who is seated on expiry, floor-hold duration, shot clocks). The client renders state and
sends intent. The host can skip any timed phase (`.lc-skip` — "⏭ HEARD ENOUGH").

### Rules that carry design weight
- **KEEP is the win.** There is no banked-kept state; the verdict happens once, in the
  decision tray after round 3. So during rounds a chair is a **target**, not a judgement
  — `.hostctl` is a "TAP TO ASK" affordance and **ASK** is her composer verb.
- **Answering never eats audition time.** During a spotlight the target's shot clock
  pauses along with the rivals'. Only the 30s answer clock runs.
- **Money can never eat an answer.** Gifts and the Moment are disabled during
  spotlights; the Moment works in OPEN FLOOR only.
- **The floor hold is superseded by the Moment** (see above) — one 20s paid
  one-on-one per show, not a repeatable per-turn hold; the quad stays intact and only
  the host and buyer see the other two chairs mute and blur.
- **Promotion, not a storm.** A chair opens, the bench leader is already known, she gets
  5 seconds to override, and he rises on the camera-flip. No modal state, no interruption.
- **Per-chair keep/pass does not exist.** The verdict happens once, in the decision tray
  after round 3, so during rounds a chair is a **target**, not a judgement — `.hostctl` is
  a single "TAP TO ASK" affordance. There is deliberately no `.hostctl--verdict`: a
  layout exploration must not reinstate verdicts just because bigger cells leave room.
- **Two indicators can run at once on the bench.** Amber **NEXT UP** (a standing) and rose
  **SURGING** (a rate of change) light *simultaneously* — a single winner is a result, a
  leader plus a challenger is a race. Rose pulses at .62s against amber's 1.4s; the >2×
  split is load-bearing, because rose has to read as *accelerating*, not merely also lit.
- **Refill has exactly two shapes:** one seat (pass one) or all three (clear the deck).
  There is no partial fill, so "n of 3" framing appears only in clear-the-deck.
- **No free-typed questions anywhere.** She picks decks at GO LIVE and taps mid-show.
  Every question is authored and vetted by you — a content feature that is really a
  safety feature.
- **Crowd credits (✦).** Hearting someone on deck is a bet: +15 ✦ if they're seated,
  +40 ✦ if they win the finale. Spend on unblur / skip the line / gifts. **Her safety
  tools are never purchasable.**

---

## SCREEN INVENTORY

### `Last Call Lobby.dc.html` — everything before the room
| Frame | Notes |
|---|---|
| L0 Log in | Email + password only |
| L0b Create account | Face verification framed as a promise, not a hurdle |
| L1 Lobby | **First screen after login.** 210px full-bleed live feeds, not thumbnails. Phase chip, 👁, ♥ ride on the video; 3-bar seat strip (teal open / pink taken / grey opens-next-round) answers "can I get on?" before you tap. CTA is **TAKE THE SEAT** or **WATCH** by state. GO LIVE is a fixed bar — never a card in the feed, never scrolls away. |
| L2 Sort & filter | Sort is one choice, filters are the rest, live result count |
| L3 Nothing live | Launch-night state: get pinged, or be the room |
| L0c Radius | **GATED — Phase 2.** See below. |

**The radius gate.** Day one there won't be 14 rooms within 25 miles, and a radius filter
over an empty map reads as "nobody is here" — blaming the filter for a supply problem.
Ship with distance **shown but not filtered**: sign-up goes straight to the lobby, cards
display miles, the WITHIN control is replaced by an explainer. Switch on per-market at
~10 concurrent rooms via `html[data-radius-filter="on"]`.

### `Last Call Room.dc.html` — the live room, six states
Same DOM, one root class each: `.is-host` · `.is-spectator` · `.is-suitor` ·
`.is-drafting` · `.kb-open` · `.is-empty`.
- **Host** — chairs in full, line as a **count only**. TAP TO ASK per chair; ASK in composer.
- **Spectator** — one hollow heart centred at the foot of each chair (no chip, no fill,
  nothing occluding his face); fills and blooms on press. JOIN THE LINE in composer.
- **Suitor** — her video still full-bleed behind him. Row weighted to him (1.4fr/136px
  vs .72fr/104px bottom-aligned). 🔇 TAKE THE FLOOR second in his rail.
- **Draft** — blind silhouettes + climbing tallies, 15s. Full five-POV treatment lives in
  `Last Call Draft.dc.html`.
- **Keyboard** — video and chairs do not move a pixel.
- **Empty** — first-run; the 3-up grid collapses to one dashed strip.

### `Last Call Episode.dc.html` — the game engine
S0 build your deck · S0b stage the opener · S0c pre-show room POV · S1 show start ·
S2/S2b spotlight (host + spotlighted suitor) · S3 question drawer · S4 open floor ·
S5/S5b decision tray + "she's deciding" · S6/S6b blind refill (host blind + crowd).

### `Last Call Draft.dc.html` — the storm, five POVs + edge states
**Room** (faces revealed, fat rapid-fire hearts with ripple feedback, "SHE CAN'T SEE THEM
— SHOW HER") · **Host** (shapes only, animated tallies, AHEAD vs CLOSING, "THE CROWD IS
TELLING YOU") · **Candidate** (own card lit rose, tally climbing, camera-flip if picked) ·
**Chair** (read-only, dimmed — competitors get no vote) · **During play** (same strip
shell, count only, for contrast).

**Edge states, with the reasoning:**
- **0 in line** → no storm, no stall. Show continues two-up; the open chair becomes a
  standing recruiting slot and the next to queue is seated on a mini-reveal.
- **Exactly 1** → skip the 15s window entirely, 2s mini-reveal. Faking a vote with one
  option teaches the crowd their hearts don't matter.
- **Tie at 0:00** → server picks randomly among leaders **and says so on screen** ("DEAD
  HEAT — HOUSE PICKS"). A crowd that can't see the tiebreak assumes the house cheated.

### `Last Call Storyboard.dc.html` — one episode, three POVs
Six beats × host/chair/room. Read a row to compare the same second across roles; read a
column to live one night as one person. Beat 6 is the storm.

### `Last Call Moment.dc.html` — the paid one-on-one beat
Five frames: the **✦ MOMENT** trigger on a seated chair's own screen before anyone buys,
the host's view for the first 10s (decline live) and after 10s (end-early), the buyer's
own view, and the one shared view for every other chair/bench/crowd member (room
unaffected, one header pill). Plus the indicator's three rejected alternatives and the
T-20 lock ruling.

---

## LAYOUT ARCHITECTURE (the room)
**PANEL (current default)** — `[data-view="panel"]`
```
.lc-room
├── .lc-top               ‹ · wordmark · phase+dots · 👁 · ✦   (never wraps)
├── #rt_chairs            grid 1fr 1fr, 168px cells — host warm, 3 chairs cool
├── #rt_line              bench header + #lineitems (3 square 116px cells)
└── column (flex:1)
    ├── #chatstrip        flex:1, min-height:0, NO cap  ← sole flexible child
    └── #inputbar         no margin-top:auto
```
Chat must be the **only** flexible child here. A `max-height` cap on chat, or
`margin-top:auto` on the composer, strands surplus column height as a dead band — that
opened a 120px void under the bench twice.

**STAGE (host-backdrop, still supported)**
```
.lc-room                  position:fixed; inset:0; overflow:hidden
├── #rt_hero              absolute; inset:0; object-fit:cover; z-index:0  ← never reflows
├── ::before / ::after    top scrim 150px · bottom scrim 56% (max .8 alpha)
├── .lc-top        z:3    ONE row: ‹ · wordmark · spacer · LIVE · phase+dots · 👁 · ✦
├── #rt_host       z:3    left:13px; top: safe-area + 68px
├── .lc-rail       z:3    right:13px — 🛡 · (🔇 suitor) · 🎁 · ♥count, all 44px
└── .lc-overlay    z:2    bottom-anchored stack, gap 9px, padding 0 12px
    ├── #rt_chairs        3 tiles @136px, video fills tile, controls overlay inside
    ├── #rt_line          header + #lineitems (4 on deck + next-up stack)
    ├── #chatstrip        max-height min(26dvh,138px), fade mask, overflow hidden
    └── #inputbar         field + role CTA (ASK / JOIN THE LINE / ↩ LEAVE CHAIR)
```
`#chatstrip` keeps its global `max-height: min(26dvh, 138px)` for STAGE, where
`.lc-overlay` is `position:absolute` with a bottom offset and **no height** — `flex:1`
in an auto-height column has no free space to distribute, so chat would become
content-sized, uncapped, and grow up through her face zone. Only
`[data-view="panel"] #chatstrip` sets `max-height:none`.

**`.lc-top` must not wrap** (`flex-wrap:nowrap; overflow:hidden`) — adding the phase chip
pushed it past 390px and items spilled into the chairs row. The chip is terse ("R2 ●●○").

**Chairs sit at ~40% height, not pinned top or right.** A full-width row at the top cuts
through her face zone; a right column leaves no room for controls. Bottom-anchored keeps
the upper third clear and gives THE LINE a fixed home above chat.

**Both role CTAs live inside `#inputbar`.** Floating them over the video cost the hero a
row and made the screen read as two rooms. The send arrow was removed — Enter sends.

### Keyboard
`viewport-fit=cover`; **do not** set `interactive-widget=resizes-content`.
```js
const vv = window.visualViewport;
const sync = () => document.documentElement.style.setProperty('--lc-kb',
  Math.max(0, innerHeight - vv.height - vv.offsetTop) + 'px');
vv.addEventListener('resize', sync); vv.addEventListener('scroll', sync); sync();
input.addEventListener('focus', () => room.classList.add('kb-open'));
input.addEventListener('blur',  () => room.classList.remove('kb-open'));
```
Only `.lc-overlay` shifts. In `.kb-open`: chat → 96px, chair video → 58px,
`#rt_endshow` hides, line items go horizontal. **`.lc-rail` must NOT hide** — typing is
exactly when someone may need to report.

---

## DESIGN TOKENS

### Palette
| Token | Value | Use |
|---|---|---|
| `--midnight` | `#080b20` | app field |
| `--set` | `#111634` | panels |
| `--purple` | `#241a52` | secondary surface |
| `--riser` | `#3b2a72` | PASS fill, device rim |
| `--neon-pink` | `#ff2d8f` | **her, and anything she has chosen** |
| `--neon-teal` | `#2de3d0` | show machinery: clocks, phases, mechanics |
| `--lilac` | `#b9a8ff` | **safety and moderation only** |
| `--gold` | `#ffd6e9` | the crowd's voice: hearts, ✦ credits, the storm |
| lane amber | `#ffc24d` | draft: **LEADING / AHEAD** — a standing |
| lane rose | `#ff7ab8` | draft: **SURGING / CLOSING** — a rate of change, and strike pips |
| last life | `#ff4d6d` | third-strike warning only |
| `--video` | `#141a3a` | video well |
| `--cream` | `#f2f0ff` | — |

Semantics: **pink = her and her choices · teal = the show · gold = the crowd · lilac =
safety.** A calm safety cue must never read as an alarm.
Four alternate skins (`cartridge`, `meter`, `sunset`, `primetime`) ship as
`[data-skin]` blocks; `neon` is default.

### Typography
| Role | Font | Spec |
|---|---|---|
| Wordmark | **Monoton** | 10–13px in-room / 30–44px title cards, `letter-spacing:.04em`, neon bloom |
| Display | **Baloo 2** 800 | 13–46px. **At 22px+ with `overflow:hidden` use `line-height:1.4`** — Baloo's ink box is ~30px and 1.1 clips ascenders and descenders on both axes (`overflow-y:visible` is not an escape; CSS forces it to auto). |
| Body / UI | **Archivo** 400/600/800 | 9–15px, body 14/1.5 |
| Clocks, counts, kickers | **Azeret Mono** 700 | 7–26px, `letter-spacing:.06–.24em` |

Neon bloom (display only, never body):
`text-shadow: 0 0 10px rgba(255,255,255,.55), 0 0 24px rgba(255,45,143,.95), 0 0 60px rgba(255,45,143,.5)`

### Radii & spacing
Chair 16px outer / 12px inner · hero 24/18 · lobby card 22/19 · pills 10–14 ·
composer 24 · rail 50% · device frame 42. Overlay gap 9 · chair gap 7 · rail gap 10 ·
padding 12–13.

### Video frames
- **Hero** — full-bleed, no border. Its "frame" is the two scrims plus the LIVE chip.
- **Chair in play** — `1.5px solid #2de3d0`, `0 0 12px rgba(45,227,208,.45)`
- **Chair kept / spotlit** — `2px solid #ff2d8f`, `0 0 22px rgba(255,45,143,.85)`, grows
  to 1.56fr / 160px while rivals recede to .72fr / 104px bottom-aligned
- **Chair empty** — `1.5px dashed rgba(45,227,208,.45)`, `background rgba(6,8,24,.32)`
- Video fills the whole tile; the verdict floats **inside** it on a 62px bottom scrim.
  A control shelf below the tile was costing 49px of a 127px band.
- Left column is **him** (name, hearts under it); right column is **the show** (clock,
  KEPT under it). Same line, opposite edges.

### Buttons
Glass, not slabs — video reads through the composer row.
- `#rt_endshow` / `.lc-skip`: `rgba(45,227,208,.24)` + `1.5px solid rgba(45,227,208,.85)` + `blur(10px)`
- `#rt_joinline` / `.lc-ask`: `rgba(255,45,143,.34)` + `1.5px solid rgba(255,255,255,.9)` + `0 0 30px` halo
- `.hostctl`: dashed pink "TAP TO ASK", min-height 32px (the strip is the target; the tile is tappable)
- Press: `scale(.93–.96)` on icons, bevel-collapse on slabs. ✓ brighter than ✕ — the
  affirmative gets the shine; declining is a quiet switch, not an alarm.

### Animation
`beat` heart pulse 2.4s · `tally` LIVE dot 1.8s · `mic` live-mic bars .9s ·
`lc-reveal` camera-flip .62s (the draft's signature beat) · `lc-stepup` .34s (next in
line entering the window) · `lc-shiftleft` .3s (FIFO shift when a seat is taken) ·
`lc-surge` 1.4s amber / .62s rose · `lc-ripple` .5s (heart tap) · `lc-strikeout` .5s.
Progress bars `transition: width 1s linear`.
**`@keyframes lc-surge` must read `rgba(var(--lane-soft), …)`** — an animated
`box-shadow` overrides the element's own for the entire cycle, so a hardcoded hue there
silently repaints every lit card the same colour.
All wrapped in `@media (prefers-reduced-motion: reduce)`.

---

## ID / CLASS CONTRACT
Preserved from the existing build so current JS drops in unchanged:

`rt_hero` · `rt_chairs` · `.chair` · `.cclock` · `.kepttag` · `.hostctl` · `rt_line` ·
`lineitems` · `chatstrip` · `.floatmsg` · `inputbar` · `rt_joinline` · `rt_endshow` ·
`rt_title` · `rt_host` · `rt_hostbadge` · `chip`

**Panel requires one DOM move, additive:** `#rt_hero` goes from a sibling of
`.lc-overlay` to the **first child of `#rt_chairs`**, wrapped in `.chair.is-host`. Both
layouts then read one tree and the JS never learns which view is on — STAGE styles
`.chair.is-host` as `position:fixed; inset:0; z-index:0`; PANEL leaves it in grid flow.
`.chair · .cclock · .hostctl · #rt_line · #lineitems · #chatstrip · #inputbar ·
#rt_joinline` are untouched.

One behavioral change: **`#rt_title` is `display:none` in-room.** JS keeps writing to it
(it still labels the room in the lobby list and the tab title), but the room name is
redundant on screen — `#rt_hostbadge` names the room by naming her.

New hooks: `.lc-top` `.lc-overlay` `.lc-rail` `.lc-safebtn` `.lc-floorbtn` `.lc-floor*`
`.lc-question` `.lc-rounds` `.lc-phase` `.lc-ask` `.lc-skip` `.lc-drawer*` `.lc-qcard`
`.lc-decide*` `.lc-draft*` `.lc-silhouette` `.lc-nextup` `.lc-hearttap`
`.lc-hearttap__glyph` `.lc-selfview` `.chair__name` `.chair__hearts` `.chair__feed`
`.cclock__pause` `.lc-card*` `.lc-golive` `.lc-gated*` `.lc-strip__*` `.lc-lane`
`.lc-lane__badge` `.lc-lane__tap` `.lc-lane__pips` `.lc-lane__heart` `.lc-lane__n`
`.is-leading` `.is-surging` `.is-mine` `.is-lastlife` `.is-out` `.is-shifting`
`.is-entering` `.is-storm`

**Known gap:** the Episode and Storyboard mockups hard-code their styling inline and do
**not** carry the `#rt_chairs` / `#chatstrip` / `.chair` hooks that
`Last Call Room.dc.html` does. The room file is the reference implementation for the
contract; the episode frames are visual specs for the phases. Wire the phase states by
hand, or add the hooks first and let `lastcall-theme.css` bind. **The Moment is in the
same state** — inline-styled, no theme.css hooks yet. Its blur/mute visual can reuse
`.chair__feed.is-dimmed` scoped to two peers instead of the whole room; the entry-point
button and header pill need new hooks, and the old `.lc-floorbtn`/`.lc-floor__pop` hooks
should come out once it ships.

---

## STATE MANAGEMENT
| Variable | Drives |
|---|---|
| `role` | `.is-host` / `.is-spectator` / `.is-suitor` |
| `phase` | `.is-showstart` / `.is-spotlight` / `.is-asking` / `.is-mingle` / `.is-deciding` / `.is-drafting` |
| `round` | 1–3, drives `.lc-rounds__dots` |
| `chairs[3]` | occupant, hearts, clockMs, clockPaused, muted, isTarget |
| `spotlight` | target chair, question, answer clock (server-owned) |
| `line[]` | on-deck 4 (photo, name, hearts) + remaining count |
| `drafting` | open chair index, 15s deadline, front-four ids in join order, live tallies, leader id, surger id, mode: single \| deck |
| `strikes{}` | per-line-member strike count 0–3; 3 = removed, cannot rejoin tonight |
| `chairHold` | per-chair 15s reconnect deadline + reason (drop \| quit \| left); server-owned |
| `moment` | active, remaining ms, buyerId, declinedAt — server-owned; drives the
header pill and both peers' `updateReceiveSettings` calls. Supersedes `floorHold`. |
| `credits` | ✦ balance; gates `.lc-floor__go` (`:disabled` when short) |
| `kbInset` | `--lc-kb` from visualViewport |
| `viewers`, `heartTotal` | top bar 👁, rail ♥ |

## Assets
No image assets. All iconography is Unicode: `♥ ✕ ✓ 🛡 🎁 🔇 🎬 👁 ✦ ‹ ❙❙ ⏭ ⌕ ⇅ ◈ ◔ ⤢ ↩`.
Video and avatar areas are placeholder gradients — replace with real streams and profile
photos. Fonts: Google Fonts — Monoton, Baloo 2 (500–800), Archivo (400–800),
Azeret Mono (400–700).

## Files
| File | What it is |
|---|---|
| `lastcall-theme.css` | **Integration-ready CSS.** Five skins as custom properties + every component keyed to the IDs above. Set `data-skin="neon"`. |
| `Last Call Lobby.dc.html` | Pre-room pages (6 frames) |
| `Last Call Room.dc.html` | Live room, six states + the visibility matrix |
| `Last Call Episode.dc.html` | The game engine, 11 frames |
| `Last Call Walkthrough.dc.html` | **Start here.** Ten real screens in order, login → show end, weighted to the mid-round exit and the promotion (steps 5–8), plus the full walk-out rule table |
| `Last Call Panel.dc.html` | **Current room default:** panel + bench, 6 frames (spectator, host-blind, spotlight split, promotion, empty seats, adaptive 2-up) + the argument for killing the storm |
| `Last Call Draft.dc.html` | Superseded storm exploration — kept for the edge-state reasoning (0 in line, exactly 1, dead heat) |
| `Last Call Storyboard.dc.html` | One episode × three POVs, 18 frames |
| `Last Call Moment.dc.html` | The paid one-on-one beat — supersedes the floor hold in `Last Call Room.dc.html` |
| `Last Call Panel Deck.dc.html` | Presentation deck of the panel + bench room (deck-stage, PPTX-ready) |
| `Last Call.dc.html` | Earlier full-app pass: finale (won / alone), winner capture, closing card, backstage, contact exchange, private thread |
