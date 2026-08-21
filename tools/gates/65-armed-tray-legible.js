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
  name: "armed-tray-legible",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      D.addUser({ id: "u_c1", name: "Chair One" });
      D.addUser({ id: "u_c2", name: "Chair Two" });
      D.addUser({ id: "u_b1", name: "Bench One" });
      const host = await h.newClient("host");
      host.login(hostU);
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const roomId = D.addRoom({ id: "r_at1", host_id: hostU, name: "AT1", phase: "deciding", round: 2 });
      D.addMember(roomId, "u_c1", "chair", { seat_index: 0 });
      D.addMember(roomId, "u_c2", "chair", { seat_index: 1 });
      D.addMember(roomId, "u_b1", "line");
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomId) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() =>
        document.getElementById("eg_decide").style.display !== "none"), 8000, "decide card up, unarmed");
      await host.page.evaluate(() => document.getElementById("eg_dkeep").click());
      const visibleRightAfterArm = await host.page.evaluate(() =>
        document.getElementById("eg_decide").style.display !== "none");
      t.ok(visibleRightAfterArm, "tray stays visible immediately after arm click");
      await host.page.evaluate(() => window.__lc.egRefreshRoom());
      const visibleAfterRefresh = await waitFor(() => host.page.evaluate(() =>
        document.getElementById("eg_decide").style.display !== "none"), 5000,
        "tray still visible after re-render while armed");
      t.ok(visibleAfterRefresh, "tray survives a re-render while armed");
      const options = await host.page.evaluate(() => ({
        keep: (document.getElementById("eg_dkeep").textContent || "").trim(),
        pass: (document.getElementById("eg_dpass").textContent || "").trim(),
        clear: (document.getElementById("eg_dclear").textContent || "").trim(),
      }));
      t.ok(!!options.keep, "KEEP ONE option present and non-empty");
      t.ok(!!options.pass, "PASS ONE option present and non-empty");
      t.ok(!!options.clear, "CLEAR THE DECK option present and non-empty");
    } finally {
      await h.close();
    }
  },
};
