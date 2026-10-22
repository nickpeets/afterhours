-- DDL — THE DECK (feat/deck, PR D1 of the lobby refresh; ruling Nick 10/21 21:00: "just like Tinder" —
-- a lobby that is never dead: swipe, match, chat, with the show as the reason to come back)
-- STATUS: NOT RUN.  Hand to Nick; he runs it in Supabase Studio (project afterhours, PRODUCTION).
-- Never run by an agent.  Record the read-back under "Run log" in tools/DESIGN-deck.md.
--
-- Studio-safe by construction: ONE level of $$ everywhere, no nested dollar-quotes, no guard on a
-- column this file overwrites.  Run the PREFLIGHT first and READ it (the 2026-10-21 profiles run).
--
-- What it does, in dependency order, ONE transaction, refuses on drift:
--   0. guards      — lc_config / is_subscriber / lc_pack_status are the 2026-10-21 read-backs; none of
--                    the tables / functions this file creates exist
--   1. swipes      — swiper → target, 'like' | 'pass'; owner-only RLS; one row per pair (re-swipe = update)
--   2. matches     — the unordered pair (a < b) with created_at; written by the swipe trigger when the
--                    reciprocal like exists; participants read; nobody writes directly
--   3. messages    — match_id, sender, body ≤1000; participants read; the sender inserts only if a
--                    participant and neither has blocked the other; added to the realtime publication
--   4. RPCs        — deck_next(n): the next n cards for me (not me, not swiped, not blocked either way,
--                    mutual seeking + my age window), Fan Favorites first (hearts desc) then newest;
--                    each card is public_profile(id), the ONE read path.  swipe(target, dir) → {matched,
--                    match_id}.  my_matches(): every match with the other person's short card, the last
--                    message and my unread count.  send_message(match_id, body).  mark_read(match_id).
--   5. post-checks — in-transaction, rolled back where they write
--
-- What this guards on (re-read before running if production has moved):
--   lc_config()                  md5 8ae9e8a3c39bb23bb3c83f7848dcd600   (2026-10-21 19:22 read-back)
--   is_subscriber(uuid)          md5 4dbe1822920a3c8c0eda368f4ca255b8   (2026-10-21 20:40 read-back)
--   lc_pack_status(look_packs)   md5 51d7be429e260c1ad5ff92fd25704165   (2026-10-21 read-back)
--   public_profile(uuid)         md5 239070f77a0faac41b7d382d2cb15eb2   (2026-10-21 19:22 read-back)
--   swipes, matches, messages, match_reads: must not exist;  deck_next, swipe, my_matches, send_message,
--   mark_read, swipes_match_trigger, lc_pair: must not exist
--
-- If Studio runs statements one at a time and a guard raises, the transaction is left open:
-- run `rollback;` before anything else.

-- ================================================================ 0. PREFLIGHT (read-only; run first, READ the output)
-- select md5(pg_get_functiondef('public.lc_config()'::regprocedure)) as lc_config_md5,
--        md5(pg_get_functiondef('public.is_subscriber(uuid)'::regprocedure)) as is_subscriber_md5,
--        md5(pg_get_functiondef('public.public_profile(uuid)'::regprocedure)) as public_profile_md5,
--        to_regclass('public.swipes') as swipes, to_regclass('public.matches') as matches, to_regclass('public.messages') as messages,
--        to_regprocedure('public.deck_next(int)') as deck_next, to_regprocedure('public.swipe(uuid,text)') as swipe,
--        (select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns
--           where table_schema='public' and table_name='profiles' and column_name in ('gender','seeking','seek_min','seek_max','birthdate','created_at')) as pref_columns,
--        (select count(*) from pg_publication where pubname='supabase_realtime') as realtime_pub,
--        (select string_agg(tablename, ',') from pg_publication_tables where pubname='supabase_realtime') as realtime_tables,
--        (select string_agg(distinct coalesce(gender,'null'), ',') from public.profiles) as gender_values,
--        (select string_agg(distinct coalesce(seeking,'null'), ',') from public.profiles) as seeking_values;
-- -- expect: 8ae9e8a3… | 4dbe1822… | 239070f7… | null ×5 | gender:text, seeking:text, seek_min:…, seek_max:…, birthdate:date, created_at:… | 1 | … | woman,man,… | everyone,women,men

begin;

-- ================================================================ 0. guards
do $$
declare h text;
begin
  h := md5(pg_get_functiondef('public.lc_config()'::regprocedure));
  if h <> '8ae9e8a3c39bb23bb3c83f7848dcd600' then
    raise exception 'DRIFT: lc_config md5 is %, expected 8ae9e8a3c39bb23bb3c83f7848dcd600 - nothing changed', h;
  end if;
  h := md5(pg_get_functiondef('public.is_subscriber(uuid)'::regprocedure));
  if h <> '4dbe1822920a3c8c0eda368f4ca255b8' then
    raise exception 'DRIFT: is_subscriber md5 is %, expected 4dbe1822920a3c8c0eda368f4ca255b8 - nothing changed', h;
  end if;
  h := md5(pg_get_functiondef('public.public_profile(uuid)'::regprocedure));
  if h <> '239070f77a0faac41b7d382d2cb15eb2' then
    raise exception 'DRIFT: public_profile md5 is %, expected 239070f77a0faac41b7d382d2cb15eb2 - nothing changed', h;
  end if;
  if to_regclass('public.swipes') is not null then raise exception 'DRIFT: public.swipes already exists - nothing changed'; end if;
  if to_regclass('public.matches') is not null then raise exception 'DRIFT: public.matches already exists - nothing changed'; end if;
  if to_regclass('public.messages') is not null then raise exception 'DRIFT: public.messages already exists - nothing changed'; end if;
  if to_regclass('public.match_reads') is not null then raise exception 'DRIFT: public.match_reads already exists - nothing changed'; end if;
  if to_regprocedure('public.deck_next(int)') is not null then raise exception 'DRIFT: public.deck_next already exists - nothing changed'; end if;
  if to_regprocedure('public.swipe(uuid,text)') is not null then raise exception 'DRIFT: public.swipe already exists - nothing changed'; end if;
  if to_regprocedure('public.my_matches()') is not null then raise exception 'DRIFT: public.my_matches already exists - nothing changed'; end if;
  if to_regprocedure('public.send_message(uuid,text)') is not null then raise exception 'DRIFT: public.send_message already exists - nothing changed'; end if;
  if to_regprocedure('public.mark_read(uuid)') is not null then raise exception 'DRIFT: public.mark_read already exists - nothing changed'; end if;
  if to_regprocedure('public.lc_pair(uuid,uuid)') is not null then raise exception 'DRIFT: public.lc_pair already exists - nothing changed'; end if;
  if to_regprocedure('public.swipes_match_trigger()') is not null then raise exception 'DRIFT: public.swipes_match_trigger already exists - nothing changed'; end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='profiles'
        and column_name in ('gender','seeking','seek_min','seek_max','birthdate')) <> 5 then
    raise exception 'DRIFT: profiles is missing one of gender/seeking/seek_min/seek_max/birthdate - nothing changed';
  end if;
end $$;

-- ================================================================ 1. swipes
create table public.swipes (
  swiper     uuid not null references auth.users(id) on delete cascade,
  target     uuid not null references auth.users(id) on delete cascade,
  dir        text not null check (dir in ('like','pass')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (swiper, target),
  check (swiper <> target)
);
create index swipes_target_like on public.swipes (target) where dir = 'like';
alter table public.swipes enable row level security;
create policy swipes_own_read on public.swipes for select to authenticated using (swiper = auth.uid());
grant select on table public.swipes to authenticated;   -- writes go through swipe()
comment on table public.swipes is 'The Deck (PR D1, 10/21): my swipes. One row per pair; a re-swipe updates. Written only by swipe().';

-- ================================================================ 2. matches: the unordered pair
create function public.lc_pair(x uuid, y uuid, out a uuid, out b uuid)
language sql immutable
as $$ select least(x, y), greatest(x, y) $$;
revoke all on function public.lc_pair(uuid, uuid) from public, anon, authenticated;

create table public.matches (
  id         uuid primary key default gen_random_uuid(),
  a          uuid not null references auth.users(id) on delete cascade,
  b          uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (a, b),
  check (a < b)
);
alter table public.matches enable row level security;
create policy matches_participants_read on public.matches for select to authenticated using (a = auth.uid() or b = auth.uid());
grant select on table public.matches to authenticated;
comment on table public.matches is 'A mutual like (PR D1, 10/21): a < b. Written by the swipes trigger only. Chat opens on the match (ruling: just like Tinder).';

-- the match is written the instant the second like lands
create function public.swipes_match_trigger()
returns trigger language plpgsql security definer set search_path to 'public'
as $$
declare p record;
begin
  if new.dir = 'like' and exists (select 1 from public.swipes s where s.swiper = new.target and s.target = new.swiper and s.dir = 'like') then
    select * into p from public.lc_pair(new.swiper, new.target);
    insert into public.matches (a, b) values (p.a, p.b) on conflict (a, b) do nothing;
  end if;
  return new;
end $$;
create trigger swipes_match after insert or update on public.swipes
  for each row execute function public.swipes_match_trigger();

-- unread bookkeeping: when I last read a match's thread
create table public.match_reads (
  match_id uuid not null references public.matches(id) on delete cascade,
  reader   uuid not null references auth.users(id) on delete cascade,
  read_at  timestamptz not null default now(),
  primary key (match_id, reader)
);
alter table public.match_reads enable row level security;
revoke all on table public.match_reads from public, anon, authenticated;   -- only through mark_read / my_matches

-- ================================================================ 3. messages
create table public.messages (
  id         bigint generated always as identity primary key,
  match_id   uuid not null references public.matches(id) on delete cascade,
  sender     uuid not null references auth.users(id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index messages_match_time on public.messages (match_id, created_at);
alter table public.messages enable row level security;
create policy messages_participants_read on public.messages for select to authenticated
  using (exists (select 1 from public.matches m where m.id = messages.match_id and (m.a = auth.uid() or m.b = auth.uid())));
grant select on table public.messages to authenticated;   -- writes go through send_message()
comment on table public.messages is 'Match chat (PR D1, 10/21). Participants read (RLS); send_message() writes and refuses across a block.';
-- realtime: the chat sheet subscribes to messages for its match_id
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ================================================================ 4. the RPCs
-- the next n cards for me: not me, not swiped, not blocked either way, who I am seeking and who is
-- seeking me, inside my age window; Fan Favorites (hearts) first, then the newest profiles
create function public.deck_next(n int default 10)
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); mine record; out jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into mine from public.profiles where id = me;
  if not found then return '[]'::jsonb; end if;
  select coalesce(jsonb_agg(public.public_profile(c.id) order by c.hearts desc, c.created_at desc nulls last), '[]'::jsonb)
    into out
    from (
      select p.id, p.created_at,
             (select count(*) from public.room_events e where e.type = 'heart' and e.payload->>'target' = p.id::text) as hearts
        from public.profiles p
       where p.id <> me
         and p.display_name is not null
         and p.birthdate is not null
         and not exists (select 1 from public.swipes s where s.swiper = me and s.target = p.id)
         and not exists (select 1 from public.user_blocks ub where (ub.blocker = me and ub.blocked = p.id) or (ub.blocker = p.id and ub.blocked = me))
         -- who I am seeking (unknown gender is never hidden)
         and (coalesce(mine.seeking, 'everyone') = 'everyone' or p.gender is null
              or (mine.seeking = 'women' and p.gender = 'woman') or (mine.seeking = 'men' and p.gender = 'man'))
         -- who is seeking me
         and (coalesce(p.seeking, 'everyone') = 'everyone' or mine.gender is null
              or (p.seeking = 'women' and mine.gender = 'woman') or (p.seeking = 'men' and mine.gender = 'man'))
         -- my age window
         and public.lc_age_of(p.birthdate) between coalesce(mine.seek_min, 18) and coalesce(mine.seek_max, 99)
       order by hearts desc, p.created_at desc nulls last
       limit greatest(1, least(coalesce(n, 10), 30))
    ) c;
  return out;
end $$;
revoke all on function public.deck_next(int) from public, anon;
grant execute on function public.deck_next(int) to authenticated;

create function public.swipe(target uuid, dir text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); p record; m uuid;
begin
  if me is null then raise exception 'not signed in'; end if;
  if target is null or target = me then raise exception 'bad target'; end if;
  if dir not in ('like','pass') then raise exception 'bad dir'; end if;
  if exists (select 1 from public.user_blocks ub where (ub.blocker = me and ub.blocked = target) or (ub.blocker = target and ub.blocked = me)) then
    raise exception 'blocked';
  end if;
  insert into public.swipes (swiper, target, dir) values (me, target, dir)
    on conflict (swiper, target) do update set dir = excluded.dir, updated_at = now();
  select * into p from public.lc_pair(me, target);
  select id into m from public.matches where a = p.a and b = p.b;
  return jsonb_build_object('target', target, 'dir', dir, 'matched', m is not null, 'match_id', m);
end $$;
revoke all on function public.swipe(uuid, text) from public, anon;
grant execute on function public.swipe(uuid, text) to authenticated;

create function public.my_matches()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); out jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'match_id', m.id, 'created_at', m.created_at,
           'other', public.public_profile(case when m.a = me then m.b else m.a end),
           'last', (select jsonb_build_object('body', x.body, 'sender', x.sender, 'at', x.created_at)
                      from public.messages x where x.match_id = m.id order by x.created_at desc limit 1),
           'unread', (select count(*) from public.messages x
                        where x.match_id = m.id and x.sender <> me
                          and x.created_at > coalesce((select r.read_at from public.match_reads r where r.match_id = m.id and r.reader = me), 'epoch'::timestamptz)))
         order by coalesce((select max(x.created_at) from public.messages x where x.match_id = m.id), m.created_at) desc), '[]'::jsonb)
    into out
    from public.matches m
   where (m.a = me or m.b = me)
     and not exists (select 1 from public.user_blocks ub where (ub.blocker = me and ub.blocked = case when m.a = me then m.b else m.a end)
                                                           or (ub.blocked = me and ub.blocker = case when m.a = me then m.b else m.a end));
  return out;
end $$;
revoke all on function public.my_matches() from public, anon;
grant execute on function public.my_matches() to authenticated;

create function public.send_message(match_id uuid, body text)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); m record; other uuid; row public.messages;
begin
  if me is null then raise exception 'not signed in'; end if;
  select * into m from public.matches x where x.id = send_message.match_id;
  if not found or (m.a <> me and m.b <> me) then raise exception 'not your match'; end if;
  other := case when m.a = me then m.b else m.a end;
  if exists (select 1 from public.user_blocks ub where (ub.blocker = me and ub.blocked = other) or (ub.blocker = other and ub.blocked = me)) then
    raise exception 'blocked';
  end if;
  if body is null or char_length(btrim(body)) = 0 or char_length(body) > 1000 then raise exception 'bad body'; end if;
  insert into public.messages (match_id, sender, body) values (send_message.match_id, me, btrim(body)) returning * into row;
  insert into public.match_reads (match_id, reader, read_at) values (send_message.match_id, me, row.created_at)
    on conflict (match_id, reader) do update set read_at = excluded.read_at;
  return to_jsonb(row);
end $$;
revoke all on function public.send_message(uuid, text) from public, anon;
grant execute on function public.send_message(uuid, text) to authenticated;

create function public.mark_read(match_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.matches x where x.id = mark_read.match_id and (x.a = me or x.b = me)) then raise exception 'not your match'; end if;
  insert into public.match_reads (match_id, reader, read_at) values (mark_read.match_id, me, now())
    on conflict (match_id, reader) do update set read_at = now();
end $$;
revoke all on function public.mark_read(uuid) from public, anon;
grant execute on function public.mark_read(uuid) to authenticated;

-- ================================================================ 5. post-checks
do $$
declare n int;
begin
  if (select count(*) from pg_tables where schemaname='public' and tablename in ('swipes','matches','messages','match_reads')) <> 4 then
    raise exception 'post-check failed: tables - rolling back';
  end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('deck_next','swipe','my_matches','send_message','mark_read','swipes_match_trigger','lc_pair')) <> 7 then
    raise exception 'post-check failed: functions - rolling back';
  end if;
  select count(*) into n from pg_class c where c.oid in ('public.swipes'::regclass,'public.matches'::regclass,'public.messages'::regclass,'public.match_reads'::regclass) and c.relrowsecurity;
  if n <> 4 then raise exception 'post-check failed: RLS on % of 4 - rolling back', n; end if;
  if exists (select 1 from pg_publication where pubname='supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and tablename='messages') then
    raise exception 'post-check failed: messages not in supabase_realtime - rolling back';
  end if;
  raise notice 'deck_next md5: %  swipe md5: %  my_matches md5: %  send_message md5: %',
    md5(pg_get_functiondef('public.deck_next(int)'::regprocedure)), md5(pg_get_functiondef('public.swipe(uuid,text)'::regprocedure)),
    md5(pg_get_functiondef('public.my_matches()'::regprocedure)), md5(pg_get_functiondef('public.send_message(uuid,text)'::regprocedure));
end $$;

commit;

-- ================================================================ READ BACK (read-only; run after, record under "Run log" in tools/DESIGN-deck.md)
-- select md5(pg_get_functiondef('public.deck_next(int)'::regprocedure)) as deck_next_md5,
--        md5(pg_get_functiondef('public.swipe(uuid,text)'::regprocedure)) as swipe_md5,
--        md5(pg_get_functiondef('public.my_matches()'::regprocedure)) as my_matches_md5,
--        md5(pg_get_functiondef('public.send_message(uuid,text)'::regprocedure)) as send_message_md5,
--        md5(pg_get_functiondef('public.public_profile(uuid)'::regprocedure)) as public_profile_md5,
--        (select count(*) from pg_tables where schemaname='public' and tablename in ('swipes','matches','messages','match_reads')) as tables,
--        (select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename='messages') as messages_realtime,
--        (select string_agg(tablename||'='||(select count(*) from pg_policies p where p.schemaname='public' and p.tablename=t.tablename), ', ')
--           from (values ('swipes'),('matches'),('messages'),('match_reads')) t(tablename)) as policies,
--        jsonb_array_length(public.deck_next(5)) as deck_sample;   -- in Studio (no uid) this raises 'not signed in' — that is correct; drop this column to run the rest
-- -- expect: four new md5s (record — the next DDL's guards) | 239070f7… | 4 | 1 | swipes=1, matches=1, messages=1, match_reads=0

-- ================================================================ UNDO (one transaction)
-- begin;
-- drop function public.mark_read(uuid); drop function public.send_message(uuid,text); drop function public.my_matches();
-- drop function public.swipe(uuid,text); drop function public.deck_next(int);
-- alter publication supabase_realtime drop table public.messages;
-- drop table public.messages; drop table public.match_reads;
-- drop trigger swipes_match on public.swipes; drop function public.swipes_match_trigger();
-- drop table public.matches; drop function public.lc_pair(uuid,uuid); drop table public.swipes;
-- commit;
