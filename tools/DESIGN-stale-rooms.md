# DESIGN — stale-host rooms END server-side

STATUS: RULED (Nick, 2026-10-08). **DDL RUN IN PRODUCTION 2026-10-08 (PT)**
by Nick in Studio (Supabase project doqtfyxgzlfvglfdkphx); pg_cron enabled
and `end-stale-rooms` scheduled every minute. Read-back at the bottom.

## The ruling, in one sentence
A `live` room whose host beat (`host_seen_at`, else `created_at`) is older
than HOST_STALE_MS (120 s) is ENDED on the server — not merely hidden by the
client. Warm-up (`preshow`) rooms included. HOST_STALE_MS stays the one number.

Calls made with the ruling (Nick, 10/8):
- pg_cron: enable it, every minute.
- The stale-host resume card (RULING Q1 v2, 9/30), the lobby ghost filter and
  openRoom's client janitor are **deleted**.
- Pre-column rows (null `host_seen_at`, old `created_at`) are swept too.
- A room's beat starts at creation: `rooms.host_seen_at default now()` is
  pinned in the DDL (production already had it; the client insert does not
  send the column). A fresh room with no heartbeat yet is NOT swept at 119 s.
- `end_show` was read before deciding how the sweep ends a room (below).

## What was read from production, 2026-10-08 (SOURCE, by the reads)
- `end_show(room_id uuid, winner_id uuid)` — md5 `e70916a656cd57ad6a6135ad13935b09`.
  SECURITY DEFINER, `search_path=public`, `#variable_conflict use_column`.
  Raises `not authenticated` when `auth.uid()` is null; raises
  `not host (room host=%, caller=%)` when the caller is not `rooms.host_id`;
  then `update rooms set status='ended', winner_id=…` and inserts a `finale`
  `room_events` row with `user_id = caller` and `payload {winner_id}`.
  Nothing else: no member, clock or backstage work.
- `heartbeat(room_id uuid)` — md5 `16e30eced0c2d95020e425f734a2ea53`.
  SECURITY DEFINER. One statement: `update room_members set last_seen=now()`
  keyed on the room and `auth.uid()`.
- `server_now` — md5 `f88188ac98a9f33fcf2befe23a0869b3` (untouched).
- `rooms`: RLS on. Policies `rooms_select_live` (status='live' OR host),
  `rooms_insert_host` (check auth.uid()=host_id), `rooms_update_host`
  (using/check auth.uid()=host_id). No DELETE policy. Table grants to
  anon/authenticated are blanket; RLS is the fence. Only index: the pkey.
  `host_seen_at timestamptz null default now()`, `created_at … default now()`.
- `room_events.user_id` is nullable.
- `pg_cron` 1.6.4 available in the dashboard, NOT installed; no `cron` schema.
- Live rooms at read time: 1 — and it was already stale.

## Why the sweep does not call `end_show`
`end_show` hard-requires `auth.uid() = host_id`. A cron job has no JWT, so
`auth.uid()` is null and it raises before the UPDATE. The only bypass is
forging `request.jwt.claims` with `set local` — a hack that also lies in
the finale row. So the ending moved into ONE internal function,
**`end_room(p_room, p_winner, p_actor, p_by)`**, revoked from
anon/authenticated; `end_show` keeps its gate byte-for-byte and delegates;
the sweep calls `end_room` directly. One body ends a show, two doors reach it.

Behaviour change flagged: `end_room` ends only `status='live'` rows, so a
second End-it is a no-op instead of a second finale row (the old `end_show`
wrote both every time).

## The DDL (one transaction, md5-guarded, refuses on drift)
Full text with commentary: `DDL-stale-rooms-end.sql` (handed to Nick to run
in Studio; the agent's tooling cannot write DDL into the SQL editor).

1. Guards: `end_show` and `heartbeat` md5 as above; refuses if any new name
   already exists.
2. `end_room(p_room, p_winner, p_actor, p_by)` — the one ending.
   Sweep-ended rooms: `user_id = host_id`, `payload.by = 'stale_host'`.
3. `end_show` → same gate, then `perform end_room(…, v_uid, 'host')`.
4. `lc_host_stale_ms()` = 120000 (immutable); `lc_config()` →
   `{host_stale_ms}` (granted to anon/authenticated).
5. `end_stale_rooms()` — `status='live' and coalesce(host_seen_at,
   created_at) < now() - lc_host_stale_ms()`, **no phase predicate**;
   `end_room(id, null, host_id, 'stale_host')` per row; returns the count.
   Revoked from anon/authenticated.
6. End-on-touch: `heartbeat` runs `end_stale_rooms()` first; new
   `list_live_rooms()` (granted to authenticated) sweeps then returns live
   rooms newest first — replaces the client's raw `rooms` select (lobby) and
   the boot-time "my live rooms" read.
7. `alter column host_seen_at set default now()`, same for `created_at`.
8. Partial index `rooms_live_beat_idx` on `coalesce(host_seen_at, created_at)
   where status='live'`.
9. Separately, after the transaction: `create extension pg_cron`, then
   `select cron.schedule('end-stale-rooms', '* * * * *', $$select
   public.end_stale_rooms()$$)`.

## Client (this branch)
- `HOST_STALE_MS` is `let`, 120000 as the fallback literal, overwritten from
  `lc_config()` at boot (`lcConfigLoad`). Exported with `LC_CONFIG`.
- Boot read and `loadRooms()` call `list_live_rooms()`. Whatever comes back
  is live and fresh; a booting host with a live row is a real reload and is
  walked straight in (RULING Q1 v1).
- Deleted: the `#staleresume` card and its handlers, `hostBeatStale`,
  `STALE_RESUME`, the lobby ghost filter, openRoom's client janitor
  (`rooms.update({status:'ended'})` from a viewer). openRoom answers a tap on
  a since-ended card from the row's `status`, with no write.
- `grep 120000 index.html` = 3: the fallback literal, its comment, and the
  unrelated roster-patch TTL.

## Double
`HOST_STALE_MS` exported; `endRoom()` / `sweepStaleRooms()` (+ `sweepLog`);
`end_show` delegates after the read-back's gate; `heartbeat` and
`list_live_rooms` sweep first; `end_stale_rooms` / `end_room` RPCs refuse
with `permission denied`; `lc_config` returns the constant. Labelled AS
WRITTEN IN THE DDL until the read-back lands.

## Gates
- **74** (file kept, scene rewritten): stale beat → the row is ended by the
  boot read, lobby, no card in the DOM, no client write, one finale
  `by='stale_host'`; 30 s → straight in; HOST_STALE_MS from lc_config equals
  the double's; no filter/janitor/card in source.
- **17** ghost scene flipped: the viewer's lobby read ends the ghost on the
  server; the viewer writes nothing.
- **82 stale-rooms-end** (new): threshold incl. warm-up; 119 s negative; a
  client-created room with no heartbeat not swept at 119 s, swept at 121 s;
  a member inside is routed out; heartbeat and list_live_rooms each sweep;
  revoked doors; idempotent ending; end_show's gate stands.

## Production run log (2026-10-08 PT / 2026-10-09 UTC)
Nick ran the transaction in Studio (the agent's tooling cannot write DDL
into the SQL editor), enabled pg_cron from Database → Extensions and ran
`select cron.schedule('end-stale-rooms', '* * * * *', $$select
public.end_stale_rooms()$$)`. Read back by the agent (read-only SELECTs):
- `pg_extension`: pg_cron 1.6.4 installed.
- `cron.job`: one row — schedule `* * * * *`, command
  `select public.end_stale_rooms()`, active=true.
- `cron.job_run_details`, last three: succeeded · 1 row at
  2026-10-09 00:17:00, 00:18:00, 00:19:00 UTC — the minute tick is running.
- `rooms.host_seen_at` default `now()`; index `rooms_live_beat_idx` present.
- Live rooms stale right now: 0. Finale events with `by='stale_host'`: 1 —
  the one stale room that was live at the 10/8 read was ended by the first
  sweep, as predicted.

## SOURCE — read back from production with `pg_get_functiondef`, 2026-10-09 UTC
md5 of `pg_get_functiondef(oid)` per function (the bodies are the DDL above
as run; a byte-for-byte paste of the read-back is the next doc pass):

| function | md5 |
|---|---|
| end_room(uuid,uuid,uuid,text) | d13fa71c612f53c41f28666c3d03d879 |
| end_show(uuid,uuid) | 6cdb55b2179b51f70fc88eaccb4f1a7d (was e70916a656cd57ad6a6135ad13935b09) |
| end_stale_rooms() | 0416e31b5f8db3a64df4e41420d3eae6 |
| heartbeat(uuid) | 9e5f1c385ec625c572e189491194605d (was 16e30eced0c2d95020e425f734a2ea53) |
| lc_config() | fc61398880b405cbe1dd7d317b913bfd |
| lc_host_stale_ms() | 644bde9d3eb43a62dcb4ce018f950e1b |
| list_live_rooms() | 2dbdb8683f5388f78d784a231f5601a7 |

The double's `HOST_STALE_MS`, `endRoom`, `sweepStaleRooms`, `heartbeat`,
`list_live_rooms`, `lc_config` and the revoked `end_stale_rooms` /
`end_room` doors are SOURCE as of this run.
