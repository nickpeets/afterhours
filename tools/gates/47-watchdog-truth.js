/* GATE 47 — watchdog-truth: a spectator whose host goes quiet after the show
 * ENDED lands on the finale, never a bare lobby.  Ships with fix/watchdog-truth.
 *
 * WHAT THIS REPLACES, AND WHY THAT MATTERS MORE THAN THE BUG.
 * Anomaly d2 of the b0809.1727 run — a live spectator was ejected to an empty
 * lobby at show end — has been carried as "covered by gate 39" since wave 8.
 * It was not.  Gate 39's d2 is ONE assertion and it is a source grep:
 *
 *     const watchdog = html.slice(html.indexOf("HOST_LAST_SEEN && …"));
 *     t.ok(/status==="ended"/.test(watchdog.slice(0,900)) &&
 *          /roomEndedUnderUs/.test(watchdog.slice(0,900)), …)
 *
 * That proves two identifiers appear within 900 characters of each other in a
 * file.  It cannot prove the branch is reached, that the rooms row is really
 * consulted, or that what follows is a finale rather than the bare lobby the
 * live run actually saw.  Nothing else in the battery ends a show underneath a
 * spectator at all.
 *
 * AND THE REASON IT WAS A GREP IS THE POINT.  The watchdog fires on
 * `Date.now()-HOST_LAST_SEEN>80000`.  HOST_LAST_SEEN was a module-local `let`,
 * set to Date.now() on room entry as a grace period and exported nowhere, so a
 * gate had exactly two options: burn eighty-plus real seconds, or grep.  It
 * grepped.  The battery already forbids a gate from reimplementing a function
 * it cannot reach — `__lc` exists so gates drive REAL code — and this is that
 * same rule one level over, for state.  When state is unreachable a gate does
 * not fail loudly; it quietly downgrades to a source check and the check count
 * keeps climbing.  A battery that looks stronger than it is, is worse than a
 * smaller one.
 *
 * So `__lc` now carries HOST_LAST_SEEN with a setter, this gate ages the clock,
 * and the REAL watchdog runs against REAL rows.
 *
 * The four claims:
 *   1. the watchdog is reachable from a gate at all (the export exists)
 *   2. host goes quiet + room ENDED  → the finale, with the winner named
 *   3. host goes quiet + room STILL LIVE → the ordinary goodbye, room left
 *      (the branch must not swallow a genuinely vanished host)
 *   4. the spectator is never dropped on a bare lobby with the show ended
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

      t.ok(await spec.page.evaluate(() => typeof window.__lc.HOST_LAST_SEEN === "number"),
        "HOST_LAST_SEEN is reachable from a gate — the watchdog's clock is no longer a source grep's only handle");

      /* ---------- 2. ENDED under him → the finale, with the winner ---------- */
      const roomA = D.addRoom({ id: "r_wd_a", host_id: hostU, name: "Jackie's Room", phase: "deciding", round: 3 });
      D.addMember(roomA, "u_win", "chair", { seat_index: 0 });
      D.addMember(roomA, "u_spec", "spectator");

      await spec.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomA) });
      await spec.page.waitForSelector("#room.show", { timeout: 10000 });

      /* THE WATCHDOG ONLY RUNS INSIDE THE CALL: its branch is fenced behind
         `!AMHOST && DAILY && DAILY_JOINED`, because "the host vanished" is
         judged from the Daily participant list, not from the roster.  A gate
         that opens the room and stops is not in the call and the branch never
         executes — which is a thing the source grep it replaces could never
         have noticed, since a grep sees the strings whether or not anything
         can reach them. */
      await spec.page.evaluate(() => window.__lc.videoJoin && window.__lc.videoJoin());
      await waitFor(() => spec.page.evaluate(() => !!window.__lc.DAILY), 12000, "the spectator to be in the call");

      const before = await spec.page.evaluate(SCREEN);
      t.ok(before.room && !before.finale, "fixture sanity: the spectator is in the room, watching, before anything goes wrong");

      /* the show ENDS — and the host's last beat goes stale at the same time,
         which is exactly the live shape: she closed her laptop after the win */
      const rmA = D.rooms.get(roomA);
      rmA.status = "ended";
      rmA.winner_id = "u_win";
      rmA.host_seen_at = D.iso(D.now() - 180_000);
      D.memberRow(roomA, "u_win").role = "kept";

      /* age the watchdog past its 80s threshold — the REAL branch, real rows */
      await spec.page.evaluate(() => { window.__lc.HOST_LAST_SEEN = Date.now() - 90_000; });

      await waitFor(() => spec.page.evaluate(() =>
        document.getElementById("finale").classList.contains("show") ||
        document.getElementById("snap").classList.contains("show") ||
        !window.__lc.CURRENT_ROOM), 30000, "the spectator's screen to resolve");

      const after = await spec.page.evaluate(SCREEN);
      t.ok(after.finale || after.snap,
        `the spectator lands on the FINALE, not a bare lobby (finale=${after.finale}, snap=${after.snap}, lobby=${after.lobby})`);
      t.ok(!(after.lobby && !after.finale && !after.snap),
        "he is never dropped on an empty lobby with the show ended — the live run's exact symptom");
      t.ok(/win|kept|u_win/i.test(after.finaleText) || after.snap,
        `the ending names who won rather than showing him nothing (${JSON.stringify(after.finaleText.slice(0, 80))})`);

      /* ---------- 3. a genuinely vanished host is still a goodbye ---------- */
      await spec.page.evaluate(() => window.__lc.leaveRoom());
      await spec.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });
      await spec.page.evaluate(() => { window.__ENDED_HANDLED = null; });

      const roomB = D.addRoom({ id: "r_wd_b", host_id: hostU, name: "Still Live", phase: "spotlight", round: 1 });
      D.addMember(roomB, "u_spec", "spectator");
      await spec.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomB) });
      await spec.page.waitForSelector("#room.show", { timeout: 10000 });
      await spec.page.evaluate(() => window.__lc.videoJoin && window.__lc.videoJoin());
      await waitFor(() => spec.page.evaluate(() => !!window.__lc.DAILY), 12000, "back in the call (B)");

      /* room is NOT ended — the host really did vanish */
      D.rooms.get(roomB).host_seen_at = D.iso(D.now() - 180_000);
      await spec.page.evaluate(() => { window.__lc.HOST_LAST_SEEN = Date.now() - 90_000; });

      await waitFor(() => spec.page.evaluate(() => !window.__lc.CURRENT_ROOM), 30000,
        "a genuinely vanished host to end his night");
      const gone = await spec.page.evaluate(SCREEN);
      t.ok(!gone.inRoom, "a vanished host on a LIVE room still returns him to the lobby — the fix did not swallow the real case");
      t.ok(/host left|show/i.test(gone.toast),
        `and he is told why (${JSON.stringify(gone.toast.slice(0, 60))})`);

      const errs = spec.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
