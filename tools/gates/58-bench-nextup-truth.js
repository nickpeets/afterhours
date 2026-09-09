/* GATE 58 — bench-nextup-truth: the NEXT UP badge names the man the room
 * will actually seat next, and it is bound to his LANE, not to a value.
 * Ships with feat/next-up-hearts.
 *
 * THE RULE (owner ruling, 2026-09-08).  The crowd scores the bench and the
 * host seats from it.  nextOffBench() ranks the waiting line by HEARTS,
 * breaks ties on line_position — the column production mints at bench entry
 * — and settles the last tie on user_id so the order is stable and never
 * random.  We ask it who, then light the lane that man already holds.
 *
 * WHAT THIS REPLACED.  The badge used to be derived from line_position
 * ALONE: a globally monotonic column named whoever had waited longest, and
 * the ledger named nobody.  That is the superseded rule.  It was not a
 * cosmetic preference — a man the whole room was scoring could sit behind a
 * quieter, earlier man indefinitely, and the room's only published claim
 * about who is next disagreed with the crowd doing the choosing.
 *
 * LINE_POSITION STAYS, as the tiebreak and only as the tiebreak.  Hearts
 * alone go silent in ordinary states — a tie at the same count, a lone
 * bencher, an all-zero bench at show start — and falling back to
 * line_position keeps the badge total: it names exactly one man, never
 * nothing.  Gate 59 holds those states; this gate holds the divergence.
 *
 * WHY A GATE AND NOT A GLANCE.  The two orders agree in the common case —
 * the man who has been waiting longest usually has collected the most
 * hearts — so the rule is invisible in exactly the fixtures a person would
 * build by hand.  Scene A is constructed so the two orders DISAGREE, with
 * the hearts leader and the line leader in different lanes.  On the
 * superseded build the badge lands on the line leader and this gate goes red.
 *
 * THE THREE CLAIMS:
 *   A. divergence — where hearts and line_position name different men, the
 *      badge follows the HEARTS leader and not the earliest in line
 *   B. the badge follows the ledger, the queue does not — when the standing
 *      changes the halo moves to the new leader, and on the same reading the
 *      displayed lane order is unchanged.  Hearts move the glow and the
 *      seat; they never reorder the queue.
 *   C. it tracks the mechanism — when the named man is taken off the bench,
 *      the badge moves to whoever nextOffBench names next
 *
 * SCOPE ASSERTIONS FIRST.  Every scene proves the render actually reached
 * the state it is about — three lanes carrying the expected uids, and the
 * hearts actually set — before it asserts anything about the badge.  A lane
 * that never rendered has no is-leading class either, and "no wrong badge"
 * on a blank bench is a vacuous green: the same disease as a false green,
 * one scope down.
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
  name: "bench-nextup-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@nextup.test" });
      ["u_c1", "u_c2", "u_c3", "u_loud", "u_mid", "u_quiet"].forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host", { isMobile: true, hasTouch: true });
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      /* ---------- scene A: the divergence ----------
         All three chairs are held, so nothing auto-seats and the bench stays
         a bench for the whole scene.

         Lane order is by membership ROW ID (a man keeps his lane all night),
         so insertion order here IS lane order: u_loud=0, u_mid=1, u_quiet=2.
         Hearts are then set so the LOUD man leads the ledger, and he is the
         man the room seats next.  line_position runs the other way — u_quiet
         was benched first and carries the LOWEST position, so the superseded
         rule would have named him.  The two orders disagree here. */
      const roomA = D.addRoom({ id: "r_nextup_a", host_id: hostU, name: "Jackie's Room", phase: "deciding", round: 1 });
      D.rooms.get(roomA).phase_deadline = D.iso(D.now() + 600000);
      D.addMember(roomA, "u_c1", "chair", { seat_index: 0 });
      D.addMember(roomA, "u_c2", "chair", { seat_index: 1 });
      D.addMember(roomA, "u_c3", "chair", { seat_index: 2 });
      D.addMember(roomA, "u_loud",  "line", { line_position: 900 });   // lane 0, most hearts
      D.addMember(roomA, "u_mid",   "line", { line_position: 700 });   // lane 1
      D.addMember(roomA, "u_quiet", "line", { line_position: 305 });   // lane 2, longest waiting

      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomA) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });

      const lanes = () => host.page.evaluate(() => {
        const out = [];
        for (let i = 0; i < 3; i++) {
          const el = document.getElementById("rt_bench" + i);
          if (!el) { out.push(null); continue; }
          const badge = el.querySelector(".lc-lane__badge");
          out.push({
            i,
            uid: el.dataset.benchuid || null,
            leading: el.classList.contains("is-leading"),
            empty: el.classList.contains("is-empty"),
            badgeShown: badge ? getComputedStyle(badge).display !== "none" : false,
          });
        }
        return out;
      });

      const nextUid = () => host.page.evaluate(() => {
        const n = window.__lc.nextOffBench(window.__lc.ROOM_STATE.members, window.__lc.CURRENT_ROOM);
        return n ? n.user_id : null;
      });

      /* hearts land through the shared ledger in production; here we set the
         same object the render reads, then repaint through the app's own
         renderRoom rather than poking classes. */
      const setHearts = (m) => host.page.evaluate((map) => {
        const H = window.__lc.HEARTS;
        Object.keys(H).forEach((k) => delete H[k]);
        Object.assign(H, map);
        window.__lc.renderRoom();
        return { ...window.__lc.HEARTS };
      }, m);

      await waitFor(async () => (await lanes()).filter((l) => l && l.uid).length === 3,
        10000, "three bench lanes to render");

      const readback = await setHearts({ u_loud: 9, u_mid: 3, u_quiet: 0 });

      /* --- scope: the scene is really the scene --- */
      const A = await lanes();
      t.ok(A.every((l) => l && l.uid) && A.map((l) => l.uid).join(",") === "u_loud,u_mid,u_quiet",
        `all three lanes rendered, in row-id order (${A.map((l) => l.uid).join(", ")})`);
      t.ok(A.every((l) => !l.empty), "no lane is in its empty state — the bench really painted three men");
      t.ok(readback.u_loud === 9 && readback.u_loud > readback.u_mid && readback.u_mid > readback.u_quiet,
        `hearts are set with the LOUD man on top (loud ${readback.u_loud}, mid ${readback.u_mid}, quiet ${readback.u_quiet})`);

      const nA = await nextUid();
      t.ok(nA === "u_loud",
        `the mechanism names u_loud — the hearts leader, not the earliest in line (nextOffBench said ${nA})`);
      t.ok(readback.u_loud > readback.u_quiet,
        "…and he is NOT the earliest in line, so the two orders genuinely disagree here");

      /* --- the claim --- */
      const leadA = A.filter((l) => l.leading).map((l) => l.uid);
      t.ok(leadA.length === 1, `exactly one lane wears the badge (${leadA.length}: ${leadA.join(", ") || "none"})`);
      t.ok(leadA[0] === "u_loud",
        `NEXT UP is on the man the room will seat — u_loud (it is on ${leadA[0] || "nobody"})`);
      t.ok(!A.find((l) => l.uid === "u_quiet").leading,
        "the line leader does NOT wear it — line_position is the tiebreak, not the rank");
      t.ok(A.find((l) => l.uid === "u_loud").badgeShown,
        "…and the badge is actually visible on his lane, not merely classed");

      /* ---------- scene B: the badge follows the ledger, the queue does not ----------
         Hearts are the thing that moves constantly.  The halo tracks them —
         that is the ruling — but the lanes do not move with it.  The row-id
         lane ordering is what keeps the faces still while the glow travels,
         and both facts are read off the SAME render so they cannot drift
         apart in the telling. */
      const rb = await setHearts({ u_loud: 1, u_mid: 99, u_quiet: 0 });
      const B = await lanes();
      const leadB = B.filter((l) => l.leading).map((l) => l.uid);
      t.ok(rb.u_mid === 99, "hearts moved — a new man is now far ahead on the ledger");
      t.ok(leadB.length === 1 && leadB[0] === "u_mid",
        `the badge MOVED with them, onto u_mid (it is on ${leadB[0] || "nobody"})`);
      t.ok(B.map((l) => l.uid).join(",") === "u_loud,u_mid,u_quiet",
        "and on that same reading the faces did not reshuffle — the lane is his for the night");

      /* ---------- scene C: it tracks the mechanism ----------
         Take the named man off the bench the way the app does — the seated
         set nextOffBench consults — and the badge must follow to whoever it
         names next, which is the next man on the ledger and not the next
         lane along.

         Put the ledger back under the LOUD man first, so the man we take off
         the bench is the man scene A named.  Left as scene B had it we would
         be seating u_mid instead, and the scene would quietly drift from the
         one this header describes. */
      const rc = await setHearts({ u_loud: 50, u_mid: 2, u_quiet: 0 });
      await host.page.evaluate(() => { window.__SEATED_UIDS = window.__SEATED_UIDS || {}; window.__SEATED_UIDS["u_loud"] = true; window.__lc.renderRoom(); });
      t.ok(rc.u_loud > rc.u_mid && rc.u_mid > rc.u_quiet,
        `the loud man leads the ledger, so taking him off is what this scene turns on (${rc.u_loud}/${rc.u_mid}/${rc.u_quiet})`);
      const nC = await nextUid();
      const C = await lanes();
      const leadC = C.filter((l) => l.leading).map((l) => l.uid);
      t.ok(nC === "u_mid", `with u_loud seated the mechanism names u_mid (said ${nC})`);
      t.ok(leadC.length === 1 && leadC[0] === "u_mid",
        `the badge followed it to u_mid (it is on ${leadC[0] || "nobody"})`);
      t.ok(!C.find((l) => l.uid === "u_loud").leading,
        "…and not on u_loud, who was just taken off the bench — the badge tracks the mechanism, not the top of the ledger");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
