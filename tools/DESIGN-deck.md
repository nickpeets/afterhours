# The Deck — swipe, match, chat (PR D1 of the lobby refresh)

**Branch** `feat/deck` · ruling Nick 10/21 21:00: *"we need a real interface
refresh … if there's nobody online when people want to use it they'll never
come back … like Tinder, swipeable … just like Tinder."* Chat opens on the
match (no show-attendance gate — the show is the reason to come back, not
a gate).

STATUS: client in this PR; `tools/DDL-deck.sql` **NOT RUN** — Nick runs it in
Studio (three pastes), then records the read-back below.

## The lobby refresh, in three PRs

1. **D1 — this PR: THE DECK.** Under LIVE NOW, the next cards from
   `deck_next`; right/♥ = like, left/✕ = pass; the second like writes the
   match; IT'S A MATCH → Say hi → the thread. 💬 in the header with the
   unread badge; Matches sheet; Chat sheet with realtime delivery.
   On a quiet night (no live room) LIVE NOW folds to one line and the deck
   owns the screen — the lobby is never dead.
2. **D2 — THE MARQUEE.** Hosts schedule shows; the lobby shows the next one
   with RSVP, a countdown and a reminder; when it goes live the Marquee is
   the live card.
3. **D3 — THE BRIDGE.** A ♥ in the deck is a standing heart: when he is
   seated in a show it lands on his chair and the swiper gets a push
   ("Dex is in the chair right now"). Matches who both attend get an After
   Party room. The deck ranks by show stats (Fan Favorites lead already).

## Rules kept

- ♥ in the deck never touches the host's choice. Nothing here names an
  engine RPC (gate 99 S).
- Blocks carry over: `deck_next` hides, `swipe` / `send_message` refuse,
  `my_matches` drops the pair.
- Every card is `public_profile` — the ONE read path (age not birthdate).
- No client writes `swipes` / `matches` / `messages` directly; RPCs only,
  participants-only RLS for reads.

## The server (`tools/DDL-deck.sql`)

`swipes` (one row per pair; re-swipe updates), `matches` (a<b, written by
the `swipes_match` trigger), `messages` (≤1000, realtime publication),
`match_reads`. RPCs: `deck_next(n)` (not me / not swiped / not blocked /
mutual seeking via the existing `gender`+`seeking` columns / my
`seek_min..seek_max`; Fan Favorites by hearts, then newest), `swipe`,
`my_matches` (other's short card, last message, unread), `send_message`,
`mark_read`. Guards: `lc_config` 8ae9e8a3…, `is_subscriber` 4dbe1822…,
`public_profile` 239070f7….

## Gate 99 `deck` (36 checks)

DDL shape · the deck's exclusions and ordering · the card's paint and tap
→ full card · like / pass rows · a pass never matches · one match, both
phones, IT'S A MATCH → chat · send, unread badge, mark_read, realtime
delivery, the 1000 limit, an outsider reads nothing · block both ways
drops the match and the card · zero console errors.

## Judgment calls

- **Chat on match, immediately** (Nick: "just like Tinder").
- **Fan Favorite badge at ≥5 hearts**; the deck orders by hearts first so
  people who show up on air get seen first — the game feeds the deck.
- **deck_next reuses the existing matching prefs** (`gender`, `seeking`,
  `seek_min/max`) rather than adding new ones; unknown gender is never
  hidden (same rule as the lobby's host matching).
- **No distance filter yet** — `zip_code` is there, geocoding isn't; D2 or
  later.
- **No undo** (Tinder sells it); a re-swipe through the full card could be
  a VIP perk later.
- **Realtime on `messages`** is a publication add, guarded by the
  publication's existence; if production's realtime is off the chat still
  works on open/reload, just without live delivery.

## Run log

_(Nick's read-back goes here.)_
