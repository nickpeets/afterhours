/* GATE 29 — self-truth & card lifecycle: the actor's own window derives
 * from the same truth as everyone else's, and every card lives and dies
 * by room truth.  Ships with fix/self-truth-and-card-lifecycle.
 *
 * Live bugs: (a) TAKE A BENCH SEAT succeeded server-side (every other
 * client saw the man benched) while the ACTOR'S own desktop still showed
 * the join button; (b) "A CHAIR IS OPEN" burned into the next round
 * after the chair filled, and a question-card remnant appeared with no
 * live spotlight (the truth poll replays missed events — an expired
 * spotlight event repainted the card).
 *
 * Now: the actor's accepted write folds OPTIMISTICALLY (instant verb
 * flip) with the roster sync as the guaranteed confirm; cardReconcile()
 * runs on every truth pass — cards render IFF their owning state is
 * active (spotlight card iff a live seated target; recruitment card iff
 * draft phase or an open recruit window; decide/drumroll iff deciding);
 * a recruit window whose chair filled by ANY route resolves; an expired
 * spotlight event replayed from history never raises the card.
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
  name: "self-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_s3", "u_a", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (n, u) => {
        const c = await h.newClient(n); c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const actor = await boot("actor", "u_a");    // his realtime will be severed
      const crowd = await boot("crowd", "u_w");
      const room = D.addRoom({ id: "r_self", host_id: hostU, name: "Self Night", phase: "openfloor", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 300_000);
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      D.addMember(room, "u_s3", "chair", { seat_index: 2 });
      D.addMember(room, "u_a", "spectator");
      D.addMember(room, "u_w", "spectator");
      for (const c of [host, actor, crowd]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      await actor.page.evaluate(() => { window.__realtimePush = undefined; });   // the deaf desktop

      /* --- (a) the actor's own window transitions, realtime dead --- */
      await actor.page.evaluate(() => document.getElementById("rt_joinline").click());
      await waitFor(() => (D.memberRow(room, "u_a") || {}).role === "line", 15_000, "the server accepts the bench take");
      const tServer = Date.now();
      await waitFor(() => actor.page.evaluate(() =>
        /LEAVE THE BENCH/.test(document.getElementById("rt_joinline").textContent)), 6_500,
        "the ACTOR'S OWN window flips to LEAVE THE BENCH");
      const flipMs = Date.now() - tServer;
      t.ok(true, `the actor's verb flipped ${flipMs}ms after the server accepted (optimistic fold + truth confirm)`);
      await waitFor(() => crowd.page.evaluate(() => {
        const lanes = [...document.querySelectorAll("#lineitems .lc-lane")];
        return lanes.some((l) => l.dataset.benchuid === "u_a");
      }), 8_000, "every other window agrees he's benched");
      t.ok(true, "actor and audience read the same truth");

      /* --- (b1) the recruitment card dies when the chair fills, clear event or not --- */
      // collapse a chair with an empty-ish bench…: pass u_s1 with bench empty
      // (u_a is the only line member — pull him out first so the bench is bare)
      D.rpc("host", "pass_member", { room_id: room, user_id: "u_a" });   // back to crowd (bench now empty)
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "spotlight", 60);
      await waitFor(() => host.page.evaluate(() => window.__lc.askEligible(null) === true), 10_000, "choosing");
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => !!D.rooms.get(room).spotlight_target, 8000, "an answer is live");
      const tgt = D.rooms.get(room).spotlight_target;
      const row = D.memberRow(room, tgt);
      const idx = D.members.indexOf(row); D.members.splice(idx, 1);
      D.emit("room_members", "DELETE", { ...row });                       // the target walks; bench is EMPTY
      await waitFor(() => host.page.evaluate(() =>
        window.__lc.PASS_PICK && window.__lc.PASS_PICK.recruit === true), 8000, "the recruit window opens");
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_draft").style.display !== "none"), 5000,
        "A CHAIR IS OPEN card up");
      // …and the chair fills by a route that fires NO clearing event the
      // host is listening for (a self-claim, modeled as a direct seat)
      D.rpc("crowd", "seat_pick", { room_id: room, seat_index: (row.seat_index ?? 0) });
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_draft").style.display === "none"), 6_500,
        "the recruitment card dies within one sync of the chair filling");
      t.ok(true, "no more 'A CHAIR IS OPEN' burning into the next round");
      t.ok(await host.page.evaluate(() => !window.__lc.PASS_PICK), "the recruit window resolved with it");

      /* --- (b2) an expired spotlight relic never raises the card --- */
      for (const c of [host, crowd]) await c.page.evaluate(() => { document.getElementById("eg_question").style.display = "none"; });
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "openfloor", 60);
      await host.page.waitForTimeout(800);
      // hand-feed a stale spotlight event (deadline long past) through the same door the poll uses
      await crowd.page.evaluate((ev) => window.__lc.handleEvent(ev), {
        id: "e_stale_1", room_id: room, user_id: "u_host", type: "spotlight", created_at: D.iso(D.now() - 90_000),
        payload: { target_user: "u_s2", round: 1, question_id: null, question_text: "old news?", deadline: D.iso(D.now() - 60_000) },
      });
      await crowd.page.waitForTimeout(600);
      t.ok(await crowd.page.evaluate(() => document.getElementById("eg_question").style.display === "none"),
        "a replayed, expired spotlight event does NOT raise the question card");
      // and the reconciler self-heals a card that somehow got stuck on
      await crowd.page.evaluate(() => { document.getElementById("eg_question").style.display = "block"; });
      await waitFor(() => crowd.page.evaluate(() => document.getElementById("eg_question").style.display === "none"), 6_500,
        "cardReconcile clears a stuck question card on the next truth pass");
      t.ok(true, "no question card renders anywhere without a live spotlight in room truth");

      const errs = [host, actor, crowd].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
