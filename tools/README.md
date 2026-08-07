# Last Call — battery v2

The verification harness for the single-file build (`index.html`).  Battery
v2 starts its count over: the old 30-gate/554-check battery died with the
container that held it and is **not** reconstructed here.  Nothing about
verification lives outside this directory — the harness is the repo's.

## Run it

```
tools/verify.sh                  # full battery
tools/verify.sh --only=boot      # one gate
tools/verify.sh --update-golden  # regenerate the golden regression baseline
```

First run does `npm install` inside `tools/` (playwright-core, css-tree,
acorn, pixelmatch, pngjs — no browsers are downloaded).

**Chromium**: the harness resolves the binary at launch, in order:
`$LC_CHROMIUM` (explicit override) → `/opt/pw-browsers/chromium` (the
preinstalled symlink in this container, which currently resolves to
`/opt/pw-browsers/chromium-1194/chrome-linux/chrome`, Chromium 141.0.7390.37)
→ playwright-core's own registry path.  If none exists it fails with
instructions rather than downloading anything.

Known resolved paths per environment (don't rediscover):

- Previous container: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (Chromium 141.0.7390.37, via the `/opt/pw-browsers/chromium` symlink)
- Codespace didactic-guide: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`
  (Chromium 141.0.7390.37, same symlink; `npx playwright-core install chromium`
  is blocked in this environment — cdn.playwright.dev returns 403 "host not
  permitted" — so the preinstalled binary is the only route)

## How it works

```
verify.sh → lib/run.js → gates/*.js (filename order)
lib/harness.js        one shared Chromium; each client window is a browser
                      context that loads the REAL index.html over a routed
                      offline origin (https://lastcall.test)
lib/backend-double.js stateful Supabase double in NODE — rooms, members,
                      roles, room_events, RPCs, realtime.  All windows share
                      it, so multi-window flows hit real shared state.
lib/shims/            served in place of the supabase-js / daily-js CDN
                      bundles.  Dumb transports: supabase calls forward to
                      the double; the Daily fake mints REAL MediaStreams
                      (fake camera for local, canvas capture for remotes).
lib/fixtures.js       named rosters, incl. the COUNT PARITY roster
                      (host + 2 crowd + 3 bench + 2 chairs + 1 kept + 1 stale)
gates/                one file per gate
golden/               committed baseline PNGs + META.json
```

### Gates call real code — the structural rule

The single worst failure of the old battery was gates re-implementing app
logic and testing the re-implementation.  Battery v2 forbids that
structurally: `index.html` exports `window.__lc` — REAL function references
(roster load, render, bench entry, seat/keep/pass, phase engine, video
attach/reflow) plus live state getters.  Every runtime gate drives the app
through `__lc` or the real DOM controls.  **A gate that defines its own
version of app logic is a failed gate — if a function can't be reached,
export it in `__lc`, don't reimplement it.**

## The gates and what each proves

| # | gate | proves |
|---|------|--------|
| 1 | `parse` | index.html is well-formed; every inline script parses (acorn) |
| 2 | `css-parse` | every `<style>` block and markup `style=""` attr parses (css-tree), zero errors |
| 3 | `forbidden` | the three in-flight bugs cannot come back: no `.load()` on video, no srcObject null-then-reassign, ONE headcount derivation, ONE bench-role entry point |
| 4 | `safari-scan` | every `<video>` has playsinline; local elements muted; no `play()` inside any `setInterval` (AST scan) |
| 5 | `boot` | signed-in cold start reaches the lobby with zero console errors and zero network egress |
| 6 | `view-matrix` | all 28 role×phase cells render: room shown, nothing stacked, no horizontal overflow, top bar + hero present, no errors |
| 7 | `episode` | full show in four real windows: GO LIVE → lobby cards → ♥ bench (headshot path) → auto-seat curtain-up → engine phases via the host's SKIP → keep/pass → LAST CALL board → winner; everyone lands on an end screen |
| 8 | `video-life` | join/seat/unseat/leave with real MediaStreams: feeds land in the right tiles, sweeps remove the right feeds, no dead tracks, teardown leaves nothing |
| 9 | `guest-path` | unauthenticated cold load: auth screen alone, interactive, error-free |
| 10 | `golden` | full-frame pixel diff vs `tools/golden/` — **regression baseline only** (see below) |

## What battery v2 does NOT cover

- **Pixel correctness.**  The DC mock reference files are gone; there is
  nothing to conform to.  `tools/golden/` was captured from the live build
  and is a **regression** baseline: it catches changes, it does not prove
  correctness, and the captured build's bugs are baked into it.  The gate
  prints this label on every run.
- **Gates 11–13** (COUNT PARITY, BENCH ENTRY, REATTACH BUDGET) ship with
  the three bug-fix branches, alongside their fixes — not here.
- The backstage/winner's-room swap flow, drafts, gifts/hearts ledgers, and
  invite/recovery auth flows are exercised only incidentally.
- The Daily double is **per-window**: remote streams are synthesized locally
  (canvas capture) and injected via `window.__dailyControl`; media is not
  transported between windows.  Roster/game state IS shared across windows
  through the Node-side double.
- Real Supabase/Daily network behavior (latency, RLS, token expiry).  The
  battery runs fully offline; any unexpected network egress fails `boot` /
  `guest-path`.

## Known-failing gates on the untouched build (real bugs, not weakened)

- `forbidden` — four independent headcount derivations exist (lobby card,
  room header, line watchbar, bench slice) and no unified `roomCounts()`;
  this is the live count-disagreement bug.  Fixed by `fix/count-truth`.
- `video-life` — `reflowVideo`'s 6-second disagreement sweep removes an
  unseated member's `<video>` from the DOM but leaves its `VIDEO_TILES`
  entry dangling with a live `srcObject`.  Orphaned stream; adjacent to the
  `fix/video-attach-idempotent` branch's remit.
