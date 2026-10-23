# BRIEF — D4 · THE TABS (the Tinder layer, then the show)

Ruling (Nick, 10/22): "Make the Tinder portion as familiar as possible, THEN we hit them with the
show layer. Swiping, likes, chat, profile — all easily accessible." Approved against the Design
canvas "Last Call Redesign", row A (Swipe home · Shows · Matches · You). Mechanics stay AS BUILT:
no new show logic, no engine changes, no DDL. This PR is structure: a persistent bottom tab bar and
four tabs, made mostly by MOVING blocks that already exist in index.html.

Branch `feat/tabs` from `main` after #132 (marquee) merges. One PR. Build stamp bumps at both sites.

## The four tabs (bottom bar, always visible when signed in and not in a room)

| tab | id | what it holds | where it comes from today |
|---|---|---|---|
| ♥ Swipe (HOME) | `#tab_swipe` | the deck, full height; above it ONE slim pill: `LIVE NOW · <host> · WATCH ›` when any room is live, else `NEXT SHOW · <when> ›` when a show is scheduled, else nothing | `#deck` (+ `#deck_ctl`); pill is new, reads `roomlist` data and `marqueeLoad()` |
| 📺 Shows | `#tab_shows` | the Marquee (live card / next scheduled + RSVP + countdown), LIVE NOW room list, UP NEXT list, then GO LIVE and SCHEDULE | `#marquee`, `#roomlist`, `#golive`, `#schedulebtn` — moved, not rebuilt |
| 💬 Matches | `#tab_matches` | Tinder layout: a horizontal row of new-match avatars (matches with no messages yet), then the message list; tapping opens the existing chat sheet | `#matches_body` content; `matchesRender()` gains the two-section layout |
| ☺ You | `#tab_you` | own card preview (tap → `openProfile(ME.id)`), completeness %, EDIT (→ `openProfileEditor`), VIP pill, Settings, Sign out | `#mebtn`, `#vippill`, `#settingsbtn`, `#signout` |

Rules
- The Swipe tab is the first screen after sign-in and after leaving a room (finale card first, then
  Swipe — wave 6 rule stands: never a bare lobby).
- `#room` is a full-screen takeover: the tab bar is hidden while `CURRENT_ROOM` is set.
- The header keeps the logo and `#coinchip`; `#matchesbtn`, `#mebtn`, `#settingsbtn`, `#signout`
  leave the header (their functions move into the tabs; keep the ids, keep the handlers).
- Unread badge: the 💬 tab shows `UNREAD` exactly as `#matchesbtn` does today (same `has-unread`
  class, same `data-n`).
- `#whoami` stays, under `?debug` only (ruling in #108) — put it at the foot of the You tab.
- `#lobby.is-quiet` goes away: Swipe is always the deck. Delete the quiet-night CSS.
- Deep links: `#swipe #shows #matches #you` select a tab on load; `location.hash` follows the tab.
- No new RPCs. No DDL. No engine touch. If a tab needs data it doesn't have, it reads the same
  derivation the old block read (`roomCounts()` for live counts — SEQUENCE rule 3).

## Visual
Skin unchanged in this PR (neon). Tab bar: 4 equal cells, icon over 8px mono label, active = pink
with glow, inactive = 45% ink. Safe-area padding at the bottom. The exact look is on the canvas
(row A, Main.dc.html) — match proportions, not pixels; the Broadcast Noir skin is a later PR.

## Exports (`window.__lc`)
Add `tabShow(name)`, `tabActive()`, and the pill's `pillRender()`. Keep every existing export.

## Gate 101 — `tools/gates/101-tabs.js` (drive the real index.html; backend double)
1. Sign in → `#tab_swipe` visible, deck stack has cards, tab bar visible, header has no `#mebtn`.
2. No live room, no scheduled show → no pill. Scheduled show → `NEXT SHOW` pill → tap → Shows tab.
3. Live room → `LIVE NOW` pill names the host; tap → Shows tab; Watch → enters room; tab bar hidden
   while in room; leave → finale → Swipe tab, tab bar back.
4. Matches tab: a match with no messages appears in the avatar row and NOT in the list; after a
   message it moves to the list; unread badge on the tab matches UNREAD.
5. You tab: avatar tap opens own card (`#profile` sheet, ME.id); EDIT opens the editor; VIP pill
   present; Sign out works.
6. Hash deep links select tabs; back/forward moves between tabs.
7. `#lobby.is-quiet` never set; the old quiet CSS is gone (grep the stylesheet).
8. Every existing gate still green (run the full battery; `golden` is environment-only).

## Done means
Battery green except `golden`, stamp bumped, `tools/DESIGN-tabs.md` with the move table above
filled in with line cites, PR body with the canvas link and a screenshot of each tab from the harness.
