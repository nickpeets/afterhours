/* supabase-shim.js — served IN PLACE OF the supabase-js CDN bundle.
 * Dumb transport: every call is forwarded to the Node-side BackendDouble via
 * the window.__rpcCall binding.  No backend semantics live here.
 */
(() => {
  "use strict";
  const call = (op, payload) => window.__rpcCall(JSON.stringify({ op, payload }))
    .then((r) => (typeof r === "string" ? JSON.parse(r) : r));

  /* realtime registry: postgres_changes handlers by channel */
  const channels = new Set();
  window.__realtimePush = (evt) => {
    for (const ch of channels) {
      if (!ch.__subscribed) continue;
      for (const h of ch.__handlers) {
        if (h.kind !== "postgres_changes") continue;
        const f = h.filter || {};
        if (f.table && f.table !== evt.table) continue;
        if (f.event && f.event !== "*" && f.event !== evt.eventType) continue;
        if (f.filter) {
          const m = /^([a-z_]+)=eq\.(.+)$/.exec(f.filter);
          if (m && String(evt.new?.[m[1]]) !== m[2]) continue;
        }
        try { h.cb({ ...evt, new: evt.new, old: evt.old }); } catch (e) { console.error("[shim] handler threw", e); }
      }
    }
  };

  function makeBuilder(table) {
    const spec = { table, action: null, values: null, filters: [], order: null, limit: null, single: false, maybeSingle: false, selectAfter: false };
    const run = () => call("table", spec).then(({ data, error }) => ({ data, error }));
    const b = {
      select(_cols) { if (spec.action && spec.action !== "select") spec.selectAfter = true; else spec.action = "select"; return b; },
      insert(v) { spec.action = "insert"; spec.values = v; return b; },
      update(v) { spec.action = "update"; spec.values = v; return b; },
      upsert(v) { spec.action = "upsert"; spec.values = v; return b; },
      delete() { spec.action = "delete"; return b; },
      eq(col, val) { spec.filters.push({ type: "eq", col, val }); return b; },
      neq(col, val) { spec.filters.push({ type: "neq", col, val }); return b; },
      in(col, val) { spec.filters.push({ type: "in", col, val }); return b; },
      order(col, o) { spec.order = { col, ascending: !!(o && o.ascending) }; return b; },
      limit(n) { spec.limit = n; return b; },
      single() { spec.single = true; return b; },
      maybeSingle() { spec.maybeSingle = true; return b; },
      then(res, rej) { return run().then(res, rej); },
      catch(rej) { return run().catch(rej); },
    };
    return b;
  }

  class Channel {
    constructor(name) { this.name = name; this.__handlers = []; this.__subscribed = false; }
    on(kind, filter, cb) { this.__handlers.push({ kind, filter, cb }); return this; }
    subscribe(cb) { this.__subscribed = true; channels.add(this); if (cb) { try { cb("SUBSCRIBED"); } catch (e) {} } return this; }
    unsubscribe() { this.__subscribed = false; channels.delete(this); return Promise.resolve("ok"); }
  }

  const authListeners = [];
  window.__authEmit = (event, session) => authListeners.forEach((fn) => { try { fn(event, session); } catch (e) {} });

  function createClient(_url, _key, _opts) {
    return {
      auth: {
        getSession: () => call("auth.getSession").then(({ data, error }) => ({ data: data || { session: null }, error })),
        getUser: () => call("auth.getUser").then(({ data, error }) => ({ data: data || { user: null }, error })),
        signInWithPassword: (c) => call("auth.signInWithPassword", c),
        signUp: (c) => call("auth.signUp", c),
        signOut: () => call("auth.signOut"),
        resetPasswordForEmail: (e, o) => call("auth.resetPasswordForEmail", { email: e }),
        updateUser: (u) => call("auth.updateUser", u),
        onAuthStateChange(fn) { authListeners.push(fn); return { data: { subscription: { unsubscribe() {} } } }; },
      },
      from: (table) => makeBuilder(table),
      rpc: (name, args) => {
        const p = call("rpc", { name, args });
        return { then: (res, rej) => p.then(res, rej), catch: (rej) => p.catch(rej) };
      },
      channel: (name) => new Channel(name),
      removeChannel: (ch) => { if (ch) ch.unsubscribe(); return Promise.resolve("ok"); },
      functions: { invoke: () => Promise.resolve({ data: null, error: null }) },
    };
  }

  window.supabase = { createClient };
})();
