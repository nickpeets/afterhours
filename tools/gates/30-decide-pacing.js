/* GATE 30 — decide-pacing: while the pick window is open, its timer is
 * the ONLY advancing authority; the header counts the ACTIVE window; the
 * skip control fires once, in its spec'd segments, ONE rung forward
 * (RULING REVERSED 2026-08-22 — skip_phase, not a straight jump to her
 * call; see gate 62's header for the full trail).
 * Ships with fix/decide-pacing.
 *
 * The live killer (branch 2a): the window itself held in-model, but a
 * server-side phase flip (prod's decide_pass opens the DRAFT STORM with
 * its own short clock) cleared PASS_PICK via egApply's phase guard — and
 * the freed resolver then nudged resolve_draft, auto-choosing her
 * replacement.  Now the window survives EVERY phase flip, and no
 * advancing RPC (advance_phase / resolve_draft / section-clock skip)
 * leaves this client while it is open.
 *
 * Proven here:
 *   - pass → the window opens with ITS OWN 20s countdown in the header,
 *     labeled PICK FROM THE BENCH;
 *   - a hostile server flip to a 2s-deadline DRAFT mid-window → the
 *     window SURVIVES, the phase does not advance, no resolve_draft or
 *     advance_phase leaves the host while it's open;
 *   - her tap seats instantly even under the hostile flip;
 *   - a second window left alone expires on ITS clock and only then
 *     advances;
 *   - the skip control: hidden during choosing and her call, visible in
 *     the answer/open floor/deliberation, a double-tap fires ONE
 *     transition, ONE rung forward (RULING REVERSED 2026-08-22).
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
  name: "decide-pacing",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_s3", "u_b1", "u_b2"].forEach((id) => D.addUser({ id, name: id }));
      const host = await h.newClient("host");
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const mk = (id, benched) => {
        const room = D.addRoom({ id, host_id: hostU, name: "Pace Night", phase: "deciding", round: 3 });
        D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
        D.addMember(room, "u_s1", "chair", { seat_index: 0 });
        D.addMember(room, "u_s2", "chair", { seat_index: 1 });
        D.addMember(room, "u_s3", "chair", { seat_index: 2 });
        benched.forEach((u) => D.addMember(room, u, "line"));
        return room;
      };
      const enter = async (roomId) => {
        await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomId) });
        await host.page.waitForSelector("#room.show", { timeout: 10000 });
      };
      const leave = async () => {
        await host.page.evaluate(() => window.__lc.leaveRoom());
        await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });
      };
      const advancingRpcs = (roomId, since) => D.rpcLog.slice(since).filter((r) =>
        ["advance_phase", "resolve_draft", "skip_phase"].includes(r.name) && r.args.room_id === roomId).length;

      /* ===== scene A: hostile flip mid-window — the window is the authority ===== */
      const roomA = mk("r_paceA", ["u_b1", "u_b2"]);
      await enter(roomA);
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 8000, "decide card");
      await host.page.evaluate(() => document.getElementById("eg_dpass").click());
      await host.page.evaluate(() => document.getElementById("rt_seat0").click());
      await waitFor(() => host.page.evaluate(() => !!window.__lc.PASS_PICK), 8000, "the pick window opens");
      // the header shows the PICK clock, labeled
      await waitFor(() => host.page.evaluate(() => {
        const p = document.getElementById("rt_phase").textContent;
        return /PICK FROM THE BENCH/.test(p) && /0:(1[4-9]|20)/.test(p);
      }), 5000, "the header counts the PICK window's own ~20s clock, labeled");
      t.ok(true, "the header clock tracks the active window (branch 2b)");
      // HOSTILE: the server flips to a 2s-deadline draft (prod's storm)
      const rpcMark = D.rpcLog.length;
      D.setPhase(roomA, "draft", 2);
      await host.page.evaluate(() => window.__lc.egRefreshRoom());
      await host.page.waitForTimeout(3_500);   // the hostile clock expires…
      t.ok(await host.page.evaluate(() => !!window.__lc.PASS_PICK),
        "the pick window SURVIVES the server's phase flip (the live killer)");
      t.ok(D.rooms.get(roomA).phase === "draft", "…and the phase has NOT been advanced by this client");
      t.ok(advancingRpcs("r_paceA", rpcMark) === 0,
        "no advance_phase / resolve_draft / skip_phase left this client while the window was open");
      // her tap still wins instantly, hostile flip and all
      await waitFor(() => host.page.evaluate(() => !!document.getElementById("rt_bench0").dataset.benchuid), 8000, "bench lane");
      await host.page.click("#rt_bench0");
      await waitFor(() => D.members.filter((m) => m.room_id === roomA && (m.role === "chair" || m.role === "kept")).length === 3, 8000,
        "her tap seats the replacement instantly under the hostile flip");
      t.ok(true, "host tap always wins — the pick timer was the only authority");
      await leave();

      /* ===== scene B: left alone, the window expires on ITS clock ===== */
      const roomB = mk("r_paceB", ["u_b2"]);
      await enter(roomB);
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 8000, "decide card B");
      await host.page.evaluate(() => document.getElementById("eg_dpass").click());
      await host.page.evaluate(() => document.getElementById("rt_seat0").click());
      await waitFor(() => host.page.evaluate(() => !!window.__lc.PASS_PICK), 8000, "window B opens");
      const tOpen = Date.now();
      await waitFor(() => host.page.evaluate(() => !window.__lc.PASS_PICK), 26_000, "window B expires");
      const heldMs = Date.now() - tOpen;
      t.ok(heldMs >= 17_000, `the window held its FULL clock (${Math.round(heldMs / 1000)}s) — nothing advanced it early`);
      await waitFor(() => D.rooms.get(roomB).phase === "spotlight" && (D.rooms.get(roomB).round || 0) === 4, 8000,
        "expiry advances — the pick timer itself, nothing else");
      await leave();

      /* ===== scene C: the skip control's spec ===== */
      const roomC = mk("r_paceC", ["u_b1"]);
      D.setPhase(roomC, "spotlight", 60);   // choosing: no target
      await enter(roomC);
      const skipVisible = () => host.page.evaluate(() => {
        const el = document.getElementById("eg_skip");
        return el && getComputedStyle(el).display !== "none";
      });
      t.ok(!(await skipVisible()), "skip is HIDDEN during choosing (nothing heard yet)");
      await waitFor(() => host.page.evaluate(() => window.__lc.askEligible(null) === true), 8000, "choosing live");
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => !!D.rooms.get(roomC).spotlight_target, 8000, "an answer is live");
      await waitFor(skipVisible, 8000, "skip appears during the ANSWER");
      // double-tap: ONE fire, ONE rung forward — RULING REVERSED 2026-08-22:
      // skip_phase walks spotlight -> openfloor here, it does not jump to
      // deciding (round is 3 from mk(), but the ANSWER->openfloor hop has
      // no round-dependent fork — that fork only lives at openfloor itself)
      const rpcMark2 = D.rpcLog.length;
      await host.page.evaluate(() => { document.getElementById("eg_skip").click(); document.getElementById("eg_skip").click(); });
      await waitFor(() => D.rooms.get(roomC).phase === "openfloor", 8000, "she's heard enough → ONE rung forward, not straight to her call");
      await host.page.waitForTimeout(1200);
      // round is 4 here, not the mk()-seeded 3: egFireSpotlight's ask_question
      // is what bumps round (asking, not the phase walker) — round bumped
      // 3->4 BEFORE the skip tap; the point under test is that the tap
      // itself didn't touch it further
      const roundAtTap = D.rooms.get(roomC).round;
      t.ok(D.rooms.get(roomC).phase === "openfloor" && roundAtTap === 4,
        `a double-tap fired ONE transition (debounced) — openfloor, round untouched by the skip itself (round=${roundAtTap})`);
      t.ok(await skipVisible(), "skip is still VISIBLE on the open floor — she can speed herself along again, rung by rung");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
