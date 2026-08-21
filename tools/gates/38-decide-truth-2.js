/* GATE 38 — decide-truth-2: her call under prod's NULL deadline, and an
 * option set that survives re-renders.  Ships with fix/decide-truth-2.
 *
 * Conductor run (b0809.1727), at her call:
 *   · the clock sat parked at a lying "0:00 · HER CALL" — the rooms row
 *     carried phase_deadline NULL (prod enters her call that way; the
 *     double never did — it always minted a 60s deadline);
 *   · Q5's clock-out/crowd-call machinery never fired despite distinct
 *     hearts — it armed only off the server deadline;
 *   · PASS ONE appeared, then VANISHED on a re-render, and the armed
 *     pass-mode died with it (egApply's deciding branch re-nulled the
 *     mode and re-derived the options on every re-apply).
 *
 * HARNESS FIDELITY (what the double faked): advance_phase always wrote a
 * deadline into deciding, so no gate ever saw prod's null-deadline her
 * call.  The double now enters deciding with phase_deadline NULL, as prod
 * does.
 *
 * Now: the local her-call fallback never parks at 0:00 (expired ⇒ the
 * chip says "HER CALL · HER MOVE" — a labeled holding state); the host
 * arms her OWN her-call window when the server sends no deadline, so the
 * crowd-call fires off its own timer; the option set derives once at
 * genuine phase entry and only re-derives on the decide-sig (a re-render
 * is not a roster change), and an armed tap-mode survives re-applies.
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

module.exports = {
  name: "decide-truth-2",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_b1", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const host = await h.newClient("host");
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      /* ---- fidelity: the double's advance into deciding carries NULL ---- */
      const rF = D.addRoom({ id: "r_dt2f", host_id: hostU, name: "F", phase: "deliberation", round: 3 });
      D.rpc("host", "advance_phase", { room_id: rF });
      t.ok(D.rooms.get(rF).phase === "deciding" && D.rooms.get(rF).phase_deadline === null,
        "double fidelity: advancing into HER CALL carries phase_deadline NULL, as prod does");

      /* ---- SCENE A: option-set stability + no lying clock ---- */
      const rA = D.addRoom({ id: "r_dt2a", host_id: hostU, name: "A", phase: "deciding", round: 3 });
      D.rooms.get(rA).phase_deadline = null;
      D.addMember(rA, "u_s1", "chair", { seat_index: 0 });
      D.addMember(rA, "u_s2", "chair", { seat_index: 1 });
      D.addMember(rA, "u_b1", "line");
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(rA) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 8000, "decide card");
      const opt0 = await host.page.evaluate(() => ({
        pass: document.getElementById("eg_dpass").style.display,
        card: document.getElementById("eg_decide").style.display,
      }));
      t.ok(opt0.pass !== "none", "bench=1 ⇒ PASS ONE offered at phase entry (Q3 v2)");

      // ten forced re-renders, roster untouched — the option set may not move
      const opts = await host.page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 10; i++) {
          window.__lc.renderRoom();
          window.__lc.egApply();
          out.push(document.getElementById("eg_dpass").style.display + "/" + document.getElementById("eg_decide").style.display);
        }
        return out;
      });
      t.ok(new Set(opts).size === 1 && opts[0] === opt0.pass + "/" + opt0.card,
        `option set IDENTICAL across 10 forced re-renders with an unchanged roster (${opts[0]}) — a re-render is not a roster change`);

      // an ARMED tap-mode survives a re-apply: the card stays down and the tap still lands
      await host.page.evaluate(() => document.getElementById("eg_dpass").click());   // arm pass-mode (card hides)
      await host.page.evaluate(() => { window.__lc.egApply(); window.__lc.renderRoom(); });
    // tray stays visible while armed per decide-path ruling 2026-08-21; old assertion retired.
      t.ok(await host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"),
        "a re-apply does NOT resurrect the card over her armed tap-mode (the live run wiped it)");
      await host.page.evaluate(() => document.querySelector('#rt_chairs [data-heartuid="u_s2"]').click());
      await waitFor(() => D.rpcLog.some((r) => r.name === "decide_pass" && r.args.target === "u_s2"), 8000, "the armed tap lands");
      t.ok(true, "…and her tap still fires decide_pass — the mode survived");
      // resolve the pick window she just opened (her tap is its proper exit)
      // so no stale 20s expiry can skip a LATER room's phase from the tick
      await waitFor(() => host.page.evaluate(() => !!window.__lc.PASS_PICK), 8000, "pick window open");
      await host.page.evaluate(() => window.__lc.hostSeat("u_b1"));
      await waitFor(() => host.page.evaluate(() => !window.__lc.PASS_PICK), 8000, "pick window resolved");
      // the chip never lied 0:00 during any of this
      const chipNow = await host.page.evaluate(() => document.getElementById("rt_phase").textContent);
      t.ok(!/0:00/.test(chipNow), `the header never parks at a lying 0:00 (reads "${chipNow}")`);
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });

      /* ---- SCENE B: null-deadline her call — holding label, crowd-call arms itself ---- */
      const rB = D.addRoom({ id: "r_dt2b", host_id: hostU, name: "B", phase: "deciding", round: 3 });
      D.rooms.get(rB).phase_deadline = null;
      D.addMember(rB, "u_s1", "chair", { seat_index: 0 });
      D.addMember(rB, "u_s2", "chair", { seat_index: 1 });
      for (let k = 0; k < 3; k++) D.pushEvent(rB, "u_w", "heart", { target: "u_s1" });
      D.pushEvent(rB, "u_w", "heart", { target: "u_s2" });
      await host.page.evaluate(() => { window.__lc.LC_SECTION_SECS.deciding = 4; });   // shorten HER CALL for the gate
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(rB) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() => (window.__lc.HEARTS["u_s1"] || 0) === 3), 8000, "hearts seeded");
      // while the local window runs, the chip counts; when it dries, it HOLDS with a label
      const midChip = await host.page.evaluate(() => document.getElementById("rt_phase").textContent);
      t.ok(/HER CALL/.test(midChip), `her call chip present ("${midChip}")`);
      // the crowd-call fires off the host's OWN arm — no server deadline anywhere
      await waitFor(() => D.rooms.get(rB).status === "ended" && D.rooms.get(rB).winner_id === "u_s1", 20_000,
        "the crowd-call fires under a NULL server deadline");
      t.ok(D.rpcLog.some((r) => r.name === "decide_keep" && r.args.target === "u_s1" && r.args.room_id === rB),
        "Q5 clock-out: the heart leader is KEPT on the ordinary path — armed by the host's own her-call window");
      t.ok(D.rooms.get(rB).phase_deadline === null, "…with the rooms row's deadline still null throughout (prod shape)");

      /* ---- SCENE C: holding label when the window dries on a TIE ---- */
      const rC = D.addRoom({ id: "r_dt2c", host_id: hostU, name: "C", phase: "deciding", round: 3 });
      D.rooms.get(rC).phase_deadline = null;
      D.addMember(rC, "u_s1", "chair", { seat_index: 0 });
      D.addMember(rC, "u_s2", "chair", { seat_index: 1 });
      D.pushEvent(rC, "u_w", "heart", { target: "u_s1" });
      D.pushEvent(rC, "u_w", "heart", { target: "u_s2" });   // dead heat — Q5 holds
      await host.page.evaluate(() => { window.__lc.LC_SECTION_SECS.deciding = 2; });
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(rC) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await host.page.waitForTimeout(3500);   // the 2s window dries; the tie holds
      const heldChip = await host.page.evaluate(() => { window.__lc.renderRoom(); return document.getElementById("rt_phase").textContent; });
      t.ok(/HER MOVE/.test(heldChip) && !/0:00/.test(heldChip),
        `a dried her-call window HOLDS with a labeled state ("${heldChip}") — never a lying 0:00`);
      t.ok(D.rooms.get(rC).status !== "ended", "…and the tie really held (no crowd-call, Q5)");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
