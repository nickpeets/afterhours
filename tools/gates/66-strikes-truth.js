/* GATE 66 — strikes-truth: the bench lane renders the strikes column that
 * engine_award_seat already writes — the LAST LIFE badge (is-lastlife) and
 * the pip lights follow m.strikes, and a man engine_award_seat has already
 * bounced to role:'spectator' at strikes 3 holds no lane at all.
 *
 * This gate does not exercise the RPC that awards a strike — that is
 * engine_award_seat's contract, server-side, and out of scope here.  It
 * proves the READ side: renderRoom's bench-lane block (index.html, the
 * `for(let i=0;i<3;i++){ ... }` loop over `benched`) draws m.strikes||0
 * correctly once the roster carries it, and that the existing role==='line'
 * filter — not a second removal path — is what takes a three-strike man off
 * the bench.
 *
 * ONE LANE, THREE SCENES.  u_strike is benched once; each scene patches his
 * client-side roster row (the same technique gate 58/59 use for HEARTS —
 * direct mutation of the object renderRoom reads, then a renderRoom() call,
 * no RPC round-trip) and re-reads the lane.  Lane order is by membership row
 * id (renderRoom sorts `line` by `a.id||a.user_id`), so with one bench member
 * he is deterministically lane 0 throughout.
 *
 * SCOPE ASSERTIONS FIRST.  Scenes B and C both assert an ABSENCE — no
 * is-lastlife, no lit pips, no lane at all — and an absence is meaningless
 * unless the render is proven live first.  Each negative scene therefore
 * confirms the lane (or, pre-flip, u_strike's lane) actually rendered before
 * asserting what is missing from it.
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
  name: "strikes-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@strikes.test" });
      ["u_c1", "u_c2", "u_c3", "u_strike"].forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host", { isMobile: true, hasTouch: true });
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      const roomA = D.addRoom({ id: "r_strikes", host_id: hostU, name: "Jackie's Room", phase: "deciding", round: 1 });
      D.rooms.get(roomA).phase_deadline = D.iso(D.now() + 600000);
      D.addMember(roomA, "u_c1", "chair", { seat_index: 0 });
      D.addMember(roomA, "u_c2", "chair", { seat_index: 1 });
      D.addMember(roomA, "u_c3", "chair", { seat_index: 2 });
      D.addMember(roomA, "u_strike", "line", { line_position: 300 });

      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomA) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });

      const lanes = () => host.page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 3; i++) {
          const el = document.getElementById("rt_bench" + i);
          if (!el) { out.push(null); continue; }
          const pipsOn = [...el.querySelectorAll(".lc-lane__pips span")].filter((p) => p.classList.contains("on")).length;
          out.push({
            i,
            uid: el.dataset.benchuid || null,
            lastlife: el.classList.contains("is-lastlife"),
            empty: el.classList.contains("is-empty"),
            pipsOn,
          });
        }
        return out;
      });

      /* patches the SAME object renderRoom reads — window.__lc.ROOM_STATE.members
         — then repaints through the app's own renderRoom, exactly as gate
         58/59's setHearts repaints through HEARTS. */
      const setMember = (uid, patch) => host.page.evaluate(({ uid, patch }) => {
        const m = (window.__lc.ROOM_STATE.members || []).find((x) => x.user_id === uid);
        if (m) Object.assign(m, patch);
        window.__lc.renderRoom();
        return m ? { ...m } : null;
      }, { uid, patch });

      await waitFor(async () => { const l = await lanes(); return l[0] && l[0].uid === "u_strike" && !l[0].empty; },
        10000, "u_strike's bench lane to render");

      /* ---------- scene A: two strikes lights is-lastlife ---------- */
      const mA = await setMember("u_strike", { strikes: 2 });
      const A = await lanes();
      t.ok(mA && mA.strikes === 2, "scope: the roster row genuinely carries strikes:2 client-side");
      t.ok(A[0] && A[0].uid === "u_strike" && !A[0].empty, "scope: lane 0 still carries u_strike after the patch");
      t.ok(A[0].lastlife, "is-lastlife lights the lane at two strikes");
      t.ok(A[0].pipsOn === 2, `exactly two pip spans carry .on (saw ${A[0].pipsOn})`);

      /* ---------- scene B: zero strikes, no is-lastlife ---------- */
      const mB = await setMember("u_strike", { strikes: 0 });
      const B = await lanes();
      t.ok(mB && mB.strikes === 0, "scope: the roster row carries strikes:0");
      t.ok(B[0] && B[0].uid === "u_strike" && !B[0].empty, "scope: lane 0 still carries u_strike at zero strikes");
      t.ok(!B[0].lastlife, "is-lastlife is NOT set at zero strikes");
      t.ok(B[0].pipsOn === 0, `zero pip spans carry .on (saw ${B[0].pipsOn})`);

      /* ---------- scene C: three strikes, man absent from bench ----------
         engine_award_seat has already flipped role to 'spectator' by the
         time strikes reaches 3 — this scene patches the roster row to that
         shape directly, the same way scenes A/B patch strikes alone, and
         proves the EXISTING role==='line' filter is what removes him: no
         second removal path is touched or needed. */
      const preC = await lanes();
      t.ok(preC[0] && preC[0].uid === "u_strike" && !preC[0].empty,
        "scope: before the flip, u_strike genuinely holds lane 0");

      const mC = await setMember("u_strike", { strikes: 3, role: "spectator" });
      const C = await lanes();
      t.ok(mC && mC.role === "spectator" && mC.strikes === 3,
        "scope: the roster row now carries role:spectator, strikes:3 — engine_award_seat's shape");
      t.ok(!C.some((l) => l && l.uid === "u_strike"), "no bench lane carries his benchuid any longer");
      t.ok(C[0] && C[0].empty, "…and the lane at his former slot (0) is is-empty, not a stale rendering of him");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
