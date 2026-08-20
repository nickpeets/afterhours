/* GATE 46 — bench-order-truth: the room has ONE answer to "who is next off
 * the bench", and a pick window never expires into an empty chair.
 * Ships with fix/pick-window-autoseat.
 *
 * THE RULING (owner, 2026-08-11): "the 20-second window must not expire into
 * an empty chair.  On expiry, auto-seat the longest-waiting benched man and
 * announce it in the feed.  She still picks, she just doesn't have to.  No
 * self-seating, canon intact."
 *
 * WHAT WAS THERE BEFORE.  At the expiry site the window simply closed:
 *
 *     if(PASS_PICK && Date.now()>PASS_PICK.until){
 *       passPickClear();
 *       sb.rpc("skip_phase",{...})            // …and the chair stays empty
 *     }
 *
 * She passed a man, was given twenty seconds to choose his replacement, and
 * if she was reading the room instead of the card the show moved on a chair
 * short.  The bench watched a seat they were waiting for go by unfilled.
 *
 * WHY THIS GATE IS ABOUT ORDER AND NOT JUST ABOUT SEATING.  "Longest-waiting"
 * has to mean something.  Measured against production, same man, two readings:
 *
 *     spectator → line_position null,  joined_at 07:44:32
 *     benched   → line_position 249,   joined_at 07:44:32   (unchanged)
 *
 * `line_position` is minted at BENCH ENTRY and is globally monotonic.
 * `joined_at` is ROOM entry.  Ordering by joined_at — the obvious choice, and
 * the only field the double used to carry — seats a twenty-minute lurker ahead
 * of a man who benched on arrival.  In a show whose whole premise is waiting
 * your turn, that is the bug, and it would have shipped green.
 *
 * ONE DERIVATION, NOT TWO (owner's call, echoing fix/count-truth).  Curtain-up
 * already auto-seats three men without her tapping, and it took whatever order
 * activeRows happened to yield.  That is a second answer to a question the
 * server already answers in a column.  Both paths now read the SAME helper, and
 * this gate holds them to naming the same man.
 *
 * WHAT THIS GATE COVERS, AND WHAT IT DOES NOT.  This header used to claim
 * there was no second hand-rolled ordering of role==="line" rows ANYWHERE
 * (static).  It asserts no such thing and could not: the static section greps
 * two named SLICES of the file, not the file.  The claim was wider than the
 * evidence under it — which is the defect this gate exists to catch, committed
 * in the gate's own prose.  Restated to match what the assertions reach:
 *
 *   STATIC — the helper itself, and the two seating paths that were rewritten
 *     1. a named single derivation nextOffBench exists; it orders by
 *        line_position; it never reads joined_at.  (That third check is
 *        guarded on the slice being non-empty, so a missing helper fails here
 *        rather than passing vacuously against an empty string.)
 *     2. benchQueue DELEGATES to it and carries no second copy of the
 *        comparator
 *     3. inside the pick-window-expiry slice and the curtain-up slice — and
 *        only inside those two — seating asks the helper instead of ordering
 *        the rows itself
 *
 *   RUNTIME
 *     4. the expiry seats the LOWEST line_position man, not the array's first
 *     5. it is announced — the feed carries a beat, and she never tapped
 *     6. curtain-up and the expiry, given the same bench, name the same man
 *
 * OUT OF SCOPE — named here so it is not mistaken for covered:
 *   - autoSeatFromLine() takes line[0] of an UNSORTED filter of role==="line"
 *     rows (index.html 3649-3652).  That is a second ordering in the sense
 *     this gate's old header denied; it is the classic-room path, neither
 *     static slice reaches it, and nothing here asserts against it.  Logged in
 *     tools/DESIGN-DIFF.md under "autoSeatFromLine — unsorted line[0]".  Not
 *     fixed in fix/truth-in-bench, deliberately.
 *   - the render's lane ordering sorts the same rows by membership ROW ID, so
 *     a man keeps his lane all night.  That is a second ordering BY DESIGN: it
 *     decides which lane a man occupies, never who leaves the bench.  Gates 58
 *     and 59 hold the NEXT UP badge to the seating order instead.
 */
"use strict";
const { Harness } = require("../lib/harness");

function jsOf(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join("\n/* --- */\n");
}

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
  name: "bench-order-truth",
  async run(t, ctx) {
    /* ================= STATIC: one derivation ================= */
    const js = jsOf(ctx.html);

    t.ok(/function\s+nextOffBench\s*\(/.test(js),
      "there is a named, single derivation of bench order — nextOffBench()");

    const nob = js.slice(js.indexOf("function nextOffBench"), js.indexOf("function nextOffBench") + 600);
    t.ok(/line_position/.test(nob),
      "…and it orders by line_position, the column production mints at bench entry");
    /* guarded on nob being real: an absent helper yields an empty slice, and
       "no joined_at in an empty string" is a pass that means nothing.  A
       vacuous green is the same disease as a false green, one scope down. */
    t.ok(nob.length > 50 && !/joined_at/.test(nob),
      "…never by joined_at, which is ROOM entry and would seat a lurker ahead of an early bencher");

    /* Every site that decides who leaves the bench must go through it.  The
       two known auto-seat paths are curtain-up and the pick-window expiry. */
    const expiry = js.slice(js.indexOf("PASS_PICK && Date.now()>PASS_PICK.until"),
                            js.indexOf("PASS_PICK && Date.now()>PASS_PICK.until") + 900);
    t.ok(/nextOffBench\(/.test(expiry),
      "the pick-window expiry asks nextOffBench who is next, rather than deciding for itself");

    const curtain = js.slice(js.indexOf("cold start: full bench"), js.indexOf("cold start: full bench") + 1400);
    /* benchQueue is allowed here BECAUSE it delegates to nextOffBench — that
       delegation is asserted below, so this is one derivation reached two
       ways, not two derivations. */
    t.ok(/benchQueue\(|nextOffBench\(/.test(curtain),
      "curtain-up asks the same helper — one answer to 'who is next', not two");
    const bq = js.slice(js.indexOf("function benchQueue"), js.indexOf("function benchQueue") + 500);
    t.ok(bq.length > 50 && /nextOffBench\(/.test(bq) && !/line_position/.test(bq),
      "…and benchQueue DELEGATES to nextOffBench rather than carrying a second copy of the comparator");
    t.ok(!/filter\(m=>m\.role==="line"[^)]*\)\s*\.slice\(0,3\)/.test(curtain.replace(/\s+/g, "")),
      "…and no longer takes an unordered slice of the line rows");

    /* ================= RUNTIME ================= */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@bench.test" });
      ["u_s1", "u_hold1", "u_hold2", "u_early", "u_mid", "u_late"].forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host", { isMobile: true, hasTouch: true });
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      /* ---------- scenario A: the pick window expires with a bench ----------
         EXACTLY ONE CHAIR OPENS.  An earlier draft of this fixture seated only
         the man she passes, which left all three chairs empty — and a room
         with nobody seated and a full bench is a CURTAIN UP, where seating
         three is correct.  The gate failed and the app was right; the fixture
         was asking the wrong question.  Two men stay in their chairs so the
         pass opens one seat and one seat only.

         Bench order is deliberately NOT insertion order: u_late is added
         first but carries the HIGHEST line_position, so a gate that reads
         the array's head instead of the column picks the wrong man. */
      const roomA = D.addRoom({ id: "r_bench_a", host_id: hostU, name: "Jack's Room", phase: "deciding", round: 1 });
      D.rooms.get(roomA).phase_deadline = D.iso(D.now() + 120000);
      D.addMember(roomA, "u_s1", "chair", { seat_index: 0 });
      D.addMember(roomA, "u_hold1", "chair", { seat_index: 1 });
      D.addMember(roomA, "u_hold2", "chair", { seat_index: 2 });
      D.addMember(roomA, "u_late", "line", { line_position: 940 });
      D.addMember(roomA, "u_early", "line", { line_position: 301 });   // ← the longest waiting
      D.addMember(roomA, "u_mid", "line", { line_position: 615 });

      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomA) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });

      t.ok(await host.page.evaluate(() => window.__lc.nextOffBench(window.__lc.ROOM_STATE.members) &&
             window.__lc.nextOffBench(window.__lc.ROOM_STATE.members).user_id === "u_early"),
        "nextOffBench names u_early (line_position 301) — the lowest, not the array's first");

      /* she passes, the window opens, and then she does nothing at all */
      await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"),
        10000, "the decide card");
      await host.page.evaluate(() => document.getElementById("eg_dpass").click());
      await host.page.evaluate(() => document.getElementById("rt_seat0").click());
      await waitFor(() => (D.memberRow(roomA, "u_s1") || {}).role === "spectator", 8000, "the pass lands");
      await waitFor(() => host.page.evaluate(() => !!window.__lc.PASS_PICK), 8000, "the pick window opens");

      /* Nothing is clicked from here on.  That is the whole point of the
         gate, and it is guaranteed by CONSTRUCTION — this driver issues no
         further input — rather than by an assertion.  An earlier draft
         "proved" it by comparing a __benchTapCount that does not exist,
         which reads 0 both times and passes no matter what the app does.
         A vacuous green is a false green one scope down; deleted. */
      await waitFor(() => (D.memberRow(roomA, "u_early") || {}).role === "chair", 30000,
        "the LONGEST-WAITING man to be seated when the window expires untouched");

      const after = await host.page.evaluate(() => ({
        pick: window.__lc.PASS_PICK,
        rows: window.__lc.ROOM_STATE.members.map((m) => ({ u: m.user_id, role: m.role, lp: m.line_position })),
      }));
      const seated = after.rows.filter((r) => r.role === "chair" || r.role === "kept").map((r) => r.u);
      const stillLine = after.rows.filter((r) => r.role === "line").map((r) => r.u).sort();

      t.ok(seated.includes("u_early"),
        `the empty chair is filled rather than carried into the next round (seated: ${seated.join(", ")})`);
      t.ok(!seated.includes("u_mid") && !seated.includes("u_late"),
        `exactly ONE man comes off the bench — the window fills a seat, it does not empty the bench (seated: ${seated.join(", ")})`);
      t.ok(seated.includes("u_hold1") && seated.includes("u_hold2"),
        "the two men who were never passed keep their chairs — one seat opened, one seat filled");
      t.ok(stillLine.join(",") === "u_late,u_mid",
        `the men behind him keep their places (${stillLine.join(", ")})`);
      t.ok(!after.pick, "the window marker is cleared");

      /* --- announced in the feed --- */
      const beat = await host.page.evaluate(() =>
        (document.getElementById("room").innerText || "").toLowerCase());
      t.ok(/bench|next up|takes the chair|steps up/.test(beat),
        "the room is TOLD who came off the bench — an auto-seat is a beat, not a silent mutation");

      /* --- and the server was asked once, not three times --- */
      const seatCalls = D.rpcLog ? D.rpcLog.filter((c) => c.name === "seat_member" && c.room_id === roomA).length : 1;
      t.ok(seatCalls <= 1, `seat_member fired at most once for this window (fired ${seatCalls}×)`);

      /* ---------- scenario B: curtain-up names the SAME man ---------- */
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });

      const roomB = D.addRoom({ id: "r_bench_b", host_id: hostU, name: "Jack's Room II", phase: "preshow", round: 0 });
      D.addMember(roomB, "u_late", "line", { line_position: 940 });
      D.addMember(roomB, "u_early", "line", { line_position: 301 });
      D.addMember(roomB, "u_mid", "line", { line_position: 615 });

      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomB) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });

      await waitFor(() => {
        const seatedB = D.activeMembers(roomB).filter((m) => m.role === "chair");
        return seatedB.length >= 3;
      }, 25000, "curtain-up to seat three");

      const bySeat = D.activeMembers(roomB)
        .filter((m) => m.role === "chair")
        .sort((a, b) => (a.seat_index ?? 0) - (b.seat_index ?? 0))
        .map((m) => m.user_id);

      t.ok(bySeat[0] === "u_early",
        `curtain-up gives seat 0 to the SAME man the expiry would have — u_early (got ${bySeat[0]})`);
      t.ok(bySeat.join(",") === "u_early,u_mid,u_late",
        `and fills the chairs in bench order, not array order (${bySeat.join(", ")})`);

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
