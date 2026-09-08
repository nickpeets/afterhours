# Last Call — design source

**This folder is the design's SOURCE, not a relay of it.**

Everything here is canonical. If a claim about the design conflicts with a
file in this folder, the file wins. Do not write code from a summary,
a chat description, or another agent's account of what the design says —
open the file.

This folder exists because the design previously lived only in a Claude
Design project. Every fresh agent session started blind to it and worked
from relayed descriptions, which is how the DESIGN-DIFF document ended up
marked `SOURCE(design-relay)` — written by an agent that had never opened
these files.

## Layout

    design/
      mocks/       the .dc.html reference implementations
      assets/      lastcall-theme.css (the styling contract) + support scripts
      reference/   HANDOFF-README.md — state table and ID/CLASS contract

## The mocks

| File | What it is |
|---|---|
| `Last Call Room.dc.html` | Reference implementation for the room |
| `Last Call Panel.dc.html`, `Last Call Panel Deck.dc.html` | Panel layout |
| `Last Call Discovery.dc.html` | 59-frame annotated walkthrough — every screen, control by control, per role |
| `Last Call Moment.dc.html` | THE MOMENT (Rev 5) — quad-preserving mute/blur |
| `Last Call Filters.dc.html` | Camera filters — picker, forced drop, pairing strip |
| `Last Call Walkthrough.dc.html` | 10-screen walkthrough |
| `Last Call Lobby.dc.html` | Lobby |
| `Last Call Episode.dc.html`, `Last Call Draft.dc.html`, `Last Call Storyboard.dc.html`, `Last Call Flow.dc.html` | Episode / draft / storyboard / flow |
| `Last Call.dc.html` | Panel-equivalent |

## The standing mandate

From the owner ruling of Aug 5:

> **Copy, don't re-author.** Render templates are lifted VERBATIM from the
> mock's fragments. The mock's chair is the chair; its lane is the lane.
> JS only fills text and toggles the state classes from the README's state
> table. JS is a puppeteer of the design's DOM, never an author of its own.

This eliminates the "my template vs. their CSS" drift class, which is the
root cause of the layout defects that shipped repeatedly.

## Known: design ahead of build

`Last Call Discovery.dc.html` carries its own supersedes list. Two items
are build dependencies, not design details:

1. **NEXT UP** — the design glows on hearts (ranked by heart count, with
   `line_position` breaking ties and covering the all-zero bench at show
   start). The app currently seats by `line_position` only. `nextOffBench()`
   is called in four places and must change before design and mechanism
   agree.
2. **The draft storm is superseded.** The app has a 15-second reveal storm
   with tallies and a modal. The design replaces it: chair opens → 5-second
   override window for her → bench leader rises on a camera-flip → next in
   line drops onto the bench, FIFO. That phase is scheduled for demolition;
   do not build against it.

## IMPORTANT — this folder must not ship in the app bundle

`lastcall-ios`'s `scripts/sync-web.mjs` copies nearly everything from this
repo into `www/`, which becomes the iOS app bundle. Its SKIP set must
include `design/`, or these mocks ship inside the App Store binary.

The same applies to `docs/`, `tools/`, and `CONTRIBUTING.md`, which are
already being copied and are only harmless because they remain untracked.

## Not included

Historical phone screenshots and debug captures from the design project
were deliberately left out — 12 MB of test artifacts with no design
authority. Git history is permanent; the design source is 1.2 MB.
