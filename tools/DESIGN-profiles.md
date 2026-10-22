# Profiles — the Tinder set, and its interface with the game

**Branch** `feat/profiles-tinder` · PR C of the 10/20–10/21 brief · built in the
planning session (not the Codespace agent) on Nick's 10/21 ruling: *"full go —
Tinder's architecture, and an interesting interface between the profiles and
the game."*

STATUS: client shipped in this PR; `tools/DDL-profiles.sql` **NOT RUN** — Nick
runs it in Studio (three pastes), then records the read-back below.

## What a card is

The shape is Tinder's: up to six photos ([0] is the primary), a 500-char bio,
city, optional pronouns, detail chips (job, school, height, looking for,
drinks, smokes, kids, sign), up to five interests from a curated list of ~60
(with "Live music" and "Karaoke" for the Portland crowd), and **three
prompts**.  Age is shown, never the birthdate.  Report and Block live on the
card.  A completeness bar nudges; nothing beyond name, age and a photo is
required.

The bench headshot stays what it was — the crowd's live look at him, taken on
every bench join — and is separate from the gallery.  When he has no gallery,
the card falls back to the headshot.

## The interface with the game (the ruling's second half)

1. **A contestant card, not a dating profile.**  The sheet opens from the
   name chip on any chair, the host's hero, or a bench lane, and paints
   **show stats first** — hearts, shows played, KEEPs, hosted — above the bio
   and prompts.  Same data as Tinder, show framing.
2. **The host ASKs from his prompts.**  The twenty prompts are rows in a
   real question deck, *From his profile* 🪪.  His three answers live in
   `profiles.prompts` as `{q: <questions.id>, a: <line>}`.  The ASK drawer,
   opened at a target, leads with a **`<NAME>'S PROMPTS`** tab showing his
   three answered prompts; tapping one is an ordinary `ask_question` with
   that question's id — **the engine is untouched**.  The spotlight card
   then shows *He wrote: "…"* under the question, for everyone in the room;
   he answers it live.
3. **Crowd ♥ on the card = a heart; mutual = After Party.**  Not in this PR
   — that is PR D (likes, matches, DMs that unlock only after the show ends,
   moderation).
4. **The bench stays blind to the host.**  She cannot open a bench card
   (`openProfile` refuses with "She picks blind — he opens up when he's
   seated"); the crowd can.  The server-side md5 mask in `active_members`
   is what keeps bench identities from her in the first place.

## The server (`tools/DDL-profiles.sql`)

Studio-safe by construction: one level of `$$`, no nested tags, and no guard
on a column the file overwrites (the 2026-10-21 run-log rules).

- **`profiles`** gains `bio, city, pronouns, details jsonb, interests text[],
  prompts jsonb, photos text[]` with CHECKs (bio ≤500, interests ≤5, prompts
  ≤3, photos ≤6, shapes).
- **`public_profile(uid)`** (security definer) is the ONE read path for
  someone else's card: age via `lc_age_of(birthdate)`, the primary photo,
  bio, stats computed server-side (`room_members` distinct rooms,
  `room_events` hearts, `rooms.winner_id` KEEPs, `rooms.host_id` hosted).
  The **full** card (gallery, details, prompts) comes back only for the
  owner, under `profiles_open_to_all`, for the host of a live room he is
  seated in, or — when PR B has created it — `is_subscriber(viewer)`
  (consulted through `to_regprocedure`, so this DDL runs before or after
  B).  Blocked either way → `{"blocked": true}`.
- **`lc_settings`** (sealed key/value) with `profiles_open_to_all = true`
  for the soft launch; **`lc_config()` is replaced** to report it, so its md5
  changes — the read-back records the new guard.  Nick flips the switch in
  Studio, no deploy.
- **`user_blocks`** (owner-only RLS) + `my_blocks()` (both directions),
  `block_user`, `unblock_user`.
- **The deck**: `question_decks` *From his profile* + 20 `questions`.
- **Storage**: bucket `profile-photos` (public read, 2 MB, jpeg/png/webp)
  with four policies; writes only under `<auth.uid()>/`.

## The phone

- `openProfile(uid)` → `public_profile` → `renderProfileCard` (bottom
  sheet, swipe gallery with dots, stats grid, bio, prompts, chips, VIP note
  when the card is short, Report / Block / Edit).  30-second cache per
  person that turns over with the open_to_all switch.
- `openProfileEditor()` from the header avatar (`#mebtn`) or Settings →
  *Edit my card*.  Photos are resized on the phone (longest edge 1080, JPEG
  .85) and uploaded to `<uid>/<ts>.jpg`; ◀ ▶ reorder, ✕ remove, slot 0 is
  MAIN.  Validation on the phone mirrors the CHECKs; the save is
  `update … select` so a silently-blocked write can't fake success.
- **Blocking masks, never thins.**  `blocksMaskProfs` renames a blocked
  person "Blocked" and drops the face in the profs map `loadRoomState`
  builds; the roster rows are untouched, so `roomCounts`' one derivation is
  unchanged (a blocked chair is still a chair).  Blocked hosts' rooms are
  off my lobby.  `my_blocks` is read at boot.
- `egPromptsTab` / `egPaintPromptAnswer` are the two hooks into the ASK
  flow; nothing else in the engine path moved.

## The harness

`backend-double.js` models the DDL: `settings`, `blocks`, `storage`,
`subscribers` (PR B's hook, ahead), `publicProfile()` with the same
visibility rule, the prompt deck seeded, the profiles CHECKs enforced on
write, `storage.upload` refusing any folder but the caller's.  The shim
gains `storage.from().upload/getPublicUrl` as a dumb transport; the harness
serves bucket URLs on the offline origin as a 1×1 PNG.

**Gate 97 `profiles`** (53 checks): the DDL's shape; the editor's save and
the phone-side limits; the storage policy; the contestant card (age not
date, stats above bio, the switch's short card, the host's full card for
her seated chair); the blind bench; block both ways without thinning the
roster; the prompts tab → `ask_question` → *He wrote* on the crowd's
spotlight; zero console errors.

## Judgment calls

- **Bucket is public-read.**  Signed URLs would need a refresh path in a
  single-file app; a card's photos are seen by the whole room anyway.
  Paths are `<uid>/<timestamp>.jpg` — not guessable without the uid.
- **Blocking masks instead of removing.**  Removing a blocked chair from my
  roster would blank a seat and break the one headcount derivation.
  Masking (name "Blocked", no face, no card, no lobby room) is the
  dating-app behaviour that fits a live show.  Server-side exclusion from
  matching/lobby lists is a follow-up if Nick wants it.
- **The host reads her seated chair's full card even when the switch is
  off** — otherwise the HIS PROMPTS tab would go dark for a non-subscriber
  host.  Bench stays blind regardless.
- **`is_subscriber` is consulted only if it exists**, so PR B and PR C land
  in either order.
- **Tier badge** is not on the card: chips/leaderboard don't exist in
  production yet.  Hearts / shows / KEEPs / hosted are.
- **Prompts are 120 chars**, one line — they are read aloud on air.
- `report_user` was left as-is (it already "also blocks for you" by its
  copy); `user_blocks` is the explicit both-ways table the card uses.  If
  `report_user` keeps its own list, the two can be merged in a follow-up.

## Run log

_(Nick's read-back goes here after the DDL runs: new `lc_config` md5,
`public_profile` md5, deck id, `profiles_open_to_all`, bucket, policies.)_
