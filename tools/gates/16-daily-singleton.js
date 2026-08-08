/* GATE 16 — daily-singleton: one call object, created once, reused; a
 * rejoin destroys before it creates.  Ships with fix/daily-singleton.
 *
 * Finding 7 (console, live run): "videoJoin exception: Duplicate
 * DailyIframe instances are not allowed" — two videoJoin calls in the same
 * beat both passed the old `if(DAILY) return` guard (it sat AFTER the
 * awaited token fetch, while DAILY was still null), so both reached
 * createCallObject and the loser threw.  The daily shim now enforces the
 * real library's one-live-instance rule, so any regression throws here
 * exactly as it did in prod.
 *
 * Proven through real __lc references:
 *   - two concurrent videoJoin calls share ONE in-flight promise (identity
 *     check), create ONE instance, raise NO duplicate exception.
 *   - videoLeave → videoJoin is a clean rejoin: destroy completes before
 *     the new create (never two live instances).
 *   - gate 13's budgets hold across the whole rejoin cycle: 0 re-parents,
 *     and per participant ≤1 srcObject assignment and ≤1 <video> creation
 *     PER MOUNT EPOCH (join1, join2) — a rejoin is one genuine stream
 *     change, nothing more.
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
  name: "daily-singleton",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_a", "u_b"].forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host");
      host.login(hostU);
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const room = D.addRoom({ id: "r_single", host_id: hostU, name: "Singleton Night", phase: "spotlight" });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 300_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      D.addMember(room, "u_b", "chair", { seat_index: 1 });

      // openRoom fires the FIRST videoJoin; we immediately double-fire two
      // more so three joins race in the same beat
      await host.page.evaluate((r) => {
        window.__joinRace = (async () => {
          const p0 = window.__lc.openRoom(r);           // fires videoJoin() inside
          const p1 = window.__lc.videoJoin();
          const p2 = window.__lc.videoJoin();
          const shared = (p1 && p2 && p1 === p2);       // in-flight join IS the join
          await Promise.all([p0, p1, p2].map((p) => Promise.resolve(p).catch((e) => e)));
          return { shared };
        })();
      }, { ...D.rooms.get(room) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      const race = await host.page.evaluate(() => window.__joinRace);
      await waitFor(() => host.page.evaluate(() => window.__lc.DAILY_JOINED === true), 10000, "the (single) join completes");
      t.ok(race.shared, "concurrent videoJoin calls return the SAME in-flight promise (identity check)");

      const after1 = await host.page.evaluate(() => window.__dailyInstances());
      t.ok(after1.created === 1, `triple-fired join created exactly ONE call object (created=${after1.created})`);
      const dupErrs = () => host.page.evaluate(() =>
        (window.__lcVdbgLog || []).concat([]).filter((s) => /Duplicate DailyIframe/i.test(String(s))).length);
      const dupInConsole = host.logs.filter((l) => /Duplicate DailyIframe/i.test(l.text)).length;
      t.ok(dupInConsole === 0, `no "Duplicate DailyIframe" exception anywhere in the console (found ${dupInConsole})`);

      // remotes land, budgets baseline
      await host.page.evaluate(() => { window.__dailyControl.addRemote("u_a"); window.__dailyControl.addRemote("u_b"); });
      await waitFor(() => host.page.evaluate(() => document.querySelectorAll("#room video").length === 3), 10000,
        "hero + two chairs mounted after the raced join");

      /* --- leave → rejoin: destroy strictly before create --- */
      await host.page.evaluate(() => {
        window.__rejoin = (async () => {
          const leave = window.__lc.videoLeave();
          const join = window.__lc.videoJoin();          // fired while leave is in flight
          await Promise.all([leave, join].map((p) => Promise.resolve(p).catch((e) => e)));
          return window.__dailyInstances();
        })();
      });
      const after2 = await host.page.evaluate(() => window.__rejoin);
      await waitFor(() => host.page.evaluate(() => window.__lc.DAILY_JOINED === true), 10000, "rejoin completes");
      t.ok(after2.created === 2 && after2.liveNow,
        `leave→rejoin is clean: exactly one new instance (created=${after2.created}), one live now — destroy finished before create`);
      const dupAfter = host.logs.filter((l) => /Duplicate DailyIframe/i.test(l.text)).length;
      t.ok(dupAfter === 0, "the rejoin cycle raised no duplicate-instance exception either");

      /* --- gate 13's budgets hold through the rejoin cycle --- */
      await host.page.evaluate(() => { window.__dailyControl.addRemote("u_a"); window.__dailyControl.addRemote("u_b"); });
      await waitFor(() => host.page.evaluate(() => document.querySelectorAll("#room video").length === 3), 10000,
        "feeds remount after the rejoin");
      await host.page.waitForTimeout(7000);   // let any disagreement window expire
      const out = await host.page.evaluate(() => {
        const s = window.__lc.VIDEO_STATS;
        const tiles = Object.entries(window.__lc.VIDEO_TILES).map(([sid, x]) => ({ sid, uid: x.uid, inDom: document.contains(x.el) }));
        return { assigns: s.assigns, creates: s.creates, reparents: s.reparents, tiles };
      });
      const table = () => ["u_host", "u_a", "u_b"].map((u) =>
        `${u}: assignments=${out.assigns[u] || 0} creations=${out.creates[u] || 0} re-parents=${out.reparents[u] || 0}`).join(" · ");
      // two mount epochs (join1, join2) — a rejoin is ONE genuine stream change
      const overAssigned = ["u_host", "u_a", "u_b"].filter((u) => (out.assigns[u] || 0) > 2);
      t.ok(overAssigned.length === 0, `srcObject assignments ≤ 1 per mount epoch across the rejoin (${table()})`);
      const overCreated = ["u_host", "u_a", "u_b"].filter((u) => (out.creates[u] || 0) > 2);
      t.ok(overCreated.length === 0, `<video> creations ≤ 1 per mount epoch across the rejoin (${table()})`);
      const reparented = Object.keys(out.reparents).filter((u) => out.reparents[u] > 0);
      t.ok(reparented.length === 0, `0 re-parents through the whole cycle (${table()})`);
      t.ok(out.tiles.every((x) => x.inDom), "no dangling VIDEO_TILES entry after leave→rejoin — " +
        JSON.stringify(out.tiles.filter((x) => !x.inDom)));

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
