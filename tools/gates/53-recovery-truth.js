/* GATE 53 — recovery-truth: deleted-and-not-re-added must be unreachable,
 * or at the very least it must never pass IN SILENCE.
 *
 * PROVENANCE, labelled.  This one IS red against the build it was forged on
 * (unlike gate 51, which locked a contract): the census of 2026-08-13 found
 * the lapse recovery discarding every rpc result, and the server read found
 * that nothing server-side ever un-sets role='gone'.  Chain those and you
 * get the worst reachable end state in the app: leave_room succeeds (hard
 * DELETE), join_room fails, the result is discarded — and a man is ERASED
 * from the show by his own client's recovery, silently.  Last night's bug
 * cost him his place in line; this one costs him the room.
 *
 * THE CONSTRAINT, written here so the next reader does not mistake the fix
 * for intended design: THE CLIENT FIX IS A WORKAROUND.  The server offers no
 * revive path — heartbeat has no role predicate, join_room keeps role in
 * both directions, nothing un-sets 'gone' — so delete-and-recreate is the
 * only door, and the retry-plus-loud-failure below is a bandage over that
 * missing capability.  The real fix is server-side: PRESENCE SEPARATE FROM
 * ROLE.  One schema change retires this gate's whole scenario, the bench
 * position loss, and the recovery's delete — three items, one cause.
 *
 * What this gate holds until then:
 *   1. join_room fails after a successful leave_room → the client RETRIES
 *      (bounded), and on success the man is back in the room;
 *   2. if every retry fails, a HUMAN-VISIBLE message lands — the silent
 *      variant of this end state is the thing made unreachable;
 *   3. leave_room failing is also read, not discarded.
 *
 * FOUND WHILE FORGING THIS GATE (2026-08-13, breadcrumb trace): the recovery
 * decision itself was reading a RENDERING, not state.  The old guard checked
 * ROOM_STATE.members — but this handler starts TWO roster loads (syncRoomTruth's
 * and its own), the loser is superseded and returns WITHOUT committing, and the
 * guard then consulted a roster committed BEFORE the sweep.  The swept man
 * found himself on a stale list, decided he was fine, and stayed buried — the
 * recovery never fired at all.  Traced: seq3 superseded by seq4, decision made
 * against seq1's commit.  The fix decides from a direct read of his OWN row
 * (never masked, RLS permits), which is what this gate's scene exercises: with
 * the stale roster, every assertion below times out.  METHOD rule 11 — a
 * rendering of state is not state — found living in the app's own code.
 */
"use strict";
const { Harness } = require("../lib/harness");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200)); } };

module.exports = {
  name: "recovery-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@rec.test" });
      D.addUser({ id: "u_b", name: "u_b" });
      const b = await h.newClient("b"); b.login("u_b"); await b.goto();
      await b.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const room = D.addRoom({ id: "r_rec", host_id: hostU, name: "Rec", phase: "spotlight", round: 1 });
      D.addMember(room, "u_b", "line");
      await b.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await b.page.waitForSelector("#room.show", { timeout: 10000 });

      /* ---- scene: swept while the phone slept, and the re-add DIES ---- */
      D.memberRow(room, "u_b").last_seen = new Date(D.now() - 200_000).toISOString();
      D.rpc("host", "sweep_stale_members", { room_id: room });
      t.ok(D.memberRow(room, "u_b").role === "gone", "fixture: the sweep buried him at 200s");

      D.setFault("join_room", "b", { error: "boom: join_room unavailable" });
      const rpcCount = (name) => (D.rpcLog || []).filter((r) => r.name === name && r.clientId === "b").length;
      const joinsBefore = rpcCount("join_room");

      await b.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));

      /* the recovery runs: leave_room deletes, join_room fails every time */
      await waitFor(async () => Promise.resolve(!D.memberRow(room, "u_b")), 15000,
        "the recovery's leave_room to delete his row");
      await b.page.waitForTimeout(4000);

      const joins = rpcCount("join_room") - joinsBefore;
      t.ok(joins >= 2,
        `the re-add is RETRIED, not attempted once and abandoned — a transient failure after a deletion deserves more than one try (join_room attempts: ${joins})`);

      const row = D.memberRow(room, "u_b");
      const toastTxt = await b.page.evaluate(() => {
        const el = document.getElementById("toast");
        return el ? (el.textContent || "").trim() : "";
      });
      const consoleSaysWhy = b.logs.some((l) => /recovery: join_room/.test(l.text));
      t.ok(!!row || toastTxt.length > 0,
        `DELETED-AND-NOT-RE-ADDED NEVER PASSES IN SILENCE: either his row is back (retry won) or a human-visible message says what happened (row=${!!row}, toast=${JSON.stringify(toastTxt)})`);
      t.ok(consoleSaysWhy,
        "…and the console names the failing call for whoever debugs it");

      /* ---- and when the fault clears, the same path actually recovers ---- */
      D.setFault("join_room", "b", null);
      await b.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await waitFor(async () => Promise.resolve(!!D.memberRow(room, "u_b")), 15000,
        "recovery to succeed once the server answers");
      t.ok(D.memberRow(room, "u_b").role === "spectator",
        `with the server answering, he is back in the room (as ${D.memberRow(room, "u_b").role} — the workaround's cost, per the header: the fresh row has no prev_role for join_line to preserve)`);
    } finally { await h.close(); }
  },
};
