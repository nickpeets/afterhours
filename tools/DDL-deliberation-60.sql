-- DDL — deliberation is 60 seconds, ONE server value (RULING 10/15, Nick)
-- STATUS: NOT RUN.  Written for review.  Part A is read-only; Part B changes
-- production and must not be run until Nick has read Part A's output.
--
-- WHERE THE 90 COMES FROM (fix/rehearsal-1009):
--   * NOT the client.  index.html's LC_SECTION_SECS.deliberation was already 60,
--     but it is only a fallback: lcSectionLeft() and the phase pill read the
--     ROOM'S phase_deadline whenever the server sets one, and it always does
--     for deliberation.
--   * The SERVER.  The 10/9 conductor logs time openfloor->deliberation to
--     deliberation->deciding at 83.9s (s1-clean), 90.9s (s1-rerun) and 90.4s
--     (s1-take3); the crowd's pill read 1:26 four seconds in.  The deadline is
--     stamped by advance_phase when round 3's open floor ends (read 2026-10-11:
--     advance_phase computes each section's deadline and hands it to
--     engine_set_phase — e.g. engine_set_phase(.., 'openfloor', now() + 45s)).
--     The 90 matches the design handoff (design/HANDOFF-README.md:191,
--     "DELIBERATION 90s"), which the server was evidently built from; SPEC.md
--     and the client say 60.
--   * The battery never saw it: the double's advance_phase used 60.
--   The exact text of advance_phase's deliberation branch has NOT been read
--   for this change — Part A reads it.  Part B refuses to run unless that
--   text is exactly what this file expects.
--
-- THE CHANGE: one function, lc_deliberation_secs() = 60, read by
-- advance_phase AND handed to the client through lc_config (the
-- HOST_STALE_MS pattern, RULING 10/8).  The client keeps 60 as its fallback.

-- =============================================================== PART A
-- read-only.  Run, and paste the output back before Part B.
select md5(pg_get_functiondef('public.advance_phase(uuid)'::regprocedure)) as md5,
       length(pg_get_functiondef('public.advance_phase(uuid)'::regprocedure)) as chars;
-- expect: cf40a21d901322ac721e118f0c339bd4 | 2060   (as read 2026-10-11)

select n, line
  from regexp_split_to_table(pg_get_functiondef('public.advance_phase(uuid)'::regprocedure), E'\n')
       with ordinality as t(line, n)
 where line ~* 'deliberation|interval|seconds|90';
-- expect: ONE line holding `interval '90 seconds'` on the deliberation branch

select md5(pg_get_functiondef('public.lc_config()'::regprocedure)) as lc_config_md5,
       pg_get_functiondef('public.lc_config()'::regprocedure) as lc_config_def;
-- expect: the body from tools/DDL-stale-rooms-end.sql (host_stale_ms only)

select exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace
               and proname = 'lc_deliberation_secs') as already_there;
-- expect: false

-- =============================================================== PART B
-- DO NOT RUN until Part A has been read back and matches.
begin;

-- 1. the one number
create function public.lc_deliberation_secs()
returns integer language sql immutable as $$ select 60 $$;

-- 2. advance_phase reads it.  Rewritten IN PLACE from its own live
--    definition, so nothing else in the function can change: the guard
--    demands the 2026-10-11 md5 and EXACTLY ONE `interval '90 seconds'`,
--    and only that literal is replaced.
do $$
declare d text; h text; n int; d2 text;
begin
  d := pg_get_functiondef('public.advance_phase(uuid)'::regprocedure);
  h := md5(d);
  if h <> 'cf40a21d901322ac721e118f0c339bd4' then
    raise exception 'DRIFT: advance_phase md5 is %, expected cf40a21d901322ac721e118f0c339bd4 — re-read before running', h;
  end if;
  select count(*) into n from regexp_matches(d, 'interval ''90 seconds''', 'g');
  if n <> 1 then
    raise exception 'advance_phase holds % copies of interval ''90 seconds'' (expected 1) — the deliberation literal is not where Part A said; stop', n;
  end if;
  d2 := replace(d, 'interval ''90 seconds''', 'make_interval(secs => public.lc_deliberation_secs())');
  execute d2;
end $$;

-- 3. the client is handed the same number
create or replace function public.lc_config()
returns jsonb language sql stable security definer set search_path to 'public'
as $$ select jsonb_build_object('host_stale_ms', public.lc_host_stale_ms(),
                                'deliberation_secs', public.lc_deliberation_secs()) $$;
grant execute on function public.lc_config() to anon, authenticated;

-- 4. read-back, inside the transaction
select line from regexp_split_to_table(pg_get_functiondef('public.advance_phase(uuid)'::regprocedure), E'\n') as line
 where line ~* 'deliberation_secs|90 seconds';
-- expect: the deliberation line now reads make_interval(secs => public.lc_deliberation_secs()); no '90 seconds'
select public.lc_config();
-- expect: {"host_stale_ms": 120000, "deliberation_secs": 60}

commit;
