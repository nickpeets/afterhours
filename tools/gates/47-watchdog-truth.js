/* GATE 47 — watchdog-truth: a spectator whose host goes quiet is TOLD, and
 * whatever ends the show lands him on a card, never a bare lobby.
 *
 * HISTORY.  This gate was born (fix/watchdog-truth) to drive the 80s video
 * watchdog for real instead of grepping for it — the rule that state a gate
 * can't reach turns gates into source greps.  fix/rehearsal-1009 retired
 * that watchdog: at 80s it ejected a guest to the lobby with a toast, before
 * the server's 120s ending and with no road back if she returned.  The
 * truth now is the host's BEAT (host_seen_at every HOST_BEAT_MS): ~15s of an
 * unchanged beat puts up "The host lost connection, hang tight", and the
 * server ends the room (RULING 10/8).  The clock is exported the same way
 * (HOST_BEAT_LOCAL, settable) so this gate ages it instead of waiting.
 *
 * WHAT THE OLD VERSION OF THIS GATE LEANED ON: claim 2 set the room ENDED
 * by writing the row and let the guest READ it.  Production's rooms RLS
 * (select_live) never shows a guest an ended row; the double now enforces
 * it, so the guest learns the ending from the ledger (finale) or the 406.
 *
 * The claims:
 *   1. the host-gone clock is reachable from a gate
 *   2. room ENDED with a winner, guest on the poll only (realtime muted):
 *      the 406 is read as "it ended", the ledger names the winner, and he
 *      lands on the finale — never a bare lobby
 *   3. host goes quiet on a LIVE room → the notice; the server ends it →
 *      "The host left. Show's over.", never a bare lobby
 *   4. zero console errors
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

/* what the spectator's screen is actually showing */
const SCREEN = () => ({
  lobby: (document.getElementById("lobby").className || "").includes("show") ||
         getComputedStyle(document.getElementById("lobby")).display !== "none",
  room: document.getElementById("room").classList.contains("show"),
  finale: document.getElementById("finale").classList.contains("show"),
  snap: document.getElementById("snap").classList.contains("show"),
  finaleText: (document.getElementById("finale").innerText || "").trim().slice(0, 200),
  toast: document.getElementById("toast").textContent || "",
  inRoom: !!(window.__lc.CURRENT_ROOM),
});

module.exports = {
  name: "watchdog-truth",
  async run(t, ctx) {
    /* ---------- 1. the state the watchdog runs on is reachable ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@wd.test" });
      ["u_win", "u_spec"].forEach((id) => D.addUser({ id, name: id }));

      const boot = async (n, u) => {
        const c = await h.newClient(n);
        c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const spec = await boot("spec", "u_spec");

      t.ok(await spec.page.evaluate(() => typeof window.__lc.HOST_BEAT_LOCAL === "number" && window.__lc.HOST_QUIET_MS === 15000),
        "1: the host-gone clock (HOST_BEAT_LOCAL, 15s) is reachable from a gate");

      /* ---------- 2. ENDED under him → the finale, with the winner ---------- */
      const roomA = D.addRoom({ id: "r_wd_a", host_id: hostU, name: "Jackie's Room", phase: "deciding", round: 3 });
      D.addMember(roomA, "u_win", "chair", { seat_index: 0 });
      D.addMember(roomA, "u_spec", "spectator");
      await spec.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomA) });
      await spec.page.waitForSelector("#room.show", { timeout: 10000 });
      const before = await spec.page.evaluate(SCREEN);
      t.ok(before.room && !before.finale, "fixture sanity: the spectator is in the room, watching, before anything goes wrong");

      /* she keeps him and closes her laptop; his socket dropped the finale —
         only the 4s poll is left, and the room row is now invisible to him */
      h.muteRealtime("spec", true);
      D.memberRow(roomA, "u_win").role = "kept";
      D.endRoom(roomA, "u_win", hostU, "host");
      D.rooms.get(roomA).host_seen_at = D.iso(D.now() - 180_000);
      await waitFor(() => spec.page.evaluate(() =>
        document.getElementById("finale").classList.contains("show") ||
        document.getElementById("snap").classList.contains("show") ||
        !window.__lc.CURRENT_ROOM), 30000, "the spectator's screen to resolve");
      const after = await spec.page.evaluate(SCREEN);
      t.ok(after.finale || after.snap,
        `2: the spectator lands on the FINALE, not a bare lobby (finale=${after.finale}, snap=${after.snap}, lobby=${after.lobby})`);
      t.ok(!(after.lobby && !after.finale && !after.snap),
        "2: he is never dropped on an empty lobby with the show ended");
      t.ok(/win|kept|u_win/i.test(after.finaleText) || after.snap,
        `2: the ending names who won rather than showing him nothing (${JSON.stringify(after.finaleText.slice(0, 80))})`);
      h.muteRealtime("spec", false);

      /* ---------- 3. a quiet host on a LIVE room ---------- */
      await spec.page.evaluate(() => window.__lc.leaveRoom());
      await spec.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });
      const roomB = D.addRoom({ id: "r_wd_b", host_id: hostU, name: "Still Live", phase: "spotlight", round: 1 });
      D.addMember(roomB, "u_spec", "spectator");
      await spec.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomB) });
      await spec.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => spec.page.evaluate(() => window.__lc.HOST_READ_OK > 0), 10000, "a first read of her beat");
      /* no host page beats this room: age the clock, the poll says it */
      await spec.page.evaluate(() => { window.__lc.HOST_BEAT_LOCAL = Date.now() - 20_000; });
      await waitFor(() => spec.page.evaluate(() => { const n = document.getElementById("rt_hostgone"); return n && !n.hidden; }), 10000, "the host-gone notice");
      t.ok(true, "3: a quiet host → \"The host lost connection, hang tight\"");
      /* RULING 10/8: the SERVER ends it (on his own heartbeat's touch) */
      D.rooms.get(roomB).host_seen_at = D.iso(D.now() - 180_000);
      await waitFor(() => Promise.resolve(D.rooms.get(roomB).status === "ended"), 15000,
        "the server to end the vanished host's room on the spectator's heartbeat");
      t.ok(D.events.some((e) => e.room_id === roomB && e.type === "finale" && e.payload.by === "stale_host"),
        "3: a genuinely vanished host is ended by end_stale_rooms (finale by='stale_host'), not by the client");
      await waitFor(() => spec.page.evaluate(() => document.getElementById("finale").classList.contains("show")), 15000,
        "the host-left card");
      const gone = await spec.page.evaluate(SCREEN);
      t.ok(/The host left\. Show.s over\./.test(gone.finaleText) && !gone.lobby,
        `3: …and the night ends on "The host left. Show's over.", never a bare lobby (${JSON.stringify(gone.finaleText.slice(0, 60))})`);

      const errs = spec.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
