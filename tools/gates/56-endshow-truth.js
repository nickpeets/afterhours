/* GATE 56 — endshow-truth: a show that ended must END, or say it couldn't.
 * RED ON PURPOSE against today's build.
 *
 * PROVENANCE, labelled.  Forged 2026-08-13 against the rpc census's
 * strand-risk pair (c)+(d), bundled by the conductor as "the same family: a
 * show that never ends":
 *
 *   (c) the decide handler: decide_keep is READ (its error toasts), but the
 *       end_show that follows the keep is swallowed —
 *           try{ await sb.rpc("end_show",{…,winner_id:uid}); }catch(e){}
 *       A winner is DECIDED (kept role written, the KEPT beat plays, she
 *       walks backstage) while the rooms row stays status='live': spectators
 *       never see the finale, the lobby lists a live show with nobody home.
 *   (d) the sign-out sweep: a host signing out from the lobby ends her live
 *       rooms in a loop whose every result is swallowed — one failure and
 *       she signs out over an ORPHANED LIVE ROOM, told nothing.
 *
 * What this gate holds:
 *   1. (c) the end_show after a keep is RETRIED bounded, and its terminal
 *      failure is LOUD on her screen — the room saying 'live' while the
 *      winner is backstage is never silent;
 *   2. (c) the manual door still works: endShow() with the server answering
 *      closes the night (the recovery the toast points her at);
 *   3. (d) the sign-out sweep reads and retries each end_show, and a
 *      failure is at least NAMED (console + toast) before sign-out proceeds
 *      — sign-out is not blocked (a user can always leave), but the orphan
 *      is no longer silent.  PRODUCT NOTE handed up: whether sign-out
 *      should be HELD until the room closes is the conductor's call; this
 *      gate asserts loudness, not blocking.
 */
"use strict";
const { Harness } = require("../lib/harness");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200)); } };

module.exports = {
  name: "endshow-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@end.test" });
      ["u_s1", "u_s2", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const host = await h.newClient("host"); host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const endShows = () => (D.rpcLog || []).filter((r) => r.clientId === "host" && r.name === "end_show").length;
      const toastOf = () => host.page.evaluate(() => {
        const el = document.getElementById("toast");
        return el ? (el.textContent || "").trim() : "";
      });

      /* ---- scene 1: she keeps one, and the ending refuses to land ---- */
      const rA = D.addRoom({ id: "r_endA", host_id: hostU, name: "A", phase: "deciding", round: 3 });
      D.rooms.get(rA).phase_deadline = null;
      D.addMember(rA, "u_s1", "chair"); D.memberRow(rA, "u_s1").seat_index = 0;
      D.addMember(rA, "u_s2", "chair"); D.memberRow(rA, "u_s2").seat_index = 1;
      for (let k = 0; k < 3; k++) D.pushEvent(rA, "u_w", "heart", { target: "u_s1" });
      D.pushEvent(rA, "u_w", "heart", { target: "u_s2" });
      D.setFault("end_show", "host", { error: "boom: end_show unavailable" });
      await host.page.evaluate(() => { window.__lc.LC_SECTION_SECS.deciding = 4; });
      const e0 = endShows();
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(rA) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      /* the crowd-call keeps the heart leader; the swallowed end_show follows */
      await waitFor(() => D.rpcLog.some((r) => r.name === "decide_keep" && r.args.room_id === rA), 20000,
        "the crowd-call to keep the heart leader");
      await host.page.waitForTimeout(4500);

      t.ok(endShows() - e0 >= 2,
        `(c) the ending is RETRIED, not attempted once under a swallow (end_show attempts: ${endShows() - e0})`);
      t.ok(D.rooms.get(rA).status !== "ended",
        "fixture sanity: the server really did refuse — the room still says live");
      const toast1 = await toastOf();
      t.ok(/couldn'?t|didn'?t|end|close/i.test(toast1) && toast1.length > 0,
        `(c) A DECIDED SHOW THAT WON'T END IS SAID OUT LOUD on her screen — kept beat or not, the room lying 'live' is never silent (toast=${JSON.stringify(toast1)})`);
      t.ok(host.logs.some((l) => /end_show/.test(l.text)),
        "…and the console names the failing call");

      /* ---- scene 2: the manual door closes the night once the server answers ---- */
      D.setFault("end_show", "host", null);
      await host.page.evaluate(() => window.__lc.endShow("u_s1"));
      await waitFor(() => D.rooms.get(rA).status === "ended" && D.rooms.get(rA).winner_id === "u_s1", 8000,
        "the manual end to land");
      t.ok(D.rooms.get(rA).status === "ended",
        "(c) the recovery door works: endShow() with the server answering closes the night");
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });

      /* ---- scene 3: sign-out over a live room, ending refused ---- */
      const rB = D.addRoom({ id: "r_endB", host_id: hostU, name: "B", phase: "spotlight", round: 1 });
      D.rooms.get(rB).status = "live";
      D.setFault("end_show", "host", { error: "boom: end_show unavailable" });
      const e1 = endShows();
      await host.page.evaluate(() => document.getElementById("signout").click());
      await waitFor(async () => Promise.resolve(endShows() - e1 >= 1), 10000,
        "the sign-out sweep to attempt the ending");
      await host.page.waitForTimeout(4000);

      t.ok(endShows() - e1 >= 2,
        `(d) the sign-out sweep RETRIES the ending it used to swallow (attempts: ${endShows() - e1})`);
      t.ok(host.logs.some((l) => /signout.*end_show|end_show.*(fail|attempt)/i.test(l.text)),
        "(d) the orphaned live room is NAMED in the console before sign-out proceeds — never a silent orphan");
      /* COPY PIN, labelled as a pin and not behaviour (the sign-out reload
         races any toast read): the ruling 2026-08-14 requires the exit to
         OFFER THE RETRY — the shipped copy must name the recovery route. */
      t.ok(/still LIVE\.\s*Sign back in and tap LAST CALL/.test(ctx.html),
        "(d) copy pin: the toast names the recovery — still LIVE, sign back in, tap LAST CALL");
      D.setFault("end_show", "host", null);
    } finally { await h.close(); }
  },
};
