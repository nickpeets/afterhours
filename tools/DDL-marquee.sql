-- DDL — THE MARQUEE (feat/marquee, PR D2 of the lobby refresh; ruling Nick 10/21–22: a lobby that is never
-- dead — hosts SCHEDULE shows, the lobby shows the next one with a countdown and RSVP, and the scheduled
-- card becomes the live card the moment she goes live)
-- STATUS: NOT RUN.  Hand to Nick; he runs it in Supabase Studio (project afterhours, PRODUCTION).
-- Never run by an agent.  Record the read-back under "Run log" in tools/DESIGN-marquee.md.
--
-- Studio-safe by construction: ONE level of $$, no nested dollar-quotes, no plpgsql variable named `row`,
-- no guard on a column this file overwrites.  Run the PREFLIGHT first and READ it.
--
-- What it does, in dependency order, ONE transaction, refuses on drift:
--   0. guards      — lc_config / public_profile / deck_next are the 10/21–22 read-backs; nothing this file
--                    creates exists
--   1. shows       — host_id, title, starts_at, status ('scheduled' | 'live' | 'done' | 'cancelled'), room_id;
--                    signed-in users read scheduled/live/done; writes only through RPCs
--   2. rsvps       — (show_id, user_id); own rows; written through rsvp()
--   3. RPCs        — schedule_show(title, starts_at) (one scheduled show per host at a time; 10 min to 30 days
--                    out), cancel_show(id), rsvp(show_id, going), upcoming_shows() (the next 14 days + any live
--                    one, with the host's short card, going count, my RSVP, and the live room if linked),
--                    show_went_live(show_id, room_id) (the host links her scheduled show to the room she just
--                    opened), and the lazy close: a linked room that is no longer live reads as done
--   4. post-checks
--
-- Reminders (email an hour before) are D2b: they need pg_cron + an edge function with the Resend key, neither
-- of which this file touches.
--
-- What this guards on (re-read before running if production has moved):
--   lc_config()          md5 8ae9e8a3c39bb23bb3c83f7848dcd600   (2026-10-21 read-back)
--   public_profile(uuid) md5 239070f77a0faac41b7d382d2cb15eb2   (2026-10-21 read-back)
--   deck_next(int)       md5 fb39c8203d9a7e843294cbec2069bc0d   (2026-10-22 read-back)
--   shows, rsvps: must not exist;  schedule_show, cancel_show, rsvp, upcoming_shows, show_went_live: must not exist
--
-- If Studio runs statements one at a time and a guard raises, the transaction is left open:
-- run `rollback;` before anything else.

-- ================================================================ 0. PREFLIGHT (read-only; run first, READ the output)
-- select md5(pg_get_functiondef('public.lc_config()'::regprocedure)) as lc_config_md5,
--        md5(pg_get_functiondef('public.public_profile(uuid)'::regprocedure)) as public_profile_md5,
--        md5(pg_get_functiondef('public.deck_next(int)'::regprocedure)) as deck_next_md5,
--        to_regclass('public.shows') as shows, to_regclass('public.rsvps') as rsvps,
--        to_regprocedure('public.upcoming_shows()') as upcoming_shows,
--        (select string_agg(column_name||':'||data_type, ', ' order by ordinal_position) from information_schema.columns
--           where table_schema='public' and table_name='rooms' and column_name in ('id','host_id','contestant_name','status','created_at')) as room_columns,
--        (select string_agg(distinct status, ',') from public.rooms) as room_status_values,
--        (select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('rooms','room_members','messages')) as realtime_tables;
-- -- expect: 8ae9e8a3… | 239070f7… | fb39c820… | null | null | null | id:uuid, host_id:uuid, contestant_name:text, status:text, created_at:… | live,ended,… | 3 (or 1–3)

begin;

-- ================================================================ 0. guards
do $$
declare h text;
begin
  h := md5(pg_get_functiondef('public.lc_config()'::regprocedure));
  if h <> '8ae9e8a3c39bb23bb3c83f7848dcd600' then
    raise exception 'DRIFT: lc_config md5 is %, expected 8ae9e8a3c39bb23bb3c83f7848dcd600 - nothing changed', h;
  end if;
  h := md5(pg_get_functiondef('public.public_profile(uuid)'::regprocedure));
  if h <> '239070f77a0faac41b7d382d2cb15eb2' then
    raise exception 'DRIFT: public_profile md5 is %, expected 239070f77a0faac41b7d382d2cb15eb2 - nothing changed', h;
  end if;
  h := md5(pg_get_functiondef('public.deck_next(int)'::regprocedure));
  if h <> 'fb39c8203d9a7e843294cbec2069bc0d' then
    raise exception 'DRIFT: deck_next md5 is %, expected fb39c8203d9a7e843294cbec2069bc0d - nothing changed', h;
  end if;
  if to_regclass('public.shows') is not null then raise exception 'DRIFT: public.shows already exists - nothing changed'; end if;
  if to_regclass('public.rsvps') is not null then raise exception 'DRIFT: public.rsvps already exists - nothing changed'; end if;
  if to_regprocedure('public.schedule_show(text,timestamptz)') is not null then raise exception 'DRIFT: schedule_show already exists - nothing changed'; end if;
  if to_regprocedure('public.cancel_show(uuid)') is not null then raise exception 'DRIFT: cancel_show already exists - nothing changed'; end if;
  if to_regprocedure('public.rsvp(uuid,boolean)') is not null then raise exception 'DRIFT: rsvp already exists - nothing changed'; end if;
  if to_regprocedure('public.upcoming_shows()') is not null then raise exception 'DRIFT: upcoming_shows already exists - nothing changed'; end if;
  if to_regprocedure('public.show_went_live(uuid,uuid)') is not null then raise exception 'DRIFT: show_went_live already exists - nothing changed'; end if;
  if (select count(*) from information_schema.columns where table_schema='public' and table_name='rooms' and column_name in ('id','host_id','status','contestant_name')) <> 4 then
    raise exception 'DRIFT: rooms is missing one of id/host_id/status/contestant_name - nothing changed';
  end if;
end $$;

-- ================================================================ 1. shows
create table public.shows (
  id         uuid primary key default gen_random_uuid(),
  host_id    uuid not null references auth.users(id) on delete cascade,
  title      text not null check (char_length(title) between 1 and 40),
  starts_at  timestamptz not null,
  status     text not null default 'scheduled' check (status in ('scheduled','live','done','cancelled')),
  room_id    uuid null references public.rooms(id) on delete set null,
  created_at timestamptz not null default now()
);
create index shows_upcoming on public.shows (starts_at) where status in ('scheduled','live');
alter table public.shows enable row level security;
create policy shows_signed_in_read on public.shows for select to authenticated using (status <> 'cancelled');
grant select on table public.shows to authenticated;
comment on table public.shows is 'THE MARQUEE (PR D2, 10/22): scheduled shows. Written only through schedule_show / cancel_show / show_went_live.';

-- ================================================================ 2. rsvps
create table public.rsvps (
  show_id    uuid not null references public.shows(id) on delete cascade,
  user_id    uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (show_id, user_id)
);
alter table public.rsvps enable row level security;
create policy rsvps_own_read on public.rsvps for select to authenticated using (user_id = auth.uid());
grant select on table public.rsvps to authenticated;   -- writes go through rsvp()

-- ================================================================ 3. RPCs
-- one scheduled show per host at a time; 10 minutes to 30 days out
create function public.schedule_show(title text, starts_at timestamptz)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); v_show public.shows;
begin
  if me is null then raise exception 'not signed in'; end if;
  if title is null or char_length(btrim(title)) = 0 or char_length(title) > 40 then raise exception 'bad title'; end if;
  if starts_at is null or starts_at < now() + interval '10 minutes' or starts_at > now() + interval '30 days' then
    raise exception 'pick a time between 10 minutes and 30 days from now';
  end if;
  if exists (select 1 from public.shows s where s.host_id = me and s.status = 'scheduled') then
    raise exception 'you already have a show scheduled — cancel it first';
  end if;
  insert into public.shows (host_id, title, starts_at) values (me, btrim(title), starts_at) returning * into v_show;
  insert into public.rsvps (show_id, user_id) values (v_show.id, me) on conflict do nothing;   -- the host is going
  return to_jsonb(v_show);
end $$;
revoke all on function public.schedule_show(text, timestamptz) from public, anon;
grant execute on function public.schedule_show(text, timestamptz) to authenticated;

create function public.cancel_show(show_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  update public.shows s set status = 'cancelled' where s.id = cancel_show.show_id and s.host_id = me and s.status = 'scheduled';
  if not found then raise exception 'not your scheduled show'; end if;
end $$;
revoke all on function public.cancel_show(uuid) from public, anon;
grant execute on function public.cancel_show(uuid) to authenticated;

create function public.rsvp(show_id uuid, going boolean)
returns jsonb
language plpgsql security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); n int;
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.shows s where s.id = rsvp.show_id and s.status in ('scheduled','live')) then raise exception 'no such show'; end if;
  if going then
    insert into public.rsvps (show_id, user_id) values (rsvp.show_id, me) on conflict do nothing;
  else
    delete from public.rsvps r where r.show_id = rsvp.show_id and r.user_id = me;
  end if;
  select count(*) into n from public.rsvps r where r.show_id = rsvp.show_id;
  return jsonb_build_object('show_id', rsvp.show_id, 'going', going, 'count', n);
end $$;
revoke all on function public.rsvp(uuid, boolean) from public, anon;
grant execute on function public.rsvp(uuid, boolean) to authenticated;

-- the host links the show she scheduled to the room she just opened
create function public.show_went_live(show_id uuid, room_id uuid)
returns void
language plpgsql security definer set search_path to 'public'
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'not signed in'; end if;
  if not exists (select 1 from public.rooms r where r.id = show_went_live.room_id and r.host_id = me) then raise exception 'not your room'; end if;
  update public.shows s set status = 'live', room_id = show_went_live.room_id
   where s.id = show_went_live.show_id and s.host_id = me and s.status = 'scheduled';
  if not found then raise exception 'not your scheduled show'; end if;
end $$;
revoke all on function public.show_went_live(uuid, uuid) from public, anon;
grant execute on function public.show_went_live(uuid, uuid) to authenticated;

-- the next 14 days (and anything live), soonest first; a linked room that is no longer live reads as done
create function public.upcoming_shows()
returns jsonb
language plpgsql stable security definer set search_path to 'public'
as $$
declare me uuid := auth.uid(); v_out jsonb;
begin
  if me is null then raise exception 'not signed in'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'title', s.title, 'starts_at', s.starts_at, 'created_at', s.created_at,
           'status', case when s.status = 'live' and r.status is distinct from 'live' then 'done' else s.status end,
           'room_id', s.room_id, 'room_status', r.status,
           'host', public.public_profile(s.host_id),
           'going', (select count(*) from public.rsvps x where x.show_id = s.id),
           'me_going', exists (select 1 from public.rsvps x where x.show_id = s.id and x.user_id = me),
           'mine', s.host_id = me)
         order by s.starts_at), '[]'::jsonb)
    into v_out
    from public.shows s
    left join public.rooms r on r.id = s.room_id
   where s.status in ('scheduled','live')
     and s.starts_at < now() + interval '14 days'
     and s.starts_at > now() - interval '6 hours'
     and not exists (select 1 from public.user_blocks ub where (ub.blocker = me and ub.blocked = s.host_id) or (ub.blocker = s.host_id and ub.blocked = me));
  return v_out;
end $$;
revoke all on function public.upcoming_shows() from public, anon;
grant execute on function public.upcoming_shows() to authenticated;

-- realtime: the lobby's Marquee refreshes on shows / rsvps changes
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'shows') then
      alter publication supabase_realtime add table public.shows;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'rsvps') then
      alter publication supabase_realtime add table public.rsvps;
    end if;
  end if;
end $$;

-- ================================================================ 4. post-checks
do $$
begin
  if (select count(*) from pg_tables where schemaname='public' and tablename in ('shows','rsvps')) <> 2 then raise exception 'post-check failed: tables - rolling back'; end if;
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname in ('schedule_show','cancel_show','rsvp','upcoming_shows','show_went_live')) <> 5 then
    raise exception 'post-check failed: functions - rolling back';
  end if;
  if (select count(*) from pg_class where oid in ('public.shows'::regclass,'public.rsvps'::regclass) and relrowsecurity) <> 2 then raise exception 'post-check failed: RLS - rolling back'; end if;
  raise notice 'upcoming_shows md5: %  schedule_show md5: %', md5(pg_get_functiondef('public.upcoming_shows()'::regprocedure)), md5(pg_get_functiondef('public.schedule_show(text,timestamptz)'::regprocedure));
end $$;

commit;

-- ================================================================ READ BACK (read-only; run after, record under "Run log" in tools/DESIGN-marquee.md)
-- select md5(pg_get_functiondef('public.upcoming_shows()'::regprocedure)) as upcoming_shows_md5,
--        md5(pg_get_functiondef('public.schedule_show(text,timestamptz)'::regprocedure)) as schedule_show_md5,
--        md5(pg_get_functiondef('public.rsvp(uuid,boolean)'::regprocedure)) as rsvp_md5,
--        md5(pg_get_functiondef('public.show_went_live(uuid,uuid)'::regprocedure)) as show_went_live_md5,
--        (select count(*) from pg_tables where schemaname='public' and tablename in ('shows','rsvps')) as tables,
--        (select count(*) from pg_publication_tables where pubname='supabase_realtime' and tablename in ('shows','rsvps')) as realtime,
--        (select string_agg(t.tablename||'='||(select count(*) from pg_policies p where p.schemaname='public' and p.tablename=t.tablename), ', ')
--           from (values ('shows'),('rsvps')) t(tablename)) as policies;
-- -- expect: four new md5s (record) | 2 | 2 | shows=1, rsvps=1

-- ================================================================ UNDO (one transaction)
-- begin;
-- alter publication supabase_realtime drop table public.rsvps; alter publication supabase_realtime drop table public.shows;
-- drop function public.upcoming_shows(); drop function public.show_went_live(uuid,uuid); drop function public.rsvp(uuid,boolean);
-- drop function public.cancel_show(uuid); drop function public.schedule_show(text,timestamptz);
-- drop table public.rsvps; drop table public.shows;
-- commit;
