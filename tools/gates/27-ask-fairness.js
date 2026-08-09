/* GATE 27 — ask-fairness: coverage is per-CYCLE — everyone asked once
 * before anyone twice; pills persist until the cycle completes; the card
 * lands on every window, INCLUDING the target's own, inside the skew
 * budget.  Ships with fix/ask-fairness.
 *
 * The live bugs: (a) the question card landed late for one specific
 * target; (b) a seated man showed NO ASKED pill after being asked — prod
 * increments rooms.round on EVERY ask, so the old (member, server-round)
 * pill vanished the moment the NEXT man was asked.  The pill now reads
 * the CYCLE coverage set (RULING 8/9 wave 4): it accumulates until every
 * seated man has been asked, then clears for cycle 2; the rotation and
 * the TAP TO ASK affordance derive from the same set; a replaced man's
 * slate is clean.
 *
 * Proven here (host + A + B + C + crowd windows):
 *   - ask A, ask B → pills persist on BOTH A and B; C is up next by the
 *     rotation AND by the host's TAP TO ASK affordance;
 *   - ask C → the cycle completes → ALL pills clear for cycle 2;
 *   - cycle 2: ask A again, pass A, seat D → D's slate is clean and the
 *     rotation offers him;
 *   - EVERY ask's card render is measured on EVERY window — per-target,
 *     per-role skew ≤ the gate-23 budget (300ms), target's own included.
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
  name: "ask-fairness",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_a", "u_b", "u_c", "u_d", "u_w"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (n, u) => {
        const c = await h.newClient(n); c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const wa = await boot("wa", "u_a");
      const wb = await boot("wb", "u_b");
      const wc = await boot("wc", "u_c");
      const crowd = await boot("crowd", "u_w");
      const room = D.addRoom({ id: "r_fair", host_id: hostU, name: "Fair Night", phase: "spotlight", round: 0 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      D.addMember(room, "u_b", "chair", { seat_index: 1 });
      D.addMember(room, "u_c", "chair", { seat_index: 2 });
      D.addMember(room, "u_d", "line");
      D.addMember(room, "u_w", "spectator");
      const WINDOWS = [["host", host], ["A", wa], ["B", wb], ["C", wc], ["crowd", crowd]];
      for (const [, c] of WINDOWS) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }

      const backToChoosing = async () => {
        await waitFor(async () => {
          if (D.rooms.get(room).phase !== "spotlight" || D.rooms.get(room).spotlight_target) {
            D.rooms.get(room).spotlight_target = null;
            D.setPhase(room, "spotlight", 60);
          }
          await host.page.evaluate(() => window.__lc.egRefreshRoom());
          return host.page.evaluate(() => window.__lc.askEligible(null) === true);
        }, 15_000, "choosing window");
      };
      const cardDown = async () => {
        for (const [, c] of WINDOWS) await c.page.evaluate(() => { document.getElementById("eg_question").style.display = "none"; });
      };
      const askAndMeasure = async (label) => {
        await cardDown();
        const seen = {};
        const pollers = WINDOWS.map(([k, c]) => (async () => {
          for (let i = 0; i < 300 && !seen[k]; i++) {
            const v = await c.page.evaluate(() => {
              const q = document.getElementById("eg_question");
              return getComputedStyle(q).display !== "none" && q.getBoundingClientRect().width > 0;
            }).catch(() => false);
            if (v) { seen[k] = Date.now(); break; }
            await new Promise((r) => setTimeout(r, 20));
          }
        })());
        await host.page.evaluate(() => window.__lc.egFireSpotlight());
        await Promise.all(pollers);
        const times = Object.values(seen);
        t.ok(times.length === WINDOWS.length,
          `${label}: the card painted on all five windows (got ${times.length})`);
        const skew = Math.max(...times) - Math.min(...times);
        t.ok(skew <= 300, `${label}: per-target skew ${skew}ms — target's own window included (≤300ms)`);
        return D.rooms.get(room).spotlight_target;
      };
      const pills = () => host.page.evaluate(() => [0, 1, 2].map((i) =>
        document.getElementById("rt_seat" + i).classList.contains("is-asked") ? 1 : 0).join(""));

      /* --- cycle 1: A, then B — pills PERSIST --- */
      const t1 = await askAndMeasure("ask #1");
      t.ok(t1 === "u_a", `rotation opens with seat 0 (asked ${t1})`);
      await backToChoosing();
      const t2 = await askAndMeasure("ask #2");
      t.ok(t2 === "u_b", `cycle coverage picks the next unasked man (asked ${t2})`);
      await waitFor(async () => (await pills()) === "110", 6000, "pills persist on A AND B (the live Dock bug)");
      t.ok(true, "pills accumulate through the cycle — no per-ask-round vanishing");
      // C is up next: rotation AND the host's TAP TO ASK affordance agree
      await backToChoosing();
      const affordance = await host.page.evaluate(() => [0, 1, 2].map((i) => {
        const el = document.getElementById("rt_seat" + i);
        const b = el.querySelector(".hostctl");
        return b && getComputedStyle(b).display !== "none" ? 1 : 0;
      }).join(""));
      t.ok(affordance === "001", `only C carries TAP TO ASK in the choosing beat (got ${affordance})`);
      t.ok(await host.page.evaluate(() =>
        window.__lc.askTargets().find((m) => !window.__lc.askedThisCycle(m.user_id)).user_id === "u_c"),
        "the rotation names C as up next — same coverage set as the pills");

      /* --- ask C: the cycle completes, ALL pills clear --- */
      const t3 = await askAndMeasure("ask #3");
      t.ok(t3 === "u_c", `the cycle closes on C (asked ${t3})`);
      await waitFor(async () => (await pills()) === "000", 6000, "cycle complete → every pill clears for cycle 2");
      t.ok(true, "a completed cycle wipes the slate — cycle 2 begins clean");

      /* --- cycle 2 + replacement: a new man's slate is clean --- */
      await backToChoosing();
      const t4 = await askAndMeasure("ask #4 (cycle 2)");
      t.ok(t4 === "u_a", `cycle 2 restarts the rotation (asked ${t4})`);
      D.rpc("host", "pass_member", { room_id: room, user_id: "u_a" });
      D.rpc("host", "seat_member", { room_id: room, user_id: "u_d", seat_index: 0 });
      await waitFor(() => host.page.evaluate(() =>
        document.getElementById("rt_seat0").dataset.heartuid === "u_d" &&
        !document.getElementById("rt_seat0").classList.contains("is-asked")), 8000,
        "the replacement's chair carries NO pill");
      t.ok(await host.page.evaluate(() => window.__lc.askedThisCycle("u_d") === false),
        "a passed/replaced man's slate is clean in the coverage set too");

      const errs = WINDOWS.flatMap(([, c]) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across five windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
