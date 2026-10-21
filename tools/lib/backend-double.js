/* backend-double.js — stateful Supabase double for the Last Call battery.
 *
 * Lives in NODE, not in the page: every browser client (host window, suitor
 * windows) talks to the SAME double through an exposed binding, so
 * multi-window flows exercise real shared state rather than per-window mocks.
 * The in-page shim (supabase-shim.js) is a dumb transport; ALL semantics live
 * here.  ("exactly like production Supabase" is what this sentence used to
 * claim.  It is a copy, and the whole point of the audit below is that a copy
 * asserting its own fidelity is the hardest kind of wrong to see.)
 *
 * PROVENANCE.  Every behavioural claim in this file is now labelled SOURCE
 * (read from the server, with the artifact and the date) or ASSUMED (derived
 * from reading index.html, unverified).  There is no third category, because
 * the third category is what caused three defects in this file: a value
 * (SWEEP_MS 45s), a relationship (sweep before hide), and a semantic
 * (join_line re-minting) — and the semantic was wearing a label that said
 * "Measured, not assumed."
 *
 * Faithfulness notes, each one labelled:
 *  - SOURCE (server function `active_members`, SQL editor 2026-08-12): the
 *    freshness filter is `last_seen > now() - interval '60 seconds'`.
 *  - SOURCE (server function `sweep_stale_members`, same read): rows are
 *    marked 'gone' at `now() - interval '3 minutes'`.
 *  - SOURCE (server function `join_line`, same read): FIFO — an existing
 *    `line` row keeps `v_prev_pos`; anything else mints
 *    `nextval('line_position_seq')`.
 *  - ASSUMED (from index.html, unverified): active_members() is SECURITY
 *    DEFINER and so returns rows regardless of RLS.  The FILTER was read; the
 *    security qualifier was not, and the two were being asserted in one
 *    breath.
 *  - ASSUMED (from index.html, unverified): the host has NO room_members row.
 *    Consistent with every read so far and never checked against the schema.
 *  - ASSUMED (from index.html, unverified): the `kept` exemption inside
 *    active_members — rows with role==='kept' survive the freshness filter.
 *    THIS ONE MATTERS RIGHT NOW: the lapse fix extends that exemption to
 *    seated men, so the double is about to be the only authority for the
 *    behaviour the fix is judged against.  Read it off the server before the
 *    fix is called proven.
 *  - ASSUMED (from index.html, unverified): realtime postgres_changes fire on
 *    rooms / room_members / room_events mutations, delivered to every
 *    subscribed client.
 *
 * ON THE TWO CONSTANTS, AND WHAT WAS ACTUALLY WRONG WITH THEM.  The diagnosis
 * this correction was ordered against was "the double has ONE number where the
 * server has TWO."  That is not what the file said.  The split already existed
 * — FRESH_MS and SWEEP_MS, two named constants, the right shape.  What was
 * wrong was the ORDER: SWEEP_MS was 45s and FRESH_MS is 60s, so in the double
 * the sweep BURIED a man five beats before the roster would have HIDDEN him.
 * The server runs the other way round: hide at 60s, bury at 180s.
 *
 * The consequence is exactly the one the diagnosis predicted, by a different
 * mechanism.  Defect 2 lives in the gap between hiding and burying — his row
 * alive, him unrendered.  With the sweep firing FIRST that gap does not exist;
 * it is inverted into a gap where he is buried but still rendered, which is
 * not a state production can reach.  A number in the wrong order is not a
 * smaller error than a missing constant, and it is harder to see, because the
 * file looks right: two names, two windows, both plausible.
 *
 * METHOD rule 8, a layer deeper than the 45 itself: the guess that survived
 * was not the value, it was the RELATIONSHIP between two values.  Nobody had
 * to write it down for it to be load-bearing.
 */
"use strict";

/* Read from the server 2026-08-12, not derived from index.html. */
const FRESH_MS = 60_000;    // active_members: last_seen > now() - interval '60 seconds'
const SWEEP_MS = 180_000;   // sweep_stale_members: now() - interval '3 minutes'
/* STALE ROOMS END (RULING 10/8).  SOURCE: tools/DESIGN-stale-rooms.md DDL —
   lc_host_stale_ms() = 120000.  end_stale_rooms() ends every live room whose
   beat (host_seen_at, else created_at) is older than this; it runs from
   pg_cron every minute and on touch at the top of heartbeat and
   list_live_rooms.  SOURCE: run in production 2026-10-08 and read back (md5s
   in tools/DESIGN-stale-rooms.md). */
const HOST_STALE_MS = 120_000;

/* FILTER SHOW RULES — the curated rack the SERVER accepts (set_filter's
   allow-list, PENDING PRODUCTION DDL in tools/DESIGN-filter-rules.md).  This
   is the free, no-tracking tier only: the two looks the design's ledger files
   under "full-frame colour grade / vignette — cheap enough to give away".
   The amber ✦ set is not in this PR and is not in this list, so a client that
   asks for it is rejected the way production will reject it.  Deliberately
   NOT imported from index.html: the double is the server's copy of the list,
   and a gate that watches the two disagree is a gate doing its job.
   feat/camera-kit-staging (2026-10-05): the first two lens slugs join the
   list — 'ck-objects' and 'ck-express', the two Camera Kit staging test
   looks.  This MIRRORS THE DDL in tools/DESIGN-filter-rules.md ("Lens slugs
   ck-objects / ck-express"); that section's STATUS line says whether
   production has run it.  Still no token pricing: on the server a lens slug
   is one more curated name, and every rule below treats it exactly like a
   teal one. */
const FILTER_LOOKS = ["grade", "noir", "ck-objects", "ck-express",
  /* feat/looks-v2 PR B (ruling 10/18): the Halloween pack's six 2D looks
     and its seven ck- disguise slugs, MIRRORING THE DDL in
     tools/DDL-looks-packs.sql (RUN IN PRODUCTION 2026-10-19; read-back md5s
     in its STATUS line and tools/DESIGN-looks-v2.md's run log).  The
     seven ck- slugs are allow-listed AHEAD of their lenses: no lens exists
     for any of them yet, and a page with none configured shows no tile for
     them (packLook() returns null) — nobody can pick what nobody can draw. */
  "candlelight", "nightvision", "vhs", "fog", "cobweb", "lantern",
  "ck-vampire", "ck-skeleton", "ck-zombie", "ck-witch", "ck-devil", "ck-pumpkin", "ck-ghost",
  /* feat/packs-halloween-now-holidays (PR A of the 10/20–10/21 brief): the
     Holidays pack's eight 2D looks and eight ck- disguise slugs, MIRRORING
     THE DDL in tools/DDL-packs-holidays.sql (its STATUS line says whether
     production has run it).  The eight ck- slugs are allow-listed ahead of
     their lenses exactly as Halloween's seven were. */
  "fairylights", "snowfall", "frosted", "fireplace", "candycane", "snowglobe", "tinsel", "countdown",
  "ck-santa", "ck-reindeer", "ck-elf", "ck-sweater", "ck-krampus", "ck-nutcracker", "ck-snowman", "ck-champagne"];

/* THEMED PACKS (feat/looks-v2 PR B) — public.look_packs as the DDL creates
   it, and the Halloween row the DDL inserts.  The window is Pacific: Oct 24
   00:00 PDT through Nov 1 23:59:59 PST (DST ends Nov 1 2026 at 02:00), stored
   as the instants below.  lc_config() reports the ENABLED row whose window
   holds now() — the latest-starting one when two overlap — as tonight_pack,
   else null.  The double starts with NO packs (a gate seeds what it tests,
   and the battery must not change colour with the calendar); HALLOWEEN_PACK
   is the row for a gate that checks the DDL's data against the page. */
const HALLOWEEN_PACK = Object.freeze({
  slug: "halloween", name: "Halloween", icon: "\u{1F383}",
  looks: Object.freeze(["candlelight", "nightvision", "vhs", "fog", "cobweb", "lantern",
                        "ck-vampire", "ck-skeleton", "ck-zombie", "ck-witch", "ck-devil", "ck-pumpkin", "ck-ghost"]),
  /* the window as tools/DDL-packs-holidays.sql (PR A, ruling 10/20–10/21: on NOW
     for everyone, through Oct 31 PT) moves it; PR #112's DDL had Oct 24 – Nov 1 */
  starts_at: "2026-10-21T07:00:00+00:00",   // 2026-10-21 00:00 America/Los_Angeles (PDT, UTC-7): in the past the moment the DDL runs
  ends_at:   "2026-11-01T07:00:00+00:00",   // 2026-11-01 00:00 America/Los_Angeles (PDT; DST ends two hours later): Oct 31 is the last night
  enabled: true,
});
/* THE HOLIDAYS PACK (feat/packs-halloween-now-holidays) — the row the PR A
   DDL inserts.  Its window opens at the instant Halloween's closes, so the
   rotation hands over by itself: tonightPack() picks the enabled row whose
   window holds now(), and at 2026-11-01 00:00 PT that is this one. */
const HOLIDAYS_PACK = Object.freeze({
  slug: "holidays", name: "Holidays", icon: "\u{1F384}",
  looks: Object.freeze(["fairylights", "snowfall", "frosted", "fireplace", "candycane", "snowglobe", "tinsel", "countdown",
                        "ck-santa", "ck-reindeer", "ck-elf", "ck-sweater", "ck-krampus", "ck-nutcracker", "ck-snowman", "ck-champagne"]),
  starts_at: "2026-11-01T07:00:00+00:00",   // 2026-11-01 00:00 America/Los_Angeles (PDT): the same instant Halloween ends
  ends_at:   "2027-01-02T08:00:00+00:00",   // 2027-01-02 00:00 America/Los_Angeles (PST): Jan 1 is the last night
  enabled: true,
});

/* THROWABLES (feat/throwables, step 2) — the SERVER's numbers and set,
   MIRRORING THE DDL in tools/DESIGN-throwables-server.md (its STATUS line
   says whether production has run it; until then this is a model of DDL
   that has not run, and gate 80 says so).  throw_limits() on the server is
   the one place the numbers live; THROW_LIMITS is its copy.  Deliberately
   NOT imported from index.html — the double is the server's copy, and a
   gate that watches the two disagree is a gate doing its job.
   The set is the ruling's eight (DESIGN-throwables-and-mask.md "The set");
   cls is DERIVED from kind (throw_class), never stored on the member row. */
const THROW_LIMITS = { cheers: 5, jeers: 2, live_secs: 10, cooldown_secs: 20,
  /* THE PRESSURE (feat/pressure-crown, tools/DESIGN-overlay-server.md): the two
     numbers the member trigger reads — throw_limits() carries them too */
  cracks_to_shatter: 3, rose_mends: 1,
  /* COMBOS AND REACTION WINDOWS (feat/combos-reaction, tools/DESIGN-combos-server.md):
     the six numbers throw_at and the rooms trigger read */
  combo_secs: 5, combo_n: 3, combo_fx_secs: 4, ovation_hearts: 1, react_secs: 6, react_mult: 2 };
const THROW_KINDS = { petals: "cheer", hearts: "cheer", confetti: "cheer", sparkle: "cheer",
                      tomato: "jeer", pie: "jeer", boo: "jeer", cricket: "jeer" };
const THROW_COLS = ["throwables_on", "throw_kind", "throw_at", "throw_until", "cracks", "throw_n", "throw_combo_at"];
/* the guard trigger's one message (room_members_throw_guard) and the rooms
   one (rooms_throwables_guard) — what a DIRECT client write gets back */
const THROW_GUARD_MSG = "throw state changes only through throw_at, set_throwables and host_clear_throw";
const ROOMS_THROW_GUARD_MSG = "throwables_on changes only through host_set_throwables";
/* THE PRESSURE AND THE CROWN (feat/pressure-crown) — the two new refusals, in
   the server's words: the member trigger's when a jeer lands on the crown
   holder, and the rooms guard's when a client writes crown_user itself */
const CROWN_BLOCK_MSG = "he wears the crown this round";
const ROOMS_CROWN_GUARD_MSG = "the crown is awarded at her call, never written";
/* COMBOS AND REACTION WINDOWS (feat/combos-reaction): the rooms guard's words
   when a client writes react_user / react_until itself */
const ROOMS_REACT_GUARD_MSG = "the reaction window opens when an answer ends, never written";

let _seq = 1;
const nid = (p) => p + "_" + (_seq++).toString(36).padStart(6, "0");

class BackendDouble {
  constructor() {
    this.users = new Map();      // uid -> {id,email}
    this.profiles = new Map();   // uid -> profile row
    this.rooms = new Map();      // room_id -> room row
    this.members = [];           // room_members rows
    this.events = [];            // room_events rows
    this.herCallAt = new Map();  // room id -> when decide_pass / decide_clear was called (see overlayHerCall)
    this.questions = [];
    this.decks = [];
    this.sessions = new Map();   // clientId -> uid
    this.listeners = [];         // fn(evt) — harness fans out to pages
    this.rpcLog = [];            // every rpc call, for gate assertions
    this.authLog = [];           // every auth op, for gate assertions (retry counting)
    this.opLog = [];
    this.sweepLog = [];          // every end_stale_rooms() run (cron tick or on-touch), for gate assertions             // EVERY dispatched op, in arrival order, across auth/rpc/table — for ORDER assertions (gate 73)
    this.swaps = {};             // room_id -> { uid: contact_text } (backstage swap offers)
    this.clockSkew = 0;          // ms added to "now" (staleness tests)
    /* set_filter's allow-list, per double.  Starts as the server's curated
       list (FILTER_LOOKS above: the two teal looks and the two staging lens
       slugs).  allowFilterLook() widens it for ONE double — it stands in for
       DDL that HAS NOT BEEN WRITTEN (the harness's shim-only slugs 'foxears'
       and 'halo' are not production names and never will be; a future real
       slug must be added to production's two CHECK constraints and to
       set_filter before anyone can wear it — tools/DESIGN-filter-rules.md,
       "Lens looks").  A gate that calls it is testing the client against a
       server that does not exist, and says so; without the call an unlisted
       slug is rejected here exactly the way production rejects it. */
    this.filterLooks = FILTER_LOOKS.slice();
    /* look_packs (PR B): the rows; addLookPack() seeds one, tonightPack()
       is lc_config's query on the double's clock */
    this.lookPacks = [];
    /* THROWABLES: the ledger (throw_ledger) — rations and the thrower's
       identity.  Server-only: table() refuses to read it for ANY client, it
       is never emitted over realtime, and only throw_at writes it.  A gate
       that wants to see who threw reads it HERE, off the double in Node —
       exactly as production's service role could and a member never can. */
    this.throwLedger = [];
  }
  allowFilterLook(name) { if (!this.filterLooks.includes(name)) this.filterLooks.push(name); return this.filterLooks.slice(); }
  /* a look_packs row, as the DDL's constraints accept it; slug is the key
     (an insert on an existing slug replaces, like an upsert in Studio) */
  addLookPack({ slug, name, icon = "", looks, starts_at, ends_at, enabled = true }) {
    if (!slug || !Array.isArray(looks) || !starts_at || !ends_at) throw new Error("look_packs: slug, looks, starts_at, ends_at are required");
    if (Date.parse(ends_at) <= Date.parse(starts_at)) throw new Error("look_packs: ends_at must be after starts_at");
    const row = { slug, name: name || slug, icon, looks: looks.slice(), starts_at: new Date(starts_at).toISOString(), ends_at: new Date(ends_at).toISOString(), enabled: !!enabled };
    this.lookPacks = this.lookPacks.filter((p) => p.slug !== slug).concat([row]);
    return { ...row, looks: row.looks.slice() };
  }
  removeLookPack(slug) { this.lookPacks = this.lookPacks.filter((p) => p.slug !== slug); }
  /* lc_pack_status(row) (PR A DDL): 'live' | 'scheduled' | 'vaulted' | 'off'
     from the window on the double's clock; packStatuses() is the Studio-only
     look_packs_status view.  A VAULTED row stays — nothing here deletes it. */
  packStatus(p, t) {
    const now = Number.isFinite(t) ? t : this.now();
    if (!p.enabled) return "off";
    if (now >= Date.parse(p.ends_at)) return "vaulted";
    if (now < Date.parse(p.starts_at)) return "scheduled";
    return "live";
  }
  packStatuses(t) { return this.lookPacks.slice().sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at)).map((p) => ({ slug: p.slug, name: p.name, status: this.packStatus(p, t), starts_at: p.starts_at, ends_at: p.ends_at, enabled: p.enabled, looks: p.looks.slice() })); }
  /* lc_tonight_pack(): the enabled row whose [starts_at, ends_at) holds
     now(), the latest-starting one if several — or null */
  tonightPack(t) {
    const now = Number.isFinite(t) ? t : this.now();
    const live = this.lookPacks.filter((p) => p.enabled && Date.parse(p.starts_at) <= now && now < Date.parse(p.ends_at))
      .sort((a, b) => Date.parse(b.starts_at) - Date.parse(a.starts_at));
    if (!live.length) return null;
    const p = live[0];
    return { slug: p.slug, name: p.name, icon: p.icon, looks: p.looks.slice(), starts_at: p.starts_at, ends_at: p.ends_at };
  }

  now() { return Date.now() + this.clockSkew; }
  iso(t) { return new Date(t ?? this.now()).toISOString(); }

  /* ---------- seeding ---------- */
  addUser({ id, email, name, face = null, zip = "94110", gender = null, seeking = "everyone" }) {
    id = id || nid("u");
    this.users.set(id, { id, email: email || id + "@fix.test" });
    this.profiles.set(id, {
      id, display_name: name || id, face_json: face,
      zip_code: zip, radius_miles: 25, gender, seeking,
      birthdate: "1990-01-01", coins: 120,
    });
    return id;
  }
  addRoom({ id, host_id, name, phase = null, status = "live", round = 0 }) {
    id = id || nid("r");
    this.rooms.set(id, {
      id, host_id, contestant_name: name || "Fixture Room", tagline: "",
      status, phase, round, spotlight_target: null, phase_deadline: null,
      /* rooms.cycle — production's own count of passes to her call (start_show
         sets 1; engine_award_seat, the last seat filled after her call, sets
         round = 0, cycle + 1; both read from Studio 2026-10-11).  The overlay
         does not read it (ruling 10/11: the round turns at her call).  crown_user is
         who wears the crown until her next call (feat/pressure-crown; PENDING
         DDL). */
      cycle: 1, crown_user: null,
      /* THE REACTION WINDOW (feat/combos-reaction; PENDING DDL): whose answer
         just ended, and until when a throw at him counts double.  Written
         only by setPhase (the rooms trigger). */
      react_user: null, react_until: null,
      winner_id: null, created_at: this.iso(), host_seen_at: this.iso(),
      moment_a: null, moment_b: null,   // the Moment seam — see start_moment
      throwables_on: true,              // THROWABLES: the host's show switch (rooms.throwables_on, default true)
    });
    return id;
  }
  /* BENCH ORDER IS A SERVER COLUMN, and the double was missing it.
     SOURCE: production ROW reads (not function bodies), 2026-08-12, same man,
     two readings:
       spectator → { role:"spectator", line_position: null,  joined_at: 07:44:32 }
       benched   → { role:"line",      line_position: 249,   joined_at: 07:44:32 }
     So `line_position` is minted AT BENCH ENTRY and is globally monotonic
     (a different room minutes earlier read 248), while `joined_at` records
     when he entered the ROOM and is untouched by benching.

     That distinction is the whole point.  `joined_at` is the field you reach
     for when asked to seat "the longest-waiting benched man", and it is
     WRONG: a spectator who lurks twenty minutes and then taps the bench
     carries an early joined_at and would jump ahead of a man who benched on
     arrival.  A gate written against a double that only has joined_at could
     not have caught that — it would have had no other field to assert.  So
     the double carries line_position with production's semantics, and the
     ONE derivation of bench order reads it.

     RETRACTED 2026-08-12, and this is the one worth reading twice.  What stood
     here was: "Production does the opposite: bench → 250, leave the bench →
     line_position NULL, re-bench → 251.  A man who steps off and comes back
     goes to the BACK of the queue."

     The READINGS were real — 250, null, 251, off production rows.  The
     SENTENCE drawn from them was not.  `join_line` on the server (read direct,
     2026-08-12) preserves: `if v_prev_role = 'line' and v_prev_pos is not null
     then v_pos := v_prev_pos`.  251 appeared only because `leave_room` had
     already DELETED the row, so there was no previous position left to keep.
     The observation was of the round-trip, and it was generalised into a rule
     about re-entry that the server does not have.

     And the retraction was already sitting in the next paragraph.  The old
     comment went on: "the ROW IS DELETED AND RECREATED — the null is a new row,
     not a wiped column."  That is the correct mechanism, written down, directly
     underneath a conclusion it contradicts.  Nobody had to find new evidence;
     the evidence was adjacent.

     Then it chose wrong on its own terms: "Minting unconditionally is kept
     anyway because it states the measured intent and stays correct if a direct
     chair-to-bench path is ever added that does not round-trip through
     leave_room."  That path is exactly what the lapse fix creates — a seated
     man held through the invisible window and re-benched without a leave_room.
     The comment named the scenario that would break it and picked the branch
     that breaks. */
  addMember(room_id, user_id, role, { seat_index = null, ageMs = 0, line_position = undefined } = {}) {
    const row = {
      id: nid("m"), room_id, user_id, role, seat_index,
      last_seen: this.iso(this.now() - ageMs),
      joined_at: this.iso(this.now() - ageMs),
      line_position: line_position !== undefined ? line_position
                   : (role === "line" ? this.nextLinePosition() : null),
      /* FILTER SHOW RULES (feat/filter-rules, step 2 of 3).  Two server-owned
         columns on the member row, PENDING PRODUCTION DDL (tools/
         DESIGN-filter-rules.md):
           filter       — the look he is publishing RIGHT NOW, or null
           filter_pick  — the ONE look he committed to this show, or null.
                          Set once by set_filter and never cleared by a drop;
                          it IS the one-per-show lock.
         Kept separate on purpose: a drop clears `filter` and leaves
         `filter_pick`, which is exactly the "he can't pick a new one" rule,
         and it leaves the door open for the design's "resumes after the
         moment" note without a schema change (not built — see the doc). */
      filter: null, filter_pick: null,
      /* THROWABLES (feat/throwables, step 2).  Four server-owned columns on
         the TARGET's row, PENDING PRODUCTION DDL (tools/
         DESIGN-throwables-server.md):
           throwables_on  his opt-in (default true; off = nobody can hit him)
           throw_kind     what landed last (one of THROW_KINDS)
           throw_at       server start
           throw_until    server expiry.  A WIPE is throw_until = now():
                          live = now < throw_until; cooldown = now <
                          throw_until + 20s.  No timers anywhere.
         The thrower is NOT here — he is in throwLedger, server-only. */
      throwables_on: true, throw_kind: null, throw_at: null, throw_until: null,
      /* THE PRESSURE (feat/pressure-crown; PENDING DDL): landed jeers this
         round minus roses, 0..cracks_to_shatter, on HIS row.  seated_at is
         production's column (set when he takes a chair); the round trigger
         reads it to tell who sat through her call. */
      cracks: 0,
      /* COMBOS (feat/combos-reaction; PENDING DDL): the live throw's count
         toward a combo, and when its combo fired.  The room sees the count,
         never who: the throwers are in throwLedger only. */
      throw_n: 0, throw_combo_at: null,
      seated_at: (role === "chair" || role === "kept") ? this.iso(this.now() - ageMs - 1000) : null,
    };
    this.members.push(row);
    return row;
  }
  /* ---------- THROWABLES helpers (mirror the DDL; every one labelled) ---------- */
  /* the wipe: throw_until := now() ONLY if a throw is live — a wipe with
     nothing live changes nothing, so it can never shorten a cooldown
     (host_clear_throw / set_throwables / host_set_throwables / ask_question
     all write `where throw_until > now()` or the equivalent case) */
  wipeThrow(row) {
    if (!row || row.throw_until == null) return false;
    if (Date.parse(row.throw_until) <= this.now()) return false;
    row.throw_until = this.iso();
    return true;
  }
  throwLive(row) { return !!(row && row.throw_until != null && this.now() < Date.parse(row.throw_until)); }
  throwCooling(row) {
    return !!(row && row.throw_until != null && !this.throwLive(row) &&
      this.now() < Date.parse(row.throw_until) + THROW_LIMITS.cooldown_secs * 1000);
  }
  /* the caller's OWN remaining rations — the ledger's only read path, and it
     is keyed to (room, user), never the membership row (leave+rejoin keeps it) */
  throwCounts(room_id, uid) {
    let cheers = 0, jeers = 0;
    for (const l of this.throwLedger) {
      if (l.room_id !== room_id || l.thrower_id !== uid) continue;
      if (l.cls === "cheer") cheers++; else jeers++;
    }
    return { cheers_left: THROW_LIMITS.cheers - cheers, jeers_left: THROW_LIMITS.jeers - jeers };
  }
  /* THE ONE role writer.  Mirrors trigger room_members_throw_guard's wipe
     half: a row whose role leaves chair/kept loses its live throw the same
     instant, whoever moved it (seat / keep / pass / timeout / sweep /
     step_down / decide_* / join_line all come through here).  chair→kept is
     NOT a wipe — kept is a target (Nick #1). */
  setRole(row, role, seat_index) {
    const wasSeated = row.role === "chair" || row.role === "kept";
    const nowSeated = role === "chair" || role === "kept";
    row.role = role;
    if (seat_index !== undefined) row.seat_index = seat_index;
    if (wasSeated && !nowSeated) { this.wipeThrow(row); row.cracks = 0; }   // the frame he leaves is clean (trigger, feat/pressure-crown)
    if (!wasSeated && nowSeated) row.seated_at = this.iso();
  }
  /* ---------- THE PRESSURE AND THE CROWN (feat/pressure-crown) ----------
     Mirrors of the two triggers in tools/DESIGN-overlay-server.md (ran
     2026-10-11) as tools/DESIGN-combos-server.md leaves them: the crack
     arithmetic and the crown's block are throw_at's now.  Nothing here is
     reachable by a client: cracks move only
     where a throw LANDS (throw_at's own update), the crown only at her
     call (the phase leaving 'deciding'). */
  /* rooms_overlay_round, the fresh-show half: preshow / showstart carry nothing over */
  overlayFresh(r) {
    r.crown_user = null; r.react_user = null; r.react_until = null;
    for (const m of this.members) if (m.room_id === r.id && m.cracks) { m.cracks = 0; this.emit("room_members", "UPDATE", { ...m }); }
  }
  /* rooms_overlay_round, the her-call half: the phase LEAVES 'deciding' for
     anything but 'ended' (ruling 10/11: cracks reset at her call, the crown
     is awarded at her call).  The crown goes to the clear hearts leader (at
     least one heart) among the men still in a chair who were seated before
     her call; on a tie the holder keeps it if he is still in a chair, else
     nobody; then every crack resets.  The caller emits the rooms row after.
     WHAT THIS FAKES: production's decide_pass / decide_clear move the phase
     themselves (to the draft, or through engine_award_seat to the floor), so
     the trigger fires INSIDE her call.  The double has no draft: its phase
     leaves 'deciding' a beat later, when the show walks on — so decide_pass /
     decide_clear stamp the moment (herCallAt) and the contenders are frozen
     there, exactly the set production's "seated_at < now()" sees. */
  overlayHerCall(r) {
    const cut = this.herCallAt.has(r.id) ? this.herCallAt.get(r.id) : this.now() + 1;
    this.herCallAt.delete(r.id);
    const hearts = (uid) => this.events.filter((e) => e.room_id === r.id && e.type === "heart" && e.payload && e.payload.target === uid).length;
    const seated = this.members.filter((m) => m.room_id === r.id && (m.role === "chair" || m.role === "kept") && (!m.seated_at || Date.parse(m.seated_at) < cut))
      .map((m) => ({ uid: m.user_id, h: hearts(m.user_id) }));
    const max = seated.length ? Math.max(...seated.map((x) => x.h)) : null;
    const top = seated.filter((x) => x.h === max);
    if (max != null && max > 0 && top.length === 1) r.crown_user = top[0].uid;
    else {
      const held = this.members.some((m) => m.room_id === r.id && m.user_id === r.crown_user && (m.role === "chair" || m.role === "kept"));
      r.crown_user = held ? r.crown_user : null;
    }
    for (const m of this.members) if (m.room_id === r.id && m.cracks) { m.cracks = 0; this.emit("room_members", "UPDATE", { ...m }); }
  }
  /* the ONE server-side clear, used by every path that strips a filter:
     drop_filter, host_clear_filter, ask_question, start_moment.  Emits the
     member UPDATE so every client observes the field change; callers that
     also mutate the rooms row emit THAT afterwards, so a client never sees
     asked=true (or paired) with the filter still set. */
  clearFilterRow(room_id, user_id) {
    const row = this.memberRow(room_id, user_id);
    if (!row || row.filter == null) return false;
    row.filter = null;
    this.emit("room_members", "UPDATE", { ...row });
    return true;
  }
  nextLinePosition() {
    /* SOURCE: server function join_line, read 2026-08-12 — the mint is
       `nextval('line_position_seq')`, ONE sequence, so positions are global
       across rooms rather than per-room.  Starting high models a counter that
       has been running a while.  (This line previously said "like prod's
       global counter" with nothing behind it; it happens to have been right,
       which is not the same as having been checked.) */
    if (this._linePos == null) this._linePos = 200;
    return ++this._linePos;
  }
  loginClient(clientId, uid) { this.sessions.set(clientId, uid); }

  /* ---------- realtime ---------- */
  onChange(fn) { this.listeners.push(fn); }
  emit(table, eventType, row) {
    const evt = { schema: "public", table, eventType, new: row, old: {} };
    for (const fn of this.listeners) { try { fn(evt); } catch (e) { /* page gone */ } }
  }

  /* ---------- helpers ---------- */
  memberRow(room_id, user_id) {
    return this.members.find((m) => m.room_id === room_id && m.user_id === user_id);
  }
  activeMembers(room_id) {
    const cutoff = this.now() - FRESH_MS;
    return this.members
      .filter((m) => m.room_id === room_id && m.role !== "gone" &&
        (m.role === "kept" || Date.parse(m.last_seen) >= cutoff))
      .map((m) => ({ ...m }));
  }
  requireUid(clientId) {
    const uid = this.sessions.get(clientId);
    if (!uid) throw new Error("not authenticated");
    return uid;
  }

  /* ---------- entry point: everything the page asks for ---------- */
  async dispatch(clientId, op, payload) {
    /* AUTH FAULTS (wave 9) — the boot path's three worlds are only
       distinguishable if the double can produce all three:
         D.setFault("auth.getSession", "host", { error: "refresh_token_not_found" })
             the server answered and refused   → { data:null, error }
         D.setFault("auth.getSession", "host", { throw: "net::ERR_CONN_RESET" })
             nothing answered at all           → the page's __rpcCall promise
             REJECTS, because a `throw` escapes dispatch entirely
       An error field and a rejected promise are different diseases, and the
       app is required to tell them apart — hence two modes, not one.
       authLog records every auth op so a gate can prove the bounded retry
       actually retried (and only once). */
    /* OP LOG (fix/signout-ghost-room) — one ordered record of everything a
       page asked for.  rpcLog and authLog are separate lists, so "did the
       room end BEFORE the sign-out" had no answer; this is the answer.  The
       entry is pushed on ARRIVAL and `ok` is filled in when the op settles
       (null while in flight, true/false after; a `throw` fault leaves it
       false). */
    const entry = { n: this.opLog.length, clientId, op, ok: null };
    if (op === "rpc" && payload) { entry.name = payload.name; entry.args = payload.args || {}; }
    if (op === "table" && payload) { entry.table = payload.table; entry.action = payload.action; entry.values = payload.values || null; }
    this.opLog.push(entry);
    if (typeof op === "string" && op.startsWith("auth.")) {
      /* SIGN-OUT FIDELITY (fix/signout-ghost-room).  The double's signOut
         could not fail and did not know its scope.
         SOURCE (@supabase/auth-js 2.112.4 — the version index.html pins —
         dist/main/GoTrueClient.js `_signOut`, read 2026-09-30):
           · no access token  → no server call at all; the local session is
             removed; { error: null }.
           · the revoke (POST /logout?scope=…, made for EVERY scope, local
             included) comes back an error other than 401/403/404 → the
             local session is STILL removed (scope !== 'others') and the
             error is returned.  A refused or unreachable sign-out does not
             keep you signed in; it is merely reported.
           · scope 'others' never removes the current session.
         ASSUMED: what makes the call REJECT outright (a lock timeout, a
         storage exception) — the `throw` mode below models "it rejected and
         removed nothing"; nobody has watched production do it.
         A fault may carry `scope` to hit ONE scope only:
           D.setFault("auth.signOut", "host", { throw: "…", scope: "global" }) */
      const isSignOut = op === "auth.signOut";
      const scope = isSignOut ? ((payload && payload.scope) || "global") : null;
      if (isSignOut) entry.scope = scope;
      this.authLog.push(isSignOut ? { clientId, op, scope } : { clientId, op });
      let f = this.faults && (this.faults[op + "|" + clientId] || this.faults[op + "|*"]);
      if (f && isSignOut && f.scope && f.scope !== scope) f = null;
      if (f && f.throw) { entry.ok = false; throw new Error(f.throw === true ? "network unreachable" : f.throw); }
      if (f && f.error && isSignOut && !this.sessions.has(clientId)) f = null;   // nothing to revoke → no server call to refuse
      if (f && f.error) {
        if (isSignOut && scope !== "others") this.sessions.delete(clientId);     // SOURCE above: removed even though the revoke failed
        entry.ok = false;
        return { data: null, error: { message: f.error } };
      }
    }
    try {
      const data = await this._dispatch(clientId, op, payload || {});
      entry.ok = true;
      return { data, error: null };
    } catch (e) {
      entry.ok = false;
      return { data: null, error: { message: String(e.message || e) } };
    }
  }

  async _dispatch(clientId, op, p) {
    if (op === "auth.getSession") {
      const uid = this.sessions.get(clientId);
      return { session: uid ? { access_token: "tok-" + uid, user: this.users.get(uid) } : null };
    }
    if (op === "auth.getUser") {
      const uid = this.sessions.get(clientId);
      return { user: uid ? this.users.get(uid) : null };
    }
    if (op === "auth.signOut") { if ((p.scope || "global") !== "others") this.sessions.delete(clientId); return {}; }
    if (op === "auth.signInWithPassword") {
      const u = [...this.users.values()].find((x) => x.email === p.email);
      if (!u) throw new Error("Invalid login credentials");
      this.sessions.set(clientId, u.id);
      return { session: { access_token: "tok-" + u.id, user: u }, user: u };
    }
    if (op === "auth.signUp") {
      const id = this.addUser({ email: p.email, name: p.email.split("@")[0] });
      this.sessions.set(clientId, id);
      return { session: { access_token: "tok-" + id }, user: this.users.get(id) };
    }
    if (op === "auth.resetPasswordForEmail" || op === "auth.updateUser") return {};

    if (op === "rpc") {
      this.rpcLog.push({ clientId, name: p.name, args: p.args });
      /* a call that came from a PAGE, not from a gate's own D.rpc (see the
         early-nudge rule in advance_phase) */
      this._fromPage = true;
      try { return this.rpc(clientId, p.name, p.args || {}); } finally { this._fromPage = false; }
    }
    if (op === "table") return this.table(clientId, p);
    throw new Error("double: unknown op " + op);
  }

  /* ---------- fault injection (wave 8 fidelity) ----------
     The live run's headline diseases were PER-CLIENT truth failures the
     double could never produce: the host's active_members reads going bad
     while every other client read fine, and a join_line the server accepted
     but never kept.  Gates drive both with setFault:
       D.setFault("active_members", "host", { error: "boom" })   // that client's reads fail
       D.setFault("join_line", "w", { drop: true })              // accepted, row untouched
       D.setFault("join_line", "w", null)                        // clear
       D.setFault("end_show", "host", { error: "boom", times: 1 }) // refuse ONCE, then clear itself */
  setFault(name, clientId, mode) {
    this.faults = this.faults || {};
    const k = name + "|" + (clientId || "*");
    if (mode) this.faults[k] = mode; else delete this.faults[k];
  }

  /* ---------- RPCs ---------- */
  rpc(clientId, name, a) {
    const fk = this.faults && (this.faults[name + "|" + clientId] ? name + "|" + clientId : name + "|*");
    const f = this.faults && this.faults[fk];
    if (f) {
      /* `times: N` — the fault fires N times and then clears itself, so a
         gate can say "the FIRST end_show is refused, the retry lands"
         without racing the page to clear it (gate 73). */
      if (f.times !== undefined && (f.error || f.drop)) { if (--f.times <= 0) delete this.faults[fk]; }
      if (f.error) throw new Error(f.error);
      if (f.drop) return (f.result !== undefined ? f.result : null);   // accepted-but-dropped
      if (f.freeze) {
        // prod's exact face: the read keeps SUCCEEDING but returns a frozen
        // snapshot — the live host's window watched line×3 while the server
        // said chair×3.  First call captures; every later call replays it.
        if (f._snap === undefined) f._snap = JSON.parse(JSON.stringify(this._rpc(clientId, name, a)));
        return JSON.parse(JSON.stringify(f._snap));
      }
    }
    return this._rpc(clientId, name, a);
  }
  _rpc(clientId, name, a) {
    const uid = this.sessions.get(clientId);
    switch (name) {
      case "server_now": return this.iso();
      case "active_members": return this.activeMembers(a.room_id);
      case "join_room": {
        if (!uid) throw new Error("not authenticated");
        /* SOURCE: server function join_room, read 2026-08-12.  It selects the
           member row, and:
             if v_member is null then
               insert into room_members (room_id, user_id, role, last_seen)
               values (v_room_id, v_uid, 'spectator', now())
               on conflict on constraint room_members_room_user_uniq do nothing
             else
               -- already a member: refresh presence, keep role (no downgrade)
               update room_members set last_seen = now() where id = v_member.id
             end if;

           THE INSERT ONLY RUNS WHEN THERE IS NO ROW.  A swept row is still a
           row, so a man who has been buried comes back through the else branch
           and KEEPS role='gone'.  The server says "no downgrade" in its own
           comment and means it in both directions: it will not demote a chair,
           and it will not promote a corpse.

           What stood here revived a gone row as 'spectator'.  That was the
           fifth unsourced behaviour in this file and the most expensive: a
           counterfactual run against it concluded that dropping the client's
           leave_room call was harmless.  On the real server dropping it strands
           the man at role='gone' with no path back, because nothing on the
           server ever un-sets 'gone'. */
        let row = this.memberRow(a.room_id, uid);
        if (row) { row.last_seen = this.iso(); }          // keep role, no downgrade
        else row = this.addMember(a.room_id, uid, "spectator");
        this.emit("room_members", "INSERT", { ...row });
        return null;
      }
      case "join_line": {
        if (!uid) throw new Error("not authenticated");
        let row = this.memberRow(a.room_id, uid);
        if (!row) row = this.addMember(a.room_id, uid, "spectator");
        if (this.events.some((e) => e.room_id === a.room_id && e.type === "pass" && e.payload?.target_user === uid))
          throw new Error("passed — cannot rejoin the line");
        /* READ FROM THE SERVER 2026-08-12, function join_line, verbatim:
             -- FIFO line order: keep your place if you are already in line
             if v_prev_role = 'line' and v_prev_pos is not null
               then v_pos := v_prev_pos;
               else v_pos := nextval('line_position_seq');
           THE SERVER WAS BUILT TO KEEP HIS PLACE.

           What stood here before said the opposite — "minted AFRESH every time,
           a man who steps off the bench and comes back goes to the BACK of the
           queue.  Measured, not assumed."  It was not measured.  It was this
           file describing itself, and the label was the dangerous part: a guess
           wearing the costume of the thing that would have caught it.  It
           propagated — "back of the queue" went out as a finding on the
           strength of this comment before the server was ever read. */
        const prevRole = row.role, prevPos = row.line_position;
        this.setRole(row, "line"); row.last_seen = this.iso();
        row.line_position = (prevRole === "line" && prevPos != null)
          ? prevPos
          : this.nextLinePosition();
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "heartbeat": {
        if (!uid) return null;
        /* SOURCE: server function heartbeat, read 2026-08-12.  Its entire body
           is `update room_members set last_seen = now()` keyed on the room and
           auth.uid().  THERE IS NO ROLE PREDICATE — the string 'gone' does not
           appear in the function at all.

           What stood here was `if (row && row.role !== "gone")`, which skipped
           swept rows.  That was never read off anything; it is the fourth
           unsourced behaviour found in this file, and it mattered: a beat that
           skips a gone row makes the row look frozen, and a beat that refreshes
           one makes it look alive-but-hidden.  The server does the latter.
           `role` is left alone either way, so a swept man's last_seen keeps
           moving while active_members goes on excluding him for `role <>
           'gone'`. */
        /* RULING 10/8: end-on-touch — the sweep runs at the top of heartbeat
           (DDL step 4), before the member's own beat. */
        this.sweepStaleRooms();
        const row = this.memberRow(a.room_id, uid);
        if (row) { row.last_seen = this.iso(); }
        return null;
      }
      case "leave_room": {
        const i = this.members.findIndex((m) => m.room_id === a.room_id && m.user_id === uid);
        if (i >= 0) { const [row] = this.members.splice(i, 1); this.emit("room_members", "DELETE", { ...row }); }
        return null;
      }
      case "sweep_stale_members": {
        const cutoff = this.now() - SWEEP_MS;
        for (const m of this.members) {
          if (m.room_id === a.room_id && m.role !== "gone" && m.role !== "kept" &&
              Date.parse(m.last_seen) < cutoff) {
            this.setRole(m, "gone");
            this.emit("room_members", "UPDATE", { ...m });
          }
        }
        return null;
      }
      case "seat_member": {
        const row = this.memberRow(a.room_id, a.user_id);
        if (!row) throw new Error("no such member");
        this.setRole(row, "chair", a.seat_index); row.last_seen = this.iso();
        this.pushEvent(a.room_id, uid, "seat", { target_user: a.user_id, seat: a.seat_index });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "keep_member": {
        const row = this.memberRow(a.room_id, a.user_id);
        if (!row) throw new Error("no such member");
        this.setRole(row, "kept");
        this.pushEvent(a.room_id, uid, "keep", { target_user: a.user_id });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "pass_member": {
        const row = this.memberRow(a.room_id, a.user_id);
        if (!row) throw new Error("no such member");
        this.setRole(row, "spectator", null);
        this.pushEvent(a.room_id, uid, "pass", { target_user: a.user_id });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "timeout_member": {
        const row = this.memberRow(a.room_id, a.user_id);
        if (row) { this.setRole(row, "spectator", null); this.pushEvent(a.room_id, uid, "timeout", { target_user: a.user_id }); this.emit("room_members", "UPDATE", { ...row }); }
        return null;
      }
      case "start_show": { const r0 = this.rooms.get(a.room_id); if (r0) { r0.round = r0.round || 0; r0.cycle = 1; } return this.setPhase(a.room_id, "showstart", 20); }
      /* end_deliberation REMOVED 2026-08-22 (ruling reversed).  It lived
     * here from the 2026-08-20 ruling on the theory that skip_phase's
     * single-step walker would retire SPEC wave 5's jump-to-deciding
     * behaviour.  A live show on 2026-08-22 proved that theory backwards:
     * the straight jump WAS the bug.  end_deliberation is dropped from
     * production (DDL, 2026-08-22, verbatim pg_get_functiondef read and a
     * pg_proc sweep confirming zero other call sites, both posted to the
     * advisor before the DROP ran) and eg_skip is back on skip_phase below
     * — so the double no longer models a function that doesn't exist. */
    case "skip_phase":
      case "advance_phase": {
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        const order = ["preshow", "showstart", "spotlight", "openfloor", "deliberation", "deciding"];
        const i = order.indexOf(r.phase);
        let next, secs;
        /* PRODUCTION REFUSES AN EARLY NUDGE (advance_phase read verbatim from
           Studio, 2026-10-11): "if now() < v_r.phase_deadline then return
           noop".  The double advanced unconditionally, which is how a crowd
           phone with a fast clock ended an answer for the whole room in gate
           87's first run and nowhere else.  Modelled here for EVERY PAGE,
           the host's included, as production does.
           WHAT THIS FAKES: a gate's own D.rpc("host", "advance_phase") still
           walks the show early — the gates use it as a fast-forward.  Until
           feat/combos-reaction the host's PAGE was exempt too, and gate 89
           caught the cost: the host page's resolver, holding a deadline that
           had already passed, nudged advance_phase a beat after the show had
           moved to the open floor, and the double bounced the room back to
           the spotlight — a move production refuses.  skip_phase (hers, and
           it sets the deadline to now first) shares this case and is never
           refused.  The null-deadline no-op is NOT modelled (her call would
           never leave 'deciding' in a double that has no draft — G10). */
        if (name === "advance_phase" && (this._fromPage || uid !== r.host_id) && r.phase_deadline && this.now() < Date.parse(r.phase_deadline))
          return { noop: true, phase: r.phase, deadline: r.phase_deadline };
        /* deciding -> spotlight is the double's stand-in for production's
           engine_award_seat (the double has no draft): rooms.cycle goes up
           here, and setPhase below — the phase leaving 'deciding' — is where
           her call turns the round over (the crown named, the cracks reset). */
        if (r.phase === "deciding") { r.round = (r.round || 0) + 1; next = "spotlight"; secs = 60; r.cycle = (r.cycle || 1) + 1; }
        else if (r.phase === "draft") { next = "spotlight"; secs = 60; }   // a skipped draft returns to the floor
        else if (r.phase === "openfloor") {
          // production forks HERE (verbatim, advance_phase read from Studio,
          // 2026-08-22): round>=3 -> deliberation; else back to spotlight,
          // awaiting a new question, spotlight_target cleared.  Added
          // alongside the skip_phase/end_deliberation reversal — gates
          // 07/30 needed the real fork to test the button honestly, not a
          // flat walk that always landed on deliberation.
          if ((r.round || 0) >= 3) { next = "deliberation"; secs = 60; }
          else { r.spotlight_target = null; next = "spotlight"; secs = 60; }
        }
        else { next = i < 0 ? "showstart" : order[Math.min(i + 1, order.length - 1)]; secs = next === "deciding" ? null : 60; }
        // wave 8 fidelity: prod enters HER CALL with a NULL phase_deadline —
        // the conductor's live room proved it (deadline:null, clock parked
        // at a lying 0:00).  The double now does what prod does.
        this.setPhase(a.room_id, next, secs);
        // LEDGER, added 2026-08-22: production's chain is skip_phase ->
        // advance_phase -> engine_set_phase -> engine_emit, and engine_emit
        // inserts a room_events row (read verbatim from Studio) — every
        // real phase advance is ledgered, this fast walker included.  The
        // double was silent here before; a gate asserting the ledger side
        // of eg_skip's new RPC (gate 62 clause iii) needs this to be real,
        // not assumed.  Note what production's payload does NOT carry: no
        // "reason" key — skip_phase and an ordinary clock expiry look
        // identical in the ledger.
        const rr = this.rooms.get(a.room_id);
        this.pushEvent(a.room_id, uid, "phase", { phase: rr.phase, deadline: rr.phase_deadline, round: rr.round, cycle: rr.cycle });   // engine_set_phase's payload carries the cycle (read 2026-10-11)
        return null;
      }
      /* ---- fix/no-client-room-writes (2026-08-20) ----
       * Local doubles for the four server functions this branch adds.
       * These mirror the RULED behaviour, not a read server signature --
       * engine_set_phase's real parameter shape is still unconfirmed
       * (grep across this repo turns up nothing; asked the advisor before
       * posting functions 1-3's real SQL).  The double does not need that
       * signature: it only needs to update the same rooms columns and emit
       * the same realtime shape the client already expects, so gates 61-63
       * can prove the CLIENT wiring is correct pending the real functions'
       * go-ahead. */
      case "reset_to_preshow": {
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        if (uid !== r.host_id) throw new Error("not the host");
        if (r.status !== "live") throw new Error("room not live");
        if (r.phase === "preshow" && (r.round || 0) === 0 && !r.spotlight_target) return null;
        r.phase = "preshow"; r.round = 0;
        r.spotlight_target = null; r.spotlight_question_id = null;
        r.phase_deadline = null;
        this.overlayFresh(r);                    // rooms_overlay_round: back to preshow carries nothing over
        this.emit("rooms", "UPDATE", { ...r });
        this.pushEvent(a.room_id, uid, "phase", { reason: "stage_emptied", phase: "preshow" });
        return null;
      }
      case "set_phase_deadline": {
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        if (uid !== r.host_id) throw new Error("not the host");
        if (r.status !== "live" || r.phase === "preshow") return null;
        if (a.until_ts == null) throw new Error("until_ts required");
        const untilMs = Date.parse(a.until_ts);
        if (!(untilMs > this.now())) throw new Error("until_ts must be in the future");
        if (untilMs > this.now() + 10 * 60_000) throw new Error("until_ts too far out");
        r.phase_deadline = a.until_ts;
        this.emit("rooms", "UPDATE", { ...r });
        this.pushEvent(a.room_id, uid, "phase", { reason: "window_open", phase: r.phase });
        return null;
      }
      case "clear_spotlight_target": {
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        if (uid !== r.host_id) throw new Error("not the host");
        r.spotlight_target = null; r.spotlight_question_id = null;
        this.emit("rooms", "UPDATE", { ...r });
        this.pushEvent(a.room_id, uid, "phase", { reason: "target_cleared", phase: r.phase });
        return null;
      }
      case "step_down": {
        if (!uid) throw new Error("not authenticated");
        const row = this.memberRow(a.room_id, uid);
        if (!row) throw new Error("no such member");
        const r = this.rooms.get(a.room_id);
        const passed = !!(r && r.phase === "spotlight" && r.spotlight_target === uid);
        this.setRole(row, passed ? "gone" : "spectator", null);
        this.pushEvent(a.room_id, uid, passed ? "pass" : "stepdown",
          { target_user: uid, actor: "self", source: "step_down", was_spotlight: passed });
        this.emit("room_members", "UPDATE", { ...row });
        return { passed, role: row.role };
      }
      case "end_show": {
        /* SOURCE: production end_show read 2026-10-08 (md5 e70916a6…):
           raises 'not authenticated' with no auth.uid(), 'not host' when the
           caller is not rooms.host_id; then the ending.  RULING 10/8 moved
           the ending itself into end_room() (one path ends a show) and
           end_show delegates — see endRoom below. */
        if (!uid) throw new Error("not authenticated");
        const r = this.rooms.get(a.room_id);
        const vHost = r ? r.host_id : null;
        if (vHost !== uid) throw new Error(`not host (room host=${vHost}, caller=${uid})`);
        this.endRoom(a.room_id, a.winner_id || null, uid, "host");
        return null;
      }
      case "end_stale_rooms":
        /* revoked from anon/authenticated in the DDL: a client call is refused */
        throw new Error("permission denied for function end_stale_rooms");
      case "end_room":
        throw new Error("permission denied for function end_room");
      case "lc_config":
        return { host_stale_ms: HOST_STALE_MS, tonight_pack: this.tonightPack() };
      case "list_live_rooms": {
        if (!uid) throw new Error("permission denied for function list_live_rooms");
        this.sweepStaleRooms();
        return [...this.rooms.values()].filter((r) => r.status === "live")
          .sort((x, y) => Date.parse(y.created_at) - Date.parse(x.created_at)).map((r) => ({ ...r }));
      }
      case "seat_pick": {
        // engine-mode self-seat: claimant takes the named seat
        const row = this.memberRow(a.room_id, uid);
        if (!row) throw new Error("no such member");
        this.setRole(row, "chair", a.seat_index ?? 0);
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "ask_question": {
        // PROD PARITY (fact learned 8/9, folded into SPEC.md): the live RPC
        // returns jsonb, NOOPS when a spotlight is already running,
        // increments rooms.round per ask (rounds count asks), sets a 30s
        // answer deadline, pauses chair clocks (engine_pause_clocks — the
        // client renders ⏸ under any engine phase, so no double-side state
        // is needed), and emits the 'spotlight' ledger event.
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        if (r.spotlight_target) return { noop: true };   // a spotlight is already running
        if (!a.target) return { noop: true };
        r.round = (r.round || 0) + 1;
        r.spotlight_target = a.target;
        r.spotlight_question_id = a.question_id ?? null;
        r.phase_deadline = this.iso(this.now() + 30_000);
        /* FORCED DROP ON ASK (filter rules #3): the asked man's filter is
           cleared INSIDE the ask, before the rooms row is emitted — same
           transaction in production (DESIGN-filter-rules.md), same
           statement here.  Never a separate step, never the client's call:
           a double that let the client clear it would prove nothing. */
        /* THROWABLES: the ASK wipe rides the SAME member statement as the
           filter clear (DDL 1l splices `throw_until = case … now()` onto
           `set filter = null`), so it lands on every client BEFORE the rooms
           row that says he is asked.  One emit for both: clearFilterRow emits
           only when the filter changed, so the wipe emits itself if not. */
        {
          const tr = this.memberRow(a.room_id, a.target);
          const wiped = this.wipeThrow(tr);
          const filtered = this.clearFilterRow(a.room_id, a.target);
          if (wiped && !filtered) this.emit("room_members", "UPDATE", { ...tr });
        }
        this.emit("rooms", "UPDATE", { ...r });
        // prod engine_emit parity (8/9): the spotlight event carries the
        // question text and the answer deadline, so EVERY role paints the
        // card from the one event — no per-client fetch race.
        const q = (this.questions || []).find((x) => String(x.id) === String(a.question_id));
        // wave 8 fidelity: prod's engine_emit ships DIFFERENT key names and a
        // timestamptz with a space ("YYYY-MM-DD HH:MM:SS+00"), and the answer
        // window is configurable.  spotlightShape="prod" emits that exact
        // shape (gate 37); "prod-naive" drops the zone entirely (the parse
        // hazard).  Default stays the double's classic shape.
        if (this.spotlightShape === "prod" || this.spotlightShape === "prod-naive") {
          const win = this.answerWindowMs || 30_000;
          r.phase_deadline = this.iso(this.now() + win);
          this.emit("rooms", "UPDATE", { ...r });
          let dl = r.phase_deadline.replace("T", " ").replace(/\.\d+Z$/, "+00").replace("Z", "+00");
          if (this.spotlightShape === "prod-naive") dl = dl.replace(/\+00$/, "");
          this.pushEvent(a.room_id, uid, "spotlight",
            { target: a.target, round: r.round, question_id: a.question_id ?? null,
              question: q ? q.text : null, answer_deadline: dl });
        } else {
          this.pushEvent(a.room_id, uid, "spotlight",
            { target_user: a.target, round: r.round, question_id: a.question_id ?? null,
              question_text: q ? q.text : null, deadline: r.phase_deadline });
        }
        return { ok: true, round: r.round };
      }
      /* ---------- FILTER SHOW RULES (feat/filter-rules) ----------
         Every rejection below is the SERVER's rejection, mirrored word for
         word from the pending DDL (tools/DESIGN-filter-rules.md) so gate 71
         can assert the message a client will really see.  The client never
         writes `filter` or `filter_pick`; these four functions are the only
         doors, and ask_question / start_moment clear the field inside
         themselves. */
      case "set_filter": {
        if (!uid) throw new Error("not authenticated");
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        const row = this.memberRow(a.room_id, uid);
        if (!row || row.role === "gone") throw new Error("not a member of this room");
        if (!this.filterLooks.includes(a.name)) throw new Error("no such filter");
        /* order matters and the DDL keeps it: the beat he is in (asked,
           paired) is named before the standing lock, so the message says
           WHY NOW rather than why ever */
        if (r.spotlight_target === uid) throw new Error("filter not allowed while asked");
        if (r.moment_a === uid || r.moment_b === uid) throw new Error("filter not allowed during a moment");
        if (row.filter_pick != null) throw new Error("filter locked for this show");
        row.filter = a.name; row.filter_pick = a.name;
        this.emit("room_members", "UPDATE", { ...row });
        return { ok: true, filter: row.filter };
      }
      case "drop_filter": {
        if (!uid) throw new Error("not authenticated");
        const row = this.memberRow(a.room_id, uid);
        if (!row) throw new Error("not a member of this room");
        this.clearFilterRow(a.room_id, uid);   // the lock (filter_pick) stays
        return { ok: true };
      }
      case "host_clear_filter": {
        if (!uid) throw new Error("not authenticated");
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        if (r.host_id !== uid) throw new Error("only the host can force a filter off");
        const row = this.memberRow(a.room_id, a.user_id);
        if (!row) throw new Error("no such member");
        this.clearFilterRow(a.room_id, a.user_id);
        return { ok: true };
      }
      /* THE MOMENT — NO PRODUCTION COUNTERPART.  The Moment (design/Last Call
         Moment.dc.html) is not built anywhere: no RPC, no rooms column, no
         client.  These two cases are the SEAM the rules need — the pairing
         is the buyer + the host (the design's pair; she has no member row, so
         her "field" is nothing to clear), recorded on the rooms row as
         moment_a / moment_b — so that "both faces go bare the instant the
         moment starts, atomically with the pairing" is a proven property of
         the path whatever RPC eventually owns it.  When the real Moment
         lands, its start function inherits this contract; until then these
         are labelled what they are: ASSUMED shape, no server read behind
         them. */
      case "start_moment": {
        if (!uid) throw new Error("not authenticated");
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        if (r.moment_a || r.moment_b) throw new Error("a moment is already running");
        const other = a.target || r.host_id;
        r.moment_a = uid; r.moment_b = other;
        /* both member fields (where a member row exists) clear INSIDE the
           pairing, then the rooms row carries the pair — one update, no
           beat where paired && filtered can be observed */
        /* THROWABLES, DOUBLE ONLY (no production counterpart — the ruling's
           "The Moment wipes throws on both faces" is modelled here so the
           client path is proven; the DDL carries NO moment check, as
           DESIGN-filter-rules.md divergence 1 already records for filters) */
        for (const who of [uid, other]) {
          const mr = this.memberRow(a.room_id, who);
          const wiped = this.wipeThrow(mr);
          const filtered = this.clearFilterRow(a.room_id, who);
          if (wiped && !filtered) this.emit("room_members", "UPDATE", { ...mr });
        }
        this.emit("rooms", "UPDATE", { ...r });
        return { ok: true, pair: [uid, other] };
      }
      case "end_moment": {
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        r.moment_a = null; r.moment_b = null;
        this.emit("rooms", "UPDATE", { ...r });
        return { ok: true };
      }
      /* ---------- THROWABLES (feat/throwables, step 2) ----------
         Every rejection below is the SERVER's rejection, mirrored word for
         word and IN ORDER from the DDL in tools/DESIGN-throwables-server.md
         (PENDING PRODUCTION), so gate 80 can assert the message a client
         will really see.  The client never writes a throw column; these are
         the only doors, and ask_question / start_moment / setRole wipe
         inside themselves. */
      case "throw_at": {
        if (!uid) throw new Error("not authenticated");
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        const cls = THROW_KINDS[a.kind] || null;
        if (!cls) throw new Error("no such throw");
        if (r.host_id === uid) throw new Error("the host does not throw");
        const me = this.memberRow(a.room_id, uid);
        if (!me || me.role === "gone") throw new Error("not a member of this room");
        if (me.role !== "spectator") throw new Error("only the crowd throws");
        if (!r.throwables_on) throw new Error("throwables are off for this show");
        const tgt = this.memberRow(a.room_id, a.target);
        if (!tgt) throw new Error("no such member");
        if (tgt.role !== "chair" && tgt.role !== "kept") throw new Error("target is not in a chair");
        if (!tgt.throwables_on) throw new Error("he has throwables off");
        /* DOUBLE ONLY: the Moment refusal (ruling: "any new throw at either
           of them is refused until The Moment ends").  Not in the DDL —
           rooms.moment_* does not exist in production. */
        if (r.moment_a === a.target || r.moment_b === a.target) throw new Error("no throws during a moment");
        /* THE ORDER IS THE SQL'S (tools/DESIGN-combos-server.md, 1e): the
           crown is part of who he is, so it refuses before the beat he is in
           and before the thrower's ration. */
        if (cls === "jeer" && r.crown_user && r.crown_user === a.target) throw new Error(CROWN_BLOCK_MSG);
        const at = this.now();
        const react = !!(r.react_user && r.react_user === a.target && r.react_until && at < Date.parse(r.react_until));
        const w = react ? THROW_LIMITS.react_mult : 1;         // a throw in his reaction window counts double
        let join = false;
        if (this.throwLive(tgt)) {
          /* THE JOIN (ruling 10/11, "One rule changes"): same polarity, inside
             the combo window, from a thrower who is not already in this one.
             Anything else while a throw is live is what it always was. */
          const landedAt = Date.parse(tgt.throw_at);
          if (THROW_KINDS[tgt.throw_kind] !== cls || !(at < landedAt + THROW_LIMITS.combo_secs * 1000) ||
              this.throwLedger.some((l) => l.room_id === a.room_id && l.target_id === a.target && l.thrower_id === uid && Date.parse(l.at) >= landedAt))
            throw new Error("a throw is already live");
          join = true;
        } else if (!react && this.throwCooling(tgt)) throw new Error("cooling down");   // (inside his window his cooldown does not apply)
        const counts = this.throwCounts(a.room_id, uid);
        if ((cls === "cheer" ? counts.cheers_left : counts.jeers_left) <= 0)
          throw new Error("no " + cls + "s left this show");
        // THE PRESSURE: by what this throw counts for
        if (cls === "jeer") tgt.cracks = Math.min(THROW_LIMITS.cracks_to_shatter, (tgt.cracks || 0) + w);
        else if (a.kind === "petals") tgt.cracks = Math.max(0, (tgt.cracks || 0) - THROW_LIMITS.rose_mends * w);
        let fire = false;
        if (join) {
          tgt.throw_n = (tgt.throw_n || 0) + w;
          fire = !tgt.throw_combo_at && tgt.throw_n >= THROW_LIMITS.combo_n;
          if (fire) {
            tgt.throw_combo_at = this.iso(at);
            tgt.throw_until = this.iso(Math.max(Date.parse(tgt.throw_until), at + THROW_LIMITS.combo_fx_secs * 1000));
          }
          // throw_kind and throw_at do NOT move: the overlay does not restart
        } else {
          tgt.throw_kind = a.kind; tgt.throw_at = this.iso(at);
          tgt.throw_until = this.iso(at + THROW_LIMITS.live_secs * 1000);
          tgt.throw_n = w;
          fire = tgt.throw_n >= THROW_LIMITS.combo_n;
          tgt.throw_combo_at = fire ? this.iso(at) : null;
        }
        this.throwLedger.push({ room_id: a.room_id, thrower_id: uid, cls, kind: a.kind, target_id: a.target, at: this.iso(at) });   // once, whatever it counted for
        this.emit("room_members", "UPDATE", { ...tgt });   // the row: a count, no thrower on it
        /* STANDING OVATION: his heart, once per combo, with NO sender (the
           SQL inserts user_id NULL — engine_emit would have named the third
           thrower) */
        if (fire && cls === "cheer") for (let k = 0; k < THROW_LIMITS.ovation_hearts; k++) this.pushEvent(a.room_id, null, "heart", { target: a.target, ovation: true });
        const left = this.throwCounts(a.room_id, uid);
        return { ok: true, kind: a.kind, cls, at: tgt.throw_at, until: tgt.throw_until, joined: join, n: tgt.throw_n, counted: w, combo: !!tgt.throw_combo_at, ...left };
      }
      case "throw_counts": {
        if (!uid) throw new Error("not authenticated");
        return { ...this.throwCounts(a.room_id, uid), limits: { ...THROW_LIMITS } };   // throw_limits(): the two Pressure numbers ride along
      }
      case "set_throwables": {
        if (!uid) throw new Error("not authenticated");
        const row = this.memberRow(a.room_id, uid);
        if (!row || row.role === "gone") throw new Error("not a member of this room");
        row.throwables_on = !!a.on;
        if (!a.on) this.wipeThrow(row);            // opt-out mid-show wipes what is on him
        this.emit("room_members", "UPDATE", { ...row });
        return { ok: true, throwables_on: row.throwables_on };
      }
      case "host_clear_throw": {
        if (!uid) throw new Error("not authenticated");
        const r = this.rooms.get(a.room_id);
        if (!r || r.host_id !== uid) throw new Error("only the host can clear a throw");
        const row = this.memberRow(a.room_id, a.user_id);
        if (!row) throw new Error("no such member");
        if (this.wipeThrow(row)) this.emit("room_members", "UPDATE", { ...row });
        return { ok: true };
      }
      case "host_set_throwables": {
        if (!uid) throw new Error("not authenticated");
        const r = this.rooms.get(a.room_id);
        if (!r || r.host_id !== uid) throw new Error("only the host can switch throwables");
        r.throwables_on = !!a.on;
        if (!a.on) {
          for (const m of this.members)
            if (m.room_id === a.room_id && this.wipeThrow(m)) this.emit("room_members", "UPDATE", { ...m });
        }
        this.emit("rooms", "UPDATE", { ...r });
        return { ok: true, throwables_on: r.throwables_on };
      }
      case "decide_keep": {
        // her decision verbs (egDecideTap) — same shape as keep_member /
        // pass_member but keyed by `target`, mirroring prod's decide_* RPCs
        const row = this.memberRow(a.room_id, a.target);
        if (!row) throw new Error("no such member");
        this.setRole(row, "kept");
        this.pushEvent(a.room_id, uid, "keep", { target_user: a.target });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "decide_pass": {
        const row = this.memberRow(a.room_id, a.target);
        if (!row) throw new Error("no such member");
        this.herCallAt.set(a.room_id, this.now());   // HER CALL (see overlayHerCall)
        this.setRole(row, "spectator", null);
        this.pushEvent(a.room_id, uid, "pass", { target_user: a.target });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "decide_clear": {
        this.herCallAt.set(a.room_id, this.now());   // HER CALL (see overlayHerCall)
        for (const m of this.members) {
          if (m.room_id === a.room_id && m.role === "chair") { this.setRole(m, "spectator", null); this.emit("room_members", "UPDATE", { ...m }); }
        }
        return null;
      }
      case "get_draft_view": return { open: false };
      case "get_draft_tallies": return [];
      case "draft_heart": return null;
      case "get_swap_status": {
        // the backstage pair is host_id + winner_id; "other" is the partner.
        const r = this.rooms.get(a.room_id) || {};
        const other = (uid === r.host_id) ? r.winner_id : r.host_id;
        const store = this.swaps[a.room_id] || {};
        const mine = store[uid] != null;
        const theirs = other != null && store[other] != null;
        return { they_offered: theirs, i_offered: mine,
                 other_contact: (mine && theirs) ? store[other] : null };   // secrecy: only when BOTH offered
      }
      case "offer_swap": {
        (this.swaps[a.room_id] = this.swaps[a.room_id] || {})[uid] = a.contact_text || "";
        // the OFFER is a ledger fact: both clients fold it and re-check the
        // reveal condition at once — no waiting on a poll (wave 5)
        this.pushEvent(a.room_id, uid, "swap", { by: uid });
        const r = this.rooms.get(a.room_id) || {};
        const other = (uid === r.host_id) ? r.winner_id : r.host_id;
        const store = this.swaps[a.room_id];
        const theirs = other != null && store[other] != null;
        return { other_contact: theirs ? store[other] : null };
      }
      case "rescind_swap": {
        if (this.swaps[a.room_id]) delete this.swaps[a.room_id][uid];
        this.pushEvent(a.room_id, uid, "swap", { by: uid, rescind: true });
        return null;
      }
      case "accept_terms": case "request_invite": case "report_user": case "delete_my_account": return null;
      case "resolve_draft": return null;
      default: throw new Error("double: unimplemented RPC " + name);
    }
  }

  setPhase(room_id, phase, secs) {
    const r = this.rooms.get(room_id);
    if (!r) throw new Error("no room");
    const was = r.phase, wasDeadline = r.phase_deadline;
    r.phase = phase;
    r.phase_deadline = secs ? this.iso(this.now() + secs * 1000) : null;
    if (phase !== was && (phase === "preshow" || phase === "showstart")) this.overlayFresh(r);   // rooms_overlay_round: a fresh show
    else if (phase !== was) {
      /* rooms_overlay_round, the reaction window (feat/combos-reaction): the
         phase LEAVES 'spotlight' while a man was on the clock — his deadline
         passed (advance_phase) or she moved on (skip_phase); both end at
         this one statement in production (engine_set_phase). */
      if (was === "spotlight" && r.spotlight_target && wasDeadline) {
        r.react_user = r.spotlight_target;
        r.react_until = this.iso(this.now() + THROW_LIMITS.react_secs * 1000);
      }
      if (was === "deciding" && phase !== "ended") this.overlayHerCall(r);   // rooms_overlay_round: her call is made
    }
    this.emit("rooms", "UPDATE", { ...r });
    return null;
  }
  /* ---------- STALE ROOMS END (RULING 10/8) ---------- */
  /* end_room(p_room, p_winner, p_actor, p_by): THE one ending.  Only a live
     row ends (a second End-it is a no-op, no second finale); the finale
     event names the actor and why. */
  endRoom(room_id, winner_id, actor, by) {
    const r = this.rooms.get(room_id);
    if (!r || r.status !== "live") return false;
    r.status = "ended"; r.winner_id = winner_id || null;
    this.emit("rooms", "UPDATE", { ...r });
    this.pushEvent(room_id, actor, "finale", { winner_id: winner_id || null, by });
    return true;
  }
  /* end_stale_rooms(): coalesce(host_seen_at, created_at) < now() - HOST_STALE_MS,
     status='live', NO phase predicate (warm-up rooms included).  Called by the
     cron tick (gates call D.sweepStaleRooms() directly to stand in for
     pg_cron) and on touch from heartbeat / list_live_rooms. */
  sweepStaleRooms() {
    const cutoff = this.now() - HOST_STALE_MS;
    let n = 0;
    for (const r of this.rooms.values()) {
      if (r.status !== "live") continue;
      const beat = Date.parse(r.host_seen_at || r.created_at || 0);
      if (beat && beat < cutoff) { if (this.endRoom(r.id, null, r.host_id, "stale_host")) n++; }
    }
    this.sweepLog.push({ at: this.now(), ended: n });
    return n;
  }

  pushEvent(room_id, user_id, type, payload) {
    const ev = { id: nid("e"), room_id, user_id, type, payload, created_at: this.iso() };
    this.events.push(ev);
    this.emit("room_events", "INSERT", { ...ev });
    return ev;
  }

  /* ---------- table ops (the query-builder transport) ---------- */
  table(clientId, spec) {
    const { table, action, values, filters = [], order, limit, single, maybeSingle, selectAfter } = spec;

    /* Fault injection for TABLE writes, added for gate 49.  rpc() has had this
       since wave 8; table() never did, so every gate that wanted to see a
       user-facing failure message had to assert the STRING from source and
       hope.  Two modes, and they are different diseases:
         D.setFault("table:profiles.upsert", "w", { error: "permission denied" })
             the write fails loudly  → the app's `if(error)` branch
         D.setFault("table:profiles.upsert", "w", { drop: true })
             the write is ACCEPTED and never lands, and the read-back returns
             what was already there → the app's "didn't stick" branch.  This is
             production's face for an RLS denial that answers 200, the same
             shape join_line already models. */
    const fkey = "table:" + table + "." + action;
    const tf = this.faults && (this.faults[fkey + "|" + clientId] || this.faults[fkey + "|*"]);
    if (tf && tf.error) throw new Error(tf.error);
    if (tf && tf.drop) {
      if (!selectAfter) return null;
      const idv = (values && !Array.isArray(values) && values.id) ||
                  (filters.find((f) => f.col === "id") || {}).val || null;
      const cur = (table === "profiles" && idv) ? (this.profiles.get(idv) || { id: idv }) : {};
      return single ? { ...cur } : [{ ...cur }];
    }
    const rowsOf = () => {
      if (table === "rooms") return [...this.rooms.values()];
      if (table === "profiles") return [...this.profiles.values()];
      if (table === "room_events") return [...this.events];
      if (table === "room_members") return this.members.map((m) => ({ ...m }));
      /* THROWABLES: the ledger has RLS on with NO policies and no API grants
         — production answers a member's read with "permission denied for
         table throw_ledger" (dry run, DESIGN-throwables-server.md) */
      if (table === "throw_ledger") throw new Error("permission denied for table throw_ledger");
      if (table === "questions") return [...this.questions];
      if (table === "question_decks") return [...this.decks];
      throw new Error("double: unknown table " + table);
    };
    const match = (row) => filters.every((f) => {
      if (f.type === "eq") return String(row[f.col]) === String(f.val);
      if (f.type === "in") return (f.val || []).map(String).includes(String(row[f.col]));
      if (f.type === "neq") return String(row[f.col]) !== String(f.val);
      if (f.type === "gt") return String(row[f.col]) > String(f.val);
      throw new Error("double: unknown filter " + f.type);
    });

    if (action === "select") {
      let rows = rowsOf().filter(match);
      if (order) rows.sort((a, b) => {
        const x = a[order.col], y = b[order.col];
        return (x < y ? -1 : x > y ? 1 : 0) * (order.ascending ? 1 : -1);
      });
      if (limit) rows = rows.slice(0, limit);
      if (single || maybeSingle) {
        if (rows.length > 1) throw new Error("more than one row");
        if (!rows.length) { if (maybeSingle) return null; throw new Error("no rows"); }
        return rows[0];
      }
      return rows;
    }

    if (action === "insert") {
      const uid = this.sessions.get(clientId);
      const list = Array.isArray(values) ? values : [values];
      const out = list.map((v) => {
        if (table === "rooms") {
          // prod server default: engine on, rooms are born in preshow
          const id = this.addRoom({ host_id: v.host_id ?? uid, name: v.contestant_name, status: v.status || "live", phase: v.phase ?? "preshow" });
          const row = this.rooms.get(id);
          this.emit("rooms", "INSERT", { ...row });
          return row;
        }
        if (table === "room_events") return this.pushEvent(v.room_id, v.user_id ?? uid, v.type, v.payload);
        throw new Error("double: insert into " + table + " not supported");
      });
      if (selectAfter) return single || list.length === 1 ? out[0] : out;
      return null;
    }

    if (action === "update" || action === "upsert") {
      if (table === "profiles") {
        const list = Array.isArray(values) ? values : [values];
        const out = [];
        for (const v of list) {
          const id = v.id || (filters.find((f) => f.col === "id") || {}).val;
          if (!id) throw new Error("profiles write without id");
          const cur = this.profiles.get(id) || { id };
          this.profiles.set(id, { ...cur, ...v });
          out.push({ ...this.profiles.get(id) });
        }
        /* upsert(...).select(...).single() returns the written row in prod. This
           branch returned null regardless of selectAfter, so the app's honest
           "write did not stick" read-back guard fired on every first-run save
           (surfaced by gate 69). The insert branch already honours selectAfter
           exactly this way. */
        if (selectAfter) return single || list.length === 1 ? out[0] : out;
        return null;
      }
      if (table === "rooms") {
        /* THROWABLES: trigger rooms_throwables_guard — the host writes her
           own rooms row directly today (status, host_seen_at), so the switch
           is guarded by column, not by RLS */
        if (values && "throwables_on" in values) throw new Error(ROOMS_THROW_GUARD_MSG);
        if (values && "crown_user" in values) throw new Error(ROOMS_CROWN_GUARD_MSG);   // rooms_throwables_guard, feat/pressure-crown
        if (values && ("react_user" in values || "react_until" in values)) throw new Error(ROOMS_REACT_GUARD_MSG);   // rooms_throwables_guard, feat/combos-reaction
        let n = 0;
        for (const r of this.rooms.values()) {
          if (match(r)) { Object.assign(r, values); n++; this.emit("rooms", "UPDATE", { ...r }); }
        }
        return null;
      }
      /* THROWABLES: trigger room_members_throw_guard.  A direct client write
         that touches a throw column is refused with the trigger's message
         WHATEVER RLS says (the dry run proved it under a permissive update
         policy).  Any OTHER direct member write stays "not supported" here —
         the production UPDATE policy on room_members is UNREAD (preflight 0c
         in the DDL is the read), and the client makes none (gate 71 block 8). */
      if (table === "room_members" && values && THROW_COLS.some((c) => c in values))
        throw new Error(THROW_GUARD_MSG);
      throw new Error("double: update on " + table + " not supported");
    }
    if (action === "delete") throw new Error("double: delete not supported");
    throw new Error("double: unknown action " + action);
  }
}

module.exports = { BackendDouble, FRESH_MS, SWEEP_MS, HOST_STALE_MS, FILTER_LOOKS, HALLOWEEN_PACK, HOLIDAYS_PACK, THROW_LIMITS, THROW_KINDS, THROW_GUARD_MSG, ROOMS_THROW_GUARD_MSG, CROWN_BLOCK_MSG, ROOMS_CROWN_GUARD_MSG, ROOMS_REACT_GUARD_MSG };
