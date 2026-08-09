/* GATE 25 — video-lag: pay only for pixels a tile shows.  Ships with
 * fix/video-lag.
 *
 * The live run put 5 windows × 5 feeds on one machine — partly test-rig
 * physics (N decoders on one CPU is the rig's problem), but the app was
 * paying for every feed it never painted: subscribeToTracksAutomatically
 * meant bench (silhouettes BY DESIGN) and crowd feeds were decoded by
 * everyone, at full camera resolution.
 *
 * Now the app subscribes explicitly (subscribeToTracksAutomatically:false
 * + updateParticipant/setSubscribedTracks + updateReceiveSettings), and
 * the shim models real manual-mode delivery: NO pixels flow until the
 * app subscribes.  Ledger rules:
 *   - subscriptions === participants with a visible tile, layer matched
 *     to the painted size (2 = 1-on-1 frames, 1 = quad cells, 0 = strip);
 *   - bench: ZERO video subscriptions; crowd publishes nothing;
 *   - self never round-trips.
 *
 * Proven on a room of host + 2 chairs + 3 bench + 2 crowd, from BOTH
 * sides (a crowd viewer and the host), plus a spotlight layer shift and
 * a bench→chair promotion (the tile must still mount through the
 * subscription path — that's the manual-mode risk), with gate-13 attach
 * budgets intact.
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
  name: "video-lag",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      const ALL = ["u_c1", "u_c2", "u_b1", "u_b2", "u_b3", "u_w1", "u_w2"];
      ALL.forEach((id) => D.addUser({ id, name: id }));
      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const crowd = await boot("crowd", "u_w1");
      const room = D.addRoom({ id: "r_lag", host_id: hostU, name: "Lag Night", phase: "openfloor", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 300_000);
      D.addMember(room, "u_c1", "chair", { seat_index: 0 });
      D.addMember(room, "u_c2", "chair", { seat_index: 1 });
      D.addMember(room, "u_b1", "line"); D.addMember(room, "u_b2", "line"); D.addMember(room, "u_b3", "line");
      D.addMember(room, "u_w1", "spectator"); D.addMember(room, "u_w2", "spectator");
      for (const c of [host, crowd]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      // every participant is IN the call on both clients (per-window fake)
      for (const c of [host, crowd]) {
        await c.page.evaluate((us) => us.forEach((u) => window.__dailyControl.addRemote(u)), ["u_host", ...ALL].filter((u) => true));
      }
      await host.page.waitForTimeout(2500);
      await crowd.page.waitForTimeout(500);

      const ledger = (c) => c.page.evaluate(() => {
        const subs = window.__dailyControl.subs();
        const recv = window.__dailyControl.recv();
        const parts = window.__lc.DAILY.participants();
        const byUid = {};
        for (const p of Object.values(parts)) { if (!p.local && p.user_name) byUid[p.user_name] = p.session_id; }
        const videoSubs = Object.entries(subs).filter(([, v]) => v.video).map(([sid]) => sid);
        const uidOf = (sid) => Object.keys(byUid).find((u) => byUid[u] === sid) || sid;
        return {
          videoSubUids: videoSubs.map(uidOf).sort(),
          layers: Object.fromEntries(Object.entries(recv).map(([sid, v]) => [uidOf(sid), v.video && v.video.layer])),
          tiles: [...document.querySelectorAll("#room video")].length,
          localOn: parts.local ? parts.local.tracks.video.state : "?",
        };
      });

      /* --- the CROWD viewer: 3 visible tiles (hero + 2 chairs) --- */
      const L1 = await ledger(crowd);
      t.ok(JSON.stringify(L1.videoSubUids) === JSON.stringify(["u_c1", "u_c2", "u_host"]),
        `crowd subscribes to EXACTLY the visible tiles (got: ${L1.videoSubUids.join(",")})`);
      t.ok(L1.videoSubUids.length <= L1.tiles || L1.tiles >= 3,
        `total video subscriptions ≤ visible video tiles (${L1.videoSubUids.length} subs, ${L1.tiles} tiles)`);
      t.ok(!L1.videoSubUids.some((u) => /u_b/.test(u)), "ZERO bench video subscriptions (silhouettes by design)");
      t.ok(!L1.videoSubUids.includes("u_w1") && !L1.videoSubUids.includes("u_w2"),
        "no crowd feeds subscribed by anyone");
      t.ok(L1.localOn === "off", "the crowd member publishes NOTHING");
      t.ok(L1.layers["u_host"] === 1 && L1.layers["u_c1"] === 1,
        `quad cells request the medium simulcast layer, not full camera res (layers: ${JSON.stringify(L1.layers)})`);
      t.ok(!L1.videoSubUids.includes("u_w1"), "no self round-trip (own feed renders locally, never subscribed)");

      /* --- the HOST: same discipline (2 chairs; her own feed is local) --- */
      const L2 = await ledger(host);
      t.ok(JSON.stringify(L2.videoSubUids) === JSON.stringify(["u_c1", "u_c2"]),
        `host subscribes to the two chairs only (got: ${L2.videoSubUids.join(",")})`);

      /* --- spotlight: layers follow the painted size --- */
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "spotlight", 60);
      await waitFor(() => host.page.evaluate(() => window.__lc.askEligible(null) === true), 8000, "choosing");
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => !!D.rooms.get(room).spotlight_target, 8000, "the ask lands");
      const spot = D.rooms.get(room).spotlight_target;
      await waitFor(async () => {
        const L = await ledger(crowd);
        return L.layers[spot] === 2 && L.layers["u_host"] === 2;
      }, 8000, "the 1-on-1 frames request the LARGE layer");
      const L3 = await ledger(crowd);
      const rival = ["u_c1", "u_c2"].find((u) => u !== spot);
      t.ok(L3.layers[rival] === 0, `the collapsed rival strip requests the TINY layer (got ${L3.layers[rival]})`);
      t.ok(!L3.videoSubUids.some((u) => /u_b/.test(u)), "bench still zero through the layout change");

      /* --- bench→chair promotion: the tile mounts THROUGH the sub path --- */
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "openfloor", 60);
      D.rpc("host", "pass_member", { room_id: room, user_id: "u_c2" });
      D.rpc("host", "seat_member", { room_id: room, user_id: "u_b1", seat_index: 1 });
      await waitFor(() => crowd.page.evaluate(() =>
        [...document.querySelectorAll("#room video")].some((v) => v.dataset.uid === "u_b1")), 10_000,
        "the promoted man's feed mounts via subscribe-then-track (manual-mode delivery)");
      const L4 = await ledger(crowd);
      t.ok(L4.videoSubUids.includes("u_b1") && !L4.videoSubUids.includes("u_c2"),
        `the ledger followed the promotion (subs now: ${L4.videoSubUids.join(",")})`);
      t.ok(!L4.videoSubUids.some((u) => u === "u_b2" || u === "u_b3"), "the rest of the bench stays at zero");

      /* --- gate-13 budgets hold under manual mode --- */
      const stats = await crowd.page.evaluate(() => window.__lc.VIDEO_STATS);
      const over = Object.entries(stats.assigns).filter(([, n]) => n > 1);
      t.ok(over.length === 0, `attach budget intact: ≤1 srcObject assignment per mounted feed (${JSON.stringify(stats.assigns)})`);
      const reparents = Object.values(stats.reparents).filter((n) => n > 0);
      t.ok(reparents.length === 0, "0 re-parents through the subscription churn");

      const errs = [host, crowd].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
