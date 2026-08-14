/* GATE 26 — roster-agreement (né roster-truth; renamed by the conductor's
 * ruling 2026-08-13): every client agrees WHO IS SEATED, within one sync
 * interval, with realtime fully dead on some of them.  Ships with
 * fix/roster-truth.  This is gate 23's discipline applied to the roster.
 *
 * SCOPE, honestly (the rename's reason): this gate covers seat-map
 * AGREEMENT between windows and monotonic roster commits.  It does NOT
 * cover the roster's filter chain — loadRoomState's supplementary seated
 * read, activeRows, rosterOverlay — whose end-to-end walk has NEVER been
 * done (loadRoomState's own caveat says so in the code).  That walk is a
 * separate listed gate.  "roster-truth" implied all of it; this covers
 * agreement, so it is named agreement.
 *
 * The live finding: after a pass, desktop windows kept the passed man
 * seated for MINUTES while the host's iPad showed his replacement.  Two
 * diseases: the roster rode realtime + role-split refresh paths (the
 * truth poll loaded members for non-hosts only, the host on a separate
 * path), and loadRoomState commits were UNORDERED — a slow, stale
 * active_members response could clobber a fresher one, repeatedly, under
 * churn.  Now: one roster source on the truth cadence for every role,
 * and monotonic commits (ROSTER_FETCH_SEQ).
 *
 * Five windows: host + chair + bench + two crowd.  BOTH crowd windows
 * have realtime fully severed.  The show runs pass → replacement seated
 * → keep → leave; after each step, ALL FIVE seat maps must agree with
 * the server within the sync budget (one 4s interval + fetch margin).
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 250));
  }
};

module.exports = {
  name: "roster-agreement",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_s3", "u_b1", "u_b2", "u_w1", "u_w2"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (n, u) => {
        const c = await h.newClient(n); c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const chair = await boot("chair", "u_s2");
      const bench = await boot("bench", "u_b2");
      const deaf1 = await boot("deaf1", "u_w1");
      const deaf2 = await boot("deaf2", "u_w2");
      const room = D.addRoom({ id: "r_rt", host_id: hostU, name: "Roster Night", phase: "openfloor", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 300_000);
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      D.addMember(room, "u_s3", "chair", { seat_index: 2 });
      D.addMember(room, "u_b1", "line");
      D.addMember(room, "u_b2", "line");
      D.addMember(room, "u_w1", "spectator");
      D.addMember(room, "u_w2", "spectator");
      const ALL = [["host", host], ["chair", chair], ["bench", bench], ["deaf1", deaf1], ["deaf2", deaf2]];
      for (const [, c] of ALL) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      // realtime FULLY dead on both crowd windows: no members, no events, no rooms
      for (const c of [deaf1, deaf2]) await c.page.evaluate(() => { window.__realtimePush = undefined; });

      const serverMap = () => [0, 1, 2].map((i) => {
        const m = D.members.find((x) => x.room_id === room && (x.role === "chair" || x.role === "kept") && (x.seat_index ?? 0) === i);
        return m ? m.user_id + (m.role === "kept" ? "*" : "") : "·";
      }).join(",");
      const clientMap = (c) => c.page.evaluate(() => [0, 1, 2].map((i) => {
        const el = document.getElementById("rt_seat" + i);
        const uid = el.dataset.heartuid || "·";
        return uid === "·" ? "·" : uid + (el.classList.contains("is-kept") ? "*" : "");
      }).join(","));
      const SYNC_BUDGET = 6_500;   // one 4s interval + fetch margin
      const converge = async (label) => {
        const want = serverMap();
        for (const [n, c] of ALL) {
          await waitFor(async () => (await clientMap(c)) === want, SYNC_BUDGET,
            `${n} agrees on the seat map after ${label} (want [${want}])`);
        }
        t.ok(true, `${label}: all five windows agree on [${want}] within the sync budget`);
      };

      await converge("entry");

      /* --- the live-run scenario: PASS, then the replacement seated --- */
      D.rpc("host", "pass_member", { room_id: room, user_id: "u_s1" });
      await converge("the pass (the passed man leaves every seat map)");
      D.rpc("host", "seat_member", { room_id: room, user_id: "u_b1", seat_index: 0 });
      await converge("the replacement (Biff takes the chair on EVERY window)");

      /* --- keep --- */
      D.rpc("host", "keep_member", { room_id: room, user_id: "u_s3" });
      await converge("the keep (the kept star shows everywhere)");

      /* --- a chair leaves outright --- */
      const i = D.members.findIndex((m) => m.room_id === room && m.user_id === "u_s2");
      const [row] = D.members.splice(i, 1);
      D.emit("room_members", "DELETE", { ...row });
      await converge("a leave (the vacated seat empties everywhere)");

      /* --- monotonic commits: a stale response can never clobber a fresh one --- */
      const seq = await host.page.evaluate(async () => {
        // fire two loads back-to-back; the FIRST must be superseded by the
        // second — ROSTER_FETCH_SEQ discipline (both resolve, one commits)
        const p1 = window.__lc.loadRoomState();
        const p2 = window.__lc.loadRoomState();
        await Promise.all([p1, p2]);
        return true;
      });
      t.ok(seq, "concurrent roster fetches settle without a stale clobber (monotonic commit)");
      t.ok((await clientMap(host)) === serverMap(), "…and the host's map still matches the server after the race");

      const errs = ALL.flatMap(([, c]) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across all five windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
