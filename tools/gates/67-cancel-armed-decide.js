/* GATE 67 — cancel-armed-decide: the decide tray never hid on arm (gate 65
 * nailed that down), but until now there was no way OFF an arm short of
 * completing it — tap a chair (keep/pass), or wait out the phase.  A
 * host who taps KEEP ONE and then changes her mind was stuck armed.
 *
 * The fix adds one button, #eg_dcancel, living beside #eg_dwalk inside
 * #eg_decide: hidden while unarmed, shown while EG_DECIDE_MODE is set,
 * and its only handler nulls EG_DECIDE_MODE.  No RPC, no other state —
 * the button's own visibility IS the armed/unarmed signal (advisor's
 * framing, PR2 kickoff).
 *
 * TWO SCENES.  Scene A proves the visibility contract end to end: hidden
 * before arming, visible immediately after arming (eg_dkeep.click()),
 * hidden again immediately after cancel.  Scene B proves cancel is not
 * cosmetic — after cancel, tapping a chair must NOT fire decide_keep;
 * EG_DECIDE_MODE genuinely went back to null, not just the button's
 * display style.
 *
 * RED on main: #eg_dcancel does not exist at all, so every DOM read in
 * scene A returns null and the gate fails outright (not merely a wrong
 * value — the element itself is absent, which is the honest RED here).
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
  name: "cancel-armed-decide",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@cancel.test" });
      D.addUser({ id: "u_c1", name: "Chair One" });
      D.addUser({ id: "u_c2", name: "Chair Two" });
      D.addUser({ id: "u_b1", name: "Bench One" });

      const host = await h.newClient("host");
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      const roomId = D.addRoom({ id: "r_cxl", host_id: hostU, name: "CXL", phase: "deciding", round: 2 });
      D.addMember(roomId, "u_c1", "chair", { seat_index: 0 });
      D.addMember(roomId, "u_c2", "chair", { seat_index: 1 });
      D.addMember(roomId, "u_b1", "line");

      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomId) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() =>
        document.getElementById("eg_decide").style.display !== "none"), 8000, "decide card up, unarmed");

      const cancelDisplay = () => host.page.evaluate(() => {
        const el = document.getElementById("eg_dcancel");
        return el ? el.style.display : "MISSING";
      });

      /* ---------- scene A: visibility follows the arm state ---------- */
      const beforeArm = await cancelDisplay();
      t.ok(beforeArm !== "MISSING", "scope: #eg_dcancel exists in the tray");
      t.ok(beforeArm === "none", `cancel hidden before arming (saw "${beforeArm}")`);

      // arming sets EG_DECIDE_MODE but touches no DOM itself — the tray's
      // display derivation lives in egApply()'s deciding branch, same as
      // gate 65's "survives a re-render while armed" scene forces with an
      // explicit egRefreshRoom() call rather than waiting on a poll tick.
      await host.page.evaluate(() => { document.getElementById("eg_dkeep").click(); window.__lc.egApply(); });
      const afterArm = await cancelDisplay();
      t.ok(afterArm !== "none", `cancel visible after arm click + re-render (saw "${afterArm}")`);

      await host.page.evaluate(() => { document.getElementById("eg_dcancel").click(); window.__lc.egApply(); });
      const afterCancel = await cancelDisplay();
      t.ok(afterCancel === "none", `cancel hidden again after cancel click + re-render (saw "${afterCancel}")`);

      const trayStillUp = await host.page.evaluate(() =>
        document.getElementById("eg_decide").style.display !== "none");
      t.ok(trayStillUp, "the tray itself stays up after cancel — cancel un-arms, it doesn't dismiss the card");

      /* ---------- scene B: cancel is functional, not cosmetic ---------- */
      const keepsBeforeTap = D.rpcLog.filter((r) => r.name === "decide_keep").length;
      await host.page.evaluate(() => document.querySelector('#rt_chairs [data-heartuid="u_c1"]').click());
      await new Promise((r) => setTimeout(r, 400));
      const keepsAfterTap = D.rpcLog.filter((r) => r.name === "decide_keep").length;
      t.ok(keepsAfterTap === keepsBeforeTap,
        `tapping a chair after cancel fires no decide_keep — EG_DECIDE_MODE genuinely nulled (saw ${keepsAfterTap - keepsBeforeTap} new calls)`);

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally {
      await h.close();
    }
  },
};
