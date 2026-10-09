/* GATE 17 — host-comeback: a reload NEVER ends the show (RULING Q1).
 * Ships with fix/show-survives-host.
 *
 * The bug (audit F1): the boot-time crash-recovery block ended EVERY live
 * room the booting user hosted, unconditionally — one Safari refresh on
 * the host's phone killed the night for the whole cast.
 *
 * The ruling: presence is defined by the existing absence rules alone
 * (watchers exit after 80s without the host; the 120s zombie janitor ends
 * truly abandoned rooms).  A booting host who finds her own live room
 * REJOINS it — host UI, phase, and clocks restore from server state.
 *
 * Proven here:
 *   - host reloads mid-round → the room is STILL LIVE, no end_show fired,
 *     phase and deadline intact, and the host lands back inside the room
 *     with host UI (AMHOST) without touching the lobby.
 *   - a spectator's view survives the reload: no ending beat, same phase.
 *   - true absence still ends the show: a room whose host_seen_at is
 *     older than HOST_STALE_MS is ended by the SERVER (end_stale_rooms, on
 *     the lobby read).  RULING 10/8 flipped this scene from "the viewer's
 *     client janitor ends it" to "the viewer writes nothing".
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 250));
  }
};

module.exports = {
  name: "host-comeback",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_s3", "u_w"].forEach((id) => D.addUser({ id, name: id }));

      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby, #room.show", { timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const watcher = await boot("watch", "u_w");
      const room = D.addRoom({ id: "r_live", host_id: hostU, name: "Reload Night", phase: "openfloor", round: 2 });
      const deadlineIso = D.iso(D.now() + 45_000);
      D.rooms.get(room).phase_deadline = deadlineIso;
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      D.addMember(room, "u_s3", "chair", { seat_index: 2 });
      D.addMember(room, "u_w", "spectator");
      for (const c of [host, watcher]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }

      /* --- the reload --- */
      const endShowsBefore = D.rpcLog.filter((r) => r.name === "end_show").length;
      await host.page.reload({ waitUntil: "load" });
      await waitFor(() => host.page.evaluate(() =>
        document.getElementById("room").classList.contains("show")).catch(() => false), 15000,
        "the booting host lands back inside her own live room");
      t.ok(true, "host reload → straight back into the room (no lobby detour, RULING Q1)");

      t.ok(D.rooms.get(room).status === "live", "the room is STILL LIVE after the host's reload");
      const endShowsAfter = D.rpcLog.filter((r) => r.name === "end_show").length;
      t.ok(endShowsAfter === endShowsBefore, `no end_show fired by the boot path (${endShowsBefore} → ${endShowsAfter})`);
      t.ok(D.rooms.get(room).phase === "openfloor" && D.rooms.get(room).phase_deadline === deadlineIso,
        "phase and deadline are untouched by the comeback");
      t.ok(await host.page.evaluate(() => window.__lc.AMHOST === true), "host UI restored: AMHOST after the comeback");
      t.ok(await host.page.evaluate(() => window.__lc.CURRENT_ROOM && window.__lc.CURRENT_ROOM.id === "r_live"),
        "the resumed CURRENT_ROOM is the same show");

      // the watcher never saw an ending
      const watcherInRoom = await watcher.page.evaluate(() =>
        document.getElementById("room").classList.contains("show") &&
        !document.getElementById("finale").classList.contains("show"));
      t.ok(watcherInRoom, "the crowd's night was never interrupted — no finale, still in the room");

      /* --- true absence is still fatal — but RULING 10/8 moved the ending
         to the SERVER.  openRoom's client janitor (a rooms.update from the
         viewer) is deleted; a stale room is ended by end_stale_rooms, which
         runs on touch at the top of heartbeat / list_live_rooms and from
         pg_cron.  The watcher never writes rooms. --- */
      const ghost = D.addRoom({ id: "r_ghost", host_id: "u_s1", name: "Ghost Night", phase: "openfloor", round: 1 });
      D.rooms.get(ghost).host_seen_at = D.iso(D.now() - 180_000);   // host gone 3 minutes
      D.rooms.get(ghost).created_at = D.iso(D.now() - 300_000);
      await watcher.page.evaluate(() => window.__lc.leaveRoom());
      await watcher.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });
      const w0 = D.opLog.length;
      await watcher.page.evaluate(() => window.__lc.loadRooms());   // the lobby read: list_live_rooms sweeps first
      await waitFor(() => D.rooms.get(ghost).status === "ended", 10000,
        "the SERVER ends a room whose host has been absent past the HOST_STALE_MS rule, on the lobby read");
      const watcherWrites = D.opLog.slice(w0).filter((e) => e.clientId === "watch" &&
        ((e.op === "table" && e.table === "rooms" && e.action === "update") || (e.op === "rpc" && e.name === "end_show")));
      t.ok(watcherWrites.length === 0, "genuine absence still ends the show — and the viewer wrote nothing: the janitor is the server's now");
      await waitFor(() => watcher.page.evaluate(() => ![...document.querySelectorAll("#roomlist .roomcard")].some((c) => /Ghost Night/.test(c.textContent))), 8000,
        "the lobby to list no ghost");
      t.ok(true, "the ended ghost is off the lobby list without any client-side ghost filter");

      const errs = [host, watcher].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
