-- DDL — PROFILES (feat/profiles-tinder, PR C of the 10/20–10/21 brief; ruling Nick 10/21:
-- "full go — Tinder's architecture, and an interesting interface between the profiles and the game")
-- STATUS: RUN in production 2026-10-21 ~19:22 PT by Nick (Supabase Studio, project afterhours). Read-back in
-- tools/DESIGN-profiles.md "Run log 2026-10-21". This file is what actually ran (three preflight-driven edits, logged there).
-- Never run by an agent.  Record the read-back under "Run log" in tools/DESIGN-profiles.md.
--
-- Studio-safe by construction (2026-10-21 run log): ONE level of $$ everywhere, no nested
-- dollar-quotes, and no guard on a column this file overwrites.
--
-- What it does, in dependency order, ONE transaction, refuses on drift:
--   0. guards      — lc_config / lc_pack_status are the 2026-10-21 read-backs; none of the columns,
--                    tables, functions, deck or bucket this file creates exist yet
--   1. profiles    — the Tinder set: bio (500), city, pronouns, details jsonb, interests text[] (≤5),
--                    prompts jsonb (≤3 of {q, a}), photos text[] (≤6 storage paths, [0] is primary)
--   2. lc_settings — a sealed key/value table; 'profiles_open_to_all' = true for the soft launch
--                    (ruling: nobody hits a wall in week one).  lc_config() is REPLACED to report it.
--   3. user_blocks — blocker → blocked, RLS owner-only; my_blocks() returns BOTH directions so the
--                    client hides a blocked person both ways; block_user / unblock_user RPCs
--   4. the deck    — question_decks 'From his profile' 🪪 + 20 prompt questions.  The prompts ARE
--                    questions, so the host ASKs from his profile through the untouched ask_question.
--   5. public_profile(uid) — security definer; the ONE read path for another person's card.  Returns
--                    age (never birthdate), the primary photo, bio, stats computed on the server
--                    (shows played, hearts, KEEPs, hosted); the full gallery / details / prompts only
--                    when profiles_open_to_all, or the viewer is the owner, or (later, PR B)
--                    is_subscriber(viewer).  Blocked either way → {"blocked": true} and nothing else.
--   6. storage     — bucket 'profile-photos' (public read; paths are <uid>/<n>.jpg), owner-only write
--                    policies on storage.objects
--
-- What this guards on (re-read before running if production has moved):
--   lc_config()                   md5 18c19ce96c662a68bc82e327a14f5df4   (2026-10-21 read-back)
--   lc_pack_status(look_packs)    md5 51d7be429e260c1ad5ff92fd25704165   (2026-10-21 read-back)
--   profiles: none of bio, city, pronouns, details, interests, prompts, photos exist
--   lc_settings, user_blocks: must not exist;  public_profile, my_blocks, block_user, unblock_user,
--   lc_profiles_open_to_all, lc_age_of: must not exist;  question_decks: no 'From his profile' row;
--   storage.buckets: no 'profile-photos'
--
-- lc_config() is replaced, so its md5 CHANGES: the read-back records the new value as the next guard.
--
-- If Studio runs statements one at a time and a guard raises, the transaction is left open:
-- run `rollback;` before anything else.

-- ================================================================ 0. PREFLIGHT (read-only; run first, record the output)
-- select md5(pg_get_functiondef('public.lc_config()'::regprocedure)) as lc_config_md5,
--        md5(pg_get_functiondef('public.lc_pack_status(public.look_packs)'::regprocedure)) as lc_pack_status_md5,
--        (select string_agg(column_name, ',' order by column_name) from information_schema.columns
--           where table_schema='public' and table_name='profiles') as profile_columns,
--        to_regclass('public.lc_settings') as lc_settings, to_regclass('public.user_blocks') as user_blocks,
--        to_regprocedure('public.public_profile(uuid)') as public_profile,
--        (select count(*) from public.question_decks where name='From his profile') as prompt_deck,
--        (select count(*) from storage.buckets where id='profile-photos') as bucket,
--        (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
--           where table_schema='public' and table_name='questions') as question_columns,
--        (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
--           where table_schema='public' and table_name='question_decks') as deck_columns,
--        (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
--           where table_schema='public' and table_name='room_members') as member_columns;
-- -- expect: 18c19ce9… | 51d7be42… | (no bio/city/pronouns/details/interests/prompts/photos) | null | null | null | 0 | 0 | … | … | …

begin;

-- ================================================================ 0. guards
do $$
declare h text; n int;
begin
  h := md5(pg_get_functiondef('public.lc_config()'::regprocedure));
  if h <> '18c19ce96c662a68bc82e327a14f5df4' then
    raise exception 'DRIFT: lc_config md5 is %, expected 18c19ce96c662a68bc82e327a14f5df4 (the 2026-10-21 read-back) - nothing changed', h;
  end if;
  h := md5(pg_get_functiondef('public.lc_pack_status(public.look_packs)'::regprocedure));
  if h <> '51d7be429e260c1ad5ff92fd25704165' then
    raise exception 'DRIFT: lc_pack_status md5 is %, expected 51d7be429e260c1ad5ff92fd25704165 (the 2026-10-21 read-back) - nothing changed', h;
  end if;
  -- bio already exists in production (2026-10-21 preflight); the other six must not
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='profiles'
     and column_name in ('city','pronouns','details','interests','prompts','photos');
  if n <> 0 then
    raise exception 'DRIFT: % of the six profile columns this file adds already exist - nothing changed', n;
  end if;
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='profiles' and column_name in ('id','display_name','birthdate','face_json','bio');
  if n <> 5 then
    raise exception 'DRIFT: profiles is missing one of id/display_name/birthdate/face_json/bio (found %) - nothing changed', n;
  end if;
  if to_regclass('public.lc_settings') is not null then raise exception 'DRIFT: public.lc_settings already exists - nothing changed'; end if;
  if to_regclass('public.user_blocks') is not null then raise exception 'DRIFT: public.user_blocks already exists - nothing changed'; end if;
  if to_regprocedure('public.public_profile(uuid)') is not null then raise exception 'DRIFT: public.public_profile already exists - nothing changed'; end if;
  if to_regprocedure('public.my_blocks()') is not null then raise exception 'DRIFT: public.my_blocks already exists - nothing changed'; end if;
  if to_regprocedure('public.block_user(uuid)') is not null then raise exception 'DRIFT: public.block_user already exists - nothing changed'; end if;
  if to_regprocedure('public.unblock_user(uuid)') is not null then raise exception 'DRIFT: public.unblock_user already exists - nothing changed'; end if;
  if to_regprocedure('public.lc_profiles_open_to_all()') is not null then raise exception 'DRIFT: public.lc_profiles_open_to_all already exists - nothing changed'; end if;
  if to_regprocedure('public.lc_age_of(date)') is not null then raise exception 'DRIFT: public.lc_age_of already exists - nothing changed'; end if;
  if exists (select 1 from public.question_decks where name = 'From his profile') then
    raise exception 'DRIFT: the From his profile deck already exists - nothing changed';
  end if;
  if exists (select 1 from storage.buckets where id = 'profile-photos') then
    raise exception 'DRIFT: the profile-photos bucket already exists - nothing changed';
  end if;
  if exists (select 1 from public.profiles where char_length(bio) > 500) then
    raise exception 'DRIFT: an existing bio is over 500 chars - nothing changed';
  end if;
end $$;

-- ================================================================ 1. profiles: the Tinder set
alter table public.profiles
  add column city      text,
  add column pronouns  text,
  add column details   jsonb  not null default '{}'::jsonb,
  add column interests text[] not null default '{}'::text[],
  add column prompts   jsonb  not null default '[]'::jsonb,
  add column photos    text[] not null default '{}'::text[];
alter table public.profiles
  add constraint profiles_bio_len       check (bio is null or char_length(bio) <= 500),
  add constraint profiles_city_len      check (city is null or char_length(city) <= 40),
  add constraint profiles_pronouns_len  check (pronouns is null or char_length(pronouns) <= 20),
  add constraint profiles_interests_max check (cardinality(interests) <= 5),
  add constraint profiles_prompts_shape check (jsonb_typeof(prompts) = 'array' and jsonb_array_length(prompts) <= 3),
  add constraint profiles_photos_max    check (cardinality(photos) <= 6),
  add constraint profiles_details_shape check (jsonb_typeof(details) = 'object');
comment on column public.profiles.photos   is 'storage paths in bucket profile-photos, <uid>/<n>.jpg; [0] is the primary (PR C, 10/21)';
comment on column public.profiles.prompts  is 'up to 3 of {"q": <questions.id in the From his profile deck>, "a": <one line>} (PR C, 10/21)';
comment on column public.profiles.details  is 'optional chips: job, school, height, looking_for, drinks, smokes, kids, zodiac (PR C, 10/21)';

-- age is derived on the server; birthdate never leaves the owner's row
create function public.lc_age_of(b date)
returns int
language sql immutable
as $$
  select case when b is null then null else extract(year from age(current_date, b))::int end
$$;
revoke all on function public.lc_age_of(date) from public, anon, authenticated;

-- ================================================================ 2. lc_settings + the soft-launch flag; lc_config() reports it
create table public.lc_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.lc_settings enable row level security;
revoke all on table public.lc_settings from public, anon, authenticated;
comment on table public.lc_settings is
  'Sealed key/value switches read through lc_config(). Nick flips them in Studio: update lc_settings set value = ''false'' where key = ''profiles_open_to_all''.';
insert into public.lc_settings (key, value) values ('profiles_open_to_all', 'true'::jsonb);

create function public.lc_profiles_open_to_all()
returns boolean
language sql stable security definer set search_path to 'public'
as $$
  select coalesce((select (value)::boolean from public.lc_settings where key = 'profiles_open_to_all'), false)
$$;
revoke all on function public.lc_profiles_open_to_all() from public, anon, authenticated;

create or replace function public.lc_config()
returns jsonb language sql stable security definer set search_path to 'public'
as $$ select jsonb_build_object('host_stale_ms', public.lc_host_stale_ms(), 'tonight_pack', public.lc_tonight_pack(), 'profiles_open_to_all', public.lc_profiles_open_to_all()) $$;
grant execute on function public.lc_config() to anon, authenticated;

-- ================================================================ 3. blocks: both ways, owner-only rows
create table public.user_blocks (
  blocker    uuid not null references auth.users(id) on delete cascade,
  blocked    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);
alter table public.user_blocks enable row level security;
create policy user_blocks_own_read   on public.user_blocks for select to authenticated using (blocker = auth.uid());
create policy user_blocks_own_insert on public.user_blocks for insert to authenticated with check (blocker = auth.uid());
create policy user_blocks_own_delete on public.user_blocks for delete to authenticated using (blocker = auth.uid());
grant select, insert, delete on table public.user_blocks to authenticated;

-- both directions, so the client can hide them from me AND me from them
create function public.my_blocks()
returns jsonb
language sql stable security definer set search_path to 'public'
as $$
  select jsonb_build_object(
    'blocked',    coalesce((select jsonb_agg(blocked) from public.user_blocks where blocker = auth.uid()), '[]'::jsonb),
    'blocked_by', coalesce((select jsonb_agg(blocker) from public.user_blocks where blocked = auth.uid()), '[]'::jsonb))
$$;
revoke all on function public.my_blocks() from public, anon;
grant execute on function public.my_blocks() to authenticated;

create function public.block_user(target uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  if target is null or target = auth.uid() then raise exception 'bad target'; end if;
  insert into public.user_blocks (blocker, blocked) values (auth.uid(), target) on conflict do nothing;
end $$;
revoke all on function public.block_user(uuid) from public, anon;
grant execute on function public.block_user(uuid) to authenticated;

create function public.unblock_user(target uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
begin
  if auth.uid() is null then raise exception 'not signed in'; end if;
  delete from public.user_blocks where blocker = auth.uid() and blocked = target;
end $$;
revoke all on function public.unblock_user(uuid) from public, anon;
grant execute on function public.unblock_user(uuid) to authenticated;

-- ================================================================ 4. the prompt deck: the prompts ARE questions, so she asks from his profile through ask_question (untouched)
-- the deck: ids are explicit (questions.id / question_decks.id have no default in production — 2026-10-21 preflight)
do $$
declare d_id bigint; q_id bigint; i int := 0; t text;
begin
  select coalesce(max(id), 0) + 1 into d_id from public.question_decks;
  select coalesce(max(id), 0) into q_id from public.questions;
  insert into public.question_decks (id, name, emoji, sort) values (d_id, 'From his profile', '🪪', 99);
  foreach t in array array[
    'My last call is usually…',
    'I''d pick the chair over the bench because…',
    'The song that gets me on the dance floor is…',
    'My most Portland habit is…',
    'A green flag I look for…',
    'My go-to karaoke song…',
    'The best date I ever planned…',
    'I''m weirdly good at…',
    'Two truths and a lie…',
    'Something I''d never put on a dating app…',
    'My controversial food take…',
    'What I''m like at 1am…',
    'The hill I''ll die on…',
    'I won''t shut up about…',
    'My ideal Sunday…',
    'A perfect first date in Portland…',
    'What my friends would tell you about me…',
    'I get way too competitive about…',
    'The way to my heart is…',
    'Why she should keep me…'
  ] loop
    i := i + 1; q_id := q_id + 1;
    insert into public.questions (id, deck_id, text, sort) values (q_id, d_id, t, i);
  end loop;
  raise notice 'From his profile deck id % with % prompts (question ids through %)', d_id, i, q_id;
end $$;

-- ================================================================ 5. public_profile(uid): the ONE read path for someone else's card
create function public.public_profile(target uuid)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare
  p record; me uuid := auth.uid(); full_view boolean; age int; out jsonb; stats jsonb; prompts_out jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into p from public.profiles where id = target;
  if not found then return null; end if;
  if exists (select 1 from public.user_blocks where (blocker = me and blocked = target) or (blocker = target and blocked = me)) then
    return jsonb_build_object('id', target, 'blocked', true);
  end if;
  -- the full card: the owner, the soft-launch flag, the host of a live room he is seated in, or (PR B) a subscriber
  full_view := (me = target) or public.lc_profiles_open_to_all();
  if not full_view then
    full_view := exists (select 1 from public.rooms r join public.room_members m on m.room_id = r.id
                          where r.host_id = me and r.status = 'live' and m.user_id = target and m.role in ('chair','kept'));
  end if;
  if not full_view and to_regprocedure('public.is_subscriber(uuid)') is not null then
    execute 'select public.is_subscriber($1)' into full_view using me;
  end if;
  age := public.lc_age_of(p.birthdate);
  stats := jsonb_build_object(
    'shows_played', (select count(distinct room_id) from public.room_members where user_id = target),
    'hearts',       (select count(*) from public.room_events where type = 'heart' and payload->>'target' = target::text),
    'keeps',        (select count(*) from public.rooms where winner_id = target),
    'hosted',       (select count(*) from public.rooms where host_id = target));
  select coalesce(jsonb_agg(jsonb_build_object('q', (e->>'q')::bigint, 'text', q.text, 'a', e->>'a') order by o), '[]'::jsonb)
    into prompts_out
    from jsonb_array_elements(coalesce(p.prompts, '[]'::jsonb)) with ordinality as x(e, o)
    left join public.questions q on q.id = (e->>'q')::bigint;
  out := jsonb_build_object(
    'id', p.id, 'display_name', p.display_name, 'age', age, 'city', p.city, 'pronouns', p.pronouns,
    'bio', p.bio, 'primary_photo', (p.photos)[1], 'face_photo', (p.face_json->>'photo'),
    'stats', stats, 'full', full_view, 'blocked', false);
  if full_view then
    out := out || jsonb_build_object('photos', to_jsonb(p.photos), 'details', p.details,
                                     'interests', to_jsonb(p.interests), 'prompts', prompts_out);
  else
    out := out || jsonb_build_object('photos', to_jsonb(array[(p.photos)[1]]), 'details', '{}'::jsonb,
                                     'interests', '[]'::jsonb, 'prompts', '[]'::jsonb);
  end if;
  return out;
end $$;
revoke all on function public.public_profile(uuid) from public, anon;
grant execute on function public.public_profile(uuid) to authenticated;
comment on function public.public_profile(uuid) is
  'Another person''s card (PR C, 10/21): age not birthdate; stats computed here; gallery/details/prompts only for the owner, under profiles_open_to_all, the host of a live room he is seated in, or (PR B) a subscriber. Blocked either way -> {blocked:true}.';

-- ================================================================ 6. storage: the gallery bucket, owner-only writes, public reads
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('profile-photos', 'profile-photos', true, 2097152, array['image/jpeg','image/png','image/webp']);
create policy "profile-photos read"   on storage.objects for select to authenticated, anon
  using (bucket_id = 'profile-photos');
create policy "profile-photos insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile-photos update" on storage.objects for update to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "profile-photos delete" on storage.objects for delete to authenticated
  using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ================================================================ 7. post-checks
do $$
declare j jsonb; n int;
begin
  j := public.lc_config();
  if not (j ? 'host_stale_ms') or not (j ? 'tonight_pack') or not (j ? 'profiles_open_to_all') then
    raise exception 'post-check failed: lc_config() returned % - rolling back', j;
  end if;
  if (j->>'profiles_open_to_all')::boolean is not true then
    raise exception 'post-check failed: profiles_open_to_all is not true - rolling back';
  end if;
  select count(*) into n from public.questions q join public.question_decks d on d.id = q.deck_id where d.name = 'From his profile';
  if n <> 20 then raise exception 'post-check failed: % prompts in the deck, expected 20 - rolling back', n; end if;
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='profiles'
     and column_name in ('bio','city','pronouns','details','interests','prompts','photos');
  if n <> 7 then raise exception 'post-check failed: % of 7 profile columns present - rolling back', n; end if;
  if (select count(*) from storage.buckets where id = 'profile-photos' and public) <> 1 then
    raise exception 'post-check failed: bucket missing - rolling back';
  end if;
  if (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'profile-photos %') <> 4 then
    raise exception 'post-check failed: storage policies - rolling back';
  end if;
  raise notice 'lc_config() now: %', j;
  raise notice 'lc_config md5 after: %  (record it - the next DDL''s guard)', md5(pg_get_functiondef('public.lc_config()'::regprocedure));
end $$;

commit;

-- ================================================================ READ BACK (read-only; run after, record under "Run log" in tools/DESIGN-profiles.md)
-- select md5(pg_get_functiondef('public.lc_config()'::regprocedure)) as lc_config_md5,
--        md5(pg_get_functiondef('public.public_profile(uuid)'::regprocedure)) as public_profile_md5,
--        md5(pg_get_functiondef('public.my_blocks()'::regprocedure)) as my_blocks_md5,
--        (public.lc_config()->>'profiles_open_to_all') as open_to_all,
--        (select count(*) from public.questions q join public.question_decks d on d.id=q.deck_id where d.name='From his profile') as prompts,
--        (select id from public.question_decks where name='From his profile') as deck_id,
--        (select string_agg(column_name, ',' order by column_name) from information_schema.columns
--           where table_schema='public' and table_name='profiles'
--             and column_name in ('bio','city','pronouns','details','interests','prompts','photos')) as new_columns,
--        (select public from storage.buckets where id='profile-photos') as bucket_public,
--        (select count(*) from pg_policies where schemaname='storage' and tablename='objects' and policyname like 'profile-photos %') as storage_policies,
--        (select relrowsecurity from pg_class where oid='public.user_blocks'::regclass) as blocks_rls;
-- -- read back 2026-10-21 19:22 PT: 8ae9e8a3c39bb23bb3c83f7848dcd600 | 239070f77a0faac41b7d382d2cb15eb2 | 656aa3a614fddc3675f660aaca2f8c41 | true | 20 | 5 | bio,city,details,interests,photos,prompts,pronouns | true | 4 | true

-- ================================================================ SWITCHES (Nick, in Studio, any time — no deploy)
-- update public.lc_settings set value = 'false', updated_at = now() where key = 'profiles_open_to_all';   -- full cards become a subscriber perk (needs PR B)
-- update public.lc_settings set value = 'true',  updated_at = now() where key = 'profiles_open_to_all';   -- back to open

-- ================================================================ UNDO (one transaction)
-- begin;
-- drop policy "profile-photos read" on storage.objects; drop policy "profile-photos insert" on storage.objects;
-- drop policy "profile-photos update" on storage.objects; drop policy "profile-photos delete" on storage.objects;
-- delete from storage.objects where bucket_id = 'profile-photos'; delete from storage.buckets where id = 'profile-photos';
-- drop function public.public_profile(uuid);
-- delete from public.questions where deck_id in (select id from public.question_decks where name = 'From his profile');
-- delete from public.question_decks where name = 'From his profile';
-- drop function public.unblock_user(uuid); drop function public.block_user(uuid); drop function public.my_blocks();
-- drop table public.user_blocks;
-- create or replace function public.lc_config() returns jsonb language sql stable security definer set search_path to 'public'
--   as $$ select jsonb_build_object('host_stale_ms', public.lc_host_stale_ms(), 'tonight_pack', public.lc_tonight_pack()) $$;
-- drop function public.lc_profiles_open_to_all(); drop table public.lc_settings;
-- drop function public.lc_age_of(date);
-- alter table public.profiles drop column bio, drop column city, drop column pronouns, drop column details,
--   drop column interests, drop column prompts, drop column photos;
-- commit;
