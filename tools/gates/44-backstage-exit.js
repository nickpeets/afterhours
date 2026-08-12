/* GATE 44 — backstage-exit: leaving the winner's room leaves it CLEAN, and the
 * other side is told.  Ships with fix/backstage-exit.
 *
 * THE BUG.  exitBackstage() tore down the CALL and never the SURFACE:
 *
 *     try{ if(BS_DAILY){ await BS_DAILY.leave(); await BS_DAILY.destroy(); } }catch(e){}
 *     BS_DAILY=null; BS_ROOM=null; BS_WINNER_UID=null;
 *
 * bsTrack() mounts each <video> straight into bs_tile_host / bs_tile_winner,
 * and the ONLY code anywhere that removes them is bsSyncPresence()'s !here
 * branch — which exitBackstage never calls, and which early-returns on
 * !BS_ROOM anyway, so by the third line above the cleanup is unreachable.  He
 * walked out and left a live self-view mounted behind a hidden panel.
 *
 * Three things this gate holds, exactly as the live findings named them:
 *   1. his own tiles are EMPTIED on the way out — no stale <video>, no live
 *      srcObject left behind on a detached or hidden element
 *   2. the room is left in its WAITING state, so the next entry does not open
 *      on last night's frames
 *   3. the HOST hears about the departure — the backstage_left event used to
 *      be fenced behind BSD_PHASE==="deciding", so a departure during the live
 *      call arrived and was dropped, and she sat watching a frozen tile until
 *      her own clock ran out
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

async function tap(c, sel) {
  const b = await c.page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!b) throw new Error("tap target missing: " + sel);
  await c.page.touchscreen.tap(b.x, b.y);
}

async function keepByTouch(host, targetUid) {
  await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 10000, "decide card");
  await tap(host, "#eg_dkeep");
  await host.page.waitForTimeout(180);
  await tap(host, `#rt_chairs [data-heartuid="${targetUid}"]`);
  await waitFor(() => host.page.evaluate(() => !!document.querySelector("#room .lc-beat--kept")), 8000, "the kept beat");
}

/* what the backstage surface is actually holding, live-track aware */
const SURFACE = () => ({
  videos: document.querySelectorAll("#backstage video").length,
  liveSrc: [...document.querySelectorAll("#backstage video")].filter((v) => {
    try { return !!(v.srcObject && v.srcObject.getTracks && v.srcObject.getTracks().some((t) => t.readyState === "live")); }
    catch (e) { return false; }
  }).length,
  hostWaiting: document.getElementById("bs_tile_host").classList.contains("bs-tile--waiting"),
  winnerWaiting: document.getElementById("bs_tile_winner").classList.contains("bs-tile--waiting"),
  hostWaitShown: getComputedStyle(document.getElementById("bs_wait_host")).display !== "none",
  winnerWaitShown: getComputedStyle(document.getElementById("bs_wait_winner")).display !== "none",
  winnerTileVideos: document.getElementById("bs_tile_winner").querySelectorAll("video").length,
});

module.exports = {
  name: "backstage-exit",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@exit.test" });
      ["u_s1", "u_s2"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (n, u) => {
        const c = await h.newClient(n, { isMobile: true, hasTouch: true });
        c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };

      const host = await boot("host", hostU);
      const winner = await boot("winner", "u_s1");
      const room = D.addRoom({ id: "r_exit", host_id: hostU, name: "Jack's Room", phase: "deciding", round: 3 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 120000);
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      for (const c of [host, winner]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }

      await keepByTouch(host, "u_s1");
      await waitFor(() => D.rooms.get(room).status === "ended" && D.rooms.get(room).winner_id === "u_s1", 8000, "show ended");

      /* ---- both parties backstage, both tiles live on both sides ---- */
      await tap(host, "#room .lc-beat__cta");
      await waitFor(() => host.page.evaluate(() => document.getElementById("backstage").classList.contains("show")), 10000, "host backstage");
      await waitFor(() => winner.page.evaluate(() => !!document.getElementById("fin_backstage")), 25000, "the winner's card");
      await tap(winner, "#fin_backstage");
      await waitFor(() => winner.page.evaluate(() => document.getElementById("backstage").classList.contains("show")), 10000, "winner backstage");

      await host.page.evaluate(() => window.__dailyControl.addRemote("u_s1"));
      await winner.page.evaluate(() => window.__dailyControl.addRemote("u_host"));
      await waitFor(() => winner.page.evaluate(() => window.__lc.BS_STATE.clockOn), 8000, "the winner's clock — both in the call");
      await waitFor(() => host.page.evaluate(() => window.__lc.BS_STATE.clockOn), 8000, "the host's clock — both in the call");

      /* WAIT FOR THE SECOND TILE, do not assume it.  `clockOn` flips as soon as
         both parties are in the call, but mounting the remote <video> is a
         separate async hop — so sampling the surface the instant the clock
         starts is a race.  It passed in isolation and failed once under full
         battery load at 45 gates (videos=1, live srcObject=1), which is the
         worst kind of red: it points at the app and means the harness.
         A flaky sanity check is more corrosive than a missing one, because it
         teaches you to discount reds. */
      await waitFor(() => winner.page.evaluate(() => document.querySelectorAll("#backstage video").length >= 2),
        8000, "both tiles mounted on his side");
      const before = await winner.page.evaluate(SURFACE);
      t.ok(before.videos === 2 && before.liveSrc === 2,
        `fixture sanity: his room is genuinely live before he goes (videos=${before.videos}, live srcObject=${before.liveSrc})`);
      t.ok(!before.hostWaiting && !before.winnerWaiting, "fixture sanity: neither tile is in a waiting state while both are here");

      /* ================= he leaves ================= */
      await tap(winner, "#bs_leave");
      await waitFor(() => winner.page.evaluate(() => !document.getElementById("backstage").classList.contains("show")), 8000, "backstage closes for him");
      await winner.page.waitForTimeout(600);   // let any async teardown settle

      const after = await winner.page.evaluate(SURFACE);

      /* --- 1. his own tiles are EMPTIED on the way out --- */
      t.ok(after.videos === 0,
        `no stale <video> survives his exit (videos=${after.videos}, was ${before.videos})`);
      t.ok(after.liveSrc === 0,
        `no live srcObject is left mounted behind the hidden panel (live srcObject=${after.liveSrc}, was ${before.liveSrc})`);

      /* --- 2. the room is left in its waiting state --- */
      t.ok(after.hostWaiting && after.winnerWaiting,
        `both tiles are returned to their waiting state (host=${after.hostWaiting}, winner=${after.winnerWaiting})`);
      t.ok(after.hostWaitShown && after.winnerWaitShown,
        "both labeled waiting frames are showing again — the next entry cannot open on last night's frames");

      /* --- 3. the host hears about the departure --- */
      await waitFor(() => host.page.evaluate(() => window.__lc.BS_STATE.winnerWaiting), 8000,
        "the HOST to be told he left (his tile back to a waiting state)");
      const sheSurface = await host.page.evaluate(SURFACE);
      const she = Object.assign({}, sheSurface, await host.page.evaluate(() => ({
        toast: document.getElementById("toast").textContent || "",
        toastShown: document.getElementById("toast").classList.contains("show"),
        waitText: document.getElementById("bs_wait_winner").textContent || "",
      })));
      t.ok(she.winnerTileVideos === 0,
        `his frozen frame is gone from HER surface too (videos in his tile=${she.winnerTileVideos})`);
      t.ok(she.toastShown && /slipped out|left/i.test(she.toast),
        `she is TOLD, in show language, rather than left waiting on a ghost (toast: ${JSON.stringify(she.toast)})`);
      t.ok(/waiting for/.test(she.waitText),
        `his tile carries a labeled waiting frame again ("${she.waitText}")`);
      /* SUPERSEDED by the wave 9 ruling, and left here as a record of why.
         This gate used to assert "…and SHE is still backstage — his exit closes
         his room, never hers".  That was written when the fix only unfenced the
         TELLING.  The live run at b0811.2124 showed the consequence: she stayed
         backstage all right, and her three-minute clock kept running against an
         empty room.  The owner ruled that an empty winner's room must not run a
         countdown, so his departure now ends the night for both — see gate 45,
         which owns the clock half.  Here we assert only that the goodnight beat
         is what took her out, never a silent disappearance. */
      const outcome = await host.page.evaluate(() => ({
        stillBackstage: document.getElementById("backstage").classList.contains("show"),
        toast: document.getElementById("toast").textContent || "",
      }));
      t.ok(!outcome.stillBackstage && /goodnight/i.test(outcome.toast),
        `his exit ends the night with the goodnight beat, not silently (backstage=${outcome.stillBackstage}, toast=${JSON.stringify(outcome.toast)})`);

      const errs = [host, winner].flatMap((cl) => cl.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors in both windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
