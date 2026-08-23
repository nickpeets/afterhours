/* GATE 62 — server-rpc-swaps-runtime: the RUNTIME half of no-client-room-writes
 * (gate 61 is the static half).  Three swapped call sites are exercised for
 * real, through the actual client code paths, against the PATCHED local
 * double — each proven by D.rpcLog, the instrument used in gates 13/14/17/38.
 *
 * SKIP-TRUTH (block 3), REWRITTEN 2026-08-22.  RULING REVERSED.  The
 * 2026-08-21 revision (kept for the trail, below) asserted end_deliberation
 * — that encoded the 2026-08-20 ruling, which held that reusing skip_phase
 * (a single-step phase-order walker with six other production call sites)
 * would silently retire SPEC wave 5's straight-to-deciding contract, so
 * eg_skip got its own function.  A live show on 2026-08-22 proved that
 * reasoning backwards: the straight jump WAS the bug — a host pressing
 * "she's heard enough" mid-ANSWER or mid-OPEN FLOOR was thrown all the way
 * to HER CALL, past pacing the crowd was still mid-experiencing.
 * end_deliberation is now DROPPED from production (DDL, 2026-08-22,
 * verbatim pg_get_functiondef read and a pg_proc call-site sweep posted to
 * the advisor before the DROP ran).  eg_skip is back on skip_phase.  All
 * three clauses are stated independently, same discipline as the last
 * rewrite — a gate that asserts the wrong RPC is worse than no gate:
 *     (i)   skip_phase fires, for the room the host actually holds
 *     (ii)  NOT a raw rooms write, and NOT end_deliberation — the two wrong
 *           answers this call site has now had, each excluded by a direct
 *           observation rather than inferred from (i) succeeding
 *     (iii) a phase event carrying phase='deciding' lands in the LEDGER.
 *           Traced verbatim from Studio, 2026-08-22: skip_phase ->
 *           advance_phase -> engine_set_phase -> engine_emit, which inserts
 *           the room_events row.  Unlike end_deliberation's old payload,
 *           production's carries NO "reason" key here — skip_phase and an
 *           ordinary clock expiry are indistinguishable in the ledger, by
 *           production's own design.  Asserted as an absence, not assumed.
 *
 * The test room starts at phase 'deliberation', not 'openfloor'.  That's
 * the one rung with no round-dependent branching (deliberation -> deciding,
 * unconditionally) — production's advance_phase forks at openfloor
 * (-> deliberation at round>=3, else -> spotlight).  The local double's
 * skip_phase/advance_phase case now models that fork too (added 2026-08-22,
 * same PR — gates 07 and 30 needed it to test the button honestly at
 * openfloor), so 'deliberation' here is a choice of the simplest unambiguous
 * rung to prove clauses (i)-(iii), not a gap being sidestepped.
 *
 * 2026-08-21 REVISION TEXT, kept for the trail: "The previous revision
 * asserted eg_skip fired skip_phase.  That encoded the FIRST ruling, which
 * the 2026-08-20 ruling overturned once gates 07 and 30 showed that reusing
 * skip_phase — a single-step phase-order walker with six other production
 * call sites — would silently retire SPEC wave 5's straight-to-deciding
 * contract.  eg_skip gets its own function.  index.html and gate 61 both
 * said end_deliberation while this gate said skip_phase: the two gates
 * contradicted each other and this one was red."
 *
 * Clause (ii)'s raw-write half needs an instrument rpcLog does not provide:
 * rpcLog only sees op==="rpc".  A raw write is op==="table", so this gate
 * wraps D.table for the duration and records every table call, letting the
 * absence of a rooms UPDATE be PROVEN rather than assumed.
 *
 * Blocks 1 and 2's RPCs (set_phase_deadline, clear_spotlight_target) remain
 * PENDING PRODUCTION DDL as documented when this gate was first written —
 * unverified here.  Block 3's skip_phase is different: a live, six-call-site
 * production function, read verbatim from Studio (2026-08-22) alongside the
 * chain it calls into — this gate's block 3 is no longer "local double only"
 * blind about whether the real function lives, though it still runs against
 * the local double, not production, for the runtime assertions themselves.
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
  name: "server-rpc-swaps-runtime",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;

      /* clause (ii) instrument: rpcLog records op==="rpc" only, so a raw
         sb.from("rooms").update(...) — op==="table" — is invisible to it.
         _dispatch reaches this as this.table(...), so an own-property
         assignment intercepts. */
      const tableLog = [];
      const origTable = D.table.bind(D);
      D.table = (clientId, spec) => {
        tableLog.push({ clientId, table: spec.table, action: spec.action, values: spec.values });
        return origTable(clientId, spec);
      };

      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_b1", "u_ghost"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby, #room.show", { timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);

      /* --- 1. set_phase_deadline, via passPickOpen (bench stocked) --- */
      const r1 = D.addRoom({ id: "r_dl", host_id: hostU, name: "Deadline Night", phase: "openfloor", round: 1 });
      D.rooms.get(r1).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(r1, "u_s1", "chair", { seat_index: 0 });
      D.addMember(r1, "u_s2", "chair", { seat_index: 1 });
      D.addMember(r1, "u_b1", "line");   // bench:1 — passPickOpen must return true
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r1) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      const before1 = D.rpcLog.length;
      const opened = await host.page.evaluate(() => window.__lc.passPickOpen());
      t.ok(opened === true, "passPickOpen() opens the pick window (bench stocked)");
      await waitFor(() => D.rpcLog.slice(before1).some((c) => c.name === "set_phase_deadline"), 5000,
        "set_phase_deadline RPC fired by passPickOpen");
      const dlCall = D.rpcLog.slice(before1).find((c) => c.name === "set_phase_deadline");
      t.ok(dlCall.args.room_id === r1, "...for the room the host actually holds open");
      t.ok(typeof dlCall.args.until_ts === "string" && Date.parse(dlCall.args.until_ts) > Date.now(),
        "...with a future until_ts (server-side floor/ceiling checked in gate 63's double coverage)");
      t.ok(D.rooms.get(r1).phase_deadline === dlCall.args.until_ts,
        "the double actually applied it — phase_deadline now matches the call");
      await host.page.evaluate(() => window.__lc.passPickClear());

      /* --- 2. clear_spotlight_target, via segmentCollapse's render-time
         detection (a ghost target: CURRENT_ROOM says spotlit, ROOM_STATE
         disagrees) --- */
      const r2 = D.addRoom({ id: "r_col", host_id: hostU, name: "Collapse Night", phase: "openfloor", round: 0 });
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r2) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      const before2 = D.rpcLog.length;
      await host.page.evaluate((uid) => {
        window.__lc.CURRENT_ROOM.phase = "spotlight";
        window.__lc.CURRENT_ROOM.spotlight_target = uid;
        window.__lc.renderRoom();
      }, "u_ghost");
      await waitFor(() => D.rpcLog.slice(before2).some((c) => c.name === "clear_spotlight_target"), 5000,
        "clear_spotlight_target RPC fired by segmentCollapse's ghost-target detection");
      const clearCall = D.rpcLog.slice(before2).find((c) => c.name === "clear_spotlight_target");
      t.ok(clearCall.args.room_id === r2, "...for the right room");
      t.ok(D.rooms.get(r2).spotlight_target === null, "the double actually cleared it");
      await host.page.evaluate(() => window.__lc.passPickClear());

      /* --- 3. SKIP-TRUTH: skip_phase, via a real tap on eg_skip --- */
      // deliberation, not openfloor: the one rung skip_phase's production
      // chain (advance_phase) walks unconditionally, no round>=3 fork to
      // model — see the header comment for why.
      const r3 = D.addRoom({ id: "r_skip", host_id: hostU, name: "Skip Night", phase: "deliberation", round: 1 });
      D.rooms.get(r3).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(r3, "u_s1", "chair", { seat_index: 0 });
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r3) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() =>
        document.getElementById("eg_skip").style.display !== "none"), 8000, "the skip control is up (host, seated, deliberation)");

      const before3 = D.rpcLog.length;
      const beforeTable3 = tableLog.length;
      const beforeEvents3 = D.events.length;
      await host.page.click("#eg_skip");

      /* (i) the right RPC, for the right room */
      await waitFor(() => D.rpcLog.slice(before3).some((c) => c.name === "skip_phase"), 5000,
        "clause (i): skip_phase RPC fired by the eg_skip tap");
      const skipCall = D.rpcLog.slice(before3).find((c) => c.name === "skip_phase");
      t.ok(skipCall.args.room_id === r3, "clause (i): ...for the room the host actually holds open");
      t.ok(D.rooms.get(r3).phase === "deciding",
        "clause (i): the double actually applied it — deliberation's only next rung is deciding");

      /* (ii) neither of the two wrong answers this call site has had */
      const rawRoomWrites = tableLog.slice(beforeTable3)
        .filter((w) => w.table === "rooms" && w.action === "update");
      t.ok(rawRoomWrites.length === 0,
        `clause (ii): no raw rooms-table write accompanied the tap — got ${rawRoomWrites.length} (${JSON.stringify(rawRoomWrites.map((w) => w.values))})`);
      const endCalls = D.rpcLog.slice(before3).filter((c) => c.name === "end_deliberation");
      t.ok(endCalls.length === 0,
        `clause (ii): end_deliberation was NOT called — it's retired and dropped from production; got ${endCalls.length}`);

      /* (iii) the ledger, not just the column */
      await waitFor(() => D.events.slice(beforeEvents3).some((e) =>
        e.room_id === r3 && e.type === "phase" && e.payload && e.payload.phase === "deciding"), 5000,
        "clause (iii): a phase event with phase='deciding' lands in the ledger");
      const phaseEvt = D.events.slice(beforeEvents3).find((e) =>
        e.room_id === r3 && e.type === "phase" && e.payload && e.payload.phase === "deciding");
      t.ok(!!phaseEvt, "clause (iii): the phase='deciding' ledger event exists");
      t.ok(phaseEvt.payload.reason === undefined,
        `clause (iii): ...and it carries NO reason key — skip_phase and an ordinary clock expiry are indistinguishable in the ledger, by production's own design (got reason=${phaseEvt.payload.reason})`);

      const errs = [host].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
