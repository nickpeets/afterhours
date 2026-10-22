-- DDL — the subscription scaffold (feat/subscription-scaffold, PR B of the 10/20–10/21 brief;
-- rulings Nick 10/20–10/21: "Last Call is also a subscription app"; the model is docs/fun-and-money.md)
-- STATUS: NOT RUN.  Nick runs it in Supabase Studio (project afterhours, PRODUCTION), as three pastes:
--   PREFLIGHT (one SELECT, read-only) → the begin…commit block → READ BACK (one SELECT, read-only).
-- Never run by an agent.  Record the read-back under "Run log" in tools/DESIGN-looks-v2.md.
--
-- STUDIO-SAFE BY CONSTRUCTION (the 2026-10-21 standing rules): every DO block and every function body
-- is ONE level of $$ with nothing dollar-quoted inside it; strings are built with format() /
-- quote_literal(); and no guard reads a column this file overwrites (the two columns it adds do
-- not exist yet, which IS the guard).
--
-- What it does, in dependency order, ONE transaction, refuses on drift:
--   0. guards      — the five functions on record are byte-for-byte their 2026-10-21 read-backs
--                    (throw_limits, lc_config, lc_tonight_pack, lc_pack_status, set_filter);
--                    profiles has neither new column; nothing this creates exists yet; nothing
--                    in the catalog depends on throw_limits() (the rename is safe)
--   1. columns     — profiles.subscription ('none' | 'active' | 'comped', default 'none') and
--                    profiles.subscription_until (timestamptz, null = no lapse date)
--   2. the guard   — profiles_subscription_guard: an API role (anon / authenticated — what PostgREST
--                    runs a client write as) may not change either column, whatever the row's RLS
--                    policy says.  Inside a SECURITY DEFINER function current_user is the owner, so
--                    comp_subscription (and billing, later) pass; a client's own
--                    sb.from("profiles").update({subscription:…}) does not.  The throw columns on
--                    room_members are guarded exactly this way (room_members_throw_guard).
--   3. the reads   — subscription_state(uid) → 'none' | 'active' | 'comped' (an expired
--                    subscription_until reads as 'none'); is_subscriber(uid) → boolean, THE ONE HOOK
--                    every perk check calls (PR C calls it for the full-profile perk).  Signed-in
--                    callers only.
--   4. the comp    — comp_subscription(uid, until): Studio-only (no API role may call it).  Nick
--                    comps crew and hosts; until in the past ends a comp; null is open-ended.
--   5. the ration  — throw_limits() is RENAMED throw_limits_base() (body untouched, proven by the
--                    post-check) and a new throw_limits() wraps it: the base numbers with cheers and
--                    jeers doubled when is_subscriber(auth.uid()).  throw_at, throw_counts and the
--                    member trigger call throw_limits() by name, so each sees the caller's ration
--                    with not one line of theirs touched (their production text is a reflowed paste
--                    with no full md5 on record — this is why they are not spliced).  The wrapper is
--                    security definer so every role that could call throw_limits() still can
--                    (is_subscriber is signed-in only); auth.uid() reads the request's claims either way.
--   6. the ledger  — subscriptions_status, a Studio-only view: who is subscribed, how, until when.
--   7. post-checks — in-transaction, rolled back where they write: the renamed body hashes as the
--                    read-back with its name put back; throw_limits() = throw_limits_base() for a
--                    caller with no uid; a comp that has lapsed reads 'none'; a live comp reads
--                    'comped' and doubles the ration; the guard refuses an API-role write.
--
-- What this guards on (re-read before running if production has moved):
--   throw_limits()                  md5 677f9cddef6e5eeb178437347ccf8223   (2026-10-20 read-back, live_secs 4)
--   lc_config()                     md5 18c19ce96c662a68bc82e327a14f5df4   (2026-10-21 read-back)
--   lc_tonight_pack()               md5 00ed780667ebed70cab458368bc616c1   (2026-10-21 read-back)
--   lc_pack_status(look_packs)      md5 51d7be429e260c1ad5ff92fd25704165   (2026-10-21 read-back)
--   set_filter(uuid,text)           md5 88c4017d9db2fc1dd69cf877729e4c41, 1569 chars (2026-10-21 read-back)
--   profiles: no subscription / subscription_until column
--   is_subscriber, subscription_state, comp_subscription, throw_limits_base, profiles_subscription_guard,
--   subscriptions_status: must not exist
--   NOTE: PR C (feat/profiles-tinder) replaces lc_config().  If C's DDL has run first, the lc_config
--   guard refuses by design — swap in C's read-back md5 and re-run; nothing else here depends on it.
--
-- If Studio runs statements one at a time and a guard raises, the transaction is left open:
-- run `rollback;` before anything else.

-- ================================================================ PREFLIGHT (read-only; ONE select; run first, record the output)
-- select md5(pg_get_functiondef('public.throw_limits()'::regprocedure))                        as throw_limits_md5,       -- expect 677f9cddef6e5eeb178437347ccf8223
--        length(pg_get_functiondef('public.throw_limits()'::regprocedure))                     as throw_limits_chars,     -- recorded, not guarded
--        md5(pg_get_functiondef('public.lc_config()'::regprocedure))                           as lc_config_md5,          -- expect 18c19ce96c662a68bc82e327a14f5df4
--        md5(pg_get_functiondef('public.lc_tonight_pack()'::regprocedure))                     as lc_tonight_pack_md5,    -- expect 00ed780667ebed70cab458368bc616c1
--        md5(pg_get_functiondef('public.lc_pack_status(public.look_packs)'::regprocedure))     as lc_pack_status_md5,     -- expect 51d7be429e260c1ad5ff92fd25704165
--        md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure))                 as set_filter_md5,         -- expect 88c4017d9db2fc1dd69cf877729e4c41
--        length(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure))              as set_filter_chars,       -- expect 1569
--        (select string_agg(column_name, ',' order by column_name) from information_schema.columns
--          where table_schema = 'public' and table_name = 'profiles' and column_name like 'subscription%') as subscription_columns,   -- expect null
--        (select data_type from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'id') as profiles_id_type,   -- expect uuid
--        to_regprocedure('public.is_subscriber(uuid)')                                         as is_subscriber,          -- expect null
--        to_regprocedure('public.subscription_state(uuid)')                                    as subscription_state,     -- expect null
--        to_regprocedure('public.comp_subscription(uuid,timestamptz)')                         as comp_subscription,      -- expect null
--        to_regprocedure('public.throw_limits_base()')                                         as throw_limits_base,      -- expect null
--        to_regprocedure('public.profiles_subscription_guard()')                               as profiles_guard_fn,      -- expect null
--        to_regclass('public.subscriptions_status')                                            as subscriptions_status,   -- expect null
--        (select count(*) from pg_depend d where d.refclassid = 'pg_proc'::regclass
--            and d.refobjid = 'public.throw_limits()'::regprocedure::oid and d.deptype <> 'i')  as throw_limits_dependents, -- expect 0
--        (select string_agg(tgname, ',') from pg_trigger where tgrelid = 'public.profiles'::regclass and not tgisinternal) as profiles_triggers,   -- recorded
--        (select relrowsecurity from pg_class where oid = 'public.profiles'::regclass)         as profiles_rls,           -- recorded (expect true)
--        public.throw_limits()                                                                  as throw_limits_now;      -- recorded (cheers 5, jeers 2, live_secs 4 …)

begin;

-- ================================================================ 0. guards
do $$
declare h text; n int; t text;
begin
  h := md5(pg_get_functiondef('public.throw_limits()'::regprocedure));
  if h <> '677f9cddef6e5eeb178437347ccf8223' then
    raise exception 'DRIFT: throw_limits md5 is %, expected 677f9cddef6e5eeb178437347ccf8223 (the 2026-10-20 read-back) - nothing changed; re-read before running', h;
  end if;
  h := md5(pg_get_functiondef('public.lc_config()'::regprocedure));
  if h <> '18c19ce96c662a68bc82e327a14f5df4' then
    raise exception 'DRIFT: lc_config md5 is %, expected 18c19ce96c662a68bc82e327a14f5df4 (the 2026-10-21 read-back; if PR C ran first, swap in its read-back) - nothing changed', h;
  end if;
  h := md5(pg_get_functiondef('public.lc_tonight_pack()'::regprocedure));
  if h <> '00ed780667ebed70cab458368bc616c1' then
    raise exception 'DRIFT: lc_tonight_pack md5 is %, expected 00ed780667ebed70cab458368bc616c1 (the 2026-10-21 read-back) - nothing changed', h;
  end if;
  h := md5(pg_get_functiondef('public.lc_pack_status(public.look_packs)'::regprocedure));
  if h <> '51d7be429e260c1ad5ff92fd25704165' then
    raise exception 'DRIFT: lc_pack_status md5 is %, expected 51d7be429e260c1ad5ff92fd25704165 (the 2026-10-21 read-back) - nothing changed', h;
  end if;
  h := md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure));
  if h <> '88c4017d9db2fc1dd69cf877729e4c41' or length(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure)) <> 1569 then
    raise exception 'DRIFT: set_filter is % chars md5 %, expected 1569 / 88c4017d9db2fc1dd69cf877729e4c41 (the 2026-10-21 read-back) - nothing changed', length(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure)), h;
  end if;
  select data_type into t from information_schema.columns where table_schema = 'public' and table_name = 'profiles' and column_name = 'id';
  if t is distinct from 'uuid' then
    raise exception 'DRIFT: public.profiles.id is % (expected uuid) - nothing changed', coalesce(t, 'missing');
  end if;
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name in ('subscription', 'subscription_until');
  if n <> 0 then
    raise exception 'DRIFT: profiles already has % subscription column(s) - nothing changed; this has run before', n;
  end if;
  if to_regprocedure('public.is_subscriber(uuid)') is not null or to_regprocedure('public.subscription_state(uuid)') is not null
     or to_regprocedure('public.comp_subscription(uuid,timestamptz)') is not null or to_regprocedure('public.throw_limits_base()') is not null
     or to_regprocedure('public.profiles_subscription_guard()') is not null then
    raise exception 'DRIFT: one of is_subscriber / subscription_state / comp_subscription / throw_limits_base / profiles_subscription_guard already exists - nothing changed';
  end if;
  if to_regclass('public.subscriptions_status') is not null then
    raise exception 'DRIFT: public.subscriptions_status already exists - nothing changed';
  end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_subscription_guard') then
    raise exception 'DRIFT: trigger profiles_subscription_guard already exists - nothing changed';
  end if;
  select count(*) into n from pg_depend d
   where d.refclassid = 'pg_proc'::regclass and d.refobjid = 'public.throw_limits()'::regprocedure::oid and d.deptype <> 'i';
  if n <> 0 then
    raise exception 'DRIFT: % catalog object(s) depend on throw_limits() (a view, default or generated column?) - the rename is not safe; nothing changed', n;
  end if;
end $$;

-- ================================================================ 1. columns: the subscription, server-side only
alter table public.profiles
  add column subscription text not null default 'none',
  add column subscription_until timestamptz null;
alter table public.profiles
  add constraint profiles_subscription_kind check (subscription in ('none', 'active', 'comped'));
comment on column public.profiles.subscription is
  'none | active | comped (PR B, 10/21). Server-side only: written by billing (later) and comp_subscription; the profiles_subscription_guard trigger refuses any API-role write. Read through subscription_state(uid) / is_subscriber(uid), which apply subscription_until.';
comment on column public.profiles.subscription_until is
  'When the subscription lapses; null = no lapse date. Past = reads as none (subscription_state). Server-side only (see profiles.subscription).';

-- ================================================================ 2. the guard: no API role writes either column, whatever RLS says
create function public.profiles_subscription_guard()
returns trigger language plpgsql
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      if new.subscription is distinct from 'none' or new.subscription_until is not null then
        raise exception 'subscription changes only through billing and comp_subscription';
      end if;
    elsif new.subscription is distinct from old.subscription
       or new.subscription_until is distinct from old.subscription_until then
      raise exception 'subscription changes only through billing and comp_subscription';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_subscription_guard
  before insert or update on public.profiles
  for each row execute function public.profiles_subscription_guard();

-- ================================================================ 3. the reads: subscription_state(uid), is_subscriber(uid) — THE ONE HOOK
-- An expired subscription_until reads as 'none'.  security definer: the answer does not depend on
-- the caller's RLS view of profiles.  Signed-in callers only (anon revoked).
create function public.subscription_state(uid uuid)
returns text language sql stable security definer set search_path = public
as $$
  select coalesce((select case when p.subscription in ('active', 'comped')
                                and (p.subscription_until is null or p.subscription_until > now())
                               then p.subscription else 'none' end
                     from public.profiles p where p.id = uid), 'none')
$$;
revoke all on function public.subscription_state(uuid) from public, anon;
grant execute on function public.subscription_state(uuid) to authenticated, service_role;
comment on function public.subscription_state(uuid) is
  'none | active | comped for one profile, with subscription_until applied on the server clock (an expired comp or subscription reads as none). PR B, 10/21.';

create function public.is_subscriber(uid uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select public.subscription_state(uid) <> 'none'
$$;
revoke all on function public.is_subscriber(uuid) from public, anon;
grant execute on function public.is_subscriber(uuid) to authenticated, service_role;
comment on function public.is_subscriber(uuid) is
  'THE ONE HOOK (PR B, 10/21): true while the profile is active or comped and not lapsed. Every perk check calls this — throw_limits() for the ration, the profile card (PR C) for the full-profile perk.';

-- ================================================================ 4. the comp: Studio-only
create function public.comp_subscription(uid uuid, until timestamptz default null)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_state text;
begin
  update public.profiles
     set subscription = 'comped', subscription_until = comp_subscription.until
   where id = comp_subscription.uid;
  if not found then
    raise exception 'no profile %', comp_subscription.uid;
  end if;
  v_state := public.subscription_state(comp_subscription.uid);
  return jsonb_build_object('id', comp_subscription.uid, 'subscription', 'comped',
                            'subscription_until', comp_subscription.until, 'state', v_state,
                            'is_subscriber', v_state <> 'none');
end $$;
revoke all on function public.comp_subscription(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.comp_subscription(uuid, timestamptz) to service_role;
comment on function public.comp_subscription(uuid, timestamptz) is
  'Studio-only (PR B, 10/21): comp a crew member or host. until null = open-ended; until in the past ends the comp (reads as none). Example: select public.comp_subscription(''<uid>'', ''2027-01-02 00:00 America/Los_Angeles'');';

-- ================================================================ 5. the ration: throw_limits() doubles cheers and jeers for a subscriber caller
-- The 2026-10-20 body is KEPT, under the name throw_limits_base (the post-check hashes it with its
-- old name put back).  The wrapper is what throw_at / throw_counts / the member trigger now call.
alter function public.throw_limits() rename to throw_limits_base;
comment on function public.throw_limits_base() is
  'The base numbers (the 2026-10-20 throw_limits body, renamed by PR B 10/21). throw_limits() wraps it: cheers and jeers x2 for a subscriber caller. Edit numbers HERE.';
create function public.throw_limits()
returns jsonb language sql stable security definer set search_path = public
as $$
  select case when public.is_subscriber(auth.uid())
              then b || jsonb_build_object('cheers', ((b->>'cheers')::int) * 2,
                                           'jeers',  ((b->>'jeers')::int)  * 2,
                                           'subscriber', true)
              else b end
    from public.throw_limits_base() as t(b)
$$;
grant execute on function public.throw_limits() to anon, authenticated, service_role;   -- what the old one had by Supabase default
comment on function public.throw_limits() is
  'The caller''s ration and the throw numbers (PR B, 10/21): throw_limits_base() with cheers and jeers doubled when is_subscriber(auth.uid()), and subscriber=true riding along. throw_at, throw_counts and room_members_throw_guard read it by name, untouched.';

-- ================================================================ 6. the Studio-only ledger
create view public.subscriptions_status with (security_invoker = true) as
  select p.id, p.display_name, p.subscription, p.subscription_until,
         public.subscription_state(p.id) as state, public.is_subscriber(p.id) as is_subscriber
    from public.profiles p
   where p.subscription <> 'none'
   order by p.subscription_until nulls first, p.display_name;
revoke all on table public.subscriptions_status from public, anon, authenticated;
comment on view public.subscriptions_status is
  'Studio-only: every profile with a subscription or comp and what subscription_state says right now. To comp: select public.comp_subscription(''<uid>'', ''<until>''). To end a comp: the same with an until in the past.';

-- ================================================================ 7. post-checks (in-transaction; the writing ones roll themselves back)
do $$
declare
  h text; n int; v_id uuid; lim jsonb; base jsonb; r jsonb; v_msg text; v_after text;
begin
  -- 7a. the renamed body is the read-back, byte for byte, with its name put back
  h := md5(replace(pg_get_functiondef('public.throw_limits_base()'::regprocedure), 'throw_limits_base', 'throw_limits'));
  if h <> '677f9cddef6e5eeb178437347ccf8223' then
    raise exception 'post-check failed: throw_limits_base with its old name hashes %, expected 677f9cddef6e5eeb178437347ccf8223 - the body moved; rolling back', h;
  end if;
  -- 7b. with no caller (Studio), the wrapper IS the base
  lim := public.throw_limits(); base := public.throw_limits_base();
  if lim <> base then
    raise exception 'post-check failed: throw_limits() % differs from throw_limits_base() % for a caller with no uid - rolling back', lim, base;
  end if;
  if (base->>'cheers')::int is null or (base->>'jeers')::int is null then
    raise exception 'post-check failed: throw_limits_base() carries no cheers/jeers (%) - rolling back', base;
  end if;
  -- 7c. the columns and the guard are on
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'profiles' and column_name in ('subscription', 'subscription_until');
  if n <> 2 then raise exception 'post-check failed: % of the two columns exist - rolling back', n; end if;
  if not exists (select 1 from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_subscription_guard' and tgenabled <> 'D') then
    raise exception 'post-check failed: trigger profiles_subscription_guard is missing or disabled - rolling back';
  end if;
  -- 7d. nobody is a subscriber yet; an unknown uid reads none / false
  select count(*) into n from public.profiles where subscription <> 'none' or subscription_until is not null;
  if n <> 0 then raise exception 'post-check failed: % profile(s) already carry a subscription - rolling back', n; end if;
  if public.subscription_state(gen_random_uuid()) <> 'none' or public.is_subscriber(gen_random_uuid()) then
    raise exception 'post-check failed: an unknown uid does not read none / false - rolling back';
  end if;
  -- 7e. a comp that has lapsed reads none; a live comp reads comped and doubles the caller's ration.
  --     Written inside a sub-block that always raises P0999 at the end, so every write here is
  --     rolled back and no profile leaves this file comped.
  select id into v_id from public.profiles order by id limit 1;
  if v_id is null then
    raise notice 'post-check 7e skipped: profiles is empty';
  else
    begin
      r := public.comp_subscription(v_id, now() - interval '1 second');
      if (r->>'state') <> 'none' or (r->>'is_subscriber')::boolean or public.is_subscriber(v_id) then
        raise exception 'post-check failed: a lapsed comp reads % - rolling back', r;
      end if;
      r := public.comp_subscription(v_id, now() + interval '1 day');
      if (r->>'state') <> 'comped' or not public.is_subscriber(v_id) or public.subscription_state(v_id) <> 'comped' then
        raise exception 'post-check failed: a live comp reads % - rolling back', r;
      end if;
      r := public.comp_subscription(v_id, null);
      if (r->>'state') <> 'comped' or not public.is_subscriber(v_id) then
        raise exception 'post-check failed: an open-ended comp reads % - rolling back', r;
      end if;
      -- the ration, as the comped caller: auth.uid() reads request.jwt.claims (Supabase)
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_id), true);
      perform set_config('request.jwt.claim.sub', v_id::text, true);
      if auth.uid() is distinct from v_id then
        raise notice 'post-check 7e: auth.uid() did not take the test claims (%) - the ration half is unproven here; the dry run proved it', auth.uid();
      else
        lim := public.throw_limits();
        if (lim->>'cheers')::int <> (base->>'cheers')::int * 2 or (lim->>'jeers')::int <> (base->>'jeers')::int * 2
           or (lim->>'subscriber')::boolean is distinct from true
           or (lim - 'cheers' - 'jeers' - 'subscriber') <> (base - 'cheers' - 'jeers') then
          raise exception 'post-check failed: a comped caller''s throw_limits() is %, base % - rolling back', lim, base;
        end if;
        raise notice 'post-check 7e: comped caller ration % (base %)', lim, base;
        -- the guard, as an API role on the caller's own row (RLS permitting): the write must be refused
        begin
          execute 'set local role authenticated';
          update public.profiles set subscription = 'active' where id = v_id;
          get diagnostics n = row_count;
          execute 'reset role';
          if n > 0 then
            raise exception 'post-check failed: an authenticated client changed profiles.subscription (% row) - the guard did not fire; rolling back', n;
          end if;
          raise notice 'post-check 7e: RLS hid the row from role authenticated (0 rows) - the guard was not reached here; the dry run proved it';
        exception when others then
          execute 'reset role';
          get stacked diagnostics v_msg = message_text;
          if v_msg like 'subscription changes only through%' then
            raise notice 'post-check 7e: the guard refused the client write: %', v_msg;
          elsif v_msg like 'permission denied to set role%' then
            raise notice 'post-check 7e: this session may not take role authenticated - the guard is unproven here; the dry run proved it';
          else
            raise;
          end if;
        end;
      end if;
      perform set_config('request.jwt.claims', '', true);
      perform set_config('request.jwt.claim.sub', '', true);
      raise exception using errcode = 'P0999', message = 'post-check 7e done: unwinding the test writes';
    exception when sqlstate 'P0999' then
      null;   -- every write in the sub-block is rolled back; the settings were cleared above
    end;
    if public.is_subscriber(v_id) or (select subscription from public.profiles where id = v_id) <> 'none' then
      raise exception 'post-check failed: the test comp on % survived the sub-block - rolling back', v_id;
    end if;
  end if;
  -- 7f. the untouched five
  raise notice 'lc_config md5 after: %  lc_tonight_pack md5 after: %  lc_pack_status md5 after: %  set_filter md5 after: %',
    md5(pg_get_functiondef('public.lc_config()'::regprocedure)),
    md5(pg_get_functiondef('public.lc_tonight_pack()'::regprocedure)),
    md5(pg_get_functiondef('public.lc_pack_status(public.look_packs)'::regprocedure)),
    md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure));
  raise notice 'throw_limits md5 after: %  throw_limits_base md5 after: %  is_subscriber md5: %',
    md5(pg_get_functiondef('public.throw_limits()'::regprocedure)),
    md5(pg_get_functiondef('public.throw_limits_base()'::regprocedure)),
    md5(pg_get_functiondef('public.is_subscriber(uuid)'::regprocedure));
end $$;

commit;

-- ================================================================ READ BACK (read-only; ONE select; run after, record under "Run log" in tools/DESIGN-looks-v2.md)
-- select md5(pg_get_functiondef('public.throw_limits()'::regprocedure))                        as throw_limits_md5,        -- NEW — the next DDL's guard
--        md5(pg_get_functiondef('public.throw_limits_base()'::regprocedure))                   as throw_limits_base_md5,   -- NEW — the next DDL's guard
--        md5(replace(pg_get_functiondef('public.throw_limits_base()'::regprocedure), 'throw_limits_base', 'throw_limits')) as base_with_old_name_md5,   -- expect 677f9cddef6e5eeb178437347ccf8223
--        md5(pg_get_functiondef('public.is_subscriber(uuid)'::regprocedure))                   as is_subscriber_md5,       -- NEW — the guard PR C uses
--        md5(pg_get_functiondef('public.subscription_state(uuid)'::regprocedure))              as subscription_state_md5,  -- NEW
--        md5(pg_get_functiondef('public.comp_subscription(uuid,timestamptz)'::regprocedure))   as comp_subscription_md5,   -- NEW
--        md5(pg_get_functiondef('public.profiles_subscription_guard()'::regprocedure))         as profiles_guard_md5,      -- NEW
--        md5(pg_get_functiondef('public.lc_config()'::regprocedure))                           as lc_config_md5,           -- expect 18c19ce96c662a68bc82e327a14f5df4 (untouched)
--        md5(pg_get_functiondef('public.lc_tonight_pack()'::regprocedure))                     as lc_tonight_pack_md5,     -- expect 00ed780667ebed70cab458368bc616c1 (untouched)
--        md5(pg_get_functiondef('public.lc_pack_status(public.look_packs)'::regprocedure))     as lc_pack_status_md5,      -- expect 51d7be429e260c1ad5ff92fd25704165 (untouched)
--        md5(pg_get_functiondef('public.set_filter(uuid,text)'::regprocedure))                 as set_filter_md5,          -- expect 88c4017d9db2fc1dd69cf877729e4c41 (untouched)
--        (select string_agg(column_name || ':' || data_type || ':' || coalesce(column_default, 'null'), ' | ' order by column_name) from information_schema.columns
--          where table_schema = 'public' and table_name = 'profiles' and column_name like 'subscription%') as subscription_columns,   -- expect subscription:text:'none'::text | subscription_until:timestamp with time zone:null
--        (select tgenabled from pg_trigger where tgrelid = 'public.profiles'::regclass and tgname = 'profiles_subscription_guard') as guard_trigger,   -- expect O
--        to_regclass('public.subscriptions_status')                                            as subscriptions_status,    -- expect subscriptions_status
--        (select count(*) from public.subscriptions_status)                                    as subscribers_now,         -- expect 0
--        public.throw_limits() = public.throw_limits_base()                                    as wrapper_is_base_in_studio,   -- expect true
--        public.throw_limits()                                                                  as throw_limits_now,        -- cheers 5, jeers 2, live_secs 4 … (no subscriber key: Studio has no uid)
--        public.is_subscriber(gen_random_uuid())                                                as unknown_uid_is_subscriber,   -- expect false
--        (select string_agg(p.proname || '=' || coalesce(p.proacl::text, 'default'), ' | ' order by p.proname) from pg_proc p
--          where p.pronamespace = 'public'::regnamespace
--            and p.proname in ('throw_limits','throw_limits_base','is_subscriber','subscription_state','comp_subscription')) as acls;
--   -- expect: comp_subscription with no anon/authenticated entry; is_subscriber and subscription_state with no anon entry;
--   --         throw_limits_base carrying throw_limits' old ACL; throw_limits default

-- ================================================================ COMPING (Nick, in Studio, any time — no deploy)
-- select id, display_name from public.profiles where display_name ilike '%name%';                 -- find the uid
-- select public.comp_subscription('<uid>', '2027-01-02 00:00'::timestamp at time zone 'America/Los_Angeles');   -- comp through Jan 1
-- select public.comp_subscription('<uid>', null);                                                   -- comp, open-ended
-- select public.comp_subscription('<uid>', now());                                                  -- end a comp (reads as none from this instant)
-- select * from public.subscriptions_status;                                                        -- who is comped / subscribed, and what the server says right now

-- ================================================================ UNDO (one transaction)
-- begin;
-- drop view public.subscriptions_status;
-- drop function public.throw_limits();
-- alter function public.throw_limits_base() rename to throw_limits;
-- drop function public.comp_subscription(uuid, timestamptz);
-- drop function public.is_subscriber(uuid);
-- drop function public.subscription_state(uuid);
-- drop trigger profiles_subscription_guard on public.profiles;
-- drop function public.profiles_subscription_guard();
-- alter table public.profiles drop constraint profiles_subscription_kind;
-- alter table public.profiles drop column subscription, drop column subscription_until;
-- commit;
-- -- then: select md5(pg_get_functiondef('public.throw_limits()'::regprocedure));   -- expect 677f9cddef6e5eeb178437347ccf8223 again
