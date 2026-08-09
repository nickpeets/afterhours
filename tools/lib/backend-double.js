/* backend-double.js — stateful Supabase double for the Last Call battery.
 *
 * Lives in NODE, not in the page: every browser client (host window, suitor
 * windows) talks to the SAME double through an exposed binding, so
 * multi-window flows exercise real shared state exactly like production
 * Supabase.  The in-page shim (supabase-shim.js) is a dumb transport; ALL
 * semantics live here.
 *
 * Faithfulness notes (derived from reading index.html, not from a spec):
 *  - the host has NO room_members row, by design.
 *  - active_members() is SECURITY DEFINER in prod: it returns rows regardless
 *    of RLS.  Here: rows with role!=='gone' that are fresh (last_seen within
 *    FRESH_MS) OR role==='kept' (a kept man is on stage; staleness doesn't
 *    unseat him).
 *  - sweep_stale_members marks rows 'gone' after SWEEP_MS without a beat.
 *  - realtime postgres_changes fire on rooms / room_members / room_events
 *    mutations, delivered to every subscribed client.
 */
"use strict";

const FRESH_MS = 60_000;   // active_members freshness window
const SWEEP_MS = 45_000;   // sweep_stale_members threshold

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
  addMember(room_id, user_id, role, { seat_index = null, ageMs = 0 } = {}) {
    const row = {
      id: nid("m"), room_id, user_id, role, seat_index,
      last_seen: this.iso(this.now() - ageMs),
      joined_at: this.iso(this.now() - ageMs),
    };
    this.members.push(row);
    return row;
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

  /* ---------- RPCs ---------- */
  rpc(clientId, name, a) {
    const uid = this.sessions.get(clientId);
    switch (name) {
      case "server_now": return this.iso();
      case "active_members": return this.activeMembers(a.room_id);
      case "join_room": {
        if (!uid) throw new Error("not authenticated");
        let row = this.memberRow(a.room_id, uid);
        if (row) { if (row.role === "gone") row.role = "spectator"; row.last_seen = this.iso(); }
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
        row.role = "line"; row.last_seen = this.iso();
        this.emit("room_members", "UPDATE", { ...row });
        return null;
      }
      case "heartbeat": {
        if (!uid) return null;
        const row = this.memberRow(a.room_id, uid);
        if (row && row.role !== "gone") { row.last_seen = this.iso(); }
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
      case "skip_phase":
      case "advance_phase": {
        const r = this.rooms.get(a.room_id);
        if (!r) throw new Error("no room");
        const order = ["preshow", "showstart", "spotlight", "openfloor", "deliberation", "deciding"];
        const i = order.indexOf(r.phase);
        if (r.phase === "deciding") { r.round = (r.round || 0) + 1; return this.setPhase(a.room_id, "spotlight", 60); }
        const next = i < 0 ? "showstart" : order[Math.min(i + 1, order.length - 1)];
        return this.setPhase(a.room_id, next, 60);
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
        this.pushEvent(a.room_id, uid, "spotlight",
          { target_user: a.target, round: r.round, question_id: a.question_id ?? null,
            question_text: q ? q.text : null, deadline: r.phase_deadline });
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
      case "get_swap_status": return { status: "none" };
      case "offer_swap": case "rescind_swap": return null;
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
