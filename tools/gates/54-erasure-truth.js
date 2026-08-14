/* GATE 54 — erasure-truth: no code path may delete a membership row on the
 * strength of a rendering, or without reading the result of what recreates it.
 * RED ON PURPOSE against today's build, BOTH halves, independently.
 *
 * PROVENANCE, labelled.  Forged 2026-08-13 against three named instances of
 * one defect — DECIDE FROM A RENDERING, THEN CALL A DESTRUCTIVE RPC AND
 * DISCARD THE RESULT (conductor's naming, same date).  The instances:
 *
 *   1. the lapse-recovery guard — FIXED on fix/recovery-truth (#61, gate 53);
 *      named here so the next reader sees the pattern had three faces;
 *   2. the chair STEP-DOWN in $("rt_joinline").onclick — `await leave_room;
 *      await join_room; // back as crowd`, both results discarded inside a
 *      try whose catch only sees network throws, never resolved {error}s.
 *      A man stepping down (or passing himself mid-answer) whose re-add
 *      fails is ERASED, and the toast still congratulates him on his seat;
 *   3. the LEAVE-LINE toggle in the same handler — leave_room's error is
 *      read, but the join_room after a SUCCESSFUL hard delete is discarded.
 *      A man leaving the line can be erased from the room in silence.
 *
 * THE TWO HALVES, ASSERTED INDEPENDENTLY (conductor's scope correction,
 * verbatim: "A path that reads its own row off the table but still discards
 * the re-add is broken.  A path that reads the re-add result but decided
 * from a rendering is broken.  Assert both conditions separately — otherwise
 * a future site that fixes one half passes the gate while still erasing
 * people."):
 *
 *   HALF B (read what recreates you): scenes 1 and 2 — the re-add after a
 *   successful delete is retried bounded, and its terminal failure is LOUD.
 *   A success toast over an erasure is the exact lie this gate exists for.
 *
 *   HALF A (decide from state): scene 3 — the rendering says 'line', the
 *   TABLE says 'spectator' (roster reads frozen: the read keeps succeeding
 *   and keeps being stale, prod's exact face from gate 36).  Today's code
 *   hard-deletes the spectator's row because a stale rendering told it he
 *   was on the line.  The fixed code reads his own row off the table and
 *   never fires the delete.
 *
 * NOTE ON TRAFFIC, correcting an earlier post: instance 2 fires on the
 * VOLUNTARY step-down / mid-answer self-pass (a user tap), not on every
 * host pass — the host's pass_member is a server-side role change with no
 * client delete.  Still a core-loop tap; the earlier "every pass" claim
 * was the rendering, this header is the read.
 */
"use strict";
const { Harness } = require("../lib/harness");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200)); } };

module.exports = {
  name: "erasure-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@era.test" });
      ["u_1", "u_2", "u_3"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_era", host_id: hostU, name: "Era", phase: "spotlight", round: 1 });

      const openAs = async (clientId, uid) => {
        const c = await h.newClient(clientId); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        return c;
      };
      const toastOf = (c) => c.page.evaluate(() => {
        const el = document.getElementById("toast");
        return el ? (el.textContent || "").trim() : "";
      });
      const rpcN = (cid, name) => (D.rpcLog || []).filter((r) => r.clientId === cid && r.name === name).length;

      /* ========== scene 1 — HALF B on the chair step-down ========== */
      D.addMember(room, "u_1", "chair"); D.memberRow(room, "u_1").seat_index = 0;
      const c1 = await openAs("c1", "u_1");
      c1.page.on("dialog", (d) => d.accept());          // "Leave the chair?" — yes
      await waitFor(() => c1.page.evaluate(() =>
        !!(window.__lc.ROOM_STATE.members || []).find((m) => m.user_id === "u_1")), 10000,
        "c1's roster to know he is seated");
      D.setFault("join_room", "c1", { error: "boom: join_room unavailable" });
      const j1 = rpcN("c1", "join_room");
      await c1.page.evaluate(() => document.getElementById("rt_joinline").click());
      await waitFor(async () => Promise.resolve(!D.memberRow(room, "u_1")), 10000,
        "the step-down's leave_room to delete his row");
      await c1.page.waitForTimeout(3500);

      t.ok(rpcN("c1", "join_room") - j1 >= 2,
        `HALF B, step-down: the re-add after a successful delete is RETRIED, not fired once and forgotten (attempts: ${rpcN("c1", "join_room") - j1})`);
      const row1 = D.memberRow(room, "u_1"); const toast1 = await toastOf(c1);
      t.ok(!!row1 || /lost|reload|hiccup|couldn't/i.test(toast1),
        `…and an erased man is never CONGRATULATED: either his row is back or the message says the truth, not "enjoy the show" (row=${!!row1}, toast=${JSON.stringify(toast1)})`);
      t.ok(c1.logs.some((l) => /join_room/.test(l.text)),
        "…and the console names the failing call for whoever debugs it");
      D.setFault("join_room", "c1", null);

      /* ========== scene 2 — HALF B on the leave-line toggle ========== */
      D.addMember(room, "u_2", "line");
      const c2 = await openAs("c2", "u_2");
      await waitFor(() => c2.page.evaluate(() => {
        const m = (window.__lc.ROOM_STATE.members || []).find((x) => x.user_id === "u_2");
        return !!(m && m.role === "line");
      }), 10000, "c2's roster to know he is on the line");
      D.setFault("join_room", "c2", { error: "boom: join_room unavailable" });
      const j2 = rpcN("c2", "join_room");
      await c2.page.evaluate(() => document.getElementById("rt_joinline").click());
      await waitFor(async () => Promise.resolve(!D.memberRow(room, "u_2")), 10000,
        "the leave-line's leave_room to delete his row");
      await c2.page.waitForTimeout(3500);

      t.ok(rpcN("c2", "join_room") - j2 >= 2,
        `HALF B, leave-line: same contract on the user-tap path (attempts: ${rpcN("c2", "join_room") - j2})`);
      const row2 = D.memberRow(room, "u_2"); const toast2 = await toastOf(c2);
      t.ok(!!row2 || /lost|reload|hiccup|couldn't/i.test(toast2),
        `…a man who tapped LEAVE THE BENCH is demoted or told — never silently erased from the ROOM (row=${!!row2}, toast=${JSON.stringify(toast2)})`);
      D.setFault("join_room", "c2", null);

      /* ========== scene 3 — HALF A: stale rendering must not delete ========== */
      D.addMember(room, "u_3", "line");
      const c3 = await openAs("c3", "u_3");
      await waitFor(() => c3.page.evaluate(() => {
        const m = (window.__lc.ROOM_STATE.members || []).find((x) => x.user_id === "u_3");
        return !!(m && m.role === "line");
      }), 10000, "c3's roster to believe he is on the line");
      /* freeze the roster read AT 'line', then move the table under it */
      D.setFault("active_members", "c3", { freeze: true });
      await c3.page.evaluate(() => window.__lc.loadRoomState());   // capture the snapshot at 'line'
      D.memberRow(room, "u_3").role = "spectator";
      const l3 = rpcN("c3", "leave_room");
      await c3.page.evaluate(() => document.getElementById("rt_joinline").click());
      await c3.page.waitForTimeout(2500);

      t.ok(rpcN("c3", "leave_room") - l3 === 0,
        `HALF A: a tap decided against a STALE RENDERING (screen says line, table says spectator) fires NO hard delete — the decision reads his own row off the table (leave_room calls: ${rpcN("c3", "leave_room") - l3})`);
      t.ok(!!D.memberRow(room, "u_3"),
        "…and the spectator's row survives his own button");
      D.setFault("active_members", "c3", null);

      /* ========== scene 4 — HALF A's mirror: GUARD AND ACTION READ THE SAME
         SOURCE.  Found by READING, then measured red: the wave-9 open-chair
         guard's own comment promises "the SAME derivation the guarded branch
         reads — so the guard can never disagree with the branch it is
         guarding."  Fixing the branch onto the table while the guard kept
         reading the rendering BROKE that promise: a benched man whose roster
         read is stale (rendering: spectator, table: line) taps the open
         chair, the stale guard waves him through, and the table-reading
         branch takes him OFF the line — the exact silent demotion the wave-9
         ruling exists to prevent, reopened by the half-A fix itself. ========== */
      D.addUser({ id: "u_4", name: "u_4" });
      const c4 = await openAs("c4", "u_4");   // openRoom's join_room creates his SPECTATOR row
      await waitFor(() => c4.page.evaluate(() => {
        const m = (window.__lc.ROOM_STATE.members || []).find((x) => x.user_id === "u_4");
        return !!(m && m.role === "spectator");
      }), 10000, "c4's roster to see him as a spectator");
      D.setFault("active_members", "c4", { freeze: true });
      await c4.page.evaluate(() => window.__lc.loadRoomState());  // snapshot: spectator
      D.memberRow(room, "u_4").role = "line";          // the TABLE now says line
      const l4 = rpcN("c4", "leave_room");
      await c4.page.evaluate(() => {
        const el = document.querySelector('#rt_chairs [data-takechair]');
        if (el) el.click();
      });
      await c4.page.waitForTimeout(2500);
      t.ok(rpcN("c4", "leave_room") - l4 === 0,
        `guard and action agree on the SOURCE: a benched man's open-chair tap costs him nothing even when his roster read is stale (leave_room calls: ${rpcN("c4", "leave_room") - l4})`);
      t.ok(D.memberRow(room, "u_4") && D.memberRow(room, "u_4").role === "line",
        `…and he is still on the line (role=${D.memberRow(room, "u_4") && D.memberRow(room, "u_4").role})`);
      D.setFault("active_members", "c4", null);
    } finally { await h.close(); }
  },
};
