/* GATE 24 — winners-room-mobile: the winner REACHES the winner's room on
 * a mobile client (touch + mobile emulation), and every role lands in
 * its correct post-show state.  Ships with fix/winners-room-mobile.
 *
 * The live break ("winner's room unreachable on iOS") reproduced as the
 * event-truth disease: the winner was never TOLD the show ended, so he
 * never saw the card that holds the Go Backstage CTA.  fix/event-truth
 * (stacked beneath this branch) is the cure; this gate reproduces the
 * exact journey on a REAL mobile emulation profile (isMobile, hasTouch,
 * 390×844, touchscreen taps — no mouse events) and pins it green:
 *   - show ends via the host's real board UI,
 *   - the mobile WINNER gets the snap ceremony → the winner card,
 *   - the Go Backstage CTA is INSIDE the viewport (no overflow trap) and
 *     a TOUCH tap — not a click — carries him into the winner's room,
 *   - the host's card offers backstage; a crowd member gets the plain
 *     winner card and Back to lobby returns them to the lobby.
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
  name: "winners-room-mobile",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const host = await h.newClient("host");
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      // THE MOBILE WINNER: real mobile emulation — touch, no mouse
      const winner = await h.newClient("winner", { isMobile: true, hasTouch: true });
      winner.login("u_s1"); await winner.goto();
      await winner.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const crowd = await h.newClient("crowd");
      crowd.login("u_w"); await crowd.goto();
      await crowd.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      const room = D.addRoom({ id: "r_mob", host_id: hostU, name: "Mobile Night", phase: "deciding", round: 3 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 120_000);
      D.addMember(room, "u_s1", "kept", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      D.addMember(room, "u_w", "spectator");
      for (const c of [host, winner, crowd]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      await winner.page.waitForTimeout(1200);   // his camera publishes (kept)

      /* --- the host ends the show through the real board --- */
      await host.page.evaluate(() => document.getElementById("rt_endshow").click());
      await waitFor(() => host.page.evaluate(() => !!document.querySelector("#fin_board .finalist")), 8000, "the board");
      await host.page.evaluate(() => document.querySelector("#fin_board .finalist").click());
      await waitFor(() => host.page.evaluate(() => !!document.getElementById("fin_confirm")), 8000, "confirm");
      await host.page.evaluate(() => document.getElementById("fin_confirm").click());
      await waitFor(() => D.rooms.get(room).status === "ended" && D.rooms.get(room).winner_id === "u_s1", 8000, "ended");

      /* --- the mobile winner is TOLD, then TAPS his way backstage --- */
      await waitFor(() => winner.page.evaluate(() =>
        document.getElementById("snap").classList.contains("show") ||
        document.getElementById("finale").classList.contains("show")), 10_000,
        "the winner's screen transitions (ceremony or card)");
      t.ok(true, "the mobile winner is TOLD the show ended (the live-run break)");
      await waitFor(() => winner.page.evaluate(() => !!document.getElementById("fin_backstage")), 25_000,
        "the winner card with the Go Backstage CTA (after the snap ceremony)");
      const box = await winner.page.evaluate(() => {
        const b = document.getElementById("fin_backstage");
        const r = b.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2,
                 inView: r.top >= 0 && r.bottom <= window.innerHeight && r.width >= 44 && r.height >= 40 };
      });
      t.ok(box.inView, `the CTA sits INSIDE the mobile viewport with a real tap target (no overflow trap)`);
      await winner.page.touchscreen.tap(box.x, box.y);   // TOUCH, not click
      await waitFor(() => winner.page.evaluate(() =>
        document.getElementById("backstage").classList.contains("show")), 12_000,
        "the tap carries him INTO the winner's room");
      t.ok(true, "the winner's room is reachable by TOUCH on the mobile profile");

      /* --- the other roles' post-show states --- */
      await waitFor(() => host.page.evaluate(() => {
        const f = document.getElementById("finale");
        return f.classList.contains("show") && !!document.getElementById("fin_backstage");
      }), 12_000, "the host's card offers Go Backstage");
      t.ok(true, "host post-show state correct (winner card + backstage invitation)");
      await waitFor(() => crowd.page.evaluate(() => {
        const f = document.getElementById("finale");
        return f.classList.contains("show") && /IT'S/i.test(f.textContent) && !!document.getElementById("fin_done");
      }), 25_000, "the crowd's winner card with Back to lobby");
      await crowd.page.evaluate(() => document.getElementById("fin_done").click());
      await waitFor(() => crowd.page.evaluate(() =>
        getComputedStyle(document.getElementById("lobby")).display !== "none"), 10_000,
        "Back to lobby returns the crowd to the lobby");
      t.ok(true, "crowd post-show state correct");

      const errs = [host, winner, crowd].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
