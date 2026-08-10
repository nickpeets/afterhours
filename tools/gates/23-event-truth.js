/* GATE 23 — event-truth: every transition reaches every role, from the
 * same stream, or from the truth poll when the stream dies.  Ships with
 * fix/event-truth.
 *
 * The live-run disease (first complete show): transitions rode realtime
 * only — a backgrounded iOS tab's dead socket missed the question, the
 * round popup fired per-client on render timing, and the ending never
 * emitted an event at all; the rooms-status fallback was blocked on the
 * HOST by her own LAST CALL board (the same #finale element the guard
 * checked) and skipped the WINNER's ceremony entirely.
 *
 * Now: realtime is the fast path; syncRoomTruth() reconciles the full
 * room row AND replays missed events through the SAME handleEvent, every
 * 4s, every role.  end_show emits a finale ledger event (double; prod
 * note in the PR).  showEnded() is the ONE end-of-show door.
 *
 * Five windows: host + chair + bench + crowd + guest.  The CROWD window
 * has its realtime deliberately severed — it must live entirely off the
 * truth poll.  Budgets: live-socket roles ≤300ms skew; the deafened
 * client ≤ one poll interval (6s).  The finale assertion is the one that
 * would have caught tonight.
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
  name: "event-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      D.spotlightShape = "prod";   // wave-8 fidelity: prod's engine_emit key names + timestamptz-with-space
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_s3", "u_b1", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (name, uid) => {
        const c = await h.newClient(name);
        if (uid) c.login(uid);
        await c.goto();
        await c.page.waitForSelector(uid ? "#lobby" : "#auth", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const chair = await boot("chair", "u_s1");    // spotlight target, then WINNER
      const bench = await boot("bench", "u_b1");
      const crowd = await boot("crowd", "u_w");
      const guest = await boot("guest", null);      // unauthenticated: auth screen only
      const room = D.addRoom({ id: "r_truth", host_id: hostU, name: "Truth Night", phase: "spotlight", round: 0 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      D.addMember(room, "u_s3", "chair", { seat_index: 2 });
      D.addMember(room, "u_b1", "line");
      D.addMember(room, "u_w", "spectator");
      for (const c of [host, chair, bench, crowd]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      // sever the crowd's realtime: it lives off the truth poll alone
      await crowd.page.evaluate(() => { window.__realtimePush = undefined; });

      const LIVE = [["host", host], ["chair", chair], ["bench", bench]];

      /* ---- transition 1+2: the ask → round popup + question card ---- */
      const seen = {};
      const pollers = LIVE.map(([k, c]) => (async () => {
        for (let i = 0; i < 300 && !seen[k]; i++) {
          const v = await c.page.evaluate(() => {
            const q = document.getElementById("eg_question");
            const r = q.getBoundingClientRect();
            return getComputedStyle(q).display !== "none" && r.width > 0;
          }).catch(() => false);
          if (v) { seen[k] = Date.now(); break; }
          await new Promise((r) => setTimeout(r, 20));
        }
      })());
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await Promise.all(pollers);
      t.ok(seen.host && seen.chair && seen.bench, "the question card paints on every live-socket role (COMPUTED visible, not just inline style)");
      const skew = Math.max(seen.host, seen.chair, seen.bench) - Math.min(seen.host, seen.chair, seen.bench);
      t.ok(skew <= 300, `live-socket skew ${skew}ms (≤300ms)`);
      for (const [k, c] of LIVE) {
        const beat = await c.page.evaluate(() => !!document.querySelector("#room .lc-beat--round") || window.__LASTROUND === 1);
        t.ok(beat, `${k}: the ROUND popup fired from the spotlight event (one moment, every role)`);
      }
      // the deafened crowd catches up inside one poll interval
      await waitFor(() => crowd.page.evaluate(() => {
        const q = document.getElementById("eg_question");
        return getComputedStyle(q).display !== "none" && q.getBoundingClientRect().width > 0;
      }), 6_500, "the DEAFENED crowd still gets the question — the truth poll delivers");
      t.ok(true, "a dead websocket costs one poll interval, never the show");
      t.ok(await crowd.page.evaluate(() => window.__LASTROUND === 1), "…including the round popup state");

      /* ---- transition 3+4: deliberation, then HER CALL ---- */
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "deliberation", 30);
      for (const [k, c] of LIVE) {
        await waitFor(() => c.page.evaluate(() => /DELIBERAT/i.test(document.getElementById("rt_phase").textContent)), 8000,
          k + " reaches deliberation");
      }
      D.setPhase(room, "deciding", 60);
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 8000, "her call: the decide card (host)");
      for (const [k, c] of [["chair", chair], ["bench", bench]]) {
        await waitFor(() => c.page.evaluate(() => document.getElementById("eg_drumroll").style.display !== "none"), 8000,
          k + " sees SHE'S DECIDING");
      }
      await waitFor(() => crowd.page.evaluate(() => document.getElementById("eg_drumroll").style.display !== "none"), 6_500,
        "the deafened crowd reaches her call via the poll");
      t.ok(true, "deliberation and her call land on every role, both channels");

      /* ---- transition 5: THE FINALE — the assertion that would have caught tonight ---- */
      // the host keeps u_s1, then ends the show through the REAL UI: LAST
      // CALL board → confirm → end.  Her board must never park her.
      D.rpc("host", "keep_member", { room_id: room, user_id: "u_s1" });
      await waitFor(() => host.page.evaluate(() => window.__lc.keptFinalists().length === 1), 8000, "u_s1 is KEPT");
      await host.page.evaluate(() => document.getElementById("rt_endshow").click());   // LAST CALL board (same #finale element!)
      await waitFor(() => host.page.evaluate(() => document.getElementById("finale").classList.contains("show")), 8000, "the board is up");
      await host.page.evaluate(() => {
        const f = [...document.querySelectorAll("#fin_board .finalist")][0];
        f.click();                                            // choose u_s1
      });
      await waitFor(() => host.page.evaluate(() => !!document.getElementById("fin_confirm")), 8000, "confirm screen");
      await host.page.evaluate(() => document.getElementById("fin_confirm").click());
      await waitFor(() => D.rooms.get(room).status === "ended" && D.rooms.get(room).winner_id === "u_s1", 8000, "end_show lands");
      t.ok(D.events.some((e) => e.room_id === room && e.type === "finale" && e.payload?.winner_id === "u_s1"),
        "the ending is a LEDGER event now (finale room_event emitted)");

      // the WINNER sees the show end: snap ceremony or the winner board
      await waitFor(() => chair.page.evaluate(() =>
        document.getElementById("snap").classList.contains("show") ||
        document.getElementById("finale").classList.contains("show")), 10_000,
        "the WINNER's screen transitions (snap ceremony or finale)");
      t.ok(true, "the winner is TOLD — tonight he never was");
      // the HOST leaves the board for the closing screen (photo-wait 5s max)
      await waitFor(() => host.page.evaluate(() => {
        const f = document.getElementById("finale");
        return f.classList.contains("show") && /IT'S|WALKED/i.test(f.textContent);
      }), 12_000, "the HOST's board becomes the closing screen — no more parking in deliberating");
      t.ok(true, "the host's own LAST CALL board no longer blocks her ending");
      // bench (live socket) and the deafened crowd both reach the winner card
      for (const [k, c, ms] of [["bench", bench, 20_000], ["crowd(deaf)", crowd, 25_000]]) {
        await waitFor(() => c.page.evaluate(() => {
          const f = document.getElementById("finale");
          return f.classList.contains("show") && /IT'S/i.test(f.textContent);
        }), ms, k + " reaches the winner card");
      }
      t.ok(true, "every role reaches the ending — live sockets fast, dead sockets one poll behind");

      /* ---- the guest was never touched ---- */
      const g = await guest.page.evaluate(() => ({
        auth: !document.getElementById("auth").classList.contains("hide"),
        room: document.getElementById("room").classList.contains("show"),
        fin: document.getElementById("finale").classList.contains("show"),
      }));
      t.ok(g.auth && !g.room && !g.fin, "the guest window stayed on the auth screen through the whole show");

      const errs = [host, chair, bench, crowd, guest].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across all five windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
