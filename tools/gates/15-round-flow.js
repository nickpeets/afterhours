/* GATE 15 — round-flow: the post-pass segue owns its own clock, and PASS is
 * never offered at an empty bench.  Ships with fix/round-flow.
 *
 * The old timeline (findings 4+5): a pass spent the DECIDING section's
 * leftover seconds — beatPassed (1.2s wipe) then silence until the shared
 * resolver advanced at the old deadline.  One timer served two masters.
 *
 * Proven here, through the real UI (eg_dpass → chair tap → egDecideTap →
 * decide_pass RPC) and real __lc references:
 *   - pass with a stocked bench → the pick window opens under its OWN
 *     LC_PASS_PICK_SECS timer as a SHARED phase-deadline extension.
 *   - SEGUE BUDGET: pass-landed → window open and bench seatable within
 *     2000ms.  (Defense of the number: the pacing spec's longest scripted
 *     beat is 2000ms (beatHousePicks); the replacement flow must be live
 *     within one beat of the pass — anything longer is dead air.)
 *   - host tap on a bench lane seats the replacement immediately and the
 *     show advances at once (tap always wins — the PR #5 mechanic).
 *   - pass then NO host action → the window expires and the ordinary
 *     resolver auto-advances to the next round.
 *   - bench 0 at deciding → PASS is absent, KEEP remains.
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200));
  }
};

module.exports = {
  name: "round-flow",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_s3", "u_b1", "u_b2"].forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host");
      host.login(hostU);
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      const mkDecidingRoom = (id, benched, seated = ["u_s1", "u_s2", "u_s3"]) => {
        const room = D.addRoom({ id, host_id: hostU, name: "Decide Night", phase: "deciding", round: 1 });
        D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
        seated.forEach((u, i) => D.addMember(room, u, "chair", { seat_index: i }));
        benched.forEach((u) => D.addMember(room, u, "line"));
        return room;
      };
      const enter = async (roomId) => {
        await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomId) });
        await host.page.waitForSelector("#room.show", { timeout: 10000 });
      };

      /* ================= scenario A: pass with 2 benched ================= */
      const roomA = mkDecidingRoom("r_flowA", ["u_b1", "u_b2"]);
      await enter(roomA);
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 8000,
        "the decide card shows for the host in deciding");
      t.ok(await host.page.evaluate(() => document.getElementById("eg_dpass").style.display !== "none"),
        "bench 2: PASS is offered");

      await host.page.evaluate(() => document.getElementById("eg_dpass").click());
      const tPass = Date.now();
      await host.page.evaluate(() => document.getElementById("rt_seat0").click());   // pass u_s1 — real tap path
      await waitFor(() => (D.memberRow(roomA, "u_s1") || {}).role === "spectator", 8000, "decide_pass lands");
      const tLanded = Date.now();

      // the pick window: open, its own length, as a SHARED deadline extension
      await waitFor(() => host.page.evaluate(() => !!window.__lc.PASS_PICK), 8000, "the bench-pick window opens");
      const tOpen = Date.now();
      const segue = tOpen - tLanded;
      t.ok(segue <= 2000,
        `SEGUE BUDGET: pass-landed → pick window open in ${segue}ms (budget 2000ms — one beat, the spec's longest)`);
      const win = await host.page.evaluate(() => ({ until: window.__lc.PASS_PICK.until, now: Date.now() }));
      const winLen = (win.until - win.now) / 1000;
      t.ok(winLen > 14 && winLen <= 21,
        `the window runs on its OWN generous clock (~${winLen.toFixed(1)}s left of LC_PASS_PICK_SECS=20) — not the deciding dregs`);
      const dl = Date.parse(D.rooms.get(roomA).phase_deadline);
      t.ok(dl - tPass > 14_000,
        `the extension is SHARED (rooms.phase_deadline pushed ${(Math.round((dl - tPass) / 100) / 10)}s out) — every client's resolver holds`);
      t.ok(D.rooms.get(roomA).phase === "deciding", "the show has NOT moved on while she picks");

      // host tap always wins immediately
      await waitFor(() => host.page.evaluate(() => !!document.getElementById("rt_bench0").dataset.benchuid), 8000,
        "bench lanes are live inside the window");
      const tTap = Date.now();
      await host.page.click("#rt_bench0");
      await waitFor(() => D.members.filter((m) => m.room_id === roomA && m.role === "chair").length === 3, 8000,
        "her tap seats the replacement");
      const seatMs = Date.now() - tTap;
      t.ok(seatMs <= 2000, `her tap seats him immediately (${seatMs}ms) — the PR #5 mechanic, mid-round`);
      await waitFor(() => host.page.evaluate(() => !window.__lc.PASS_PICK), 8000, "the window closes on her tap");
      await waitFor(() => D.rooms.get(roomA).phase === "spotlight" && (D.rooms.get(roomA).round || 0) === 2, 8000,
        "the show advances the moment the replacement is seated");
      t.ok(true, "tap → seat → next round, no dead air anywhere in the segue");

      /* ============ scenario B: pass, then no host action ============ */
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });
      const roomB = mkDecidingRoom("r_flowB", ["u_b2"]);
      await enter(roomB);
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 8000,
        "decide card up (scenario B)");
      await host.page.evaluate(() => document.getElementById("eg_dpass").click());
      await host.page.evaluate(() => document.getElementById("rt_seat0").click());   // pass u_s1 again
      await waitFor(() => (D.memberRow(roomB, "u_s1") || {}).role === "spectator", 8000, "pass lands (B)");
      await waitFor(() => host.page.evaluate(() => !!window.__lc.PASS_PICK), 8000, "window opens (B)");
      // no action: the extended deadline expires and the ordinary resolver advances
      await waitFor(() => D.rooms.get(roomB).phase === "spotlight" && (D.rooms.get(roomB).round || 0) === 2, 26_000,
        "auto-advance after the window expires untouched");
      t.ok(true, "no host action → the window expires and the show auto-advances to the next round");
      t.ok(await host.page.evaluate(() => !window.__lc.PASS_PICK), "the expired window's marker is gone");

      /* ============ scenario C: PASS absent when the bench can't refill ============
         POLICY (SPEC RULING Q3 v2, 8/9): PASS is offered iff bench ≥ 1 —
         full stop.  (The 8/8 seated-≥2 arm was deleted after the live run
         parked a show on a dead recruitment card.)  Any 0-bench room hides
         PASS; gate 19 drives the full predicate matrix. */
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });
      const roomC = mkDecidingRoom("r_flowC", [], ["u_s1"]);
      await enter(roomC);
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 8000,
        "decide card up (scenario C)");
      const cState = await host.page.evaluate(() => ({
        pass: document.getElementById("eg_dpass").style.display,
        keep: getComputedStyle(document.getElementById("eg_dkeep")).display,
      }));
      t.ok(cState.pass === "none", "one seated + empty bench: PASS is absent (Q3 — the show could not continue)");
      t.ok(cState.keep !== "none", "one seated + empty bench: KEEP remains on offer");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
