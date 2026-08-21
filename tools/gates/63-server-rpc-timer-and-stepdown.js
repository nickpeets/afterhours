/* GATE 63 — server-rpc-timer-and-stepdown: the reset_to_preshow RPC gate 62
 * couldn't reach without a real clock.
 *
 *   reset_to_preshow: the empty-stage janitor inside startHostPoll's REAL
 *   4000ms setInterval (SOURCE: confirmed interval, index.html).  No fake
 *   timers — an actual ~8-9s wait for two ticks, same real-timer discipline
 *   as gate 46/30's PASS_PICK expiries.
 *
 * step_down REMOVED 2026-08-21 (re-audit).  The previous revision drove
 * step_down with D.rpc(clientId, "step_down", {room_id}) directly against
 * the double and asserted on D.memberRow/D.events — the double, calling the
 * double, checked against the double.  No page, no client code, no
 * index.html.  It passed identically whether the app worked or was a blank
 * file.  step_down has no client wiring in this branch, so there is nothing
 * real yet to test; a gate that proves nothing is worse than fewer checks,
 * so the seven step_down assertions are deleted rather than kept as
 * double-spec decoration.  When step_down gets a client call site, it earns
 * a runtime gate the same way end_deliberation did in gate 62.
 *
 * reset_to_preshow is PENDING PRODUCTION DDL — this gate proves the LOCAL
 * double's modeled behaviour only; it is not evidence the real Postgres
 * function exists or matches.
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 250));
  }
};

module.exports = {
  name: "server-rpc-timer-and-stepdown",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;

      /* AUDIT 2026-08-21: this gate proved reset_to_preshow FIRES but never
         proved the raw write it replaced is GONE at runtime — both can be
         true at once.  rpcLog can't see a raw write: that's op==="table",
         not op==="rpc".  Wrap D.table so the absence is observed, not
         assumed (same instrument as gate 62's clause (ii)). */
      const tableLog = [];
      const origTable = D.table.bind(D);
      D.table = (clientId, spec) => {
        tableLog.push({ clientId, table: spec.table, action: spec.action, values: spec.values });
        return origTable(clientId, spec);
      };

      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby, #room.show", { timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);

      /* --- reset_to_preshow: real timer, empty stage, two ticks --- */
      const room = D.addRoom({ id: "r_empty", host_id: hostU, name: "Empty Stage", phase: "openfloor", round: 3 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
      D.rooms.get(room).spotlight_target = "u_ghost";
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      const beforeReset = D.rpcLog.length;
      const beforeTableReset = tableLog.length;
      await host.page.evaluate(() => window.__lc.startHostPoll());
      t.ok(D.rooms.get(room).status !== undefined, "fixture sanity: room exists before the wait");
      await waitFor(() => D.rpcLog.slice(beforeReset).some((c) => c.name === "reset_to_preshow"), 12_000,
        "reset_to_preshow fires after two empty 4000ms ticks (real timer, ~8-9s)");
      const resetCall = D.rpcLog.slice(beforeReset).find((c) => c.name === "reset_to_preshow");
      t.ok(resetCall.args.room_id === room, "...for the emptied room");
      const after = D.rooms.get(room);
      t.ok(after.phase === "preshow" && (after.round || 0) === 0 && after.spotlight_target === null,
        "the double actually reset: preshow, round 0, target cleared");

      /* Allowlist BY MATCHED CONTEXT, not by count: host_seen_at (index.html
         ~L3351) is a rooms UPDATE that rides the SAME host poll as the
         janitor, so it lands inside this window every run — one of the
         three writes gate 61 records as logged-not-fixed, and not what
         "not a raw write" is about here.  The claim is narrow: no raw write
         touched the STAGE COLUMNS reset_to_preshow now owns. */
      const STAGE_COLS = ["phase", "round", "spotlight_target", "phase_deadline", "spotlight_question_id"];
      const rawStageWrites = tableLog.slice(beforeTableReset).filter((w) =>
        w.table === "rooms" && w.action === "update" &&
        w.values && STAGE_COLS.some((c) => Object.prototype.hasOwnProperty.call(w.values, c)));
      t.ok(rawStageWrites.length === 0,
        `...and NOT a raw write — no rooms UPDATE touched the stage columns during the janitor window; got ${rawStageWrites.length} (${JSON.stringify(rawStageWrites.map((w) => w.values))})`);
      const heartbeats = tableLog.slice(beforeTableReset).filter((w) =>
        w.table === "rooms" && w.action === "update" && w.values &&
        Object.prototype.hasOwnProperty.call(w.values, "host_seen_at"));
      t.ok(heartbeats.length >= 1,
        "fixture sanity: the host_seen_at heartbeat DID ride the same poll — proof the instrument sees raw rooms writes at all, so the assertion above is a real negative and not a blind one");

      /* --- reset_to_preshow no-ops once already warm-up (widened check:
         phase='preshow' AND round=0 AND spotlight_target IS NULL) --- */
      D.loginClient("direct_reset", hostU);
      const already = D.rpc("direct_reset", "reset_to_preshow", { room_id: room });
      t.ok(already === null, "a second call against an already-preshow room no-ops cleanly (no throw)");

      const errs = [host].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
