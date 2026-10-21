# DESIGN — Looks v2: the tray, the cracks, themed packs

STATUS: PR A (the tray and the cracks) is client-only, no DDL — merged (#110).
PR B (packs and the Halloween pack, feat/looks-v2-packs) — merged (#112); its
DDL, tools/DDL-looks-packs.sql, RAN IN PRODUCTION 2026-10-19 (run log below).
PACKS, ROUND TWO (feat/packs-halloween-now-holidays, PR A of the 10/20–10/21
brief): Halloween on now through Oct 31 PT, the Holidays pack Nov 1 – Jan 1,
vaulting — its DDL, tools/DDL-packs-holidays.sql, is NOT RUN (handed to Nick;
see the section at the end).

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

**The server (tools/DDL-looks-packs.sql — RUN IN PRODUCTION 2026-10-19, run log
below; one transaction, md5-guarded
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

## Run log 2026-10-19 — production (PR B's DDL)

Run in Supabase Studio's SQL editor (project `afterhours`, PRODUCTION) by
Nick at ~13:23 PT on 2026-10-19, after #112 merged.  Read-back as Nick
reported it (the values below are his; this session had no production
read of its own):

| what | read back | the dry run predicted |
|---|---|---|
| `set_filter(uuid,text)` | md5 `a8ca64f4a6e17501e1761c4961aa0c1d`, 1373 chars | the same — asserted by the file's own post-check |
| `lc_config()` | md5 `18c19ce96c662a68bc82e327a14f5df4` | the same — printed by the dry run's NOTICE |
| `lc_tonight_pack()` | md5 `00ed780667ebed70cab458368bc616c1` | **`a4c73909d32133eeea3a03dc5747a677` — differs** |
| `lc_config()` | `{"tonight_pack":null,"host_stale_ms":120000}` | the same (Oct 19 is before the window) |
| `look_packs` | `relrowsecurity = true` | the same |

**The one mismatch, `lc_tonight_pack`.**  Its md5 in production is not the
stand-in's.  `set_filter` (spliced on the server, never pasted) and
`lc_config` (a one-line body) match to the byte, so the difference is in
the one multi-line SQL body that went through the editor — the same thing
PR C's run log recorded on 2026-10-13 (comments stripped, whitespace changed
in transit; `pg_get_functiondef` hashes the body verbatim).  Not verified
from here: nobody has yet read production's `prosrc` for it.  Until someone
does, treat `00ed7806…` as the guard value (it is what production hashes
to) and, before any DDL that depends on that function's TEXT rather than
its md5, read it back whitespace-insensitively the way PR C's second
read-back did.  Its behaviour is checked by `lc_config()` returning
`tonight_pack: null` today; the behavioural proof inside the window is the
Oct 24 phone test (the Tonight tab shows the six).

**Guards for the next DDL** (re-read before guarding on them, as always):
`set_filter` `a8ca64f4a6e17501e1761c4961aa0c1d` / 1373 ·
`lc_config` `18c19ce96c662a68bc82e327a14f5df4` ·
`lc_tonight_pack` `00ed780667ebed70cab458368bc616c1`.

NOT done: a read of the Halloween row from production (`select * from
look_packs`), the ACLs of the three functions after the run, and the
behavioural check through the app inside the window — those are the Oct 24
phone test's.  The double's `FILTER_LOOKS` and `HALLOWEEN_PACK` are SOURCE
as of this run.

## Packs, round two — Halloween NOW, the Holidays pack, vaulting (feat/packs-halloween-now-holidays)

Nick's rulings (10/20–10/21): the Halloween pack is on **now**, for everyone,
no tier or chip gate, through Oct 31 PT; on Nov 1 PT it vaults and the
**Holidays** pack takes over, switching itself on through the rotation PR B
built.  A pack whose window has passed disappears from the tray entirely
(not greyed) and stays in the DB as vaulted, for reuse.

**The server (tools/DDL-packs-holidays.sql — NOT RUN; Nick runs it in
Studio; one transaction, md5-guarded on the three 2026-10-19 read-backs,
refuses on drift).**
- the allow-list: `room_members`' two CHECKs and `set_filter`'s one line,
  spliced the 2026-10-06 way, widened by the eight 2D slugs `fairylights
  snowfall frosted fireplace candycane snowglobe tinsel countdown` and the
  eight lens slugs `ck-santa ck-reindeer ck-elf ck-sweater ck-krampus
  ck-nutcracker ck-snowman ck-champagne`.  Expected after: 1569 chars, md5
  `88c4017d9db2fc1dd69cf877729e4c41` (the SOURCE section of
  DESIGN-filter-rules.md reproduces every earlier fingerprint — 1203 /
  de467837…, 1229 / a9d3bf79…, 1373 / a8ca64f4… — with the one line swapped;
  the trailing newline `pg_get_functiondef` emits is part of the hash).
- the Halloween row: `starts_at` moved back to `'2026-10-21 00:00'` PT (so it
  is live the instant the file runs, whenever Nick runs it) and `ends_at`
  moved up to `'2026-11-01 00:00'` PT (Oct 31 the last night; DST ends two
  hours later, so both instants are PDT: 07:00Z).  Nothing else about the
  row changes; nothing gates it — a plain signed-in user sees it.
- the Holidays row: `'2026-11-01 00:00'` → `'2027-01-02 00:00'` PT (Jan 1 the
  last night), sixteen slugs.  Its window opens at the very instant
  Halloween's closes, so `lc_tonight_pack()` (enabled row whose window holds
  now(), latest-starting first) hands over by itself — no deploy, nothing
  to flip, exactly how Halloween was to come on.
- vaulting: `lc_pack_status(look_packs) → live | scheduled | vaulted | off`,
  computed from the window on the server clock (never a stored flag that can
  go stale), and `look_packs_status`, a `security_invoker` view over it,
  both revoked from anon/authenticated — Studio reads it, the app never
  does.  A vaulted pack is never `tonight_pack`, so no phone ever draws a
  tile for it; the row stays.  To vault early: `ends_at = now()`.  To reuse:
  a new window.  The live DDL deletes nothing (gate 96 reads the file and
  says so).
- Dry run 2026-10-21 against a throwaway PostgreSQL 16.15 holding a stand-in
  (`rooms`, `room_members` with the seventeen-name CHECKs, a stub
  `auth.uid()`, `set_filter` from the SOURCE section with the 2026-10-19
  line — fingerprints exactly as production's a8ca64f4…/1373 — `lc_config`
  as PR B's file creates it — 18c19ce9…, production's own — and
  `lc_tonight_pack` as PR B's file creates it, which hashes a4c73909…, not
  production's 00ed7806…, as the 2026-10-19 run log recorded; the dry run's
  COPY of the file swaps that one guard value, the committed file carries
  production's): the guards pass; the splice lands at 1569 / 88c4017d…; the
  window probe says halloween at 00:00 PDT Oct 21 and 23:59:59 PDT Oct 31,
  holidays at 00:00 PDT Nov 1 and 23:59:59 PST Jan 1, nothing at 00:00 PST
  Jan 2, with `lc_pack_status` scheduled/scheduled → live/scheduled →
  vaulted/live → vaulted/vaulted at those instants; `set_filter(room,
  'snowfall')` and `'ck-champagne'` accepted, a second pick `filter locked
  for this show`, `ck-nope` `no such filter`; `authenticated` gets
  `permission denied` on the view and on the table under the status
  function, and `halloween` from `lc_config()`; a second run of the file is
  refused by the first guard with nothing changed.  Says nothing about
  production's state — the preflight at the top of the file is that read.

**The client.**
- Eight more `FILTERS` draw functions in the free category (composites,
  gradients, strokes, the frame copied onto itself; motion off the clock):
  Fairy Lights (a string of neon bulbs round the border, twinkling),
  Snowfall, Frosted Glass (the frame copied onto itself in soft offsets,
  frost from the edges, ice crystals), Fireplace Glow (lit from below,
  embers), Candy Cane (a peppermint frame in the room's pink and white, the
  stripes creeping), Snow Globe (a round glass, snow swirling inside it
  only, a base), Tinsel (garlands over the corners in teal / pink / gold /
  violet, sparkle points), Midnight Countdown (NYE: neon digits counting to
  midnight on the phone's clock, a ring filling through the last hour,
  "HAPPY NEW YEAR" once it's past).  The palette is the room's own neon —
  #ff2d8f, #2de3d0, #b9a8ff, #ffd6e9 / #ffd23f — so a holiday look reads as
  Last Call, not clip-art.  `PACK_LOOKS` catalogues the eight.
- **Pack art.**  A pack tile's picture is the look itself: `packArt(slug)`
  draws the look's own `FILTERS` function once over the room's neon plate
  (the field, a pink and a teal glow, the mark of a face) on a 96×60 canvas,
  cached per slug as a data URL, and the tile shows that in place of the
  emoji icon (`.has-art`; the icon stays in the DOM, hidden, for the badge
  and the gates that read it).  So the art always matches what WEAR IT
  publishes and can never be clip-art.  The Halloween six get the same
  treatment.
- The Tonight tab wears the live pack's name — "Halloween", "Holidays" —
  and reads "Tonight" again with no pack (`data-tab` stays `tonight`).
- `lcPackStatus(p, t)`: the server's four words on the phone's clock.  A
  vaulted pack is one `lcTonightPack()` already returns null for, so the
  rack never holds its looks: no tile, not a hidden one, no ghost.  A page
  left open across a handover empties on its own clock (PR B's rule) and
  reads the next pack at the next `openRoom` — no polling, as before.
- The eight ck- disguises: allow-listed ahead of their lenses, exactly as
  Halloween's seven were.  No lens exists for any of them; `CAMKIT.looks`
  carries them the day the lenses do.  Lens briefs, for Lens Studio (all
  original, face-tracked, published to the Last Call lens group): Santa hat
  + beard · reindeer antlers + red nose · elf ears + hat · ugly sweater
  (chest/shoulders) · Krampus (horns, tongue) · Nutcracker (hat, painted
  cheeks, jaw) · snowman (carrot nose, coal, top hat) · champagne-and-party-
  hat (NYE).

**Gate 96 packs-holidays** (new): static (the eight are 2D-only `FILTERS`
functions; `PACK_LOOKS`; `lcPackStatus`; `packArt` draws with the look's own
function; the DDL file guards on the three 2026-10-19 md5s, refuses on an
existing holidays row / status function / a moved Halloween row, splices to
the double's 33 names with the 1569 / 88c4017d… post-check, widens both
CHECKs to the same 33, moves the Halloween window and inserts the Holidays
row as the double's `HALLOWEEN_PACK` / `HOLIDAYS_PACK`, creates the sealed
status function and view, deletes nothing, adds no column; the server model
hands over at one instant and keeps a vaulted row); on the phone
`lcPackLive` / `lcPackStatus` at the edge instants; Holidays live → the tab
named "Holidays", exactly the eight in order, Tonight / FREE / teal, eight
different pack-art pictures with the icon hidden, the ck- eight not tiles,
the pack line, and the vaulted Halloween thirteen not tiles (not even
hidden) and not ghosts while the server still holds the row; the eight
render at 360/375/390/414 from a bottom chair, 3 or 4 to a row, nothing
picked; WEAR IT on `snowfall` accepted and badged SNOWFALL ❄️ everywhere;
a stranger slug refused, a reserved `ck-champagne` accepted, a vaulted
pack's `lantern` still accepted (the list is never narrowed — vaulting is
the tray's business); a page whose only pack is vaulted reads "Tonight"
with zero Tonight tiles and the no-pack line; a vaulted row given a new
window is live at the next openRoom; a handover while the tray is up
empties Tonight on the phone's clock and the next openRoom reads Holidays;
with the server clock inside the moved window, lc_config reports Halloween
for a plain user.  **Gate 94**'s pins move with the window (its DDL file
is PR B's record, unchanged; the allow-list check is now "a subset of the
double's 33"); **gate 79** claim S counts both packs' reserved ck- slugs.
