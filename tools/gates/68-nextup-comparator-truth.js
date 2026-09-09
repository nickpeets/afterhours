/* GATE 68 — nextup-comparator-truth: the comparator, one case at a time.
 *
 * Gates 58 and 59 drive the badge through a room and assert what lights.
 * This gate goes at the derivation underneath them: nextOffBench(), read
 * through window.__lc, with no reimplementation of the ordering here.  If a
 * case below disagrees with the real function, the finding is the
 * function's, not the gate's.
 *
 * The ruling (2026-09-08) ranks the waiting line by HEARTS, breaks ties on
 * line_position, and settles the last tie on user_id.  That is three
 * behaviours, and each is a different way for the badge to go wrong:
 *
 *   all-zero      the ledger says nothing    → earliest in line
 *   a tie         the ledger says two men    → earliest of the tied
 *   a clear lead  ledger and line disagree   → hearts win
 *   lone bencher  one man, no contest        → badge present, not silent
 *   no lane       the named man is fourth    → nothing lights
 *
 * And one thing that must NOT move in any of them: the displayed queue.
 * Lane order is membership row id — FIFO — and hearts never touch it.  Every
 * case re-reads the lane order and asserts it is still the insertion order
 * it started as, so a comparator that quietly re-sorted the render would
 * fail here even while naming the right man.
 *
 * benchQueue() is the same derivation for the paths that need several —
 * curtain-up fills three chairs from it — so it is asserted on the same
 * ledger: three men in hearts order, not in line order.
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
  name: "nextup-comparator-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@comparator.test" });
      ["u_c1", "u_c2", "u_c3", "u_z1", "u_z2", "u_z3", "u_solo", "u_g1", "u_g2", "u_g3", "u_g4"]
        .forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host", { isMobile: true, hasTouch: true });
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      const lanes = () => host.page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 3; i++) {
          const el = document.getElementById("rt_bench" + i);
          if (!el) { out.push(null); continue; }
          out.push({ i, uid: el.dataset.benchuid || null, leading: el.classList.contains("is-leading") });
        }
        return out;
      });
      const shown = async () => (await lanes()).filter((l) => l && l.uid).map((l) => l.uid);
      const lead = async () => (await lanes()).filter((l) => l && l.leading).map((l) => l.uid);
      const nextUid = () => host.page.evaluate(() => {
        const n = window.__lc.nextOffBench(window.__lc.ROOM_STATE.members, window.__lc.CURRENT_ROOM);
        return n ? n.user_id : null;
      });
      const queueUids = (k) => host.page.evaluate((n) => {
        const q = window.__lc.benchQueue(window.__lc.ROOM_STATE.members, window.__lc.CURRENT_ROOM, n);
        return (q || []).map((m) => m && m.user_id);
      }, k);
      const setHearts = (m) => host.page.evaluate((map) => {
        const H = window.__lc.HEARTS;
        Object.keys(H).forEach((k) => delete H[k]);
        Object.assign(H, map);
        window.__lc.renderRoom();
        return { ...window.__lc.HEARTS };
      }, m);
      const openWith = async (roomId, name, seed) => {
        await host.page.evaluate(() => window.__lc.leaveRoom()).catch(() => {});
        const r = D.addRoom({ id: roomId, host_id: hostU, name, phase: "deciding", round: 1 });
        D.rooms.get(r).phase_deadline = D.iso(D.now() + 600000);
        D.addMember(r, "u_c1", "chair", { seat_index: 0 });
        D.addMember(r, "u_c2", "chair", { seat_index: 1 });
        D.addMember(r, "u_c3", "chair", { seat_index: 2 });
        seed(r);
        await host.page.evaluate((rr) => window.__lc.openRoom(rr), { ...D.rooms.get(r) });
        await host.page.waitForSelector("#room.show", { timeout: 10000 });
        return r;
      };

      /* ---------- one room, three men, four ledgers ----------
         Insertion order IS lane order, so the rendered queue reads
         u_z1,u_z2,u_z3 throughout.  line_position runs the other way:
         u_z2 is earliest at 300, u_z1 latest at 700.  Only the hearts
         change between the cases below. */
      await openWith("r_cmp_three", "Comparator Room", (r) => {
        D.addMember(r, "u_z1", "line", { line_position: 700 });
        D.addMember(r, "u_z2", "line", { line_position: 300 });
        D.addMember(r, "u_z3", "line", { line_position: 500 });
      });
      await waitFor(async () => (await shown()).length === 3, 10000, "three bench lanes");
      const seatOrder = await shown();
      t.ok(seatOrder.join(",") === "u_z1,u_z2,u_z3",
        `scope: three lanes rendered in row-id order (${seatOrder.join(", ")})`);

      /* case 1: all-zero → earliest in line */
      const h0 = await setHearts({});
      t.ok(Object.keys(h0).length === 0, "scope: the ledger is empty — an all-zero bench at show start");
      const n0 = await nextUid();
      t.ok(n0 === "u_z2", `all-zero falls back to the earliest in line, u_z2 (said ${n0})`);
      const q0 = await shown();
      t.ok(q0.join(",") === "u_z1,u_z2,u_z3", `…and the displayed queue is untouched FIFO (${q0.join(", ")})`);

      /* case 2: a tie → earliest of the TIED, not earliest overall */
      const h1 = await setHearts({ u_z1: 5, u_z2: 0, u_z3: 5 });
      t.ok(h1.u_z1 === 5 && h1.u_z3 === 5 && h1.u_z2 === 0,
        "scope: two men tied on top, and the man earliest in line is NOT one of them");
      const n1 = await nextUid();
      t.ok(n1 === "u_z3", `a tie breaks on line_position among the tied — u_z3 at 500 (said ${n1})`);
      t.ok(n1 !== "u_z2", "…and NOT by falling back to the earliest of the whole line, u_z2");
      const q1 = await shown();
      t.ok(q1.join(",") === "u_z1,u_z2,u_z3", `…and the displayed queue is untouched FIFO (${q1.join(", ")})`);

      /* case 3: a clear leader → hearts beat an earlier line_position */
      const h2 = await setHearts({ u_z1: 9, u_z2: 2, u_z3: 5 });
      t.ok(h2.u_z1 === 9 && h2.u_z3 === 5 && h2.u_z2 === 2,
        "scope: the man LAST in line now leads the ledger outright");
      const n2 = await nextUid();
      t.ok(n2 === "u_z1", `hearts beat an earlier line_position — u_z1 at 700 (said ${n2})`);
      const l2 = await lead();
      t.ok(l2.length === 1 && l2[0] === "u_z1", `the badge is on him, on his own lane (${l2.join(", ") || "nobody"})`);
      const q2 = await shown();
      t.ok(q2.join(",") === "u_z1,u_z2,u_z3", `…and the displayed queue is STILL untouched FIFO (${q2.join(", ")})`);

      /* benchQueue: the same derivation, three deep.  Hearts order here is
         u_z1,u_z3,u_z2 — which is neither the lane order nor the line order,
         so a queue that quietly used either would be caught. */
      const bq = await queueUids(3);
      t.ok(bq.join(",") === "u_z1,u_z3,u_z2",
        `benchQueue fills three in hearts order (said ${bq.join(", ") || "none"})`);
      t.ok(bq[0] === n2, "…and its head is the man nextOffBench names — one derivation, not two");

      /* case 4: a lone bencher → the badge is present, not silent.
         This is one of the states the superseded hearts-only badge went
         quiet in: no unique non-zero leader, so nothing lit. */
      await openWith("r_cmp_solo", "Solo Room", (r) => {
        D.addMember(r, "u_solo", "line", { line_position: 777 });
      });
      await waitFor(async () => (await shown()).length === 1, 10000, "one bench lane");
      const hs = await setHearts({});
      t.ok(Object.keys(hs).length === 0, "scope: he has no hearts at all");
      const ns = await nextUid();
      t.ok(ns === "u_solo", `one man waiting is named, hearts or no hearts (said ${ns})`);
      const ls = await lead();
      t.ok(ls.length === 1 && ls[0] === "u_solo", `and his lane wears the badge (${ls.join(", ") || "nobody"})`);

      /* case 5: the named man holds no rendered lane → nothing lights.
         Under the superseded rule u_g1 at 500 would have been named and the
         badge would have lit on a lane; under the ruling the ledger names
         the fourth man, who has no lane, and the correct render is silence. */
      await openWith("r_cmp_four", "Four Room", (r) => {
        D.addMember(r, "u_g1", "line", { line_position: 500 });
        D.addMember(r, "u_g2", "line", { line_position: 600 });
        D.addMember(r, "u_g3", "line", { line_position: 700 });
        D.addMember(r, "u_g4", "line", { line_position: 900 });
      });
      await waitFor(async () => (await shown()).length === 3, 10000, "three lanes (four men)");
      const hg = await setHearts({ u_g1: 1, u_g2: 1, u_g3: 1, u_g4: 9 });
      t.ok(hg.u_g4 === 9, "scope: the hearts leader is the fourth man, the one with no lane");
      const sg = await shown();
      t.ok(sg.join(",") === "u_g1,u_g2,u_g3", `scope: only the first three men hold lanes (${sg.join(", ")})`);
      const ng = await nextUid();
      t.ok(ng === "u_g4", `the mechanism names the man with no rendered lane, u_g4 (said ${ng})`);
      const lg = await lead();
      t.ok(lg.length === 0, `NOTHING lights (${lg.length ? "wrongly on " + lg.join(", ") : "none — correct"})`);
      t.ok(sg.join(",") === "u_g1,u_g2,u_g3", "…and the queue is still the FIFO it rendered as");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
