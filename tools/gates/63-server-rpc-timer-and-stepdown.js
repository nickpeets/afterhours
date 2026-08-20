/* GATE 63 — server-rpc-timer-and-stepdown: the two no-client-room-writes
 * RPCs gate 62 couldn't reach without either a real clock or a UI that
 * doesn't exist yet.
 *
 *   - reset_to_preshow: the empty-stage janitor inside startHostPoll's
 *     REAL 4000ms setInterval (SOURCE: confirmed interval, index.html).
 *     No fake timers — this is an actual ~8-9s wait for two ticks, same
 *     real-timer discipline as gate 46/30's PASS_PICK expiries.
 *   - step_down: not wired to any client call site in this branch (the
 *     leave_room+join_room dance it replaces is a follow-up wiring
 *     change), so it's driven directly against the double —
 *     D.rpc(clientId, "step_down", {room_id}) — the same bypass-the-UI
 *     idiom already used for seat_member/pass_member in older gates.
 *     Both branches (passed / not-passed) are proven, plus the standing
 *     instruction that this function does NOT touch decide_pass or
 *     pass_member (no accidental coupling).
 *
 * Both RPCs are PENDING PRODUCTION DDL — this gate proves the LOCAL
 * double's modeled behaviour only; it is not evidence the real Postgres
 * functions exist or match.  reset_to_preshow and step_down are posted to
 * the advisor separately, one at a time, each waiting on its own "go"
 * before it ever runs against production.
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
  name: "server-rpc-timer-and-stepdown",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby, #room.show", { timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);

      /* --- reset_to_preshow: real timer, empty stage, two ticks --- */
      const room = D.addRoom({ id: "r_empty", host_id: hostU, name: "Empty Stage", phase: "openfloor", round: 3 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
      D.rooms.get(room).spotlight_target = "u_ghost";   // proves the clear, not just a no-op read
      // deliberately NO chair/kept members — the stage is empty from the first tick
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      const beforeReset = D.rpcLog.length;
      await host.page.evaluate(() => window.__lc.startHostPoll());   // fresh ticks from an empty stage
      t.ok(D.rooms.get(room).status !== undefined, "fixture sanity: room exists before the wait");
      await waitFor(() => D.rpcLog.slice(beforeReset).some((c) => c.name === "reset_to_preshow"), 12_000,
        "reset_to_preshow fires after two empty 4000ms ticks (real timer, ~8-9s)");
      const resetCall = D.rpcLog.slice(beforeReset).find((c) => c.name === "reset_to_preshow");
      t.ok(resetCall.args.room_id === room, "...for the emptied room");
      const after = D.rooms.get(room);
      t.ok(after.phase === "preshow" && (after.round || 0) === 0 && after.spotlight_target === null,
        "the double actually reset: preshow, round 0, target cleared");

      /* --- reset_to_preshow no-ops once already warm-up (widened check:
         phase='preshow' AND round=0 AND spotlight_target IS NULL) --- */
      D.loginClient("direct_reset", hostU);
      const already = D.rpc("direct_reset", "reset_to_preshow", { room_id: room });
      t.ok(already === null, "a second call against an already-preshow room no-ops cleanly (no throw)");

      /* --- step_down: direct double calls, bypassing the UI (function 4
         has no client wiring in this branch) --- */
      const room2 = D.addRoom({ id: "r_step", host_id: hostU, name: "Step Down Night", phase: "spotlight", round: 1 });
      D.rooms.get(room2).spotlight_target = "u_s1";
      D.addMember(room2, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room2, "u_s2", "chair", { seat_index: 1 });
      D.loginClient("direct_s1", "u_s1");
      D.loginClient("direct_s2", "u_s2");

      const beforePassed = D.rpcLog.length;
      const r1 = D.rpc("direct_s1", "step_down", { room_id: room2 });
      t.ok(r1 && r1.passed === true && r1.role === "gone",
        `the spotlit target stepping down IS a pass — {passed:true, role:'gone'} (got ${JSON.stringify(r1)})`);
      t.ok(D.memberRow(room2, "u_s1").role === "gone", "the double's row actually moved to 'gone' (no hard delete)");
      t.ok(D.events.some((e) => e.room_id === room2 && e.type === "pass" &&
        e.payload?.target_user === "u_s1" && e.payload?.actor === "self" &&
        e.payload?.source === "step_down" && e.payload?.was_spotlight === true),
        "event type 'pass', payload carries target_user/actor:self/source:step_down/was_spotlight:true");

      const r2 = D.rpc("direct_s2", "step_down", { room_id: room2 });
      t.ok(r2 && r2.passed === false && r2.role === "spectator",
        `a non-spotlit chair stepping down is NOT a pass — {passed:false, role:'spectator'} (got ${JSON.stringify(r2)})`);
      t.ok(D.memberRow(room2, "u_s2").role === "spectator", "the double's row moved to 'spectator' (no hard delete)");
      t.ok(D.events.some((e) => e.room_id === room2 && e.type === "stepdown" &&
        e.payload?.target_user === "u_s2" && e.payload?.actor === "self" &&
        e.payload?.source === "step_down" && e.payload?.was_spotlight === false),
        "event type 'stepdown' for the non-pass case, same payload shape minus was_spotlight");

      const rpcAfter = D.rpcLog.slice(beforePassed);
      t.ok(rpcAfter.filter((c) => c.name === "decide_pass" || c.name === "pass_member").length === 0,
        "step_down never touches decide_pass or pass_member — no accidental coupling (per the standing instruction)");

      const errs = [host].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
