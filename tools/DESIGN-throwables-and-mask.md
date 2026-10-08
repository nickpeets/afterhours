# DESIGN — Throwables (cheers and jeers) and the Mystery Mask

STATUS: RULING ONLY, Nick 2026-10-06. Nothing built, no DDL, nothing run.
This sits beside `DESIGN-filter-rules.md` and departs from it on purpose in
two places (see "What this changes"). Build briefs come later, one feature at
a time, each with its own gates and its own stop-before-production.

## Why

Both features exist for gameplay, not revenue. Nick's ruling: no pricing, no
✦ cost, nothing for sale in this document. If money ever touches these, that
is a new ruling.

## What this changes

`DESIGN-filter-rules.md` and the Filters design (`design/Last Call
Filters.dc.html`) say two things this ruling departs from:

1. **Only the wearer controls what's on his face; the host can only force it
   off.** Throwables add a second, narrow door: the crowd can put a
   short-lived effect on a chair. Everything below exists to keep that door a
   game and not a harassment tool.
2. **Everything a viewer sees on a chair is baked into his one published
   track.** Throwables are not in the track. They are drawn on top of his
   video tile by every device, from server state (see Mechanics).

The wearer's own look, the host's force-off, drop-on-ASK and The Moment are
all unchanged.

## Throwables

### The rule, in one sentence
A crowd member can throw a curated cheer or jeer at a seated chair who has
opted in; it lands on his video tile for about ten seconds and is wiped by
anything the show cares about more.

### Who throws, who gets hit
- **Throwers:** the crowd only, meaning signed-in room members who are not in
  a chair and not the host. (The build brief confirms how the crowd is
  modelled today before assuming this.)
- **Targets:** seated chairs only. Not the host. Not the bench (the host sees
  the bench as silhouettes, so a throw there means nothing to her and
  everything to the crowd; keep it simple and leave the bench out at launch).
- **Opt-in:** a chair agrees to "throwables on" when he takes a seat. Default
  on, stated plainly in the join flow. Off means nobody can hit him, cheers
  included.

### The set (curated, closed list, same as looks)
- **Cheers:** rose petals, heart burst, confetti, spotlight sparkle.
- **Jeers:** tomato splat, cream pie, boo cloud, cartoon cricket.
- Nothing about looks, body, race, gender, sexuality or anything else about
  who he is. Silly, never degrading. Nothing borrowed from other brands or
  characters.

### Jeers hit the glass
Overlays don't follow his face. Splats (tomato, pie) land **on the glass**:
cartoon-style, at a fixed spot on the front of his tile (upper-middle, where
a face usually is), the same spot on every device, then slide or drip off.
No device does face detection. They do not track him if he moves. Screen
effects (petals, confetti, sparkle, boo cloud, cricket) don't need a face at
all. Face-tracked throws are out of scope unless a later ruling asks for them.

### Limits
- **Duration:** about 10 seconds, then it wears off on its own.
- **Ration:** each crowd member gets a small number of throws per show.
  Cheers are more plentiful than jeers. Exact numbers are tuning, not ruling.
- **One at a time, then a cooldown:** a new throw doesn't stack on a live
  one. The chair's cooldown starts when the live throw **expires** (or is
  wiped), and nothing lands on him until it passes. So a chair is hit at
  most once per (throw length + cooldown).
- **Only landed throws cost anything:** a throw refused for any reason
  (cooldown, live throw, shield, opt-out, wrong target) does not use up the
  thrower's ration. A throw that landed and was then wiped early still
  counts.
- **Rations follow the person,** not his seat or membership row: leaving and
  rejoining the room doesn't refill them.
- **Shield:** a chair who earns enough hearts, or a strong answer, is immune
  to jeers for a round. Cheers still land. (How "earned" is measured is a
  tuning question for the build brief.)

### What wins over a throw
- **ASK:** wipes any throw on the asked chair, same instant as the look drops.
- **The Moment:** wipes throws on both faces in the pair, and any new throw at
  either of them is refused until The Moment ends.
- **Host:** can clear any throw on any chair, any time. She also has an
  on/off switch for throwables for the whole show: off wipes every live throw
  and refuses new ones until she turns it back on.
- **His opt-out:** turning throwables off mid-show wipes any throw already on
  him.
- **Leaving the chair:** if he leaves or loses his seat mid-throw, it is
  wiped, same as an ASK.
- **Camera off:** doesn't stop or wipe a throw. It lands on whatever his tile
  shows.
- **His own look:** a throw shows over whatever he's wearing and never
  touches his look or his pick. When the throw ends his look is simply still
  there.

### Visibility
Every device in the room draws the same throw on the same chair: the host,
the crowd, every other chair, **and the target's own self-view**, so he sees
what he got hit with. Everyone also sees it as a cheer or a jeer in the room
feed (named or anonymous is an open question below).

### Mechanics: an overlay on the tile, not a lens
Camera Kit runs one lens per session (applying a lens replaces the prior
one), so a throw done as a lens would knock off his own look for ten
seconds. So throwables are **not** lenses and do not touch his camera or his
published track. A throw is a server event; every device draws the effect as
an animated overlay on that chair's tile.

- **The server is the referee** for ration, cooldown, opt-in, shield and
  expiry. Clients draw from server state and never decide those themselves.
- **Timing comes from the server.** Each throw carries a server start and
  expiry time; every client draws from those, not from a local ten-second
  timer, so devices don't drift. A late joiner sees a live throw for its
  remaining time.
- **Clears come from the same state.** ASK, The Moment and host clear wipe
  the overlay on every device, driven by the server, exactly as they would a
  filter.
- **Reduced motion:** on a device that asks for reduced motion, the throw
  shows as a still badge on the tile (a small tomato, a rose) for the same
  window instead of the animation. No flashing confetti or splats.
- **Recordings and clips:** anything made from published tracks will not
  contain throws. The build brief confirms how Last Call captures clips (if
  at all) and says whether throws need adding there.

## The Mystery Mask

### The rule, in one sentence
A mask hides most of the face until the ASK forces the reveal; at launch the
host hands it out as a twist.

### Three ways it can appear (all approved; launch with the first)
1. **Host twist (launch):** once per round the host can mask one seated chair.
   It replaces his look while it's on and comes off at his ASK.
2. **Chooses mystery (later):** a chair can pick the mask from his own shelf
   instead of a regular look, using his one pick.
3. **Masked bench (later):** everyone waiting on the bench is masked for the
   crowd. The ASK is the reveal.

### Rules
- The mask is a lens. It replaces his look while it's on, which is Camera
  Kit's one-lens rule working for us, not against us.
- **How it ends.** Whichever comes first:
  - **his ASK** — the reveal. The existing drop-on-ASK takes off the mask
    and his look together, so he is bare.
  - **the host lifts it** — a host action of its own, **"lift mask"**, not the
    general force-off. It removes only the mask, and his own look, if he had
    one, comes back. (Force-off still exists and still strips everything,
    mask included.)
  - **the round ends** — the twist is per round, so an un-asked mask comes off
    when the round does, and his look comes back.
  - **he leaves or loses the chair** — it's gone with him.
- The Moment strips it like any filter.
- Throwables still land on a masked chair's tile (a pie on a masked man is
  fine).
- A host-twist mask never spends or changes his pick.
- **The twist is spent once given.** However the mask ends, the host can't
  hand it to anyone else that round.
- **No Camera Kit on his device** (unsupported browser, SDK failure, lens
  won't start): the twist falls back to an app-drawn cover through the
  existing 2D filter pipeline on his own phone, for example a heavy pixelate
  of the whole frame. Same rules, same endings. The build brief confirms the
  fallback runs on iOS Safari before relying on it.

## Launch scope

Ship **throwables (cheers and jeers)** and the **host-twist mask**. Hold
"chooses mystery" and "masked bench" until shows tell us they're wanted.

## Production note (from the "Last Call Sign" pilot, 2026-10-06)

What the pilot showed, and how far it goes:
- **Throwables need no lenses.** Their art is ours (sprites or short
  animations in the app's style). No Snap submission, review or slots.
- **Web Builder:** the one component tested (Image Behind Head) had no
  animation, timing or trigger options. Others in the library ("Falling
  Elements", "Confetti") weren't opened. Whether a Web Builder mask is good
  enough is untested; a face-hugging fit may need Lens Studio or a creator.
- **Publishing friction, observed once each:** a publish used one count from
  a "Non-Lens+" submission counter (20 → 19; whether it resets is unknown);
  the first publish was rejected for a motionless, too-short preview, which
  looks like the tab being hidden while it recorded (confirmed only if the
  re-publish clears as valid); the re-publish produced a new lens ID. Plan
  lenses in batches rather than one at a time.

## Open questions (Nick)
1. Are throws anonymous in the feed, or named?
2. Can a chair turn throwables off mid-show? (Default: yes, as ruled under
   "His opt-out", pending Nick.)
3. Exact ration and cooldown numbers (tuning; defaults welcome from the
   build brief).
4. How the shield is earned: hearts, a host call, or both.
