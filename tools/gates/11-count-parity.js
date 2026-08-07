/* GATE 11 — count-parity: every headcount the app shows is the SAME number,
 * derived once, by the real roomCounts().  Ships with fix/count-truth.
 *
 * Fixture (the COUNT PARITY roster from the bug filing): host + 2 crowd +
 * 3 bench + 2 chairs + 1 kept + 1 stale (last_seen 90s ago).  Expected:
 * 2+3+2+1 = 8 member rows counted, stale excluded, host +1 (she has no
 * membership row by design) → 9 everywhere.
 *
 * Structural rule: this gate drives the REAL app — the lobby card and room
 * header are read from the real DOM after real renders, and the derivation
 * is called through window.__lc.roomCounts.  Nothing is re-implemented.
 */
"use strict";
const { Harness } = require("../lib/harness");
const fixtures = require("../lib/fixtures");

const EXPECT = { crowd: 2, line: 3, bench: 3, chairs: 2, kept: 1, total: 9 };

module.exports = {
  name: "count-parity",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const fx = fixtures.standardRoster(h.double);
      const c = await h.newClient("parity");
      c.login(fx.crowd[0]);
      await c.goto();

      /* --- the LOBBY's number, from the real card --- */
      await c.page.waitForSelector(".roomcard", { timeout: 15000 });
      await c.page.waitForFunction(() =>
        /\d+ in the room/.test(document.querySelector(".roomcard .meta")?.textContent || ""), { timeout: 10000 });
      const lobbyN = await c.page.$eval(".roomcard .meta",
        (el) => parseInt((el.textContent.match(/(\d+) in the room/) || [])[1], 10));

      /* --- the ROOM header's number, after a real entry --- */
      await c.page.click(".roomcard");
      await c.page.waitForSelector("#room.show", { timeout: 15000 });
      await c.page.waitForFunction(() =>
        parseInt((document.getElementById("rt_count").textContent || "").replace(/[^0-9]/g, ""), 10) > 0,
        { timeout: 10000 });
      await c.page.waitForTimeout(600);   // let the roster settle
      const headerN = await c.page.$eval("#rt_count",
        (el) => parseInt(el.textContent.replace(/[^0-9]/g, ""), 10));

      t.ok(lobbyN === headerN,
        `lobby count === room header count (lobby ${lobbyN} vs header ${headerN})`);

      /* --- the derivation itself, on the roster the room actually holds --- */
      const rc = await c.lc("(l)=>l.roomCounts(l.ROOM_STATE.members, l.CURRENT_ROOM)");
      t.ok(headerN === rc.total,
        `room header reads the derivation, not its own arithmetic (header ${headerN} vs roomCounts.total ${rc.total})`);
      t.ok(rc.total === EXPECT.total,
        `total is ${EXPECT.total}: 8 counted rows + the host, who has no membership row (got ${rc.total})`);
      t.ok(rc.crowd === EXPECT.crowd && rc.chairs === EXPECT.chairs,
        `crowd/chairs split matches the fixture (crowd ${rc.crowd}, chairs ${rc.chairs})`);
      t.ok(rc.kept === EXPECT.kept,
        `kept is included everywhere — staleness never unseats a kept man (kept ${rc.kept})`);
      t.ok(rc.total === rc.crowd + rc.line + rc.chairs + rc.kept + 1,
        "total = crowd + line + chairs + kept + host — nobody counted twice, nobody dropped");

      /* --- stale exclusion, driven through the REAL function with the RAW
             table rows (including the 90s-stale spectator) --- */
      const raw = h.double.members.filter((m) => m.room_id === fx.room).map((m) => ({ ...m }));
      t.ok(raw.some((m) => m.user_id === fx.stale[0]),
        "fixture sanity: the raw table really contains the stale row");
      const rcRaw = await c.lc("(l,raw)=>l.roomCounts(raw, l.CURRENT_ROOM)", raw);
      t.ok(rcRaw.total === rc.total,
        `stale rows cannot inflate any count, even from a raw table read (raw→${rcRaw.total} vs live→${rc.total})`);

      /* --- the "0 in line" bug: benched members count toward the line --- */
      t.ok(rc.line === EXPECT.line && rc.bench === EXPECT.bench,
        `three benched men ARE the line (line ${rc.line}, bench ${rc.bench})`);
      t.ok(rc.line > 0, "line > 0 while the bench is occupied");
      const watchbar = await c.page.$eval("#rt_watchbar", (el) => el.textContent.trim());
      t.ok(!/^0 IN LINE/.test(watchbar) && new RegExp("\\+" + EXPECT.line + " IN LINE").test(watchbar),
        `watchbar shows the benched men, not "0 IN LINE" (got ${JSON.stringify(watchbar)})`);

      const errs = c.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
