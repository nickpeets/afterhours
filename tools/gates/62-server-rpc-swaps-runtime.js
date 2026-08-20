/* GATE 62 — server-rpc-swaps-runtime: the RUNTIME half of no-client-room-writes
 * (gate 61 is the static half).  Three of the four swapped call sites are
 * exercised for real, through the actual client code paths, against the
 * PATCHED local double — and each is proven by D.rpcLog, the same
 * "the client called RPC X" instrument used elsewhere (gates 13/14/17/38).
 *
 * WHAT THIS PROVES, PER CALL SITE:
 *   - passPickOpen() (shared by the janitor-adjacent pass flow and, per
 *     gate 61's static proof, recruitOpen — same call shape, same RPC)
 *     really calls set_phase_deadline, with room_id and a future until_ts,
 *     when the bench can refill.
 *   - segmentCollapse's render-time detection (renderRoom(): AMHOST &&
 *     EG_ON && phase==="spotlight" && spotTargetRaw && !spotTarget) really
 *     calls clear_spotlight_target when the spotlighted seat vacates.
 *   - the eg_skip button really calls skip_phase (the PRE-EXISTING,
 *     already-deployed RPC — this call site backs onto no new server
 *     function, per gate 61's note).
 *
 * WHAT THIS DOES NOT PROVE (by design, left to gate 63):
 *   - reset_to_preshow's janitor trigger needs a real ~8-9s wait on the
 *     confirmed 4000ms HOST_POLL interval — kept out of this gate so a
 *     slow CI box can't flake THIS one; gate 63 owns the timer.
 *   - step_down has no client wiring in this branch (function 4 isn't
 *     called from anywhere yet) — gate 63 drives it directly against the
 *     double, bypassing the UI, same idiom as seat_member/pass_member in
 *     older gates.
 *
 * All three RPCs here are PENDING PRODUCTION DDL (reset_to_preshow,
 * set_phase_deadline, clear_spotlight_target) — this gate runs against the
 * LOCAL double only and says nothing about whether the real functions are
 * live.  skip_phase is the exception: it already exists in production.
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 150));
  }
};

module.exports = {
  name: "server-rpc-swaps-runtime",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_b1", "u_ghost"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby, #room.show", { timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);

      /* --- 1. set_phase_deadline, via passPickOpen (bench stocked) --- */
      const r1 = D.addRoom({ id: "r_dl", host_id: hostU, name: "Deadline Night", phase: "openfloor", round: 1 });
      D.rooms.get(r1).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(r1, "u_s1", "chair", { seat_index: 0 });
      D.addMember(r1, "u_s2", "chair", { seat_index: 1 });
      D.addMember(r1, "u_b1", "line");   // bench:1 — passPickOpen must return true
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r1) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      const before1 = D.rpcLog.length;
      const opened = await host.page.evaluate(() => window.__lc.passPickOpen());
      t.ok(opened === true, "passPickOpen() opens the pick window (bench stocked)");
      await waitFor(() => D.rpcLog.slice(before1).some((c) => c.name === "set_phase_deadline"), 5000,
        "set_phase_deadline RPC fired by passPickOpen");
      const dlCall = D.rpcLog.slice(before1).find((c) => c.name === "set_phase_deadline");
      t.ok(dlCall.args.room_id === r1, "...for the room the host actually holds open");
      t.ok(typeof dlCall.args.until_ts === "string" && Date.parse(dlCall.args.until_ts) > Date.now(),
        "...with a future until_ts (server-side floor/ceiling checked in gate 63's double coverage)");
      t.ok(D.rooms.get(r1).phase_deadline === dlCall.args.until_ts,
        "the double actually applied it — phase_deadline now matches the call");
      await host.page.evaluate(() => window.__lc.passPickClear());   // PASS_PICK is a client global; clear it
      // before moving to the next scenario, or its truthiness blocks eg_skip's visibility below.

      /* --- 2. clear_spotlight_target, via segmentCollapse's render-time
         detection (a ghost target: CURRENT_ROOM says spotlit, ROOM_STATE
         disagrees — the exact condition segmentCollapse exists to catch) --- */
      const r2 = D.addRoom({ id: "r_col", host_id: hostU, name: "Collapse Night", phase: "openfloor", round: 0 });
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r2) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      const before2 = D.rpcLog.length;
      await host.page.evaluate((uid) => {
        window.__lc.CURRENT_ROOM.phase = "spotlight";
        window.__lc.CURRENT_ROOM.spotlight_target = uid;   // a target NOT seated in ROOM_STATE
        window.__lc.renderRoom();
      }, "u_ghost");
      await waitFor(() => D.rpcLog.slice(before2).some((c) => c.name === "clear_spotlight_target"), 5000,
        "clear_spotlight_target RPC fired by segmentCollapse's ghost-target detection");
      const clearCall = D.rpcLog.slice(before2).find((c) => c.name === "clear_spotlight_target");
      t.ok(clearCall.args.room_id === r2, "...for the right room");
      t.ok(D.rooms.get(r2).spotlight_target === null, "the double actually cleared it");
      // r2 had an EMPTY bench, so segmentCollapse's own follow-through
      // (passPickOpen fails -> recruitOpen) leaves PASS_PICK set again
      // (recruit:true) — clear it or it blocks eg_skip's visibility below,
      // same client-global gotcha as after test 1.
      await host.page.evaluate(() => window.__lc.passPickClear());

      /* --- 3. skip_phase, via a real tap on the eg_skip button (the
         pre-existing RPC — proves the client swap, not a new function) --- */
      const r3 = D.addRoom({ id: "r_skip", host_id: hostU, name: "Skip Night", phase: "openfloor", round: 1 });
      D.rooms.get(r3).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(r3, "u_s1", "chair", { seat_index: 0 });
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r3) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() =>
        document.getElementById("eg_skip").style.display !== "none"), 8000, "the skip control is up (host, seated, openfloor)");
      const before3 = D.rpcLog.length;
      await host.page.click("#eg_skip");
      await waitFor(() => D.rpcLog.slice(before3).some((c) => c.name === "skip_phase"), 5000,
        "skip_phase RPC fired by the eg_skip tap");
      const skipCall = D.rpcLog.slice(before3).find((c) => c.name === "skip_phase");
      t.ok(skipCall.args.room_id === r3, "...for the right room");

      const errs = [host].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
