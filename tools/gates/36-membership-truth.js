/* GATE 36 — membership-truth: one disease, three faces (wave-8 conductor
 * run, b0809.1727).  Ships with fix/membership-truth.
 *
 * SCOPE NOTE (conductor's ruling, 2026-08-13): despite the name, this gate
 * covers EXACTLY the three wave-8 faces below — the host roster split, the
 * evaporating bench row, the ghost row — and the setFault machinery they
 * forced into the double.  It is not a general theory of membership: role
 * semantics live in gates 51/53/54, presence in 50/53, the filter chain in
 * its own listed gate.  Read the name as "the membership diseases of
 * b0809.1727", not "membership, proven".
 *
 *   a. HOST ROSTER SPLIT — the server seated three (four player tabs
 *      unanimous); the host tab alone read line×3 for >30s, survived a
 *      re-auth, and her cold-start auto-seat re-fired every ~4s writing
 *      9-10 duplicate "took a chair" feed lines.
 *   b. EVAPORATING BENCH ROW — a join_line the server accepted but never
 *      kept: the acting UI flipped to LEAVE THE BENCH three times and
 *      quietly expired each time.  No error was ever said.
 *   c. GHOST ROW — a stale line row rendered as a masked "someone" on
 *      every bench all night beside a contradicting "0 IN LINE".
 *
 * HARNESS FIDELITY (the rule): the double had no way to produce ANY of
 * these — every client always read the same fresh truth, and join_line
 * always persisted.  It now has setFault(): {freeze} (reads keep
 * succeeding but return a frozen snapshot — prod's exact face),
 * {error} and {drop} (accepted-but-dropped write).
 *
 * The cures under test:
 *   · the ledger patches the roster (rosterPatchFromEvent): seat/keep/
 *     pass/timeout events converge a client whose reads are bad ≤ one fold
 *   · the seat feed line dedupes (same man, same seat, no unseat between)
 *   · the cold-start/auto-seat loop is idempotent (once per member, row
 *     re-checked)
 *   · the optimistic bench verb reconciles against the CONFIRMED row and
 *     reverts WITH a message when the server disagrees
 *   · activeRows is the ONE row filter: the strip can never show a man
 *     the count excludes, on any role
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
  name: "membership-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_a", "u_c", "u_d", "u_w"].forEach((id) =>
        D.addUser({ id, name: id, face: { photo: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" } }));
      const boot = async (n, u) => {
        const c = await h.newClient(n); c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const w = await boot("w", "u_w");

      /* ============ SCENE 1 — the conductor sequence: host split ============ */
      const r1 = D.addRoom({ id: "r_mt1", host_id: hostU, name: "Dock's Room", phase: "preshow", round: 0 });
      D.addMember(r1, "u_a", "line"); D.addMember(r1, "u_c", "line"); D.addMember(r1, "u_d", "line");
      D.addMember(r1, "u_w", "spectator");
      for (const c of [host, w]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r1) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      await waitFor(() => host.page.evaluate(() =>
        (window.__lc.ROOM_STATE.members || []).filter(m => m.role === "line").length === 3), 8000, "host sees the bench trio");

      // freeze the HOST's roster reads at line×3 — prod's exact face
      D.setFault("active_members", "host", { freeze: true });
      await host.page.evaluate(() => window.__lc.loadRoomState());
      await host.page.waitForTimeout(300);

      // the server seats all three (the players' self-claims), events on the ledger
      ["u_a", "u_c", "u_d"].forEach((u, i) => {
        const row = D.memberRow(r1, u);
        row.role = "chair"; row.seat_index = i; row.last_seen = D.iso();
        D.emit("room_members", "UPDATE", { ...row });
        D.pushEvent(r1, u, "seat", { target_user: u, seat: i });
      });

      // the host CONVERGES ≤ one sync — from the LEDGER, while her reads stay frozen
      const t0 = Date.now();
      await waitFor(() => host.page.evaluate(() =>
        (window.__lc.ROOM_STATE.members || []).filter(m => m.role === "chair").length === 3), 5000,
        "host roster converges to chair×3 despite frozen reads");
      t.ok(true, `HOST SPLIT dead: her roster converged in ${Date.now() - t0}ms via the event fold (reads still frozen at line×3)`);

      // her chair grid renders them; the auto-seat loop stays quiet for 3 poll cycles
      await host.page.waitForTimeout(9000);
      const hostView = await host.page.evaluate(() => ({
        gridChairs: [...document.querySelectorAll("#rt_chairs [data-heartuid]")].length,
        feedSeatLines: [...document.querySelectorAll("#rt_livelayer div")].filter(e => /took a chair/.test(e.textContent)).length,
      }));
      const seatCalls = D.rpcLog.filter(r => r.name === "seat_member");
      const seatUids = new Set(seatCalls.map(r => r.args.user_id));
      t.ok(hostView.gridChairs === 3, `her chair grid seats all three (got ${hostView.gridChairs})`);
      t.ok(seatCalls.length <= 3 && seatUids.size === seatCalls.length,
        `the auto-seat loop is IDEMPOTENT: ${seatCalls.length} seat_member call(s), all unique — never the live run's every-4s re-fire`);
      t.ok(hostView.feedSeatLines === 3,
        `exactly THREE "took a chair" feed lines on the host (got ${hostView.feedSeatLines}) — 9-10 duplicates was the live run`);

      // replayed duplicate seat events (same men, same seats) fold silently
      ["u_a", "u_c", "u_d"].forEach((u, i) => D.pushEvent(r1, u, "seat", { target_user: u, seat: i }));
      await host.page.waitForTimeout(5000);
      const after = await host.page.evaluate(() =>
        [...document.querySelectorAll("#rt_livelayer div")].filter(e => /took a chair/.test(e.textContent)).length);
      t.ok(after === 3, `duplicate seat events fold SILENTLY: still ${after} feed lines after a full replay`);

      // the neutral player agrees throughout
      t.ok(await w.page.evaluate(() =>
        (window.__lc.ROOM_STATE.members || []).filter(m => m.role === "chair").length === 3),
        "the player's view never disagreed (chair×3)");

      D.setFault("active_members", "host", null);
      for (const c of [host, w]) { await c.page.evaluate(() => window.__lc.leaveRoom()); await c.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 }); }

      /* ============ SCENE 2 — the evaporating bench row ============ */
      const r2 = D.addRoom({ id: "r_mt2", host_id: hostU, name: "MT2", phase: "preshow", round: 0 });
      await w.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r2) });
      await w.page.waitForSelector("#room.show", { timeout: 10000 });
      D.setFault("join_line", "w", { drop: true });   // accepted, row never kept — prod's tab b
      await w.page.evaluate(() => document.getElementById("rt_joinline").click());
      await waitFor(() => w.page.evaluate(() => /LEAVE THE BENCH/i.test(document.getElementById("rt_joinline").textContent)), 5000, "optimistic verb");
      t.ok(true, "the accepted write flips the verb optimistically (actor's truth)");
      await waitFor(() => w.page.evaluate(() => /TAKE A BENCH SEAT/i.test(document.getElementById("rt_joinline").textContent)), 8000, "the verb reverts");
      const said = await w.page.evaluate(() => document.getElementById("toast").textContent);
      t.ok(/didn't take|try again/i.test(said),
        `the disagreement is SAID in show language ("${said}") — the live run's verb just quietly expired`);
      t.ok((D.memberRow(r2, "u_w") || { role: "spectator" }).role !== "line", "server truth unchanged (no line row)");
      D.setFault("join_line", "w", null);

      // …and the SAME click path persists once the server keeps the row (control)
      await w.page.evaluate(() => document.getElementById("rt_joinline").click());
      await waitFor(() => (D.memberRow(r2, "u_w") || {}).role === "line", 6000, "the healthy join persists");
      const freshMs = Date.now() - Date.parse(D.memberRow(r2, "u_w").last_seen);
      t.ok(freshMs < 5000, `the joined row reads FRESH at birth (heartbeat rides the join; age ${freshMs}ms)`);
      await w.page.evaluate(() => window.__lc.leaveRoom());
      await w.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });

      /* ============ SCENE 3 — the ghost row: strip and count agree ============ */
      const r3 = D.addRoom({ id: "r_mt3", host_id: hostU, name: "MT3", phase: "preshow", round: 0 });
      const ghost = D.addMember(r3, "u_a", "line");
      ghost.last_seen = D.iso(D.now() - 10 * 60_000);   // ten minutes cold
      for (const c of [host, w]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r3) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      await host.page.waitForTimeout(1200);
      for (const [label, c] of [["host", host], ["player", w]]) {
        const v = await c.page.evaluate(() => ({
          lanes: [...document.querySelectorAll("#lineitems [data-benchuid]")].length,
          watchbar: document.getElementById("rt_watchbar").textContent,
          count: window.__lc.roomCounts(window.__lc.ROOM_STATE.members, window.__lc.CURRENT_ROOM).line,
        }));
        t.ok(v.lanes === 0 && v.count === 0 && /0 IN LINE/.test(v.watchbar),
          `${label}: the stale row is excluded from strip AND count (lanes=${v.lanes}, count=${v.count}, "${v.watchbar}") — one derivation`);
      }

      const errs = [host, w].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
