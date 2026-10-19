-- DDL — themed look packs + the Halloween pack (feat/looks-v2 PR B, ruling Nick 2026-10-18)
-- STATUS: NOT RUN.  Shown to Nick for review; nothing here has touched production.
--
-- What it does, in dependency order, ONE transaction, refuses on drift:
--   0. guards      — set_filter and lc_config are byte-for-byte the last read-backs
--                    (tools/DESIGN-filter-rules.md run log 2026-10-06; tools/DESIGN-
--                    stale-rooms.md SOURCE 2026-10-09); nothing this creates exists yet
--   1. constraints — room_members' two CHECKs widened by the 13 new slugs
--   2. set_filter  — the ONE allow-list line spliced (the 2026-10-06 pattern: the body
--                    is read from the server and never re-typed), post-checked
--   3. look_packs  — the table: a pack is a named list of slugs with a date window.
--                    RLS on, no policies, no grants: it is read ONLY through lc_config
--                    (security definer).  Nick edits rows in Studio to switch packs —
--                    no deploy.
--   4. lc_tonight_pack() — the enabled row whose window holds now(); lc_config() gains
--                    `tonight_pack` (null when none).  create or replace keeps lc_config's
--                    owner and its anon/authenticated grant.
--   5. the Halloween row — Oct 24 00:00 through Nov 1 23:59:59 America/Los_Angeles
--                    (DST ends Nov 1 2026 02:00; the window is stored as timestamptz,
--                    so the end instant is 2026-11-02 00:00 PST = 2026-11-02 08:00 UTC).
--                    Six 2D looks + seven ck- disguise slugs.  No lens exists for the
--                    seven yet: the client shows no tile for a slug it cannot draw, so
--                    nobody can pick one (tools/DESIGN-looks-v2.md, PR B).
--
-- What this guards on (re-read before running if production has moved):
--   set_filter(uuid,text)  md5 a9d3bf79f637cf84c3017b616dfd9ec5, 1229 chars  (2026-10-06 read-back)
--   lc_config()            md5 fc61398880b405cbe1dd7d317b913bfd              (2026-10-09 read-back)
--   room_members_filter_curated / room_members_filter_pick_curated: the four names
--   look_packs, lc_tonight_pack: must not exist
--
-- Expected after: set_filter 1373 chars (1229 + the 144 of the thirteen added
-- names), md5 a8ca64f4a6e17501e1761c4961aa0c1d — computed from the SOURCE section of
-- DESIGN-filter-rules.md (which de-indents to the recorded 1203 / de467837… and, with
-- the 2026-10-06 line, to the recorded 1229 / a9d3bf79…) with the one line replaced,
-- and asserted by the block itself.
--
-- If Studio runs statements one at a time and a guard raises, the transaction is
-- left open: run `rollback;` before anything else.

-- ================================================================ 0. PREFLIGHT (read-only; run first, record the output)
-- select md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure))    as set_filter_md5,
--        length(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure)) as set_filter_chars;
-- -- expect: a9d3bf79f637cf84c3017b616dfd9ec5 | 1229
-- select md5(pg_get_functiondef('public.lc_config()'::regprocedure)) as lc_config_md5;
-- -- expect: fc61398880b405cbe1dd7d317b913bfd
-- select conname, pg_get_constraintdef(oid) from pg_constraint
--  where conrelid = 'public.room_members'::regclass and conname like 'room_members_filter%' order by conname;
-- -- expect two rows, each listing grade, noir, ck-objects, ck-express and nothing else
-- select to_regclass('public.look_packs') as look_packs, to_regprocedure('public.lc_tonight_pack()') as lc_tonight_pack;
-- -- expect: null | null

begin;

-- ================================================================ 0. guards
do $$
declare h text; n int;
begin
  h := md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure));
  if h <> 'a9d3bf79f637cf84c3017b616dfd9ec5' then
    raise exception 'DRIFT: set_filter md5 is %, expected a9d3bf79f637cf84c3017b616dfd9ec5 (the 2026-10-06 read-back) - nothing changed; re-read before running', h;
  end if;
  h := md5(pg_get_functiondef('public.lc_config()'::regprocedure));
  if h <> 'fc61398880b405cbe1dd7d317b913bfd' then
    raise exception 'DRIFT: lc_config md5 is %, expected fc61398880b405cbe1dd7d317b913bfd (the 2026-10-09 read-back) - nothing changed; re-read before running', h;
  end if;
  select count(*) into n from pg_constraint
   where conrelid = 'public.room_members'::regclass
     and conname in ('room_members_filter_curated','room_members_filter_pick_curated')
     and pg_get_constraintdef(oid) like '%''grade''%' and pg_get_constraintdef(oid) like '%''ck-express''%'
     and pg_get_constraintdef(oid) not like '%''candlelight''%';
  if n <> 2 then
    raise exception 'DRIFT: expected the two room_members filter CHECKs with the four 2026-10-06 names, found % - nothing changed', n;
  end if;
  if to_regclass('public.look_packs') is not null then
    raise exception 'DRIFT: public.look_packs already exists - nothing changed';
  end if;
  if exists (select 1 from pg_proc where pronamespace = 'public'::regnamespace and proname = 'lc_tonight_pack') then
    raise exception 'DRIFT: public.lc_tonight_pack already exists - nothing changed';
  end if;
end $$;

-- ================================================================ 1. constraints: the curated rack, widened by the pack's 13 slugs
alter table public.room_members drop constraint room_members_filter_curated;
alter table public.room_members add  constraint room_members_filter_curated
  check (filter is null or filter in ('grade','noir','ck-objects','ck-express',
    'candlelight','nightvision','vhs','fog','cobweb','lantern',
    'ck-vampire','ck-skeleton','ck-zombie','ck-witch','ck-devil','ck-pumpkin','ck-ghost'));
alter table public.room_members drop constraint room_members_filter_pick_curated;
alter table public.room_members add  constraint room_members_filter_pick_curated
  check (filter_pick is null or filter_pick in ('grade','noir','ck-objects','ck-express',
    'candlelight','nightvision','vhs','fog','cobweb','lantern',
    'ck-vampire','ck-skeleton','ck-zombie','ck-witch','ck-devil','ck-pumpkin','ck-ghost'));

-- ================================================================ 2. set_filter: splice the ONE allow-list line (body read from the server, never re-typed)
do $do$
declare
  v_before text := pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure);
  v_old constant text := $a$if name not in ('grade','noir','ck-objects','ck-express') then raise exception 'no such filter'; end if;$a$;
  v_new constant text := $a$if name not in ('grade','noir','ck-objects','ck-express','candlelight','nightvision','vhs','fog','cobweb','lantern','ck-vampire','ck-skeleton','ck-zombie','ck-witch','ck-devil','ck-pumpkin','ck-ghost') then raise exception 'no such filter'; end if;$a$;
  v_after text;
  v_hits  int;
begin
  if md5(v_before) <> 'a9d3bf79f637cf84c3017b616dfd9ec5' then
    raise exception 'set_filter is not the 2026-10-06 read-back (% chars, md5 %) - nothing changed; re-read it first',
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
  if md5(v_after) <> 'a8ca64f4a6e17501e1761c4961aa0c1d' or length(v_after) <> 1373 then
    raise exception 'post-check failed: set_filter is % chars, md5 % (expected 1373, a8ca64f4a6e17501e1761c4961aa0c1d) - rolling back',
      length(v_after), md5(v_after);
  end if;
  raise notice 'set_filter: % chars md5 %  ->  % chars md5 %',
    length(v_before), md5(v_before), length(v_after), md5(v_after);
end
$do$;

-- ================================================================ 3. look_packs — a pack is a named list of slugs with a date window
create table public.look_packs (
  slug        text        primary key,
  name        text        not null,
  icon        text        not null default '',
  looks       text[]      not null,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  enabled     boolean     not null default true,
  created_at  timestamptz not null default now(),
  constraint look_packs_slug_shape  check (slug ~ '^[a-z0-9][a-z0-9-]{0,39}$'),
  constraint look_packs_window      check (ends_at > starts_at),
  constraint look_packs_has_looks   check (cardinality(looks) >= 1)
);
comment on table public.look_packs is
  'Themed look packs (feat/looks-v2 PR B). lc_config() reports the enabled row whose [starts_at, ends_at) holds now() as tonight_pack; edit rows here to switch packs, no deploy. A slug in looks must also be in set_filter''s allow-list and in room_members'' two CHECKs to be wearable.';
alter table public.look_packs enable row level security;   -- no policies: unreadable by anon/authenticated except through lc_config
revoke all on table public.look_packs from public, anon, authenticated;

-- ================================================================ 4. lc_tonight_pack() and lc_config() gains tonight_pack
-- the enabled row whose window holds now(); when two overlap, the one that started latest
create or replace function public.lc_tonight_pack()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object('slug', p.slug, 'name', p.name, 'icon', p.icon, 'looks', to_jsonb(p.looks),
                            'starts_at', p.starts_at, 'ends_at', p.ends_at)
    from public.look_packs p
   where p.enabled and p.starts_at <= now() and now() < p.ends_at
   order by p.starts_at desc
   limit 1
$$;
revoke all on function public.lc_tonight_pack() from public, anon, authenticated;   -- lc_config (definer) is the one door

-- the same function as the 2026-10-08 DDL with the one key added; create or replace keeps the owner and the grant
create or replace function public.lc_config()
returns jsonb language sql stable security definer set search_path to 'public'
as $$ select jsonb_build_object('host_stale_ms', public.lc_host_stale_ms(), 'tonight_pack', public.lc_tonight_pack()) $$;
grant execute on function public.lc_config() to anon, authenticated;

-- ================================================================ 5. the Halloween pack: Oct 24 – Nov 1, Pacific
insert into public.look_packs (slug, name, icon, looks, starts_at, ends_at, enabled) values (
  'halloween', 'Halloween', '🎃',
  array['candlelight','nightvision','vhs','fog','cobweb','lantern',
        'ck-vampire','ck-skeleton','ck-zombie','ck-witch','ck-devil','ck-pumpkin','ck-ghost'],
  '2026-10-24 00:00'::timestamp at time zone 'America/Los_Angeles',   -- = 2026-10-24 07:00+00 (PDT)
  '2026-11-02 00:00'::timestamp at time zone 'America/Los_Angeles',   -- = 2026-11-02 08:00+00 (PST): Nov 1 is the last night
  true);

-- ================================================================ 6. post-checks
do $$
declare r record; j jsonb;
begin
  select starts_at, ends_at into r from public.look_packs where slug = 'halloween';
  if r.starts_at <> '2026-10-24 07:00:00+00'::timestamptz or r.ends_at <> '2026-11-02 08:00:00+00'::timestamptz then
    raise exception 'post-check failed: the Halloween window is % .. %, expected 2026-10-24 07:00+00 .. 2026-11-02 08:00+00 - rolling back', r.starts_at, r.ends_at;
  end if;
  j := public.lc_config();
  if not (j ? 'host_stale_ms') or not (j ? 'tonight_pack') then
    raise exception 'post-check failed: lc_config() returned % - rolling back', j;
  end if;
  raise notice 'lc_config() now: %', j;
  raise notice 'lc_config md5 after: %  set_filter md5 after: %',
    md5(pg_get_functiondef('public.lc_config()'::regprocedure)),
    md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure));
end $$;

commit;

-- ================================================================ READ BACK (read-only; run after, record under "Run log" in tools/DESIGN-looks-v2.md)
-- select md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure)), length(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure));
-- select md5(pg_get_functiondef('public.lc_config()'::regprocedure)), md5(pg_get_functiondef('public.lc_tonight_pack()'::regprocedure));
-- select conname, pg_get_constraintdef(oid) from pg_constraint where conrelid = 'public.room_members'::regclass and conname like 'room_members_filter%' order by conname;
-- select p.proname, p.proacl from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('set_filter','lc_config','lc_tonight_pack') order by 1;
-- -- expect: set_filter and lc_config ACLs unchanged; lc_tonight_pack with no anon/authenticated entry
-- select slug, name, looks, starts_at, ends_at, enabled from public.look_packs;
-- select public.lc_config();     -- before Oct 24 PT: {"host_stale_ms": 120000, "tonight_pack": null}
-- select relrowsecurity from pg_class where oid = 'public.look_packs'::regclass;   -- expect: true

-- ================================================================ SWITCHING PACKS (Nick, in Studio, any time — no deploy)
-- update public.look_packs set enabled = false where slug = 'halloween';          -- pull it
-- update public.look_packs set ends_at = '2026-11-03 00:00'::timestamp at time zone 'America/Los_Angeles' where slug = 'halloween';   -- extend it a night
-- insert into public.look_packs (slug, name, icon, looks, starts_at, ends_at)
--   values ('newyears', 'New Year''s', '🥂', array['noir'], '2026-12-31 00:00'::timestamp at time zone 'America/Los_Angeles',
--           '2027-01-02 00:00'::timestamp at time zone 'America/Los_Angeles');
-- (a slug a pack names that is NOT in set_filter's allow-list cannot be worn — set_filter refuses it, and the client draws no tile for a slug it has no art for)

-- ================================================================ UNDO (one transaction)
-- begin;
-- update public.room_members set filter = null      where filter      not in ('grade','noir','ck-objects','ck-express');
-- update public.room_members set filter_pick = null where filter_pick not in ('grade','noir','ck-objects','ck-express');
-- -- the two drop/add pairs with the four 2026-10-06 names; the splice DO block with v_old / v_new swapped and the length 1229
-- create or replace function public.lc_config() returns jsonb language sql stable security definer set search_path to 'public'
--   as $$ select jsonb_build_object('host_stale_ms', public.lc_host_stale_ms()) $$;
-- drop function public.lc_tonight_pack();
-- drop table public.look_packs;
-- commit;
