-- DDL — Halloween NOW, the Holidays pack, vaulting (feat/packs-halloween-now-holidays, PR A of the
-- 10/20–10/21 brief; rulings Nick 10/20–10/21)
-- STATUS: RUN in production 2026-10-21 ~16:56 PT by Nick (Supabase Studio, project afterhours). Read-back in
-- tools/DESIGN-looks-v2.md "Run log 2026-10-21". The file below is what actually ran (two Studio-forced edits, logged there).
-- Never run by an agent.  Record the read-back under "Run log" in tools/DESIGN-looks-v2.md.
--
-- What it does, in dependency order, ONE transaction, refuses on drift:
--   0. guards      — set_filter, lc_config and lc_tonight_pack are byte-for-byte the 2026-10-19
--                    read-backs (tools/DESIGN-looks-v2.md run log); the two room_members CHECKs
--                    carry the seventeen 2026-10-19 names and none of the new ones; the Halloween
--                    row is as PR #112's DDL inserted it; nothing this creates exists yet
--   1. constraints — room_members' two CHECKs widened by the Holidays pack's 16 slugs
--   2. set_filter  — the ONE allow-list line spliced (the 2026-10-06 pattern: the body is read
--                    from the server and never re-typed), post-checked to 1569 chars / 88c4017d…
--   3. Halloween   — ON NOW, for everyone, no tier or chip gate: starts_at moved back to
--                    2026-10-21 00:00 America/Los_Angeles (so it is live the instant this runs,
--                    whenever that is), ends_at moved up to 2026-11-01 00:00 America/Los_Angeles
--                    (ruling 1: through Oct 31 PT; on Nov 1 PT it vaults)
--   4. the Holidays row — 2026-11-01 00:00 → 2027-01-02 00:00 America/Los_Angeles.  The window
--                    opens at the very instant Halloween's closes, so lc_tonight_pack() (the
--                    enabled row whose [starts_at, ends_at) holds now(), latest-starting first)
--                    switches itself — the rotation PR #112 built, no deploy, nothing to flip.
--                    Eight 2D looks (shipped in the client with this PR) + eight ck- disguise
--                    slugs allow-listed AHEAD of their lenses, exactly as Halloween's seven were.
--   5. vaulting    — lc_pack_status(look_packs) → 'live' | 'scheduled' | 'vaulted' | 'off',
--                    computed from the window on the server clock (never a stored flag that can
--                    go stale), and look_packs_status, a Studio-only view over it.  A vaulted
--                    pack is one whose window has passed: it is never tonight_pack, so no phone
--                    ever draws a tile for it (gate 96), and its row STAYS for reuse — set a new
--                    window and it is scheduled again.  Nothing is ever deleted.
--
-- What this guards on (re-read before running if production has moved):
--   set_filter(uuid,text)  md5 a8ca64f4a6e17501e1761c4961aa0c1d, 1373 chars  (2026-10-19 read-back)
--   lc_config()            md5 18c19ce96c662a68bc82e327a14f5df4              (2026-10-19 read-back)
--   lc_tonight_pack()      md5 00ed780667ebed70cab458368bc616c1              (2026-10-19 read-back —
--                          production's own hash; a dry run's stand-in hashes differently, so the
--                          dry run swaps this one value in its COPY of the file — see the run log)
--   room_members_filter_curated / room_members_filter_pick_curated: the seventeen 2026-10-19 names
--   look_packs: the 'halloween' row with the 2026-10-19 window; no 'holidays' row
--   lc_pack_status, look_packs_status: must not exist
--
-- Expected after: set_filter 1569 chars (1373 + the 196 of the sixteen added names), md5
-- 88c4017d9db2fc1dd69cf877729e4c41 — computed from the SOURCE section of DESIGN-filter-rules.md
-- (which reproduces 1203 / de467837…, 1229 / a9d3bf79… and 1373 / a8ca64f4… with the earlier lines)
-- with the one line replaced, and asserted by the block itself.
--
-- If Studio runs statements one at a time and a guard raises, the transaction is left open:
-- run `rollback;` before anything else.

-- ================================================================ 0. PREFLIGHT (read-only; run first, record the output)
-- select md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure))    as set_filter_md5,
--        length(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure)) as set_filter_chars;
-- -- expect: a8ca64f4a6e17501e1761c4961aa0c1d | 1373
-- select md5(pg_get_functiondef('public.lc_config()'::regprocedure)) as lc_config_md5,
--        md5(pg_get_functiondef('public.lc_tonight_pack()'::regprocedure)) as lc_tonight_pack_md5;
-- -- expect: 18c19ce96c662a68bc82e327a14f5df4 | 00ed780667ebed70cab458368bc616c1
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.room_members'::regclass and conname like 'room_members_filter%' order by conname;
-- -- expect two rows, each listing the seventeen names through ck-ghost and nothing else
-- select slug, starts_at, ends_at, enabled from public.look_packs order by slug;
-- -- expect one row: halloween | 2026-10-24 07:00:00+00 | 2026-11-02 08:00:00+00 | t
-- select to_regprocedure('public.lc_pack_status(public.look_packs)') as lc_pack_status, to_regclass('public.look_packs_status') as look_packs_status;
-- -- expect: null | null

begin;

-- ================================================================ 0. guards
do $$
declare h text; n int; r record;
begin
  h := md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure));
  if h <> 'a8ca64f4a6e17501e1761c4961aa0c1d' then
    raise exception 'DRIFT: set_filter md5 is %, expected a8ca64f4a6e17501e1761c4961aa0c1d (the 2026-10-19 read-back) - nothing changed; re-read before running', h;
  end if;
  h := md5(pg_get_functiondef('public.lc_config()'::regprocedure));
  if h <> '18c19ce96c662a68bc82e327a14f5df4' then
    raise exception 'DRIFT: lc_config md5 is %, expected 18c19ce96c662a68bc82e327a14f5df4 (the 2026-10-19 read-back) - nothing changed; re-read before running', h;
  end if;
  h := md5(pg_get_functiondef('public.lc_tonight_pack()'::regprocedure));
  if h <> '00ed780667ebed70cab458368bc616c1' then
    raise exception 'DRIFT: lc_tonight_pack md5 is %, expected 00ed780667ebed70cab458368bc616c1 (the 2026-10-19 read-back) - nothing changed; re-read before running', h;
  end if;
  select count(*) into n from pg_constraint
   where conrelid = 'public.room_members'::regclass
     and conname in ('room_members_filter_curated','room_members_filter_pick_curated')
     and pg_get_constraintdef(oid) like '%''ck-ghost''%' and pg_get_constraintdef(oid) like '%''candlelight''%'
     and pg_get_constraintdef(oid) not like '%''snowfall''%' and pg_get_constraintdef(oid) not like '%''ck-santa''%';
  if n <> 2 then
    raise exception 'DRIFT: expected the two room_members filter CHECKs with the seventeen 2026-10-19 names, found % - nothing changed', n;
  end if;
  select * into r from public.look_packs where slug = 'halloween';
  if not found then
    raise exception 'DRIFT: no halloween row in look_packs - nothing changed';
  end if;
  -- starts_at is NOT guarded: it was already moved to 2026-10-20 17:00:07+00 by the 10/20 rehearsal, and step 3 overwrites it anyway
  if r.ends_at <> '2026-11-02 08:00:00+00'::timestamptz or not r.enabled then
    raise exception 'DRIFT: the halloween row is % .. % enabled=%, expected ends 2026-11-02 08:00+00 enabled=t (PR #112''s row) - nothing changed; re-read before running', r.starts_at, r.ends_at, r.enabled;
  end if;
  if exists (select 1 from public.look_packs where slug = 'holidays') then
    raise exception 'DRIFT: a holidays row already exists - nothing changed';
  end if;
  if to_regprocedure('public.lc_pack_status(public.look_packs)') is not null then
    raise exception 'DRIFT: public.lc_pack_status already exists - nothing changed';
  end if;
  if to_regclass('public.look_packs_status') is not null then
    raise exception 'DRIFT: public.look_packs_status already exists - nothing changed';
  end if;
end $$;

-- ================================================================ 1. constraints: the curated rack, widened by the Holidays pack's 16 slugs
alter table public.room_members drop constraint room_members_filter_curated;
alter table public.room_members add  constraint room_members_filter_curated
  check (filter is null or filter in ('grade','noir','ck-objects','ck-express',
    'candlelight','nightvision','vhs','fog','cobweb','lantern',
    'ck-vampire','ck-skeleton','ck-zombie','ck-witch','ck-devil','ck-pumpkin','ck-ghost',
    'fairylights','snowfall','frosted','fireplace','candycane','snowglobe','tinsel','countdown',
    'ck-santa','ck-reindeer','ck-elf','ck-sweater','ck-krampus','ck-nutcracker','ck-snowman','ck-champagne'));
alter table public.room_members drop constraint room_members_filter_pick_curated;
alter table public.room_members add  constraint room_members_filter_pick_curated
  check (filter_pick is null or filter_pick in ('grade','noir','ck-objects','ck-express',
    'candlelight','nightvision','vhs','fog','cobweb','lantern',
    'ck-vampire','ck-skeleton','ck-zombie','ck-witch','ck-devil','ck-pumpkin','ck-ghost',
    'fairylights','snowfall','frosted','fireplace','candycane','snowglobe','tinsel','countdown',
    'ck-santa','ck-reindeer','ck-elf','ck-sweater','ck-krampus','ck-nutcracker','ck-snowman','ck-champagne'));

-- ================================================================ 2. set_filter: splice the ONE allow-list line (body read from the server, never re-typed)
do $$
declare
  v_before text := pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure);
  v_old text;   -- built below, not dollar-quoted: Studio's editor rejects nested dollar-quotes (2026-10-21 run log)
  v_new text;
  v_after text;
  v_hits  int;
begin
  select format('if name not in (%s) then raise exception %L; end if;',
                string_agg(quote_literal(x), ',' order by o), 'no such filter')
    into v_old
    from unnest(array['grade','noir','ck-objects','ck-express','candlelight','nightvision','vhs','fog','cobweb','lantern',
                      'ck-vampire','ck-skeleton','ck-zombie','ck-witch','ck-devil','ck-pumpkin','ck-ghost']) with ordinality as t(x, o);
  select format('if name not in (%s) then raise exception %L; end if;',
                string_agg(quote_literal(x), ',' order by o), 'no such filter')
    into v_new
    from unnest(array['grade','noir','ck-objects','ck-express','candlelight','nightvision','vhs','fog','cobweb','lantern',
                      'ck-vampire','ck-skeleton','ck-zombie','ck-witch','ck-devil','ck-pumpkin','ck-ghost',
                      'fairylights','snowfall','frosted','fireplace','candycane','snowglobe','tinsel','countdown',
                      'ck-santa','ck-reindeer','ck-elf','ck-sweater','ck-krampus','ck-nutcracker','ck-snowman','ck-champagne']) with ordinality as t(x, o);
  if md5(v_before) <> 'a8ca64f4a6e17501e1761c4961aa0c1d' then
    raise exception 'set_filter is not the 2026-10-19 read-back (% chars, md5 %) - nothing changed; re-read it first',
      length(v_before), md5(v_before);
  end if;
  v_hits := (length(v_before) - length(replace(v_before, v_old, ''))) / length(v_old);
  if v_hits <> 1 then
    raise exception 'the allow-list line occurs % times in set_filter, expected exactly 1 - nothing changed', v_hits;
  end if;
  execute replace(v_before, v_old, v_new);
  v_after := pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure);
  if replace(v_after, v_new, v_old) <> v_before then
    raise exception 'post-check failed: set_filter differs by more than the one line - rolling back';
  end if;
  if md5(v_after) <> '88c4017d9db2fc1dd69cf877729e4c41' or length(v_after) <> 1569 then
    raise exception 'post-check failed: set_filter is % chars, md5 % (expected 1569, 88c4017d9db2fc1dd69cf877729e4c41) - rolling back',
      length(v_after), md5(v_after);
  end if;
  raise notice 'set_filter: % chars md5 %  ->  % chars md5 %',
    length(v_before), md5(v_before), length(v_after), md5(v_after);
end $$;

-- ================================================================ 3. Halloween: on NOW for everyone, through Oct 31 PT
update public.look_packs
   set starts_at = '2026-10-21 00:00'::timestamp at time zone 'America/Los_Angeles',   -- = 2026-10-21 07:00+00 (PDT): in the past the moment this runs
       ends_at   = '2026-11-01 00:00'::timestamp at time zone 'America/Los_Angeles',   -- = 2026-11-01 07:00+00 (PDT; DST ends two hours later): Oct 31 is the last night
       enabled   = true
 where slug = 'halloween';

-- ================================================================ 4. the Holidays pack: Nov 1 – Jan 1, Pacific, opening the instant Halloween closes
insert into public.look_packs (slug, name, icon, looks, starts_at, ends_at, enabled) values (
  'holidays', 'Holidays', '🎄',
  array['fairylights','snowfall','frosted','fireplace','candycane','snowglobe','tinsel','countdown',
        'ck-santa','ck-reindeer','ck-elf','ck-sweater','ck-krampus','ck-nutcracker','ck-snowman','ck-champagne'],
  '2026-11-01 00:00'::timestamp at time zone 'America/Los_Angeles',   -- = 2026-11-01 07:00+00 (PDT): the same instant Halloween ends
  '2027-01-02 00:00'::timestamp at time zone 'America/Los_Angeles',   -- = 2027-01-02 08:00+00 (PST): Jan 1 is the last night
  true);

-- ================================================================ 5. vaulting: a pack's status is its window on the server clock
-- 'live' is the one lc_tonight_pack() may report; 'vaulted' is a window that has passed — never
-- tonight_pack, never a tile, the row kept for reuse (set a new window and it is 'scheduled').
create function public.lc_pack_status(p public.look_packs)
returns text
language sql stable
as $$
  select case
    when not p.enabled        then 'off'
    when now() >= p.ends_at   then 'vaulted'
    when now() <  p.starts_at then 'scheduled'
    else 'live'
  end
$$;
revoke all on function public.lc_pack_status(public.look_packs) from public, anon, authenticated;
comment on function public.lc_pack_status(public.look_packs) is
  'live | scheduled | vaulted | off, from the row''s window on the server clock (PR A, 10/21). vaulted = the window has passed: the row stays for reuse, lc_tonight_pack() never reports it, no phone draws a tile for it.';
-- the Studio-only ledger: every pack with its status.  Service role / Studio only — the same seal as the table.
create view public.look_packs_status with (security_invoker = true) as
  select p.slug, p.name, public.lc_pack_status(p) as status, p.starts_at, p.ends_at, p.enabled, p.looks
    from public.look_packs p
   order by p.starts_at;
revoke all on table public.look_packs_status from public, anon, authenticated;
comment on view public.look_packs_status is
  'Studio-only read of look_packs with lc_pack_status(). To vault a pack early: update look_packs set ends_at = now() where slug = ''…''. To reuse a vaulted pack: give it a new window. Rows are never deleted.';

-- ================================================================ 6. post-checks
do $$
declare r record; j jsonb; n int;
begin
  select starts_at, ends_at into r from public.look_packs where slug = 'halloween';
  if r.starts_at <> '2026-10-21 07:00:00+00'::timestamptz or r.ends_at <> '2026-11-01 07:00:00+00'::timestamptz then
    raise exception 'post-check failed: the Halloween window is % .. %, expected 2026-10-21 07:00+00 .. 2026-11-01 07:00+00 - rolling back', r.starts_at, r.ends_at;
  end if;
  select starts_at, ends_at into r from public.look_packs where slug = 'holidays';
  if r.starts_at <> '2026-11-01 07:00:00+00'::timestamptz or r.ends_at <> '2027-01-02 08:00:00+00'::timestamptz then
    raise exception 'post-check failed: the Holidays window is % .. %, expected 2026-11-01 07:00+00 .. 2027-01-02 08:00+00 - rolling back', r.starts_at, r.ends_at;
  end if;
  if (select ends_at from public.look_packs where slug = 'halloween') <> (select starts_at from public.look_packs where slug = 'holidays') then
    raise exception 'post-check failed: Halloween does not hand over to Holidays at one instant - rolling back';
  end if;
  select count(*) into n from public.look_packs p where public.lc_pack_status(p) = 'live';
  if n <> 1 then
    raise exception 'post-check failed: % packs are live right now, expected exactly 1 - rolling back', n;
  end if;
  j := public.lc_config();
  if not (j ? 'host_stale_ms') or not (j ? 'tonight_pack') then
    raise exception 'post-check failed: lc_config() returned % - rolling back', j;
  end if;
  if (j->'tonight_pack'->>'slug') is distinct from (select p.slug from public.look_packs p where public.lc_pack_status(p) = 'live') then
    raise exception 'post-check failed: lc_config() says tonight_pack % but the live row is % - rolling back', j->'tonight_pack'->>'slug', (select p.slug from public.look_packs p where public.lc_pack_status(p) = 'live');
  end if;
  raise notice 'lc_config() now: %', j;
  raise notice 'look_packs_status: %', (select jsonb_agg(jsonb_build_object('slug', slug, 'status', status)) from public.look_packs_status);
  raise notice 'set_filter md5 after: %  lc_config md5 after: %  lc_tonight_pack md5 after: %',
    md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure)),
    md5(pg_get_functiondef('public.lc_config()'::regprocedure)),
    md5(pg_get_functiondef('public.lc_tonight_pack()'::regprocedure));
end $$;

commit;

-- ================================================================ READ BACK (read-only; run after, record under "Run log" in tools/DESIGN-looks-v2.md)
-- select md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure)), length(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure));
-- -- expect: 88c4017d9db2fc1dd69cf877729e4c41 | 1569
-- select md5(pg_get_functiondef('public.lc_config()'::regprocedure)), md5(pg_get_functiondef('public.lc_tonight_pack()'::regprocedure)), md5(pg_get_functiondef('public.lc_pack_status(public.look_packs)'::regprocedure));
-- -- expect: 18c19ce96c662a68bc82e327a14f5df4 | 00ed780667ebed70cab458368bc616c1 | 51d7be429e260c1ad5ff92fd25704165 (read back 2026-10-21 — the next DDL's guard)
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.room_members'::regclass and conname like 'room_members_filter%' order by conname;
-- select * from public.look_packs_status;
-- -- expect, run on Oct 21–31 PT: halloween live, holidays scheduled
-- select public.lc_config();     -- expect tonight_pack = the halloween row (thirteen looks) until 2026-11-01 00:00 PT, then the holidays row
-- select relrowsecurity from pg_class where oid = 'public.look_packs'::regclass;   -- expect: true
-- select p.proname, p.proacl from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('set_filter','lc_config','lc_tonight_pack','lc_pack_status') order by 1;
-- -- expect: set_filter and lc_config ACLs unchanged; lc_tonight_pack and lc_pack_status with no anon/authenticated entry

-- ================================================================ VAULTING / REUSE (Nick, in Studio, any time — no deploy)
-- select * from public.look_packs_status;                                                           -- what is live, what is scheduled, what is vaulted
-- update public.look_packs set ends_at = now() where slug = 'halloween';                             -- vault it early (it is gone from every tray at the next openRoom)
-- update public.look_packs set starts_at = '2027-10-24 00:00'::timestamp at time zone 'America/Los_Angeles',
--                              ends_at   = '2027-11-01 00:00'::timestamp at time zone 'America/Los_Angeles' where slug = 'halloween';   -- reuse: next year's window
-- update public.look_packs set enabled = false where slug = 'holidays';                              -- pull it without touching its window

-- ================================================================ UNDO (one transaction)
-- begin;
-- update public.room_members set filter = null      where filter      in ('fairylights','snowfall','frosted','fireplace','candycane','snowglobe','tinsel','countdown','ck-santa','ck-reindeer','ck-elf','ck-sweater','ck-krampus','ck-nutcracker','ck-snowman','ck-champagne');
-- update public.room_members set filter_pick = null where filter_pick in ('fairylights','snowfall','frosted','fireplace','candycane','snowglobe','tinsel','countdown','ck-santa','ck-reindeer','ck-elf','ck-sweater','ck-krampus','ck-nutcracker','ck-snowman','ck-champagne');
-- -- the two drop/add pairs with the seventeen 2026-10-19 names; the splice DO block with v_old / v_new swapped and the length 1373 / md5 a8ca64f4a6e17501e1761c4961aa0c1d
-- drop view public.look_packs_status;
-- drop function public.lc_pack_status(public.look_packs);
-- delete from public.look_packs where slug = 'holidays';
-- update public.look_packs set starts_at = '2026-10-24 07:00:00+00', ends_at = '2026-11-02 08:00:00+00' where slug = 'halloween';
-- commit;
