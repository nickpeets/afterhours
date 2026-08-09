/* GATE 18 — ask-ledger: room_events is the source of ask truth (RULING
 * Q4); every role sees ASKED; a reloading host reconstructs the rotation;
 * kept men stay in it (RULING Q6).  Ships with fix/ask-ledger.
 *
 * The bug (audit F2): fix/ask-truth fixed the KEYING of ask state but not
 * the SOURCE — askMark wrote window-local maps that existed only in the
 * host's tab.  No other role had ever rendered an ASKED badge (despite
 * the CSS comment promising "visible to the whole room"), and a host
 * reload silently restarted the rotation.
 *
 * Now: ask_question records a 'spotlight' room_event; clients fold the
 * ledger on entry (loadEventHistory) and live (handleEvent).  The maps
 * are a cache.  Gate 14's static single-door checks still bind: one
 * ask_question call site, every map write inside askMark.
 *
 * Proven here:
 *   - ask on the host's client → ASKED renders on a CHAIR's client and a
 *     CROWD client (live ledger fold), and the ledger row exists with the
 *     round recorded.
 *   - host reloads (possible since fix/show-survives-host) → lands back
 *     in the room with IDENTICAL rotation state, and the next rotation
 *     pick skips the already-asked man — no silent restart.
 *   - a KEPT man appears in askTargets() (kept = safe, not done).
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
  name: "ask-ledger",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_k", "u_w"].forEach((id) => D.addUser({ id, name: id }));

      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby, #room.show", { timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const chairC = await boot("chair", "u_s2");
      const crowdC = await boot("crowd", "u_w");
      const room = D.addRoom({ id: "r_ledger", host_id: hostU, name: "Ledger Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      D.addMember(room, "u_k", "kept", { seat_index: 2 });
      D.addMember(room, "u_w", "spectator");
      for (const c of [host, chairC, crowdC]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }

      /* --- kept men stay in rotation (RULING Q6) --- */
      const targets = await host.page.evaluate(() => window.__lc.askTargets().map((m) => m.user_id));
      t.ok(targets.includes("u_k"), `askTargets includes the KEPT man (got: ${targets.join(",")})`);

      /* --- the ask lands in the ledger and on EVERY role's screen --- */
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_s1", 8000, "rotation asks seat 0");
      const ev = D.events.find((e) => e.room_id === room && e.type === "spotlight" && e.payload?.target_user === "u_s1");
      t.ok(!!ev && ev.payload.round === 1, "the ask is a room_events row with the round recorded (the LEDGER)");
      for (const [label, c] of [["chair", chairC], ["crowd", crowdC]]) {
        await waitFor(() => c.page.evaluate(() =>
          document.getElementById("rt_seat0").classList.contains("is-asked")), 8000,
          `ASKED renders on the ${label} client`);
        t.ok(true, `ASKED visible on the ${label.toUpperCase()} client — live ledger fold, no host-local secret`);
      }

      /* --- host reload reconstructs the rotation from the ledger --- */
      const before = await host.page.evaluate(() => JSON.stringify(window.__ASKED_THIS_ROUND || {}));
      await host.page.reload({ waitUntil: "load" });
      await waitFor(() => host.page.evaluate(() =>
        document.getElementById("room").classList.contains("show")).catch(() => false), 15000,
        "host comes back into the room (gate 17 mechanics)");
      await waitFor(() => host.page.evaluate(() => window.__lc.askedThisRound("u_s1") === true), 8000,
        "replay rebuilds the (member, round) state");
      const after = await host.page.evaluate(() => JSON.stringify(window.__ASKED_THIS_ROUND || {}));
      t.ok(before === after, `rotation state identical across the reload (${before} === ${after})`);

      // and the NEXT rotation pick proves it: seat 0 is skipped
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "spotlight", 60);
      await host.page.evaluate(() => window.__lc.egRefreshRoom());
      await waitFor(() => host.page.evaluate(() => window.__lc.askEligible(null) === true), 8000, "choosing reopens");
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_s2", 8000,
        "the rotation continues where it left off — u_s2, not a restart at u_s1");
      t.ok(true, "no silent rotation restart after the host's reload");

      const errs = [host, chairC, crowdC].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across all three windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
