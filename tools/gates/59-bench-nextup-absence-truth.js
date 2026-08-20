/* GATE 59 — bench-nextup-absence-truth: the badge is present in the states
 * the old rule went silent in, and ABSENT in the one state it must not
 * guess at.  Ships with fix/truth-in-bench.
 *
 * THE OTHER HALF OF THE DEFECT.  Gate 58 covers the badge landing on the
 * wrong man.  This gate covers the badge not landing at all.
 *
 * The hearts rule required a UNIQUE NON-ZERO leader among the rendered
 * three.  Three conditions fell out of that, and each one is an ordinary
 * state of a real room:
 *
 *   a tie          two men on the same score        → nobody led
 *   a lone bencher one man waiting                  → nobody led
 *   an all-zero    early in the night, before hearts → nobody led
 *
 * So the room's only published claim about who is next was silent through
 * most of a normal show, and wrong through the rest.  Under line_position
 * none of those three conditions means anything: a globally monotonic
 * column always names exactly one man, whether there is one man or ten and
 * whatever the ledger says.  They are not fixed here, they are GONE — and
 * this gate is what stops them being quietly reintroduced as a guard.
 *
 * THE ONE REAL ABSENCE (scene E).  The bench renders three lanes; the line
 * can be longer than three.  When the man the mechanism names is the fourth,
 * he holds no lane, and there is nothing to light.  The correct behaviour is
 * NO BADGE — not the nearest lane, not the first lane, not the front of the
 * queue as a consolation.  A badge on a lane whose man is not next is the
 * exact defect this pair of gates exists to remove; producing it one lane
 * over as a fallback would reintroduce it wearing a different costume.
 *
 * Scene E is built four-man deliberately: lane order is by membership row
 * id, so the man inserted LAST holds no lane, and he is given the LOWEST
 * line_position so that he — and only he — is who the mechanism names.
 *
 * SCOPE ASSERTIONS FIRST, and they matter more here than anywhere.  Three
 * of the four claims in this gate are claims that something is ABSENT.
 * "No lane wears the badge" is true of a bench that never rendered, of a
 * room that never opened, and of a blank page.  Every scene therefore
 * proves the lanes rendered and proves what the mechanism named, and only
 * then asserts on the badge.
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
  name: "bench-nextup-absence-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@absence.test" });
      ["u_c1", "u_c2", "u_c3", "u_t1", "u_t2", "u_t3", "u_f1", "u_f2", "u_f3", "u_f4", "u_solo"]
        .forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host", { isMobile: true, hasTouch: true });
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      const lanes = () => host.page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 3; i++) {
          const el = document.getElementById("rt_bench" + i);
          if (!el) { out.push(null); continue; }
          out.push({
            i,
            uid: el.dataset.benchuid || null,
            leading: el.classList.contains("is-leading"),
            empty: el.classList.contains("is-empty"),
          });
        }
        return out;
      });
      const nextUid = () => host.page.evaluate(() => {
        const n = window.__lc.nextOffBench(window.__lc.ROOM_STATE.members, window.__lc.CURRENT_ROOM);
        return n ? n.user_id : null;
      });
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

      /* ---------- scene D: a TIE is not a silence ---------- */
      await openWith("r_nextup_tie", "Tie Room", (r) => {
        D.addMember(r, "u_t1", "line", { line_position: 810 });
        D.addMember(r, "u_t2", "line", { line_position: 640 });
        D.addMember(r, "u_t3", "line", { line_position: 402 });
      });
      await waitFor(async () => (await lanes()).filter((l) => l && l.uid).length === 3, 10000, "three lanes (tie)");
      const tieH = await setHearts({ u_t1: 5, u_t2: 5, u_t3: 5 });
      const Dl = await lanes();
      const nD = await nextUid();
      t.ok(Dl.map((l) => l.uid).join(",") === "u_t1,u_t2,u_t3", `three lanes rendered (${Dl.map((l) => l.uid).join(", ")})`);
      t.ok(tieH.u_t1 === tieH.u_t2 && tieH.u_t2 === tieH.u_t3 && tieH.u_t1 > 0,
        `every man carries the same non-zero score — a genuine tie (${tieH.u_t1}/${tieH.u_t2}/${tieH.u_t3})`);
      t.ok(nD === "u_t3", `the mechanism still names exactly one man (${nD})`);
      const leadD = Dl.filter((l) => l.leading).map((l) => l.uid);
      t.ok(leadD.length === 1 && leadD[0] === "u_t3",
        `and the badge is on him — a tie on hearts does not silence the queue (on ${leadD[0] || "nobody"})`);

      /* ---------- scene E: the four-man construction ----------
         The man the mechanism names holds NO rendered lane.  Nothing lights. */
      await openWith("r_nextup_four", "Four Room", (r) => {
        D.addMember(r, "u_f1", "line", { line_position: 500 });
        D.addMember(r, "u_f2", "line", { line_position: 600 });
        D.addMember(r, "u_f3", "line", { line_position: 700 });
        D.addMember(r, "u_f4", "line", { line_position: 120 });   // last lane-wise, FIRST in the queue
      });
      await waitFor(async () => (await lanes()).filter((l) => l && l.uid).length === 3, 10000, "three lanes (four men)");
      await setHearts({ u_f1: 4, u_f2: 2, u_f3: 1, u_f4: 0 });
      const E = await lanes();
      const nE = await nextUid();
      const shown = E.map((l) => l.uid);
      t.ok(shown.join(",") === "u_f1,u_f2,u_f3", `only the first three men hold lanes (${shown.join(", ")})`);
      t.ok(nE === "u_f4", `the mechanism names the fourth man, u_f4 (said ${nE})`);
      t.ok(!shown.includes(nE),
        `…and he holds no rendered lane — the state this scene exists for (lanes: ${shown.join(", ")}, next: ${nE})`);
      const leadE = E.filter((l) => l.leading).map((l) => l.uid);
      t.ok(leadE.length === 0,
        `NO lane wears the badge (${leadE.length ? "wrongly on " + leadE.join(", ") : "none — correct"})`);
      t.ok(!E.find((l) => l.uid === "u_f1").leading,
        "…in particular it does not fall back to the front lane, which is the old defect one lane over");

      /* ---------- scene F: a lone bencher at zero ---------- */
      await openWith("r_nextup_solo", "Solo Room", (r) => {
        D.addMember(r, "u_solo", "line", { line_position: 777 });
      });
      await waitFor(async () => (await lanes()).filter((l) => l && l.uid).length === 1, 10000, "one lane (solo)");
      const soloH = await setHearts({});
      const F = await lanes();
      const nF = await nextUid();
      t.ok(F[0] && F[0].uid === "u_solo" && !F[0].empty, "the lone man holds lane 0 and it is not the empty state");
      t.ok(F[1] && F[1].empty && F[2] && F[2].empty, "…and the other two lanes are empty, so this really is a bench of one");
      t.ok(!soloH.u_solo, "he has no hearts at all — the all-zero state, which the old rule also went silent in");
      t.ok(nF === "u_solo", `the mechanism names him anyway (${nF})`);
      t.ok(F[0].leading, "and he wears NEXT UP — one man waiting is still a man who is next");
      t.ok(!F[1].leading && !F[2].leading, "no empty lane wears it");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
