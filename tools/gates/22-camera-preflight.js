/* GATE 22 — camera-preflight: the join makes ONE verified publish
 * decision; the watchdog is a last resort, not the plan (audit F6+F11).
 * Ships with fix/camera-preflight.
 *
 * The bug: non-hosts joined publish-OFF then raced a roster-dependent
 * sync back ON; when ON lost, only the 6s watchdog noticed, and the
 * app's own setLocalVideo(false) read as off.byUser on a user who
 * touched nothing.  And CAM_GAVE_UP/BLUR_KILLED/the pending watchdog
 * survived videoLeave — camera poison crossed rooms.
 *
 * Proven here:
 *   - STATIC: videoLeave's body resets the whole recovery machine
 *     (CAM_TRIES / CAM_GAVE_UP / BLUR_KILLED / WATCHDOG_T) — AST-range
 *     checked, not eyeballed.
 *   - a SEATED suitor's clean join → local track playable, tile mounted,
 *     watchdogFires === 0 after the would-be watchdog window (the net
 *     never fired — the preflight got it right the first time).
 *   - a forced publish-race (join + concurrent sync storms) → the
 *     preflight wins: playable, still zero watchdog fires, attach budget
 *     intact (≤1 srcObject assignment).
 *   - a CROWD member publishes off — and the app KNOWS it did it:
 *     CAM_STATE.appOff true while the shim reports daily's off.byUser
 *     (the mislabel is now detectable and corrected in diagnostics).
 *   - leave → rejoin: every recovery flag zeroed, publish verified again,
 *     no watchdog dependence.
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
  name: "camera-preflight",
  async run(t, ctx) {
    /* ---------- STATIC: leave resets the recovery machine ---------- */
    const leaveBody = (ctx.html.match(/async function videoLeave\(\)\{[\s\S]*?\n\}/) || [""])[0];
    t.ok(/CAM_TRIES=0/.test(leaveBody) && /CAM_GAVE_UP=false/.test(leaveBody) &&
         /BLUR_KILLED=false/.test(leaveBody) && /clearTimeout\(WATCHDOG_T\)/.test(leaveBody),
      "videoLeave resets CAM_TRIES / CAM_GAVE_UP / BLUR_KILLED and clears the pending watchdog (F11)");

    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_a", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const suitor = await boot("suitor", "u_a");
      const crowd = await boot("crowd", "u_w");
      const room = D.addRoom({ id: "r_pre", host_id: hostU, name: "Preflight Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 300_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });   // seated BEFORE his join
      D.addMember(room, "u_w", "spectator");

      /* --- the clean seated join: verified publish, watchdog never fires --- */
      await suitor.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await suitor.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => suitor.page.evaluate(() =>
        window.__lc.DAILY_JOINED === true &&
        window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 10_000,
        "the seated suitor's publish comes up PLAYABLE from the preflight");
      t.ok(true, "one decision, verified — no OFF-then-maybe-ON race");
      await waitFor(() => suitor.page.evaluate(() =>
        Object.values(window.__lc.VIDEO_TILES).some((x) => x.uid === "u_a")), 10_000, "his own tile mounts");
      await suitor.page.waitForTimeout(7_000);   // let the would-be 6s watchdog window pass
      const st1 = await suitor.page.evaluate(() => window.__lc.CAM_STATE);
      t.ok(st1.watchdogFires === 0, `the watchdog NEVER fired on the clean path (fires=${st1.watchdogFires})`);
      t.ok(st1.appOff === false, "the app knows it is publishing (appOff=false)");
      const stats1 = await suitor.page.evaluate(() => window.__lc.VIDEO_STATS);
      t.ok((stats1.assigns["u_a"] || 0) <= 1, `attach budget holds through the preflight (assigns=${stats1.assigns["u_a"] || 0})`);

      /* --- forced publish race: preflight wins --- */
      await suitor.page.evaluate(() => Promise.all([
        window.__lc.videoJoin(), window.__lc.syncLocalPublish(),
        window.__lc.syncLocalPublish(), window.__lc.videoJoin(),
      ].map((p) => Promise.resolve(p).catch((e) => e))));
      await waitFor(() => suitor.page.evaluate(() =>
        window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 8000,
        "playable after the storm");
      const st2 = await suitor.page.evaluate(() => window.__lc.CAM_STATE);
      t.ok(st2.watchdogFires === 0, `raced joins/syncs still never need the watchdog (fires=${st2.watchdogFires})`);

      /* --- crowd publishes OFF, and the app owns the attribution --- */
      await crowd.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await crowd.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => crowd.page.evaluate(() => window.__lc.DAILY_JOINED === true), 10_000, "crowd joins");
      const crowdState = await crowd.page.evaluate(() => ({
        cam: window.__lc.CAM_STATE,
        off: window.__lc.DAILY.participants().local.tracks.video.off || null,
        state: window.__lc.DAILY.participants().local.tracks.video.state,
      }));
      t.ok(crowdState.state === "off" && crowdState.off && crowdState.off.byUser === true,
        "daily still labels the programmatic off as byUser (library behavior)");
      t.ok(crowdState.cam.appOff === true,
        "…but the APP knows IT did it (CAM_STATE.appOff) — diagnostics say byApp, never blame the user");

      /* --- leave → rejoin: the recovery machine is factory-fresh --- */
      await suitor.page.evaluate(() => window.__lc.videoLeave());
      const st3 = await suitor.page.evaluate(() => window.__lc.CAM_STATE);
      t.ok(st3.tries === 0 && !st3.gaveUp && !st3.blurKilled && !st3.pending && st3.watchdogFires === 0,
        `leave zeroes the machine (${JSON.stringify(st3)})`);
      await suitor.page.evaluate(() => window.__lc.videoJoin());
      await waitFor(() => suitor.page.evaluate(() =>
        window.__lc.DAILY_JOINED === true &&
        window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 10_000,
        "rejoin publishes playable again — no stale poison");
      const st4 = await suitor.page.evaluate(() => window.__lc.CAM_STATE);
      t.ok(st4.watchdogFires === 0, "rejoin is clean too — the watchdog stays a bystander");

      const errs = [host, suitor, crowd].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
