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
  name: "armed-keep-survives",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      D.addUser({ id: "u_c1", name: "Chair One" });
      const host = await h.newClient("host");
      host.login(hostU);
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const roomId = D.addRoom({ id: "r_ak1", host_id: hostU, name: "AK1", phase: "deciding", round: 2 });
      D.addMember(roomId, "u_c1", "chair", { seat_index: 0 });
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomId) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() =>
        document.getElementById("eg_decide").style.display !== "none"), 8000, "decide card up");
      await host.page.evaluate(() => document.getElementById("eg_dkeep").click());
      await host.page.evaluate(() => document.getElementById("room").classList.add("is-asking"));
      const armed = await host.page.evaluate(() =>
        document.getElementById("room").classList.contains("is-asking"));
      t.ok(armed, "fixture sanity: is-asking is set on #room before the tap");
      const beforeRpc = D.rpcLog.length;
      const chipBefore = await host.page.evaluate(() =>
        document.getElementById("eg_target").style.display);
      await host.page.evaluate(() => document.getElementById("rt_seat0").click());
      await waitFor(async () => {
        const chipNow = await host.page.evaluate(() => document.getElementById("eg_target").style.display);
        const rpcNow = D.rpcLog.slice(beforeRpc).some((c) => c.name === "decide_keep");
        return chipNow !== chipBefore || rpcNow;
      }, 5000, "tap to resolve one way or the other");
      const keepCall = D.rpcLog.slice(beforeRpc).find((c) => c.name === "decide_keep");
      const chipOpened = await host.page.evaluate(() =>
        document.getElementById("eg_target").style.display === "inline-flex");
      t.ok(!!keepCall && keepCall.args && keepCall.args.target === "u_c1" && !chipOpened,
        "an armed KEEP tap reaches egDecideTap (decide_keep fires) — not swallowed by is-asking guards");
      const row = D.memberRow(roomId, "u_c1");
      t.ok(row && row.role === "kept", "tapped chair role is 'kept' after armed tap");
    } finally {
      await h.close();
    }
  },
};
