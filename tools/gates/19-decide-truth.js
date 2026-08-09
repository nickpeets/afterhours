/* GATE 19 — decide-truth: the decide card tells the truth on every roster
 * change (RULING Q3), HER CALL never silently expires (RULING Q5), and
 * the pick window closes early over an emptied bench (RULING Q7).
 * Ships with fix/decide-truth.
 *
 * The bug (audit F3/F7/F10): the card's contents were computed once at
 * phase entry (egApply short-circuit); the click belt checked the bench
 * only, never the seated count; deciding's deadline was silently eaten by
 * the generic resolver; a pick window over an emptied bench sat lying
 * for 20 seconds.
 *
 * Proven here, through real __lc references and the real UI:
 *   - the Q3 v2 predicate (8/9: PASS iff bench ≥ 1, full stop — the
 *     seated-≥2 arm is DELETED), unit-driven through __lc.passViable
 *     across the seated/bench matrix.
 *   - live: ONE seated + empty bench → PASS absent; a bench arrival
 *     mid-phase flips PASS on without a phase change.
 *   - HER CALL expiry with distinct hearts → the heart leader is KEPT on
 *     the ordinary KEEP path (decide_keep + winner), with the crowd-call
 *     beat; a heart TIE → no auto-advance, the clock holds.
 *   - pick window + bench empties → window closes early and the show
 *     advances immediately (well before the 20s expiry).
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
  name: "decide-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_s3", "u_b1", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const host = await h.newClient("host");
      host.login(hostU);
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      /* --- the Q3 predicate matrix, through the ONE exported function --- */
      const matrix = await host.page.evaluate(() => {
        const mk = (chairs, kept, bench) => {
          const ms = [];
          for (let i = 0; i < chairs; i++) ms.push({ user_id: "c" + i, role: "chair", seat_index: i, last_seen: null });
          for (let i = 0; i < kept; i++) ms.push({ user_id: "k" + i, role: "kept", seat_index: chairs + i, last_seen: null });
          for (let i = 0; i < bench; i++) ms.push({ user_id: "b" + i, role: "line", last_seen: null });
          return ms;
        };
        const room = { host_id: "u_host" };
        const P = (c, k, b) => window.__lc.passViable(mk(c, k, b), room);
        return {
          "3c,0b": P(3, 0, 0), "2c,1b": P(2, 0, 1), "2c,0b": P(2, 0, 0),
          "1c,1b": P(1, 0, 1), "1c,0b": P(1, 0, 0), "1c1k,0b": P(1, 1, 0),
          "2c1k,0b": P(2, 1, 0),
        };
      });
      // Q3 v2 (8/9): bench decides, nothing else — every 0-bench cell is
      // PASS-absent now (the old seated-≥2 arm parked shows on dead
      // recruitment cards in the live run)
      const expect = { "3c,0b": false, "2c,1b": true, "2c,0b": false, "1c,1b": true, "1c,0b": false, "1c1k,0b": false, "2c1k,0b": false };
      for (const k of Object.keys(expect)) {
        t.ok(matrix[k] === expect[k], `Q3 matrix [${k}] → ${expect[k]} (got ${matrix[k]})`);
      }

      /* --- live: PASS flips ON when a bench member arrives mid-phase --- */
      const roomA = D.addRoom({ id: "r_dt1", host_id: hostU, name: "DT1", phase: "deciding", round: 3 });
      D.rooms.get(roomA).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(roomA, "u_s1", "chair", { seat_index: 0 });
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomA) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 8000, "decide card up");
      t.ok(await host.page.evaluate(() => document.getElementById("eg_dpass").style.display === "none"),
        "one seated + empty bench: PASS absent at card-open");
      const row = D.addMember(roomA, "u_b1", "line");
      D.emit("room_members", "INSERT", { ...row });
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_dpass").style.display !== "none"), 8000,
        "a bench arrival mid-phase flips PASS on — no phase change needed");
      t.ok(true, "the card re-derives on a roster change, not at phase entry (audit F3 dead)");
      // and back off when he leaves again
      const i = D.members.findIndex((m) => m.room_id === roomA && m.user_id === "u_b1");
      const [gone] = D.members.splice(i, 1);
      D.emit("room_members", "DELETE", { ...gone });
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_dpass").style.display === "none"), 8000,
        "his departure flips PASS back off");
      t.ok(true, "departures re-derive too — the predicate is live in both directions");
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });

      /* --- HER CALL expiry, distinct hearts → the crowd decides --- */
      const roomB = D.addRoom({ id: "r_dt2", host_id: hostU, name: "DT2", phase: "deciding", round: 3 });
      D.addMember(roomB, "u_s1", "chair", { seat_index: 0 });
      D.addMember(roomB, "u_s2", "chair", { seat_index: 1 });
      for (let k = 0; k < 3; k++) D.pushEvent(roomB, "u_w", "heart", { target: "u_s1" });
      D.pushEvent(roomB, "u_w", "heart", { target: "u_s2" });
      D.rooms.get(roomB).phase_deadline = D.iso(D.now() + 60_000);   // placeholder: armed AFTER entry
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomB) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      // the clock starts only once the host is fully seated in the room —
      // under full-battery load, entry (history replay incl. hearts) can
      // outlast a pre-armed 2.5s deadline and fake a non-tie
      await waitFor(() => host.page.evaluate(() => (window.__lc.HEARTS["u_s1"] || 0) === 3), 8000, "hearts seeded (B)");
      D.rooms.get(roomB).phase_deadline = D.iso(D.now() + 2_500);
      D.emit("rooms", "UPDATE", { ...D.rooms.get(roomB) });
      await waitFor(() => D.rooms.get(roomB).status === "ended", 15_000, "clock-out ends the show through the KEEP path");
      // the beats queue behind the decision: crowd-call (2.2s) then the held
      // KEPT beat — poll until one of them is on stage
      const sawBeat = await waitFor(() => host.page.evaluate(() =>
        [...document.querySelectorAll("#room .lc-beat")].some((e) =>
          /crowdcall|kept/.test(e.className))), 8000, "the crowd-call/kept beat takes the stage").then(() => true).catch(() => false);
      t.ok(D.rooms.get(roomB).winner_id === "u_s1", `the crowd's heart leader is the winner (got ${D.rooms.get(roomB).winner_id})`);
      t.ok(D.rpcLog.some((r) => r.name === "decide_keep" && r.args.target === "u_s1"),
        "the win used the ordinary KEEP path (decide_keep), not a side door");
      t.ok((D.memberRow(roomB, "u_s1") || {}).role === "kept", "the leader is KEPT");
      t.ok(sawBeat, "the crowd-call landed with a loud beat");

      /* --- HER CALL expiry, heart TIE → the clock holds --- */
      // (host is still inside roomB's ended flow — leave first)
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });
      const roomC = D.addRoom({ id: "r_dt3", host_id: hostU, name: "DT3", phase: "deciding", round: 3 });
      D.addMember(roomC, "u_s1", "chair", { seat_index: 0 });
      D.addMember(roomC, "u_s2", "chair", { seat_index: 1 });
      D.pushEvent(roomC, "u_w", "heart", { target: "u_s1" });
      D.pushEvent(roomC, "u_w", "heart", { target: "u_s2" });
      D.rooms.get(roomC).phase_deadline = D.iso(D.now() + 60_000);   // placeholder: armed AFTER entry
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomC) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() =>
        (window.__lc.HEARTS["u_s1"] || 0) === 1 && (window.__lc.HEARTS["u_s2"] || 0) === 1), 8000, "tie hearts seeded (C)");
      D.rooms.get(roomC).phase_deadline = D.iso(D.now() + 2_000);
      D.emit("rooms", "UPDATE", { ...D.rooms.get(roomC) });
      await host.page.waitForTimeout(6_000);   // well past the deadline
      t.note("TIE-DIAG hearts=" + JSON.stringify(await host.page.evaluate(() => window.__lc.HEARTS)) +
             " members=" + JSON.stringify(await host.page.evaluate(() =>
               window.__lc.ROOM_STATE.members.map((m) => m.user_id + ":" + m.role))) +
             " keeps=" + JSON.stringify(D.rpcLog.filter((r) => r.name === "decide_keep" && r.args.room_id === "r_dt3")));
      const c = D.rooms.get(roomC);
      t.ok(c.status === "live" && c.phase === "deciding" && (c.round || 0) === 3,
        `heart tie: no auto-advance, the clock holds for her tap (status=${c.status}, phase=${c.phase}, round=${c.round})`);
      t.ok(!D.rpcLog.some((r) => r.name === "decide_keep" && r.args.room_id === "r_dt3"),
        "no decide_keep fired on a tie");
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });

      /* --- RULING Q7: pick window closes early when the bench empties --- */
      const roomD = D.addRoom({ id: "r_dt4", host_id: hostU, name: "DT4", phase: "deciding", round: 1 });
      D.rooms.get(roomD).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(roomD, "u_s1", "chair", { seat_index: 0 });
      D.addMember(roomD, "u_s2", "chair", { seat_index: 1 });
      D.addMember(roomD, "u_s3", "chair", { seat_index: 2 });
      const benchRow = D.addMember(roomD, "u_b1", "line");
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomD) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 8000, "decide card up (D)");
      await host.page.evaluate(() => document.getElementById("eg_dpass").click());
      await host.page.evaluate(() => document.getElementById("rt_seat0").click());
      await waitFor(() => host.page.evaluate(() => !!window.__lc.PASS_PICK), 8000, "pick window opens");
      const tGone = Date.now();
      const j = D.members.findIndex((m) => m.room_id === roomD && m.user_id === "u_b1");
      const [b1] = D.members.splice(j, 1);
      D.emit("room_members", "DELETE", { ...b1 });
      await waitFor(() => D.rooms.get(roomD).phase === "spotlight" && (D.rooms.get(roomD).round || 0) === 2, 8000,
        "the emptied bench closes the window and advances at once");
      const closeMs = Date.now() - tGone;
      t.ok(closeMs < 6_000, `early close, not the 20s expiry (${closeMs}ms after the bench emptied)`);
      t.ok(await host.page.evaluate(() => !window.__lc.PASS_PICK), "the window marker is gone");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
