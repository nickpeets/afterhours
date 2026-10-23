# The Tabs — the Tinder layer first, then the show (PR D4 of the lobby refresh)

**Branch** `feat/tabs` off `main` at #134 (after #132 marquee, #133 brief, #134
marquee fix) · ruling Nick 10/22: "Make the Tinder portion as familiar as
possible, THEN we hit them with the show layer. Swiping, likes, chat, profile
— all easily accessible."  Approved against the Design canvas "Last Call
Redesign", row A (Swipe home · Shows · Matches · You):
https://claude.ai/artifact/SYao54FqWaXHiB928kTJER (project/Main.dc.html,
Shows.dc.html, Matches.dc.html, You.dc.html).

**Mechanics are AS BUILT.**  No engine change, no new RPC, no DDL.  This PR
is structure: a persistent bottom tab bar and four panes, made by MOVING the
blocks the one-column lobby already had — every id kept, every handler kept.
Stamp `b1023.1049` at both sites (`id="buildstamp"` index.html:1814, the
`[lastcall] build` log index.html:2458).

## The move table (brief → index.html at this commit)

| tab | pane | what it holds | where it came from | where it is now |
|---|---|---|---|---|
| ♥ Swipe (HOME) | `#tab_swipe` 1864 | the deck, full height; ONE slim pill above it | `#deck` + `#deck_ctl` (old lobby 1826–1830); the pill is new | `#showpill` 1865 (new; `pillRender()` 11582); `#deck` 1867, `#deck_stack`, `#deck_ctl` unchanged inside it. The deck's "THE DECK · swipe between shows" label is gone — the tab is the label. |
| 📺 Shows | `#tab_shows` 1873 | Marquee, LIVE NOW list, UP NEXT list, GO LIVE, SCHEDULE | `#marquee` (1818), `#roomlist` (1824), `#golive` (1819), `#schedulebtn` (1820); UP NEXT was the `.mq__more` strip inside the Marquee card | `#marquee` 1874 → `LIVE NOW` label + `#roomlist` 1876 → `UP NEXT` label + `#upnext` 1878 (the same `SHOWS.slice(1,4)` the card's strip painted, now a list — `marqueeRender()` 11458) → `#golive` 1879 → `#schedulebtn` 1880. Gate 100's "the Marquee sits above GO LIVE" still holds. |
| 💬 Matches | `#tab_matches` 1884 | new-match faces (no messages yet), then the message list; a tap opens the chat sheet | `#matches_body` inside the `#matches` sheet (2235–2238); `matchesRender()` one list | `NEW MATCHES` label + `#matches_new` 1886 (faces: `MATCHES` with no `last`), `MESSAGES` label + `#matches_body` 1888 (the rest). `matchesRender()` 11318 gains the two sections; `openMatches()`/`closeMatches()` 11339–11340 route to the tab; the `#matches` sheet is gone (`#chat` stays as it was). |
| ☺ You | `#tab_you` 1892 | own card preview (tap → `openProfile(ME.id)`), completeness %, EDIT, VIP pill, Settings, Sign out; `#whoami` under `?debug` at the foot | header `#mebtn` 1728, `#settingsbtn` 1729, `#signout` 1730; lobby `#vippill` 1822; lobby `#whoami` 1814 | `#mebtn` 1894 (same `paintMeButton`, same `onclick` from `profilesInit`), `#you_name`/`#you_sub`/`#you_pct` (`youRender()` 11602, off `MYPROFILE` + `profileCompleteness`), `#you_card` + `#you_edit` 1901 (→ `openProfile(ME.id)` / `openProfileEditor`), `#vippill` 1904 (`lcPaintVip` untouched), `#settingsbtn` 1906, `#signout` 1907 (handlers untouched), `#whoami` 1909 (the 10/15 `?debug` rule untouched, enterApp 3198–3207). |
| the bar | `#tabbar` 2334 (after `</main>`) | four equal cells, icon over an 8px mono label; active pink + glow, inactive 45% ink; safe-area padding | new; the 💬 cell is `#matchesbtn` (header 1727) | `#matchesbtn` 2337 IS the 💬 cell: same id, same `has-unread` class, same `data-n` (`matchesRefresh` 11306), same `onclick=openMatches` (deckInit). Hidden while signed out / in setup / in a room / in the backstage: `tabBarSync()` 11554 + the `:has` rules at 1674. |
| header | — | logo + `#coinchip` | 1725–1731 | 1764–1768: logo and `#coinchip` only. |

Rules, as built here:
- **Swipe is HOME.** `enterApp` paints the lobby on `tabShow(tabFromHash()||"swipe")` (3186, 3197); `leaveRoom` (7390) and the backstage exit (7118) go to `tabShow("swipe")`.  The finale card lives inside `#room` (2159) and is painted before `leaveRoom` runs, so it comes first — never a bare lobby (gate 101 §3 proves the order).
- **The room is a takeover.** `openRoom` calls `tabBarSync()` once `CURRENT_ROOM` is set (3897); the CSS belt hides the bar under `#room.show`, `#auth`, `#backstage.show` (1674).
- **The pill** (`pillRender()` 11582): LIVE NOW · host · WATCH › when the Marquee's show is live (`SHOWS` with `status==="live" && room_status==="live"`) or any LIVE NOW row exists (`LOBBY_ROOMS`, the rows `loadRooms` painted, with the `roomCounts()` totals it derived — 3492, 3574); NEXT SHOW · when › when a show is scheduled; nothing otherwise.  Tap → Shows.  Re-rendered at the end of every `marqueeRender` (11435, 11463) and every `loadRooms` (3542, 3574) — no RPC of its own.
- **Deep links / history.** `#swipe #shows #matches #you` select a tab on load; `tabShow` pushes the hash (`replaceState` on the first paint) and `popstate` follows back/forward.  The hash is never written over a token or a session slot in the fragment (`/^#?(swipe|shows|matches|you)?$/` only).
- **`#lobby.is-quiet`** is gone: the two JS sites in `loadRooms` and the four CSS rules.  Swipe is always the deck.
- **Exports** (`window.__lc`, 11643): `tabShow`, `tabActive`, `pillRender`, plus `tabBarSync`, `youRender`, `tabFromHash`, `TAB_ACTIVE`, `LOBBY_ROOMS` (observation).  Every existing export kept.

## Gate 101 `tabs` (50 checks) — `tools/gates/101-tabs.js`
S. static (panes, order, header, bar, `is-quiet` gone, the sheet gone, no RPC in the tabs code, stamps agree) ·
1. sign-in → Swipe, deck has cards, bar up, no `#mebtn` in the header, hash `#swipe` ·
2. no pill → NEXT SHOW pill by realtime → tap → Shows (same show on the Marquee, GO LIVE below) ·
3. Marla's real GO LIVE → LIVE NOW pill names her, off `LOBBY_ROOMS` + `SHOWS` → tap → Shows → the LIVE NOW card enters the room, bar hidden → she ends the show → finale card FIRST (bar still hidden) → Back to lobby → Swipe, bar back; the watcher too; the pill lets go ·
4. a messageless match is a face, not a row; a message moves it; the 💬 badge is UNREAD (`has-unread`, `data-n`); the row opens the chat sheet; reading clears it ·
5. You: name + completeness, avatar → own card, EDIT → editor, VIP pill, Settings, Sign out ·
6. `#you` / `#shows` on load; back / forward between tabs ·
7. zero console errors in every window.

## Judgment calls (where the brief met the code)
- **Gates that assumed the one-column lobby** were pointed at the tab their claim lives on — through the brief's own deep links, not through private hooks.  `05-boot`, `07-episode`, `10-golden`, `11-count-parity`, `83-lobby-live-feeds`, `84-lobby-teardown-before-join` boot with `#shows` (LIVE NOW cards, GO LIVE: Playwright's `click` needs a visible element, and the live-feed ledger previews only on-screen cards); 83's sign-out and 98's VIP pill go to the You tab (`#you`); 84 re-opens Shows after `#roomback` (a room leaves to Swipe by rule).  Two STRUCTURAL assertions were rewritten for the ruling: 98 "the VIP pill is in the lobby, above LIVE NOW" → "on the You tab"; 99 "the deck sits under LIVE NOW" → "the deck IS the Swipe tab".  Every behavioural claim in those gates is unchanged.
- **UP NEXT** is the Marquee's own `.mq__more` strip moved out of the card into a list under LIVE NOW (brief: "UP NEXT list" on the Shows tab) — the same three shows, now with host and going count; nothing new is read.
- **The pill's live source.**  The brief says the pill "reads `roomlist` data and `marqueeLoad()`"; the code keeps the Marquee's live show first (its card is what WATCH leads to) and falls back to the first LIVE NOW row.  The count beside the host is the `roomCounts()` total `loadRooms` already derived (SEQUENCE rule 3) — never recounted.
- **The `#matches` sheet is removed** rather than left as a dead surface (gate 60's rule); `openMatches`/`closeMatches` stay exported and route to the tab.  `#chat` is untouched.
- **MY CARD cell.**  The canvas row A shows MY CARD / EDIT / MY SHOWS; the brief names the avatar tap and EDIT.  MY CARD is kept (it is the avatar's action, spelled out), MY SHOWS is not built (the brief does not name it; it would need the host's own shows, which is D2b territory).
- **`#settingsbtn` reads "⚙ Settings"** as a full-width row on the You tab (the header's bare ⚙ had no room for a label).  Same id, same handler.
- **The golden `lobby` frame** now captures the Shows tab (the old lobby's content).  The baseline (captured under Chromium 151) is stale twice over here — environment (this container runs Chromium 153) AND structure — and must be regenerated in the Codespace, not from this container.

- **Gate 101's finale step drives `renderFinale(null)` directly** (the ONE post-show door, wave 6) rather than `endShow(null)`: the no-winner ending's two channels — the rooms row going `ended` and the `finale` event — race in the double, and the row's channel takes the plain goodbye (no card).  That race is the engine's, as built; the gate proves the ORDER of the exit (card → Back to lobby → Swipe), which is this PR's claim.
- **Gate 83's on-screen measurement** clips a card by `<main>`'s box (the real scroller, which now ends above the bar), the way the page's IntersectionObserver already did — the old `innerHeight` math counted a card hiding behind the bar as on screen.  Its sign-out step presses `#signout` without switching tabs (switching would take the cards off screen and the previews would leave for that reason first).

## Run log
- 2026-10-23 · this container: Chromium 153.0.8010.12 (`/opt/pw-browsers/chromium`); the golden baseline was captured under 151 — environment divergence, expected, and the lobby frame is structurally stale too (rebaseline in the Codespace).
- Baseline, `main` at #134 (b1023.1030), full battery here: 97 gates · 2824 checks · 4 failed — `golden` (environment), `throwables` (2 timing checks), `pressure-crown` (crash: timeout), `crew-selftest` (under load).  In isolation on main: `throwables` 2 of 3 clean (the same "w2's tray … JOIN THE JEER" timing check), `pressure-crown` crashes again ("late: chairs render" timeout) — both pre-existing here, both room-side, nothing in this PR touches them.
- `feat/tabs` first full run (b1023.1049): 98 gates · 2858 checks · 5 failed — `golden` (environment); `tabs` (the finale race above → fixed in the gate); `lobby-live-feeds` (2: the sign-out step and the on-screen math above → fixed in the gate); `throwables` (1, the timing flake); `pressure-crown` (crash, as on main).
- After the gate fixes, in isolation: `tabs` 50/50 clean · `lobby-live-feeds` 55/55 clean · `throwables` 2 of 4 clean (same check as main) · `pressure-crown` crashes as on main.
- `feat/tabs` second full run (b1023.1049, gates fixed): **98 gates · 2875 checks · 2 failed** — `golden` (environment, expected) and `pressure-crown` (crash: a different timeout each run — "the crown on seat 1", "late: chairs render", a null `.id` in `page.evaluate`; it crashes the same way on `main` in this container, run alone, 0 of 2 — environment/timing in the room, not this PR).  Everything else green, `tabs` 50/50, `crew-looks` / `crew-selftest` / `throwables` / `lobby-live-feeds` clean in the full run.  `pressure-crown` and `golden` are the two to confirm in the Codespace (Chromium 151, where the baseline lives).
