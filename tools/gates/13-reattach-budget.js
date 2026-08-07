/* GATE 13 — reattach-budget: a full simulated episode with real
 * MediaStreams, scored against the attach budget.  Ships with
 * fix/video-attach-idempotent.
 *
 * The budget (per participant, whole episode):
 *   - srcObject assignments ≤ 1 + (genuine stream changes).  This episode
 *     contains ZERO genuine stream changes (every track keeps its id), so
 *     the budget is exactly 1 — the initial mount.
 *   - <video> creations === distinct mounted participants (one persistent
 *     element per participant; a re-render or roster blip never recreates).
 *   - re-parents === 0 episode-wide (Safari restarts playback on a move).
 * Plus the sweep's contract: it fires on roster CHANGE only (a reflow storm
 * with an unchanged participant→tile map must not run it), and when it takes
 * a tile down the VIDEO_TILES entry goes with it — no orphans, no dangling
 * live srcObject.
 *
 * Counters are the app's own (__lc.VIDEO_STATS — instrumentation in
 * index.html); every transition is driven through the real code.
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
  name: "reattach-budget",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      const uids = ["u_a", "u_b", "u_c", "u_d", "u_e"];
      uids.forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host");
      host.login(hostU);
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const room = D.addRoom({ id: "r_budget", host_id: hostU, name: "Budget Night", phase: "spotlight" });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 300000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      D.addMember(room, "u_b", "chair", { seat_index: 1 });
      D.addMember(room, "u_c", "line");
      D.addMember(room, "u_d", "spectator");
      D.addMember(room, "u_e", "spectator");
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await host.page.evaluate((us) => us.forEach((u) => window.__dailyControl.addRemote(u)), uids);
      await waitFor(() => host.page.evaluate(() => document.querySelectorAll("#room video").length === 3), 10000,
        "initial mounts (hero + two chairs)");

      const beat = (ms) => host.page.waitForTimeout(ms);
      const seatVids = () => host.page.evaluate(() => document.querySelectorAll("[id^=rt_seat] video").length);

      /* --- the episode: seat / unseat / handover / keep / leave churn --- */
      D.rpc("host", "seat_member", { room_id: room, user_id: "u_c", seat_index: 2 });
      await waitFor(async () => (await seatVids()) === 3, 10000, "u_c's feed mounts on seating");
      D.rpc("host", "pass_member", { room_id: room, user_id: "u_a" });         // unseat; stays in call
      await beat(2500);
      D.memberRow(room, "u_d").role = "line";
      D.emit("room_members", "UPDATE", { ...D.memberRow(room, "u_d") });
      await beat(1000);
      D.rpc("host", "seat_member", { room_id: room, user_id: "u_d", seat_index: 0 });  // handover into u_a's old seat
      await waitFor(() => host.page.evaluate(() =>
        [...document.querySelectorAll("#rt_seat0 video")].some((v) => v.dataset.uid === "u_d")), 10000,
        "u_d's feed lands in the handed-over seat");
      D.rpc("host", "keep_member", { room_id: room, user_id: "u_b" });
      await beat(2500);
      D.memberRow(room, "u_e").role = "line";
      D.emit("room_members", "UPDATE", { ...D.memberRow(room, "u_e") });
      await beat(1000);
      D.rpc("host", "pass_member", { room_id: room, user_id: "u_d" });         // second unseat
      await beat(2500);
      D.rpc("host", "seat_member", { room_id: room, user_id: "u_e", seat_index: 0 });  // second handover
      await waitFor(() => host.page.evaluate(() =>
        [...document.querySelectorAll("#rt_seat0 video")].some((v) => v.dataset.uid === "u_e")), 10000,
        "u_e's feed lands after the second handover");
      await host.page.evaluate(() => window.__dailyControl.removeRemote("u_d"));  // and one clean leave
      await beat(8000);   // let every pending 6s disagreement window expire

      /* --- the budget --- */
      const out = await host.page.evaluate(() => {
        const s = window.__lc.VIDEO_STATS;
        const tiles = Object.entries(window.__lc.VIDEO_TILES).map(([sid, x]) => ({ sid, uid: x.uid, inDom: document.contains(x.el) }));
        const vids = [...document.querySelectorAll("#room video")].map((v) => ({
          uid: v.dataset.uid,
          tr: v.srcObject && v.srcObject.getVideoTracks()[0] ? v.srcObject.getVideoTracks()[0].readyState : "none",
        }));
        return { assigns: s.assigns, creates: s.creates, reparents: s.reparents, sweeps: s.sweeps, tiles, vids };
      });
      const table = () => ["u_host", ...uids].map((u) =>
        `${u}: assignments=${out.assigns[u] || 0} creations=${out.creates[u] || 0} re-parents=${out.reparents[u] || 0}`).join(" · ");

      const mounted = ["u_host", ...uids].filter((u) => (out.creates[u] || 0) > 0);
      t.ok(mounted.length === 6, `every participant mounted exactly once over the episode (mounted: ${mounted.length}/6 — ${table()})`);
      const overAssigned = mounted.filter((u) => (out.assigns[u] || 0) > 1);
      t.ok(overAssigned.length === 0,
        `srcObject assignments ≤ 1 per participant (zero genuine stream changes this episode) — ${table()}`);
      const overCreated = mounted.filter((u) => (out.creates[u] || 0) > 1);
      t.ok(overCreated.length === 0,
        `<video> creations === distinct participants — one persistent element each — ${table()}`);
      const reparented = Object.keys(out.reparents).filter((u) => out.reparents[u] > 0);
      t.ok(reparented.length === 0, `0 re-parents episode-wide — ${table()}`);

      /* --- no orphans after all that churn --- */
      t.ok(out.tiles.every((x) => x.inDom),
        "no dangling VIDEO_TILES entry after churn — " + JSON.stringify(out.tiles.filter((x) => !x.inDom)));
      t.ok(out.vids.every((v) => v.tr === "live"),
        "every mounted video still holds a live track: " + JSON.stringify(out.vids));

      /* --- the sweep fires on roster CHANGE only --- */
      const sweepsBefore = out.sweeps;
      await host.page.evaluate(() => { for (let i = 0; i < 5; i++) window.__lc.reflowVideo(); });
      const sweepsAfter = await host.page.evaluate(() => window.__lc.VIDEO_STATS.sweeps);
      t.ok(sweepsAfter === sweepsBefore,
        `a reflow storm with an unchanged participant→tile map never runs the sweep (${sweepsBefore} → ${sweepsAfter})`);

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
