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

let _seq = 1;
const nid = (p) => p + "_" + (_seq++).toString(36).padStart(6, "0");

class BackendDouble {
  constructor() {
    this.users = new Map();      // uid -> {id,email}
    this.profiles = new Map();   // uid -> profile row
    this.rooms = new Map();      // room_id -> room row
    this.members = [];           // room_members rows
    this.events = [];            // room_events rows
    this.questions = [];
    this.decks = [];
    this.sessions = new Map();   // clientId -> uid
    this.listeners = [];         // fn(evt) — harness fans out to pages
    this.rpcLog = [];            // every rpc call, for gate assertions
    this.authLog = [];           // every auth op, for gate assertions (retry counting)
    this.swaps = {};             // room_id -> { uid: contact_text } (backstage swap offers)
    this.clockSkew = 0;          // ms added to "now" (staleness tests)
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
      winner_id: null, created_at: this.iso(), host_seen_at: this.iso(),
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
    };
    this.members.push(row);
    return row;
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
    if (typeof op === "string" && op.startsWith("auth.")) {
      this.authLog.push({ clientId, op });
      const f = this.faults && (this.faults[op + "|" + clientId] || this.faults[op + "|*"]);
      if (f && f.throw) throw new Error(f.throw === true ? "network unreachable" : f.throw);
      if (f && f.error) return { data: null, error: { message: f.error } };
    }
    try {
      return { data: await this._dispatch(clientId, op, payload || {}), error: null };
    } catch (e) {
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
    if (op === "auth.signOut") { this.sessions.delete(clientId); return {}; }
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

    if (op === "rpc") { this.rpcLog.push({ clientId, name: p.name, args: p.args }); return this.rpc(clientId, p.name, p.args || {}); }
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
       D.setFault("join_line", "w", null)                        // clear */
  setFault(name, clientId, mode) {
    this.faults = this.faults || {};
    const k = name + "|" + (clientId || "*");
    if (mode) this.faults[k] = mode; else delete this.faults[k];
  }

  /* ---------- RPCs ---------- */
  rpc(clientId, name, a) {
    const f = this.faults && (this.faults[name + "|" + clientId] || this.faults[name + "|*"]);
    if (f) {
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
        row.role = "line"; row.last_seen = this.iso();
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
            m.role = "gone";
            this.emit("room_members", "UPDATE", { ...m });
          }
        }
        return null;
      }
      case "seat_member": {
        const row = this.memberRow(a.room_id, a.user_id);
        if (!row) throw new Error("no such member");
        row.role = "chair"; row.seat_index = a.seat_index; row.last_seen = this.iso();
        this.pushEvent(a.room_id, uid, "seat", { target_user: a.user_id, seat: a.seat_index });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "keep_member": {
        const row = this.memberRow(a.room_id, a.user_id);
        if (!row) throw new Error("no such member");
        row.role = "kept";
        this.pushEvent(a.room_id, uid, "keep", { target_user: a.user_id });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "pass_member": {
        const row = this.memberRow(a.room_id, a.user_id);
        if (!row) throw new Error("no such member");
        row.role = "spectator"; row.seat_index = null;
        this.pushEvent(a.room_id, uid, "pass", { target_user: a.user_id });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "timeout_member": {
        const row = this.memberRow(a.room_id, a.user_id);
        if (row) { row.role = "spectator"; row.seat_index = null; this.pushEvent(a.room_id, uid, "timeout", { target_user: a.user_id }); this.emit("room_members", "UPDATE", { ...row }); }
        return null;
      }
      case "start_show": return this.setPhase(a.room_id, "showstart", 20);
      /* end_deliberation (fix/no-client-room-writes, 2026-08-20 ruling —
     * OVERTURNS an earlier "one rung, relabelled" ruling once gates 07 and
     * 30 showed it would retire the jump-to-deciding behaviour SPEC wave 5
     * explicitly canonised).  skip_phase is untouched and stays a single-step
     * walker for its six existing call sites — this is a SEPARATE function
     * for "SHE'S HEARD ENOUGH": one press, straight to her call.
     * JUDGMENT CALL (flagged per ruling text "your call on which; raise is
     * safer, say which you chose"): RAISE outside spotlight/openfloor/
     * deliberation, not a silent no-op — a stray call from the wrong phase
     * is a client bug worth surfacing, not swallowing.
     * JUDGMENT CALL #2: the ruling text says "null deadline (waiting on
     * host)" for the new phase, which supersedes SPEC wave-5's older text
     * ("fresh 60s clock") for this exact transition — followed literally
     * here; flagged back to the advisor as a live discrepancy, not resolved
     * unilaterally. */
    case "end_deliberation": {
      const r = this.rooms.get(a.room_id);
      if (!r) throw new Error("no room");
      if (uid !== r.host_id) throw new Error("not the host");
      if (!["spotlight", "openfloor", "deliberation"].includes(r.phase))
        throw new Error("end_deliberation: only valid in spotlight/openfloor/deliberation");
      r.phase = "deciding";
      r.phase_deadline = null;
      r.spotlight_target = null;   // SPEC wave 5: "spotlight cleared"
      this.emit("rooms", "UPDATE", { ...r });
      this.pushEvent(a.room_id, uid, "phase", { reason: "host_skip", phase: "deciding" });
      return null;
    }
    case "skip_phase":
      case "advance_phase": {
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        const order = ["preshow", "showstart", "spotlight", "openfloor", "deliberation", "deciding"];
        const i = order.indexOf(r.phase);
        if (r.phase === "deciding") { r.round = (r.round || 0) + 1; return this.setPhase(a.room_id, "spotlight", 60); }
        if (r.phase === "draft") { return this.setPhase(a.room_id, "spotlight", 60); }   // a skipped draft returns to the floor
        const next = i < 0 ? "showstart" : order[Math.min(i + 1, order.length - 1)];
        // wave 8 fidelity: prod enters HER CALL with a NULL phase_deadline —
        // the conductor's live room proved it (deadline:null, clock parked
        // at a lying 0:00).  The double now does what prod does.
        return this.setPhase(a.room_id, next, next === "deciding" ? null : 60);
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
        row.role = passed ? "gone" : "spectator";
        row.seat_index = null;
        this.pushEvent(a.room_id, uid, passed ? "pass" : "stepdown",
          { target_user: uid, actor: "self", source: "step_down", was_spotlight: passed });
        this.emit("room_members", "UPDATE", { ...row });
        return { passed, role: row.role };
      }
      case "end_show": {
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        r.status = "ended"; r.winner_id = a.winner_id || null;
        this.emit("rooms", "UPDATE", { ...r });
        // wave 3: the ending is a LEDGER fact too — the finale event is the
        // fast explicit channel (prod: engine_emit in end_show; PR notes),
        // the rooms row remains the polled fallback.
        this.pushEvent(a.room_id, uid, "finale", { winner_id: a.winner_id || null });
        return null;
      }
      case "seat_pick": {
        // engine-mode self-seat: claimant takes the named seat
        const row = this.memberRow(a.room_id, uid);
        if (!row) throw new Error("no such member");
        row.role = "chair"; row.seat_index = a.seat_index ?? 0;
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
      case "decide_keep": {
        // her decision verbs (egDecideTap) — same shape as keep_member /
        // pass_member but keyed by `target`, mirroring prod's decide_* RPCs
        const row = this.memberRow(a.room_id, a.target);
        if (!row) throw new Error("no such member");
        row.role = "kept";
        this.pushEvent(a.room_id, uid, "keep", { target_user: a.target });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "decide_pass": {
        const row = this.memberRow(a.room_id, a.target);
        if (!row) throw new Error("no such member");
        row.role = "spectator"; row.seat_index = null;
        this.pushEvent(a.room_id, uid, "pass", { target_user: a.target });
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "decide_clear": {
        for (const m of this.members) {
          if (m.room_id === a.room_id && m.role === "chair") { m.role = "spectator"; m.seat_index = null; this.emit("room_members", "UPDATE", { ...m }); }
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
    r.phase = phase;
    r.phase_deadline = secs ? this.iso(this.now() + secs * 1000) : null;
    this.emit("rooms", "UPDATE", { ...r });
    return null;
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
        for (const v of list) {
          const id = v.id || (filters.find((f) => f.col === "id") || {}).val;
          if (!id) throw new Error("profiles write without id");
          const cur = this.profiles.get(id) || { id };
          this.profiles.set(id, { ...cur, ...v });
        }
        return null;
      }
      if (table === "rooms") {
        let n = 0;
        for (const r of this.rooms.values()) {
          if (match(r)) { Object.assign(r, values); n++; this.emit("rooms", "UPDATE", { ...r }); }
        }
        return null;
      }
      throw new Error("double: update on " + table + " not supported");
    }
    if (action === "delete") throw new Error("double: delete not supported");
    throw new Error("double: unknown action " + action);
  }
}

module.exports = { BackendDouble, FRESH_MS, SWEEP_MS };
