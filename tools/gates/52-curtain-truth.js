/* GATE 52 — curtain-truth: a seat that fails at curtain-up must SAY SO.
 * RED ON PURPOSE against today's build.
 *
 * PROVENANCE, labelled.  Forged against a MEASURED behaviour, 2026-08-13,
 * live harness: with every seat_member call raising (the raise the repaired
 * server produces on a ghost id), the curtain-up autoseat loop attempted all
 * three seats — the loop was never at risk of aborting, because a Postgres
 * raise arrives as a resolved {error}, not an exception — and then:
 *
 *     toast = ""     console: nothing     __SEATED_UIDS: all three marked
 *
 * Zero of three men seated, no human told, and beatCurtainUp() played TAKE
 * YOUR SEATS over an empty stage.  The failure mode is not an abort; it is
 * a FALSE CURTAIN over silent per-seat failures.
 *
 * What this gate holds:
 *   1. every per-call failure is SURFACED — the host's screen says seating
 *      failed and says how many, seated-versus-attempted;
 *   2. a failed man is not marked seated in __SEATED_UIDS, so the retry path
 *      is not poisoned;
 *   3. the loop still attempts every seat (locking the measured behaviour so
 *      a future refactor to try/catch-per-loop cannot reintroduce an abort).
 *
 * NOT asserted here (awaiting the conductor's ruling on show flow): whether
 * beatCurtainUp holds entirely when zero men sat.  When ruled, that clause
 * lands in this gate with the ruling quoted.
 */
"use strict";
const { Harness } = require("../lib/harness");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 300)); } };

module.exports = {
  name: "curtain-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@curtain.test" });
      ["u_1", "u_2", "u_3"].forEach((id) => D.addUser({ id, name: id }));
      const c = await h.newClient("host"); c.login(hostU); await c.goto();
      await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const room = D.addRoom({ id: "r_ct", host_id: hostU, name: "Curtain", phase: "preshow", round: 0 });
      D.addMember(room, "u_1", "line"); D.addMember(room, "u_2", "line"); D.addMember(room, "u_3", "line");
      await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await c.page.waitForSelector("#room.show", { timeout: 10000 });

      /* every seat call fails the way the repaired server fails on a ghost */
      D.setFault("seat_member", "host", { error: "seat_member: no such member in room" });

      await waitFor(() => Promise.resolve((D.rpcLog || []).filter((r) => r.name === "seat_member").length >= 3),
        20000, "the autoseat loop to attempt all three seats");
      await c.page.waitForTimeout(2500);

      const attempts = (D.rpcLog || []).filter((r) => r.name === "seat_member").length;
      t.ok(attempts >= 3,
        `the loop still attempts EVERY seat — a failure at one chair costs nobody else theirs (attempts=${attempts})`);

      const surfaced = await c.page.evaluate(() => {
        const toast = document.getElementById("toast");
        const txt = ((toast && toast.textContent) || "") + " " + document.body.innerText;
        return { toast: toast ? (toast.textContent || "").trim() : "",
                 saysSeating: /seat/i.test((toast && toast.textContent) || ""),
                 saysCount: /[0-3]\s*(of|\/)\s*3/.test(txt) };
      });
      t.ok(surfaced.saysSeating,
        `the failure reaches a HUMAN: the toast says seating failed rather than nothing (toast=${JSON.stringify(surfaced.toast)})`);
      t.ok(surfaced.saysCount,
        `…and it says HOW MANY — seated versus attempted, so she knows whether she is missing one man or a stage (toast=${JSON.stringify(surfaced.toast)})`);

      const poisoned = await c.page.evaluate(() => Object.keys(window.__SEATED_UIDS || {}));
      t.ok(poisoned.length === 0,
        `a man whose seating FAILED is not remembered as seated — __SEATED_UIDS stays clean so a retry can still reach him (marked: ${JSON.stringify(poisoned)})`);

      D.setFault("seat_member", "host", null);
    } finally { await h.close(); }
  },
};
