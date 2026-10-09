/* GATE 82 — stale-rooms-end: RULING 10/8.  A live room whose host beat
 * (host_seen_at, else created_at) is older than HOST_STALE_MS is ENDED on
 * the server, warm-up rooms included.  HOST_STALE_MS stays the one number.
 *
 * SOURCE for the rules: tools/DESIGN-stale-rooms.md (the DDL; production
 * read-back recorded there once it has run).  The double mirrors it:
 * end_room() is THE one ending (end_show delegates after its auth gate);
 * end_stale_rooms() sweeps; heartbeat and list_live_rooms call the sweep
 * first; pg_cron is stood in for by D.sweepStaleRooms().
 *
 * What this gate holds, against the double and the real page:
 *   a. beat 121s → the cron tick ends it; a 'preshow' warm-up room too;
 *   b. beat 119s → not ended;
 *   c. a FRESHLY CREATED room (client insert, no heartbeat yet) is NOT
 *      swept at 119s — its beat starts at creation (column default);
 *      at 121s with still no beat, it is;
 *   d. a member still inside a room when the sweep ends it is routed out
 *      (the rooms UPDATE / finale reach him) — no phantom night;
 *   e. heartbeat and list_live_rooms each trigger the sweep;
 *   f. the sweep never calls end_show (count stays 0) and a client cannot
 *      call end_stale_rooms or end_room (revoked);
 *   g. the ending is idempotent: ending an ended room writes no second
 *      finale; and end_show still refuses a non-host / a signed-out caller;
 *   h. pre-column rows (null host_seen_at) are judged on created_at.
 */
"use strict";
const { Harness } = require("../lib/harness");
const { HOST_STALE_MS } = require("../lib/backend-double");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200)); } };

module.exports = {
  name: "stale-rooms-end",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@stale.test" });
      const wU = D.addUser({ id: "u_w", name: "Watcher", email: "w@stale.test" });
      const finales = (room) => D.events.filter((e) => e.room_id === room && e.type === "finale");
      const endShowCalls = () => D.rpcLog.filter((r) => r.name === "end_show").length;
      const aged = (id, beatAgeMs, phase = "openfloor") => {
        const room = D.addRoom({ id, host_id: hostU, name: "Night " + id, phase, round: phase === "preshow" ? 0 : 1 });
        D.rooms.get(room).created_at = D.iso(D.now() - 3_600_000);
        D.rooms.get(room).host_seen_at = D.iso(D.now() - beatAgeMs);
        return room;
      };

      /* both clients boot into an EMPTY lobby first; every room below is
         added behind their backs, as the lobby poll would see it */
      const host = await h.newClient("host"); host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const w = await h.newClient("watch"); w.login(wU); await w.goto();
      await w.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      /* ---- a + b: the threshold, warm-up included ---- */
      const rOld = aged("r_old", HOST_STALE_MS + 1000);
      const rWarm = aged("r_warm", HOST_STALE_MS + 1000, "preshow");
      const rNear = aged("r_near", HOST_STALE_MS - 1000);
      const es0 = endShowCalls();
      const n = D.sweepStaleRooms();                                    // the cron tick
      t.ok(D.rooms.get(rOld).status === "ended" && D.rooms.get(rWarm).status === "ended",
        `the tick ends the two stale rooms, the warm-up (preshow) one included (this tick ended ${n})`);
      t.ok(D.rooms.get(rNear).status === "live", "beat 119s: NOT ended — the line is HOST_STALE_MS, not a guess");
      t.ok(finales(rOld).length === 1 && finales(rOld)[0].payload.by === "stale_host" && finales(rOld)[0].user_id === hostU,
        "the ending is the ONE ending: a finale event, by='stale_host', actor = the host");
      t.ok(endShowCalls() === es0, "the sweep did not call end_show (it calls end_room directly)");

      /* ---- h: pre-column rows are judged on created_at ---- */
      const rPre = D.addRoom({ id: "r_pre", host_id: hostU, name: "Pre-column", phase: "openfloor", round: 1 });
      D.rooms.get(rPre).host_seen_at = null; D.rooms.get(rPre).created_at = D.iso(D.now() - (HOST_STALE_MS + 5000));
      const rPreFresh = D.addRoom({ id: "r_pre_fresh", host_id: hostU, name: "Pre-column fresh", phase: "openfloor", round: 1 });
      D.rooms.get(rPreFresh).host_seen_at = null; D.rooms.get(rPreFresh).created_at = D.iso(D.now() - 5000);
      D.sweepStaleRooms();
      t.ok(D.rooms.get(rPre).status === "ended" && D.rooms.get(rPreFresh).status === "live",
        "null host_seen_at: created_at stands in — old one ended, young one kept");

      /* ---- c: a freshly created room has a beat from birth ---- */
      const before = new Set(D.rooms.keys());
      await host.page.evaluate(() => sb.from("rooms").insert({ host_id: ME.id, contestant_name: "Fresh", tagline: "", status: "live" }).select().single());
      const fresh = [...D.rooms.keys()].find((k) => !before.has(k));
      t.ok(!!fresh && !!D.rooms.get(fresh).host_seen_at, "a client-created room is born with host_seen_at set (column default now())");
      D.clockSkew = HOST_STALE_MS - 1000;                                // server clock: 119s later, no heartbeat ever sent
      D.sweepStaleRooms();
      t.ok(D.rooms.get(fresh).status === "live", "a fresh room with no heartbeat yet is NOT swept at 119s");
      D.clockSkew = HOST_STALE_MS + 1000;
      D.sweepStaleRooms();
      t.ok(D.rooms.get(fresh).status === "ended", "…and at 121s with still no beat, it is");
      D.clockSkew = 0;

      /* ---- d + e: a member inside, and the on-touch sweeps ---- */
      const rLive = aged("r_live", 10_000);
      D.addMember(rLive, wU, "spectator");
      await w.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(rLive) });
      await w.page.waitForSelector("#room.show", { timeout: 10000 });
      const sw0 = D.sweepLog.length;
      D.rooms.get(rLive).host_seen_at = D.iso(D.now() - (HOST_STALE_MS + 1000));   // the host goes silent
      D.rpc("watch", "heartbeat", { room_id: rLive });                                // the member's own beat touches the sweep
      t.ok(D.sweepLog.length > sw0, "heartbeat runs end_stale_rooms first (on touch)");
      t.ok(D.rooms.get(rLive).status === "ended", "…and the silent host's room is ended by a MEMBER's heartbeat");
      await waitFor(() => w.page.evaluate(() => !document.getElementById("room").classList.contains("show") ||
        document.getElementById("finale").classList.contains("show")), 10000, "the watcher to be routed out of the ended room");
      t.ok(true, "a member still inside receives the ending (rooms UPDATE / finale) — no phantom night");

      const rLobby = aged("r_lobby", HOST_STALE_MS + 1000);
      const sw1 = D.sweepLog.length;
      const listed = D.rpc("watch", "list_live_rooms", {});
      t.ok(D.sweepLog.length > sw1, "list_live_rooms runs end_stale_rooms first (on touch)");
      t.ok(D.rooms.get(rLobby).status === "ended" && !(listed || []).some((r) => r.id === rLobby),
        "…and never returns the stale room it just ended");

      /* ---- f: revoked doors ---- */
      const tryRpc = (c, name, a) => { try { D.rpc(c, name, a || {}); return null; } catch (e) { return String(e.message || e); } };
      const denied = [tryRpc("watch", "end_stale_rooms"), tryRpc("watch", "end_room", { p_room: "x" })];
      t.ok(denied.every((m) => /permission denied/.test(m || "")), `a client cannot call end_stale_rooms or end_room (${JSON.stringify(denied)})`);

      /* ---- g: idempotent, and end_show's gate stands ---- */
      const f0 = finales(rOld).length;
      D.endRoom(rOld, null, hostU, "host");
      t.ok(finales(rOld).length === f0, "ending an already-ended room writes no second finale");
      const rG = aged("r_g", 10_000);                                   // a fresh show of the host's
      const notHost = tryRpc("watch", "end_show", { room_id: rG, winner_id: null });
      t.ok(/not host/.test(notHost || ""), `end_show still refuses a non-host (${notHost})`);
      t.ok(D.rooms.get(rG).status === "live", "…and the room is untouched");
      const hostEnd = tryRpc("host", "end_show", { room_id: rG, winner_id: null });
      t.ok(!hostEnd && D.rooms.get(rG).status === "ended" && finales(rG)[0].payload.by === "host",
        "the host's own end_show still works and lands as by='host' through the same end_room");

      const errs = [host, w].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, `no console errors (${errs.slice(0, 3).join(" | ")})`);
    } finally { await h.close(); }
  },
};
