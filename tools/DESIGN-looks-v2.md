# DESIGN — Looks v2: the tray, the cracks, themed packs

STATUS: PR A (the tray and the cracks) is client-only, no DDL.  PR B (packs and
the Halloween pack) carries DDL and stops at the SQL for Nick.

## Nick's ruling (10/17)
- The looks are "not well thought out yet", and the picker (the scrolling
  strip) isn't intuitive.  A redesign is approved.
- Themed packs rotate by night.  Launch with a Halloween pack for a Halloween
  soft launch.
- The crack graphics need to be better.
- Gameplay looks (Crown, Mystery Mask, the fuse) are earned or free, never
  sold.  Cosmetic disguises can be sold later, gated by chip tier.  Leave
  room in the UI for that, but build no shop now.

## What doesn't change
- His look drops the instant he's asked.  The Moment strips everything.  The
  host can force any look off.
- One pick per show.  The server allowlists every slug (`set_filter`,
  tools/DESIGN-filter-rules.md).
- A look never touches the throw overlay, the cracks or the crown, or vice
  versa.

## PR A — the tray (feat/looks-v2)

The shelf's one-pick rule, the server's allow-list and the reconciler are
untouched.  What changed is how he picks.

**The bottom sheet.**  `#rt_shelf` is still the one dialog, risen from the
🎭 button in the composer, but it is a grid now (`repeat(auto-fill,
minmax(84px,1fr))`, 8px gap): 3 tiles to a row at 360 and 375, 4 at 390 and
up, never a sideways scroll.  Each tile is 88px tall with art, a name, the
cost, and a small badge for its kind (Classic · Tonight · Earned).  The sheet
caps at 62vh and scrolls down; it keeps its own height (`flex:0 0 auto`) and
rises over the bench, so the quad and the bench never move.  Every control is
at least 44px tall.

**Tabs.**  Tonight · Classics · Earned · Shop.
- Tonight is the current pack.  Until PR B wires `lc_config`, a page's lens
  looks (the ?camkit staging set) stand in as tonight's; with none, the tab
  says "No themed pack tonight — the Classics are free, any night."
- Classics are the two free 2D looks (Warm Grade, Noir).
- Earned lists the gameplay looks greyed, with a lock and "earn it by…":
  the Crown, the Mystery Mask (designed, not built), the Fuse.  They are
  `EARNED_LOOKS`, data the painter greys — never a wearable tile, never sent
  to `set_filter`.
- Shop is greyed "coming soon" (`SHOP_LOOKS`).  No shop is built; the tab
  is the room left for it.
- The default tab is Tonight when it has looks, else Classics.  Tabs filter
  the one rack: tiles off the current tab are `hidden`, so a gate that
  counts wearable tiles still counts them all.

**TAP TO TRY.**  A tap on a tile starts a trial (`lookTry`): the look is drawn
on his OWN tile only — a `<canvas class="chair__tryon">` placed over his
video (z 1, under every badge and under the cracks at z 3), fed by the same
`<video>` the tile shows, with the look's own `FILTERS` function — for six
seconds.  Nothing else happens: no RPC, no `DAILY` call, no published track,
no pick spent, no other phone sees a thing.  A trial with no self-view (the
bench, or no video) arms the bar without a picture and says so.
**A lens look has no live preview in PR A** — a Camera Kit trial would need a
session of its own on a clone of the camera, and the SDK runs one LensCore,
one session at a time: the hidden terms session, the trial and the real
start would race for it (a first cut did open one, and the camkit gates'
session counts turned timing-dependent).  A lens tap arms the bar with "No
preview for a face-tracked look — it shows the moment you wear it."  A lens
preview is PR B's call, with the Halloween pack, if Nick wants it; this is
the one place PR A is narrower than the brief.
- The bar: "Trying Noir — on your own screen only, for six seconds."  WEAR IT
  (`lookWear` → `filterPick`, the one door from the tray to `set_filter`)
  publishes it and locks the pick.  Cancel reverts.  After six seconds the
  canvas is gone and the bar reads "Preview over. Wear Noir?".
- The ASK, the Moment, a lock landing, the tray closing — each ends a trial.
- **While a trial is up the sheet is only the bar.**  A bottom-row chair
  sits right under the sheet (Nick, 10/17, the 390 screenshot: Marco trying
  Noir under it), so `#rt_shelf.is-trying` hides the head, tabs, rack,
  greyed tabs and foot line until Cancel ("back to the looks") or WEAR IT.
  Gate 92 measures it from a bottom chair at 360/375/390/414: at least 60%
  of the wearer's own tile is in view during a trial (it is 100% — the bar
  sits below the chairs).

**After the pick is spent** the tray hides every tile and says so plainly:
"Your pick is spent for this show. You're wearing **Noir**." with 🎭 TAKE IT
OFF (allowed, free; the pick stays spent), or "…and you took it off. It stays
off — one look per show."

## PR A — cracks v2

`pressureFracture(uid, k, W, H)`: one crack is a glass fracture — an impact
point in the frame's edge band (crack 1 at the foot, clear of his name; 2 the
left flank; 3 the top corner; any beyond all round), 6–8 radial rays walking
out of it with the jaggedness of glass, and two concentric rings threaded
through the rays.  Three strokes per crack: a dark shadow (`.ck-dark`), the
bright line (`.ck-lite`) and a hairline refraction highlight offset a pixel
down-right (`.ck-hi`).  Seeded from (uid, k) through `throwRng(throwSeed())`
and scaled to the frame's W×H, so two phones at the same width draw the same
path strings and the same pixels (gate 92 compares both).  Crack k is the
same path whether or not crack k+1 has landed (gate 88 claim 2 still holds).
`pressureCrack` keeps its old contract (the bright path) for gate 88.

**Shatter.**  At `cracks_to_shatter` the frame draws the cracks, four more
rim fractures, and ten seeded shards, each with its own fall (drift, drop,
spin on `--sx/--sy/--sr`) that `lc-shard-fall` plays over 1.05s with the
existing jolt; then the shards are gone and the cracked frame stays
(`is-shattered` without `shatter-now` hides them).  Reduced motion: no fall,
the shards sit faint and static.

**A rose mend.**  Observed like the crack: when his count goes down by less
than a reset while this client watches, the crack a rose took is drawn once
more as `.ck-mend` — a short bright dashed sweep (`lc-mend`, .7s) — and
removed by its own timer.  Her call's reset to zero is not a mend.  A rose
that takes the last crack leaves a bare frame, which shows no crack art, so
that one has no shimmer.  Reduced motion: none.

## Gates (PR A)
- **92 looks-tray** (new): static (the tap handler calls `lookTry`, never
  `filterPick`; `lookTry` makes no RPC and never touches DAILY; the rack is a
  grid with no sideways overflow; 44px targets); layout at 360/375/390/414,
  each from a bottom chair, with the trial's ≥60%-of-own-tile rule;
  TAP TO TRY spends nothing and publishes nothing, six seconds later the
  canvas is gone; Cancel; WEAR IT calls `set_filter` once and the server
  confirms; TAKE IT OFF keeps the pick spent and hides every tile; the
  bench's trial; the ASK ends a trial; the tabs; cracks byte-identical and
  pixel-identical across phones, crack 1 unchanged when 2 lands; shatter
  leaves shards and a cracked frame, reduced motion plays no fall; **the
  mutant**: a client served a page whose tap handler publishes
  (`filterPick` in place of `lookTry`) makes claim 2's check fail — the gate
  has teeth.
- **77 camkit-fallback, 78 camkit-rules, 79 camkit-staging**: a tap is TAP
  TO TRY — each gate's tile tap now taps and then WEAR IT (79 also checks
  the trial picked nothing in between); session counts unchanged, since a
  lens trial opens no session.
- **harness**: `newClient(name, { html })` serves a mutated `index.html` to
  that one client (the mutation test's door).

## PR B — themed packs (DDL: stop and show the SQL)
Not in PR A.  A pack is a named list of slugs with a date window; the server
reports tonight's pack through `lc_config` (`tonight_pack`); new slugs go
into the allow-list through the md5-guarded DDL pattern.  The Halloween pack
(Oct 24 – Nov 1): Camera Kit disguises (vampire, skeleton, zombie, witch hat,
devil horns, pumpkin head, ghost) built as original lenses, and a 2D fallback
that works today (Candlelight, Night Vision, Haunted VHS, Fog, cobweb
corners, jack-o'-lantern border).
