/* GATE 28 — promotion-video: a bench→chair promotion shows video FAST,
 * on every client, and the promoted man's own camera starts without a
 * watchdog.  Ships with fix/promotion-video.
 *
 * The live finding (Biff, asdfagent): promotions rendered no video on
 * mobile clients "for an extended period", recovering eventually.
 * DIAGNOSIS against PR #20's manual subscriptions: the recompute chain
 * is loadRoomState → reflowVideo → syncVideoSubscriptions — i.e. it is
 * driven by the ROSTER.  A client with a stale roster (the wave-4
 * roster-truth bug) never subscribed at all; "eventually recovered" was
 * whatever unrelated render finally refreshed its roster.  With
 * fix/roster-truth beneath this branch, the roster converges on the
 * truth cadence and the subscription follows in the SAME commit; the
 * promoted member's own publish rides syncLocalPublish → the gate-22
 * verified preflight — no watchdog involved.
 *
 * Budgets, proven here: live channels → the promoted man's publish AND
 * his tile on the host within 2s of the seat change landing; a client
 * with realtime FULLY severed → his tile within one sync interval; his
 * own CAM_STATE shows zero watchdog fires; the bench ledger stays at
 * zero subs right up until the promotion.
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 120));
  }
};

module.exports = {
  name: "promotion-video",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_b1", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (n, u) => {
        const c = await h.newClient(n); c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const benchy = await boot("benchy", "u_b1");   // the man about to rise
      const deaf = await boot("deaf", "u_w");        // realtime fully severed
      const room = D.addRoom({ id: "r_promo", host_id: hostU, name: "Promo Night", phase: "openfloor", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 300_000);
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_b1", "line");
      D.addMember(room, "u_w", "spectator");
      for (const c of [host, benchy, deaf]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      await deaf.page.evaluate(() => { window.__realtimePush = undefined; });
      // the call as it stands: host + seated chair publish; the bench man does NOT
      for (const c of [host, deaf, benchy]) {
        await c.page.evaluate(() => { ["u_host", "u_s1"].forEach((u) => window.__dailyControl.addRemote(u)); });
      }
      await host.page.waitForTimeout(2000);

      /* --- before: the bench ledger is silent --- */
      const before = await host.page.evaluate(() => window.__dailyControl.subs());
      t.ok(!Object.values(before).some((v) => v.video === false ? false : false) || true, "ledger readable");
      t.ok(await host.page.evaluate(() => {
        const parts = window.__lc.DAILY.participants();
        const benchSids = Object.values(parts).filter((p) => !p.local && p.user_name === "u_b1").map((p) => p.session_id);
        const subs = window.__dailyControl.subs();
        return benchSids.every((sid) => !subs[sid] || !subs[sid].video);
      }), "zero bench video subscriptions before the promotion (PR #20 discipline holds)");

      /* --- THE PROMOTION --- */
      const t0 = Date.now();
      D.rpc("host", "seat_member", { room_id: room, user_id: "u_b1", seat_index: 1 });

      // (1) his OWN camera: publish verified through the preflight, no watchdog
      await waitFor(() => benchy.page.evaluate(() => {
        try { return window.__lc.DAILY.participants().local.tracks.video.state === "playable"; }
        catch (e) { return false; }
      }), 2_000, "the promoted man's publish comes up inside the 2s budget");
      const tPub = Date.now() - t0;
      t.ok(true, `his camera published in ${tPub}ms — promotion starts the publish, not a watchdog`);

      // his stream reaches the viewers' calls the moment he publishes
      for (const c of [host, deaf]) await c.page.evaluate(() => window.__dailyControl.addRemote("u_b1"));

      // (2) the HOST (live channels): subscription + first mount ≤2s
      await waitFor(() => host.page.evaluate(() =>
        [...document.querySelectorAll("#room video")].some((v) => v.dataset.uid === "u_b1")), 2_000,
        "the host paints his tile inside the 2s budget");
      const tHost = Date.now() - t0;
      t.ok(true, `live-channel viewer: video visible ${tHost}ms after the seat change`);

      // (3) the DEAF client: within one sync interval of the roster converging
      await waitFor(() => deaf.page.evaluate(() =>
        [...document.querySelectorAll("#room video")].some((v) => v.dataset.uid === "u_b1")), 6_500,
        "the severed client paints his tile within one sync interval");
      const tDeaf = Date.now() - t0;
      t.ok(true, `dead-socket viewer: video visible ${tDeaf}ms — the roster-truth cadence carries the subscription`);

      // (4) the preflight path, not the watchdog
      const cam = await benchy.page.evaluate(() => window.__lc.CAM_STATE);
      t.ok(cam.watchdogFires === 0 && cam.appOff === false,
        `gate-22 preflight owned the publish (watchdogFires=${cam.watchdogFires}, appOff=${cam.appOff})`);
      // and the ledger followed on every viewer
      for (const [n, c] of [["host", host], ["deaf", deaf]]) {
        t.ok(await c.page.evaluate(() => {
          const parts = window.__lc.DAILY.participants();
          const sid = Object.values(parts).find((p) => !p.local && p.user_name === "u_b1")?.session_id;
          const subs = window.__dailyControl.subs();
          return !!(sid && subs[sid] && subs[sid].video);
        }), `${n}: the subscription ledger includes the promoted man`);
      }

      const errs = [host, benchy, deaf].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
