# DESIGN — the subscription scaffold (feat/subscription-scaffold, PR B of the 10/20–10/21 brief)

The model is `docs/fun-and-money.md` (ruling 2: Last Call is also a
subscription app; subscription = convenience and status, tiers earned only,
✦ à la carte, no prices yet).  This file is the server side and the record:
what the DDL does and why it is shaped this way, the dry run, and — once
Nick has run it — the production read-back.

## What this PR builds, and what it leaves

Built: the two columns, the guard, `subscription_state` / `is_subscriber`
(THE hook), `comp_subscription`, the Studio view, the ration ×2 through
`throw_limits()`, the client's `lcSubscriber()` / `lcPerks()`, the lobby's
VIP pill, gate 98.  **Not built, by the brief:** billing, prices, the shop,
the profile card (PR C), the badge on the tile (PR C draws the card), and
the bench line's server order (below).

## The server (tools/DDL-subscription.sql — NOT RUN; three pastes for Nick)

One transaction, md5-guarded on the five 2026-10-20/21 read-backs, refuses
on drift.  Studio-safe by construction: one level of `$$` everywhere,
strings via `format()` / `quote_literal()`, no guard on a column the file
writes.

- **`profiles.subscription`** `'none' | 'active' | 'comped'` (default
  `'none'`) and **`profiles.subscription_until`** (null = no lapse date).
  Server-side only: **`profiles_subscription_guard`** (before insert or
  update) refuses any API-role write to either column — the same door as
  `room_members_throw_guard` on the throw columns.  A client's ordinary
  profile writes (`upsert({id, display_name})`, `update({face_json})`,
  the prefs save) pass untouched: on insert the columns take their
  defaults, on update they are not in the payload.
- **`subscription_state(uid)`** → the word, with `subscription_until`
  applied on the server clock: an expired comp or subscription reads
  `'none'`.  **`is_subscriber(uid)`** → `subscription_state(uid) <> 'none'`.
  Both `security definer` (the answer never depends on the caller's RLS view
  of `profiles`), both signed-in only (anon revoked).  PR C calls
  `is_subscriber` for the full-profile perk.
- **`comp_subscription(uid, until)`** — Studio-only (no API role may execute
  it).  `until` null = open-ended; `until` in the past ends the comp.
- **The ration ×2** is done WITHOUT touching `throw_at` / `throw_counts` /
  the member trigger: their production text is the reflowed 10/13 paste with
  no full md5 on record (DESIGN-combos-server.md "Run log"), so a splice
  could not be guarded or post-checked honestly.  `throw_limits()` — whose
  full md5 IS on record (`677f9cdd…`, the 10/20 live_secs run) — is
  **renamed `throw_limits_base()`** (body untouched: the post-check hashes
  it with its old name put back and demands `677f9cdd…`) and a new
  `throw_limits()` wraps it: the base numbers with `cheers` and `jeers`
  doubled when `is_subscriber(auth.uid())`, plus `subscriber: true`.  Every
  consumer calls `throw_limits()` by name, so each sees the caller's ration;
  `throw_counts()` carries the doubled numbers to the phone the way it
  always carried the numbers.  The wrapper is `security definer` so any
  role that could call `throw_limits()` still can.
- **`subscriptions_status`** — Studio-only view (security_invoker, revoked
  from the API roles): who is subscribed or comped, until when, and what
  `subscription_state` says right now.
- Post-checks, in-transaction: the renamed body's old-name hash; wrapper =
  base for a caller with no uid; the columns and the trigger; nobody is a
  subscriber yet; and — inside a sub-block that always unwinds itself — a
  lapsed comp reads none, a live comp reads comped and doubles the ration
  (with `request.jwt.claims` set to the test uid), and a `set local role
  authenticated` write to `subscription` is refused by the guard.  No
  profile leaves the file comped.

### Judgment calls (also in the PR body)

1. **Readable by every signed-in user, writable by none.**  The brief says
   "users read their own, never write".  `profiles` is read with
   `select("*")` for hosts and members today, so a column-level `revoke
   select` would break those reads with a permission error on the whole
   query; and the subscriber badge (PR C) needs everyone to read it.  The
   write half is the guard; the read half stays as the table is.
2. **Rename-and-wrap, not splice** for the ration (above).
3. **Bench priority is scaffolded, not enforced.**  The line's order is
   `line_position` minted by `join_line` and read by the seating engine —
   production text never read, no md5 on record, and a re-ordering trigger
   on `room_members` would be guessing at what `engine_award_seat` sorts
   by.  `lcPerks().benchPriority` is true for a subscriber and the double
   carries the same flag; the server order moves in a DDL of its own once
   `join_line` / `engine_award_seat` are read (preflight for that: their
   `pg_get_functiondef` md5s and lengths).
4. **Pack access is a no-op today** — every pack is free for everyone by
   ruling 1 (Halloween, then Holidays).  `lcPerks().packs` is wired so the
   day a pack carries a price a subscriber never sees it; nothing is gated
   now and nothing in the tray changed.
5. **`throw_limits()` is `stable`, no longer `immutable`** — it reads
   `profiles`.  Nothing in the catalog depends on it (guarded: zero
   `pg_depend` rows), so no index or generated column could have relied on
   immutability.
6. **The PR C guard.**  PR C replaces `lc_config()`.  This file guards on
   the 10/21 `lc_config` md5 like every DDL since 10/19; if C's DDL lands
   first the guard refuses by design and Nick swaps in C's read-back value.
7. **Gate number 98** — the brief reserves 97 for PR C.

## Dry run — NOT production (2026-10-21)

Against a throwaway PostgreSQL 16.15 holding a stand-in: `auth.users` and
`auth.uid()` (reads `request.jwt.claim.sub` / `request.jwt.claims`, as
Supabase's does), `public.profiles` with RLS (read all signed-in, write own),
`throw_limits()` as the 10/20 run left it (live_secs 4; the stand-in's
body hashes `c830a194…` / 442, not production's `677f9cdd…` — the dry run's
COPY of the file swaps that one guard value, and the other four stand-ins'
too; the committed file carries production's), a `throw_counts()` that reads
`throw_limits()` by name as production's does, and three profiles.

The run: every guard passes, every statement lands, the post-checks report
`comped caller ration {cheers 10, jeers 4, subscriber true, … rest
identical}` and `the guard refused the client write`, COMMIT.  Then, as the
API roles: a plain signed-in caller gets `throw_limits()` cheers 5 / jeers 2
(no `subscriber` key) and `throw_counts()` 5 / 2; a comped caller gets 10 /
4 / true and `throw_counts()` 10 / 4; a caller whose comp lapsed a minute
ago gets 5 / 2 and reads `none` / false; a direct `update profiles set
subscription = 'active'` and `… set subscription_until = …` are both refused
with the guard's words while a rename and an upsert of the same row pass;
`comp_subscription` and `subscriptions_status` are `permission denied` for
authenticated; anon gets `throw_limits()` (5) and is denied `is_subscriber`;
in Studio, `comp_subscription(uid, now())` ends a comp (reads none at once)
and an unknown uid raises `no profile …`.  A second run of the file is
refused by the first guard (`throw_limits` has moved) with nothing changed.
The preflight and read-back SELECTs each run as one statement; the
read-back's `base_with_old_name_md5` is the stand-in's `c830a194…` — in
production it must be `677f9cdd…`.

Says nothing about production's state — the preflight is that read.

## Run log

(not yet run)
