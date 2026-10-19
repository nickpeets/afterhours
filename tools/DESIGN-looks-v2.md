# DESIGN — Looks v2: the tray, the cracks, themed packs

STATUS: PR A (the tray and the cracks) is client-only, no DDL — merged (#110).
PR B (packs and the Halloween pack, feat/looks-v2-packs) carries DDL and stops
at the SQL for Nick: tools/DDL-looks-packs.sql, NOT RUN.

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
Built on feat/looks-v2-packs (ruling 10/18).  A pack is a named list of slugs
with a date window; the server reports tonight's pack through `lc_config`
(`tonight_pack`); new slugs go into the allow-list through the md5-guarded
DDL pattern.  The Halloween pack (Oct 24 – Nov 1): Camera Kit disguises
(vampire, skeleton, zombie, witch hat, devil horns, pumpkin head, ghost) built
as original lenses, and a 2D fallback that works today (Candlelight, Night
Vision, Haunted VHS, Fog, cobweb corners, jack-o'-lantern border).

**The server (tools/DDL-looks-packs.sql — NOT RUN; one transaction, md5-guarded
on `set_filter` a9d3bf79… and `lc_config` fc613988…, refuses on drift).**
- `public.look_packs` — `slug` (pk), `name`, `icon`, `looks text[]`,
  `starts_at` / `ends_at` (timestamptz; the Halloween window is written as
  `'2026-10-24 00:00'::timestamp at time zone 'America/Los_Angeles'` through
  `'2026-11-02 00:00'` the same way, so Nov 1 is the last night and the DST
  change on Nov 1 is the database's problem), `enabled`.  RLS on, no
  policies, no grants: it is read only through `lc_config`.  Nick switches
  packs by editing rows in Studio — no deploy.
- `lc_tonight_pack()` (security definer, revoked from anon/authenticated):
  the enabled row whose `[starts_at, ends_at)` holds `now()`, the
  latest-starting one if two overlap, as jsonb; `lc_config()` is replaced
  with the one key added (`create or replace` keeps its owner and grant).
- the allow-list: `room_members`' two CHECKs and `set_filter`'s one line,
  spliced the 2026-10-06 way (body read from the server, never re-typed),
  widened by the six 2D slugs `candlelight nightvision vhs fog cobweb
  lantern` and the seven lens slugs `ck-vampire ck-skeleton ck-zombie
  ck-witch ck-devil ck-pumpkin ck-ghost`.  Expected after: 1373 chars, md5
  a8ca64f4a6e17501e1761c4961aa0c1d (computed from the SOURCE section of
  DESIGN-filter-rules.md, which reproduces both recorded fingerprints).
- Dry run 2026-10-19 against a throwaway PostgreSQL 16.15 holding a stand-in
  (`rooms`, `room_members` with the four-name CHECKs, a stub `auth.uid()`,
  `set_filter` from the SOURCE section with the 2026-10-06 line — which
  fingerprints exactly as production's a9d3bf79…/1229 — and the 10/08
  `lc_config`, fc613988…): the guards pass, the splice lands at 1373 /
  a8ca64f4…, the window probe is out at 23:59:59 PDT Oct 23, in at 00:00
  PDT Oct 24, in at 23:59:59 PST Nov 1, out at 00:00 PST Nov 2;
  `set_filter(room,'lantern')` and `'ck-ghost'` are accepted, a second pick
  is `filter locked for this show`, `ck-nope` is `no such filter`;
  `authenticated` gets `permission denied` on the table and on
  `lc_tonight_pack()` and `{"tonight_pack": null, "host_stale_ms": 120000}`
  from `lc_config()` (the pack's shape with the window moved onto today);
  a second run of the file is refused by the first guard with nothing
  changed.  Says nothing about production's state — the preflight at the
  top of the file is that read.

**The client.**
- `lcConfigLoad` keeps `tonight_pack` as `TONIGHT_PACK`; it is re-read at
  every `openRoom`, so a switch in Studio is seen at the next show entered
  (no polling).  `lcTonightPack()` applies the window on the phone's own
  clock too (`lcPackLive`): a page booted before the window or left open
  past it shows no pack.
- `PACK_LOOKS` is the client's catalogue of the 2D pack looks (icon, name);
  the six are `FILTERS` draw functions in the free category — composites,
  gradients, strokes, the frame copied onto itself; nothing per-pixel,
  nothing tracked.  `packLook(slug)` resolves a pack slug to a tile: a 2D
  look it has art for, or a configured lens; **a slug it cannot draw is not
  a tile** — the seven ck- disguises are allow-listed ahead of their lenses
  and show up the day `CAMKIT.looks` carries them.  Nobody can pick what
  nobody can draw, so there is no pick to lose.
- Tonight = the pack's looks in the pack's order, then any lens the page is
  configured with that the pack did not name (the ?camkit staging set still
  stands in with no pack, and sits after the pack with one).  A pack line
  above the rack names the pack and its last night.  Classics, Earned and
  Shop are untouched; so is every show rule, the one door, the lock.
- Not built, flagged: the "pick back" for a lens that never starts (the 10/6
  lens-failure ruling).  Nothing in the repo clears `filter_pick` short of a
  new show; a lens failure today publishes the bare camera with the pick
  spent (gate 77).  Out of PR B's scope — it needs its own DDL.

**Gate 94 looks-packs**: static (the six are 2D-only `FILTERS` functions;
the DDL file names the table, the function, the thirteen slugs, the Pacific
window and the guards; the double's allow-list and `HALLOWEEN_PACK` are the
DDL's text; `lcPackLive` at the four edge instants); no pack → Classics,
Tonight empty and says so; inside the window → Tonight by default, exactly
the six in order, badged Tonight/FREE, the seven ck- slugs not tiles, the
pack line; outside → ended / not begun / disabled each leave Tonight empty,
and a window that closes with the page open empties it on the phone's
clock; the six render at 360/375/390/414 from a bottom chair (frames on the
trial canvas that differ from the bare frame and are not flat; 3 or 4 to a
row, no sideways scroll); WEAR IT on `lantern` is accepted, the pipeline
draws it, every phone badges it; a second pick, an asked man's pick and a
stranger slug are refused, `ck-ghost` is accepted by the server and the
phone with no lens publishes bare, the host's force-off keeps the pick
spent; ?camkit + pack = the six then the two staging lenses; a switch is
seen at the next openRoom; a lens-only pack says the looks aren't available
here.  **Gate 79** claim S now reads: every shipped lens slug is on the
server, and every extra ck- slug on the server is one of the pack's seven.
