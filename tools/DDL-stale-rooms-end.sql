-- DDL — stale-host rooms END server-side (ruling, Nick 2026-10-08)
-- STATUS: RUN IN PRODUCTION 2026-10-08 (PT) by Nick in Studio; read-back in tools/DESIGN-stale-rooms.md.
-- Read back 2026-10-08 from production (project doqtfyxgzlfvglfdkphx):
--   end_show   md5 e70916a656cd57ad6a6135ad13935b09  (SECURITY DEFINER; raises
--              'not authenticated' when auth.uid() is null and 'not host' when
--              caller <> rooms.host_id; then status='ended', winner_id, and a
--              'finale' room_events row with user_id = caller)
--   heartbeat  md5 16e30eced0c2d95020e425f734a2ea53  (SECURITY DEFINER;
--              one UPDATE of room_members.last_seen for auth.uid())
--   rooms RLS on: select_live (status='live' or host), insert_host, update_host
--              (auth.uid()=host_id). No delete policy. Table grants to
--              anon/authenticated are blanket; RLS is the fence.
--   room_events.user_id is NULLABLE. pg_cron: available 1.6.4, NOT installed.
--   rooms has no index beyond the pkey. Live rooms right now: 1, and it IS
--   stale — the first sweep will end it.
--
-- WHY NOT CALL end_show FROM THE SWEEP: end_show hard-requires auth.uid() =
-- host_id. A cron job has no JWT, so auth.uid() is null and it raises before
-- the UPDATE. The only ways around are (a) faking request.jwt.claims with
-- `set local` — a hack that also lies in the finale row — or (b) splitting
-- the body. (b) is what this does: ONE internal function, end_room(), holds
-- the ending (row + finale event); end_show keeps its gate byte-for-byte and
-- delegates to it; the sweep calls it directly. One path ends a show.
-- end_room() is revoked from anon/authenticated so it is not a public door.

begin;

-- ---------------------------------------------------------------- guards
do $$
declare h text;
begin
  select md5(pg_get_functiondef('public.end_show(uuid,uuid)'::regprocedure)) into h;
  if h <> 'e70916a656cd57ad6a6135ad13935b09' then
    raise exception 'DRIFT: end_show md5 is %, expected e70916a656cd57ad6a6135ad13935b09 — re-read before running', h;
  end if;
  select md5(pg_get_functiondef('public.heartbeat(uuid)'::regprocedure)) into h;
  if h <> '16e30eced0c2d95020e425f734a2ea53' then
    raise exception 'DRIFT: heartbeat md5 is %, expected 16e30eced0c2d95020e425f734a2ea53 — re-read before running', h;
  end if;
  if exists (select 1 from pg_proc where pronamespace='public'::regnamespace
             and proname in ('end_room','end_stale_rooms','list_live_rooms','lc_config','lc_host_stale_ms')) then
    raise exception 'DRIFT: one of end_room/end_stale_rooms/list_live_rooms/lc_config already exists';
  end if;
end $$;

-- ---------------------------------------------------------------- 1. the one ending
-- The body end_show has today, minus its auth gate, plus an explicit actor.
-- user_id on the finale row: the host for a host ending; for the sweep the
-- host too (it is HER show ending), with payload.by = 'stale_host' so the
-- ledger says why. (room_events.user_id is nullable, but every reader today
-- expects a uuid there.)
create or replace function public.end_room(p_room uuid, p_winner uuid, p_actor uuid, p_by text)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  update public.rooms set status = 'ended', winner_id = p_winner
    where id = p_room and status = 'live';
  if not found then return; end if;          -- already ended: idempotent, no second finale
  insert into public.room_events (room_id, user_id, type, payload)
    values (p_room, p_actor, 'finale', jsonb_build_object('winner_id', p_winner, 'by', p_by));
end $function$;
revoke all on function public.end_room(uuid,uuid,uuid,text) from public, anon, authenticated;

-- ---------------------------------------------------------------- 2. end_show delegates
-- Gate unchanged (same messages, same checks, same signature). Only the
-- ending moved into end_room. Note the original wrote status='ended' even on
-- an already-ended room and always inserted a finale; end_room's
-- `status='live'` predicate makes a double End-it a no-op instead of a
-- second finale row. Flagging that as the one behaviour change.
create or replace function public.end_show(room_id uuid, winner_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_uid uuid; v_host uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'not authenticated'; end if;
  select r.host_id into v_host from public.rooms r where r.id = end_show.room_id;
  if v_host is distinct from v_uid then
    raise exception 'not host (room host=%, caller=%)', v_host, v_uid;
  end if;
  perform public.end_room(end_show.room_id, end_show.winner_id, v_uid, 'host');
end $function$;

-- ---------------------------------------------------------------- 3. the sweep
-- HOST_STALE_MS = 120000 lives here as the ONE server number (lc_config
-- below hands it to the client). Beat = host_seen_at, else created_at — so
-- pre-column rows (null host_seen_at) are swept on created_at, per ruling.
-- Warm-up rooms (phase='preshow') included: no phase predicate.
create or replace function public.lc_host_stale_ms()
returns integer language sql immutable as $$ select 120000 $$;

create or replace function public.end_stale_rooms()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare r record; n integer := 0;
begin
  for r in
    select id, host_id from public.rooms
     where status = 'live'
       and coalesce(host_seen_at, created_at) < now() - (public.lc_host_stale_ms() || ' milliseconds')::interval
  loop
    perform public.end_room(r.id, null, r.host_id, 'stale_host');
    n := n + 1;
  end loop;
  return n;
end $function$;
revoke all on function public.end_stale_rooms() from public, anon, authenticated;

-- what the client reads once at boot; the client keeps 120000 as its
-- fallback literal and a gate asserts the two agree
create or replace function public.lc_config()
returns jsonb language sql stable security definer set search_path to 'public'
as $$ select jsonb_build_object('host_stale_ms', public.lc_host_stale_ms()) $$;
grant execute on function public.lc_config() to anon, authenticated;

-- ---------------------------------------------------------------- 4. end-on-touch
-- heartbeat: sweep first, then the member's own beat. Every member in any
-- room calls this every ~25 s, so a stale room is ended by the next beat
-- anywhere, not just by cron.
create or replace function public.heartbeat(room_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $function$
#variable_conflict use_column
declare v_room uuid := heartbeat.room_id;
begin
  perform public.end_stale_rooms();
  update public.room_members
     set last_seen = now()
   where room_members.room_id = v_room and room_members.user_id = auth.uid();
end; $function$;

-- the lobby read: sweep, then the same rows the RLS select_live policy
-- returns today (live rooms, plus the caller's own in any status — kept so
-- nothing the lobby or boot read sees changes shape). Replaces the client's
-- raw `from("rooms").select("*").eq("status","live")` and the boot-time
-- "my live rooms" read.
create or replace function public.list_live_rooms()
returns setof public.rooms
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  perform public.end_stale_rooms();
  return query
    select * from public.rooms
     where status = 'live'
     order by created_at desc;
end $function$;
grant execute on function public.list_live_rooms() to authenticated;

-- ---------------------------------------------------------------- 5. beat starts at creation
-- The client insert (index.html, from("rooms").insert({host_id,contestant_name,
-- tagline,status})) does not send host_seen_at; production already defaults
-- it to now() (read 2026-10-08). Pinned here so a fresh room with no beat yet
-- has a beat, and is NOT swept at 119 s.
alter table public.rooms alter column host_seen_at set default now();
alter table public.rooms alter column created_at  set default now();

-- ---------------------------------------------------------------- 6. index for the sweep
create index if not exists rooms_live_beat_idx
  on public.rooms (coalesce(host_seen_at, created_at)) where status = 'live';

commit;

-- ================================================================ separate, after Nick's go
-- pg_cron is a dashboard extension enable (Database → Extensions → pg_cron)
-- or:
--   create extension if not exists pg_cron;
-- then, once, as postgres:
--   select cron.schedule('end-stale-rooms', '* * * * *', $$select public.end_stale_rooms()$$);
-- verify:  select jobid, schedule, command, active from cron.job;
--          select * from cron.job_run_details order by start_time desc limit 5;
-- The cron job runs as the postgres role, so end_stale_rooms() needs no
-- grant for it; the revoke above only closes the public door.

-- ================================================================ read-back after the run
-- select proname, md5(pg_get_functiondef(oid)) from pg_proc
--  where pronamespace='public'::regnamespace
--    and proname in ('end_show','end_room','end_stale_rooms','heartbeat','list_live_rooms','lc_config','lc_host_stale_ms');
-- paste bodies into tools/DESIGN-stale-rooms.md as SOURCE.
