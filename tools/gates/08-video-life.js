/* GATE 8 — video-life: join / seat / unseat / leave.
 * No orphaned streams, no tile left holding a dead track.  Runs on the
 * host's window with real MediaStreams (fake camera for local, canvas
 * capture for remotes) against the shipped attach/reflow code.
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

const snapshot = (page) => page.evaluate(() => {
  const vids = [...document.querySelectorAll("#room video")].map((v) => {
    const tr = v.srcObject && v.srcObject.getVideoTracks ? v.srcObject.getVideoTracks()[0] : null;
    return {
      uid: v.dataset.uid || null,
      cell: (v.closest("[id^=rt_seat]") || v.closest("#rt_hero") || { id: "elsewhere" }).id,
      trackState: tr ? tr.readyState : "none",
    };
  });
  const tiles = Object.entries(window.__lc.VIDEO_TILES).map(([sid, t]) => ({ sid, uid: t.uid, inDom: document.contains(t.el) }));
  return { vids, tiles, audio: Object.keys(window.__lc.AUDIO_ELS).length };
});

module.exports = {
  name: "video-life",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      const others = ["u_a", "u_b", "u_c"].map((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host");
      host.login(hostU);
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      // seed after boot (host crash-recovery ends pre-owned live rooms)
      const room = D.addRoom({ id: "r_vl", host_id: hostU, name: "Video Night", phase: "spotlight" });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 120_000);
      others.forEach((u, i) => D.addMember(room, u, i < 2 ? "chair" : "line", { seat_index: i < 2 ? i : null }));
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });

      /* JOIN: local publishes to hero; two seated remotes attach to seats */
      await waitFor(() => host.page.evaluate(() => document.querySelectorAll("#rt_hero video").length === 1), 10000, "local feed in hero");
      t.ok(true, "host's local feed attaches to the hero");
      await host.page.evaluate((uids) => uids.forEach((u) => window.__dailyControl.addRemote(u)), ["u_a", "u_b", "u_c"]);
      await waitFor(() => host.page.evaluate(() => document.querySelectorAll("[id^=rt_seat] video").length === 2), 10000, "two seated feeds attach");
      let s = await snapshot(host.page);
      t.ok(s.vids.filter((v) => v.cell.startsWith("rt_seat")).length === 2, "seated members' feeds land in their seats");
      t.ok(!s.vids.some((v) => v.uid === "u_c"), "a bench member's feed is NOT mounted (no tile for the line)");
      t.ok(s.vids.every((v) => v.trackState === "live"), "every mounted video holds a live track: " + JSON.stringify(s.vids));
      t.ok(s.tiles.every((x) => x.inDom), "every VIDEO_TILES entry is attached to the document");

      /* SEAT: the bench member u_c takes seat 2 → feed must appear */
      D.rpc("host", "seat_member", { room_id: room, user_id: "u_c", seat_index: 2 });
      await waitFor(() => host.page.evaluate(() => document.querySelectorAll("[id^=rt_seat] video").length === 3), 10000, "seated bench feed attaches");
      t.ok(true, "seating a bench member attaches his feed to the new seat");

      /* UNSEAT: pass u_a → roster removes him; reflow's 6s disagreement rule
         must sweep his feed (and not anyone else's) */
      await host.page.evaluate((uid) => window.__lc.hostPass(uid), "u_a");
      await waitFor(() => host.page.evaluate(() => document.querySelectorAll("[id^=rt_seat] video").length === 2), 12000, "unseated feed swept");
      s = await snapshot(host.page);
      t.ok(!s.vids.some((v) => v.uid === "u_a"), "the passed man's feed is gone after the disagreement window");
      t.ok(s.vids.filter((v) => v.cell.startsWith("rt_seat")).length === 2, "the other two seated feeds survive the sweep");

      /* PARTICIPANT LEAVES the call: tile must go immediately */
      await host.page.evaluate(() => window.__dailyControl.removeRemote("u_b"));
      await waitFor(() => host.page.evaluate(() => ![...document.querySelectorAll("#room video")].some((v) => v.dataset.uid === "u_b")), 8000, "left participant's tile removed");
      t.ok(true, "participant-left tears the tile down immediately");
      s = await snapshot(host.page);
      t.ok(s.vids.every((v) => v.trackState === "live"), "no tile holds a dead track after churn: " + JSON.stringify(s.vids));
      t.ok(s.tiles.every((x) => x.inDom), "no orphaned VIDEO_TILES entries after churn — dangling: " +
        JSON.stringify(s.tiles.filter((x) => !x.inDom)));

      /* LEAVE: videoLeave clears every stream, tile and audio element */
      await host.page.evaluate(() => window.__lc.videoLeave());
      s = await snapshot(host.page);
      t.ok(s.vids.length === 0, "videoLeave removes every mounted video (left: " + s.vids.length + ")");
      t.ok(s.tiles.length === 0, "videoLeave empties VIDEO_TILES");
      t.ok(s.audio === 0, "videoLeave empties AUDIO_ELS");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
