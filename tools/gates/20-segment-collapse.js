/* GATE 20 — segment-collapse: a vacated spotlight never plays on (RULING
 * Q2, audit F4+F9).  Ships with fix/segment-collapse.
 *
 * Policy: a chair leaving during HIS OWN answer = passing himself — he's
 * out (pass-final), the segment collapses immediately (target cleared,
 * question card down, wipe beat), and the pick window opens per the
 * Q7-compliant flow.  A NON-target chair leaving vacates the seat and the
 * segment continues.  LEAVE is never blocked, in any phase.
 *
 * The double models prod's real ask_question (fact 8/9): jsonb return,
 * round++ per ask, 30s answer deadline, noop-when-running, ledger emit.
 *
 * Proven here, three windows (host + target + watcher), real UI:
 *   - target taps ↩ LEAVE mid-answer → within the segue budget (2000ms,
 *     the pacing spec's longest beat) the server target is cleared and
 *     the question card is down on EVERY role's screen; the pick window
 *     opens (bench stocked); his exit is a PASS (ledger row + his join
 *     button gone).
 *   - a RIVAL leaves mid-answer → target, card, and deadline untouched.
 *   - QUESTION PROPAGATION (8/9): the card paints on host, chair-side,
 *     and crowd from the SAME spotlight event — skew ≤ 300ms (one tick).
 *   - OPEN-CHAIR RECRUITMENT (8/9): target leaves with an EMPTY bench →
 *     recruitment card with a LIVE countdown (never "0:00" parking) →
 *     expiry → the show moves on short-handed.
 *   - ↩ LEAVE THE CHAIR is visible and hit-testable in every phase.
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
  name: "segment-collapse",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_s3", "u_b1", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby, #room.show", { timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const s1 = await boot("s1", "u_s1");     // will be the target
      const watcher = await boot("watch", "u_w");
      const room = D.addRoom({ id: "r_col", host_id: hostU, name: "Collapse Night", phase: "spotlight", round: 0 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      D.addMember(room, "u_s3", "chair", { seat_index: 2 });
      D.addMember(room, "u_b1", "line");
      D.addMember(room, "u_w", "spectator");
      for (const c of [host, s1, watcher]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }

      /* --- a real ask puts u_s1 in the spotlight (prod-parity double) --- */
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_s1", 8000, "the ask lands");
      t.ok((D.rooms.get(room).round || 0) === 1, "prod parity: the first ask OPENS round 1 (round++ at ask)");
      const answerDl = Date.parse(D.rooms.get(room).phase_deadline);
      t.ok(answerDl - Date.now() > 20_000 && answerDl - Date.now() <= 31_000,
        "prod parity: the ask set a ~30s answer deadline");
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_question").style.display !== "none"), 8000,
        "question card up on the host");

      /* --- the TARGET walks out mid-answer --- */
      s1.page.on("dialog", (d) => d.accept());
      await s1.page.evaluate(() => document.getElementById("rt_joinline").click());
      await waitFor(() => !(D.memberRow(room, "u_s1") || { role: "chair" }).role.match(/chair|kept/), 8000, "his seat vacates");
      const tGone = Date.now();
      await waitFor(() => D.rooms.get(room).spotlight_target === null, 8000, "the server target is CLEARED — no ghost");
      const collapseMs = Date.now() - tGone;
      t.ok(collapseMs <= 2000, `SEGUE BUDGET: vacated → target cleared in ${collapseMs}ms (≤2000ms, one beat)`);
      for (const [label, c] of [["host", host], ["target", s1], ["watcher", watcher]]) {
        await waitFor(() => c.page.evaluate(() => document.getElementById("eg_question").style.display === "none"), 5000,
          `question card down on the ${label}`);
      }
      t.ok(true, "no ghost card on ANY role's screen (host, leaver, crowd)");
      await waitFor(() => host.page.evaluate(() => !!window.__lc.PASS_PICK), 5000,
        "the pick window opens (bench stocked) — the Q7-compliant replacement flow");
      t.ok(true, "the replacement flow starts in the same breath");
      // his exit is a PASS: ledger row + finality on his client
      t.ok(D.events.some((e) => e.room_id === room && e.type === "pass" && e.payload?.target_user === "u_s1"),
        "his walk-out is recorded as a PASS (room_events)");
      await waitFor(() => s1.page.evaluate(() =>
        getComputedStyle(document.getElementById("rt_joinline")).display === "none"), 8000,
        "pass-finality lands on his client (join button gone)");
      t.ok(true, "he's out for the night — RULING Q2's self-pass");
      // the host taps the bench: replacement seats, show moves
      await waitFor(() => host.page.evaluate(() => !!document.getElementById("rt_bench0").dataset.benchuid), 8000, "bench lane live");
      await host.page.click("#rt_bench0");
      await waitFor(() => D.members.filter((m) => m.room_id === room && (m.role === "chair" || m.role === "kept")).length === 3, 8000,
        "her tap refills the chair");
      t.ok(true, "host tap wins inside the collapse's pick window");

      /* --- a RIVAL leaving does NOT interrupt the segment --- */
      // the collapse's pick-window seat advanced the show (spotlight → open
      // floor); walk the fixture back to a choosing window for scene 2
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "spotlight", 60);
      await host.page.evaluate(() => window.__lc.egRefreshRoom());
      await waitFor(() => host.page.evaluate(() => window.__lc.askEligible(null) === true), 10_000, "next choosing window");
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => !!D.rooms.get(room).spotlight_target, 8000, "second ask lands");
      const tgt = D.rooms.get(room).spotlight_target;
      const dlBefore = D.rooms.get(room).phase_deadline;
      const rival = ["u_s2", "u_s3"].find((u) => u !== tgt && (D.memberRow(room, u) || {}).role === "chair");
      D.rpc("host", "pass_member", { room_id: room, user_id: rival });   // rival leaves the stage
      await host.page.waitForTimeout(1500);
      const after = D.rooms.get(room);
      t.ok(after.spotlight_target === tgt && after.phase === "spotlight" && after.phase_deadline === dlBefore,
        "a non-target departure leaves target, phase, and deadline untouched");
      t.ok(await host.page.evaluate(() => document.getElementById("eg_question").style.display !== "none"),
        "the question card plays on for the man still answering");

      /* --- QUESTION PROPAGATION: one event, every role, same tick --- */
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "spotlight", 60);
      await host.page.evaluate(() => window.__lc.egRefreshRoom());
      await waitFor(() => host.page.evaluate(() => window.__lc.askEligible(null) === true), 10_000, "choosing for the skew scene");
      const seen = { host: 0, s1: 0, watch: 0 };
      const pollers = Object.entries({ host, s1, watch: watcher }).map(([k, c]) => (async () => {
        for (let i = 0; i < 400 && !seen[k]; i++) {
          const v = await c.page.evaluate(() => document.getElementById("eg_question").style.display !== "none").catch(() => false);
          if (v) { seen[k] = Date.now(); break; }
          await new Promise((r) => setTimeout(r, 20));
        }
      })());
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await Promise.all(pollers);
      t.ok(seen.host && seen.s1 && seen.watch, "the question card reaches host, passed-man, AND crowd");
      const skew = Math.max(seen.host, seen.s1, seen.watch) - Math.min(seen.host, seen.s1, seen.watch);
      t.ok(skew <= 300, `cross-role skew ${skew}ms — one render tick, not seconds (budget 300ms)`);

      /* --- OPEN-CHAIR RECRUITMENT: empty bench never parks the show --- */
      // (bench is empty by now: u_b1 was seated in scene 1.)  The current
      // target walks out mid-answer.
      const tgt3 = D.rooms.get(room).spotlight_target;
      t.ok(D.members.filter((m) => m.room_id === room && m.role === "line").length === 0, "fixture: the bench is EMPTY");
      const rowT = D.memberRow(room, tgt3);
      const idx = D.members.indexOf(rowT);
      D.members.splice(idx, 1);
      D.emit("room_members", "DELETE", { ...rowT });   // he walks (server-side model)
      await waitFor(() => D.rooms.get(room).spotlight_target === null, 8000, "collapse clears the target (recruit path)");
      await waitFor(() => host.page.evaluate(() =>
        window.__lc.PASS_PICK && window.__lc.PASS_PICK.recruit === true), 6000, "the RECRUIT window opens");
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_draft").style.display !== "none"), 5000,
        "the recruitment card shows");
      const c1 = await host.page.evaluate(() => document.getElementById("eg_draft_clock").textContent);
      await host.page.waitForTimeout(2200);
      const c2 = await host.page.evaluate(() => document.getElementById("eg_draft_clock").textContent);
      t.ok(c1 !== "0:00" && c2 !== c1, `the recruitment clock is LIVE (${c1} → ${c2}) — no 0:00 parking`);

      await waitFor(() => host.page.evaluate(() => !window.__lc.PASS_PICK), 25_000, "the recruit window expires");
      await waitFor(() => D.rooms.get(room).phase === "openfloor", 8000, "the show moves on SHORT-HANDED");
      t.ok(await host.page.evaluate(() => document.getElementById("eg_draft").style.display === "none"),
        "the recruitment card is down after expiry");
      t.ok(true, "expiry → next segment with the remaining cast, no parking");

      /* --- LEAVE is never blocked: every phase, visible + hit-testable --- */
      // u_s3 walked in the recruitment scene — seat him again for this one
      D.addMember(room, "u_s3", "chair", { seat_index: 2 });
      const s3 = await boot("s3", "u_s3");
      await s3.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await s3.page.waitForSelector("#room.show", { timeout: 10000 });
      for (const ph of ["showstart", "spotlight", "openfloor", "deliberation", "deciding"]) {
        D.setPhase(room, ph, 60);
        await s3.page.evaluate(() => { window.__lc.egRefreshRoom(); return window.__lc.loadRoomState(); });
        const st = await waitFor(() => s3.page.evaluate(() => {
          const btn = document.getElementById("rt_joinline");
          if (!btn || !/LEAVE THE CHAIR/.test(btn.textContent)) return null;
          const r = btn.getBoundingClientRect();
          const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
          return { hit: top === btn || (top && btn.contains(top)) };
        }), 8000, `leave control in ${ph}`);
        t.ok(st.hit, `↩ LEAVE THE CHAIR visible and hit-testable in ${ph}`);
      }

      const errs = [host, s1, watcher, s3].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across all windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
