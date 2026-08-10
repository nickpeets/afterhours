/* GATE 37 — question-truth: the spotlight question is computed-visible on
 * EVERY role, including the target, under prod's exact conditions.  Ships
 * with fix/question-truth.
 *
 * Conductor run (b0809.1727): the question card rendered on the HOST tab
 * only — the target and every other role showed the ASKED pill (the fold
 * ran) but never the question text.  4/5 missing.  This was wave 3's fix
 * and gate 23 passes — a gate-passes/prod-fails divergence.
 *
 * HARNESS FIDELITY (what the double faked):
 *   1. realtime was perfect — every client got every event instantly; in
 *      prod the players' folds ride the 4s truth poll.  h.muteRealtime()
 *      now models the lossy client.
 *   2. the payload was the double's own shape — prod's engine_emit ships
 *      {target, round, question, answer_deadline} with a timestamptz-
 *      with-a-space (sometimes zone-naive).  spotlightShape="prod" /
 *      "prod-naive" emit that exact shape; gates 20/23 now run "prod".
 *   3. the answer window was a lazy 30s — a poll-latency fold could never
 *      look "expired".  The window is configurable (answerWindowMs).
 *
 * The cure: "history" is SUPERSEDED-ness, never age — the fold paints
 * unless the room has moved past this spotlight (newer round / phase
 * beyond it); the poll path paints from the cached event payload even
 * when the rooms row carries a null deadline; naive timestamps parse as
 * UTC (parseServerTs).
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

const cardState = (c) => c.page.evaluate(() => {
  const el = document.getElementById("eg_question");
  const cs = getComputedStyle(el);
  return {
    visible: cs.display !== "none" && cs.visibility !== "hidden",
    text: (document.getElementById("eg_qtext") || {}).textContent || "",
    who: (document.getElementById("eg_qfor") || {}).textContent || "",
  };
});

module.exports = {
  name: "question-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      D.spotlightShape = "prod";
      D.answerWindowMs = 8_000;   // the conductor's short prod window — polls MUST still paint
      D.questions.push({ id: "q1", text: "Window or aisle, and do you talk to the stranger next to you?" });
      D.questions.push({ id: "q2", text: "What's the last thing you fixed with your own hands?" });
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_t", "u_r", "u_b", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (n, u) => {
        const c = await h.newClient(n); c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const target = await boot("target", "u_t");
      const rival = await boot("rival", "u_r");
      const bench = await boot("bench", "u_b");
      const crowd = await boot("crowd", "u_w");
      // prod's lossy realtime: every NON-HOST role folds via the truth poll only
      ["target", "rival", "bench", "crowd"].forEach((n) => h.muteRealtime(n));

      const room = D.addRoom({ id: "r_qt", host_id: hostU, name: "Q Night", phase: "spotlight", round: 0 });
      D.rooms.get(room).phase_deadline = null;   // prod runs null rooms deadlines — the card must not care
      D.addMember(room, "u_t", "chair", { seat_index: 0 });
      D.addMember(room, "u_r", "chair", { seat_index: 1 });
      D.addMember(room, "u_b", "line");
      D.addMember(room, "u_w", "spectator");
      const all = [host, target, rival, bench, crowd];
      for (const c of all) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }

      /* --- the ask lands (prod resolver path, prod payload shape) --- */
      D.rpc("host", "ask_question", { room_id: room, question_id: "q1", target: "u_t" });
      const roles = [["host", host], ["TARGET", target], ["rival chair", rival], ["bench", bench], ["spectator", crowd]];
      for (const [label, c] of roles) {
        await waitFor(async () => (await cardState(c)).visible && /stranger next to you/.test((await cardState(c)).text), 12_000,
          label + " paints the question");
        const st = await cardState(c);
        t.ok(st.visible && /stranger next to you/.test(st.text),
          `${label}: question text computed-visible ("${st.text.slice(0, 34)}…") — poll-fold, short window, null rooms deadline`);
      }
      t.ok(true, "ALL FIVE roles painted the card — the conductor's 4/5-missing frame is dead");

      /* --- a NAIVE timestamp (no zone) still paints — the parse hazard --- */
      D.rooms.get(room).spotlight_target = null;
      D.spotlightShape = "prod-naive";
      D.rpc("host", "ask_question", { room_id: room, question_id: "q2", target: "u_r" });
      await waitFor(async () => /own hands/.test((await cardState(crowd)).text), 12_000, "naive-ts ask paints on the crowd");
      t.ok(/own hands/.test((await cardState(target)).text) || /own hands/.test((await cardState(crowd)).text),
        "a zone-naive answer_deadline parses as UTC and still paints (parseServerTs)");
      const tms = await host.page.evaluate(() =>
        window.__lc.parseServerTs("2026-08-10 12:00:00") - window.__lc.parseServerTs("2026-08-10T12:00:00Z"));
      t.ok(tms === 0, "parseServerTs: naive === explicit-UTC (never local-time drift)");

      /* --- superseded is still superseded: no zombie card --- */
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "openfloor", 60);
      await waitFor(async () => (await crowd.page.evaluate(() => (window.__lc.CURRENT_ROOM || {}).phase)) === "openfloor", 10_000, "crowd sees openfloor");
      await crowd.page.evaluate(() => { document.getElementById("eg_question").style.display = "none"; });
      // replay the ROUND-1 ask (an old event) — it must NOT resurrect the card
      const old = D.events.find((e) => e.type === "spotlight");
      await crowd.page.evaluate((p) => window.__lc.handleEvent({ id: "replay-old", room_id: p.room, type: "spotlight", user_id: "u_host", payload: p.payload, created_at: new Date(0).toISOString() }),
        { room, payload: old.payload });
      await crowd.page.waitForTimeout(600);
      t.ok(await crowd.page.evaluate(() => getComputedStyle(document.getElementById("eg_question")).display === "none"),
        "a replayed OLD spotlight event does not resurrect the card past its phase (superseded ≠ aged)");

      const errs = all.flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
