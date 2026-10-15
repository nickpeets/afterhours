/* GATE 5 — boot: cold start to lobby, zero console errors.
 * Real Chromium, real index.html, backend double seeded with the standard
 * roster.  Everything runs through the shipped code — the gate only looks.
 */
"use strict";
const { Harness } = require("../lib/harness");
const fixtures = require("../lib/fixtures");

module.exports = {
  name: "boot",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const fx = fixtures.standardRoster(h.double);
      const c = await h.newClient("boot");
      c.login(fx.crowd[0]);
      await c.goto();
      await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      t.ok(true, "cold start reaches the lobby");
      t.ok(await c.page.evaluate(() => !!window.__lc), "window.__lc diagnostic export is present");
      await c.page.waitForSelector(".roomcard", { timeout: 10000 });
      t.ok(true, "the live fixture room renders a lobby card");
      const meta = await c.page.$eval(".roomcard .meta", (el) => el.textContent);
      t.ok(/\d+ in the room/.test(meta), "room card shows a member count: " + JSON.stringify(meta.trim().slice(0, 40)));
      /* RULING 10/15: the whoami strip (name · email · window) is for
         multi-window testing under ?debug only.  The signed-in profile is
         asserted from the app's own state instead. */
      const prof = await c.page.evaluate(() => window.__lc.MYPROFILE && window.__lc.MYPROFILE.display_name);
      t.ok(/Crowd One/.test(prof || ""), "the signed-in profile is loaded: " + JSON.stringify(prof));
      const strip = await c.page.$eval("#whoami", (el) => ({ shown: el.offsetParent !== null, text: el.textContent.trim() }));
      t.ok(!strip.shown && !/@|window:/.test(strip.text), "no whoami strip (name · email · window) for a normal user: " + JSON.stringify(strip));
      const dc = await h.newClient("boot-debug");
      dc.login(fx.crowd[0]);
      await dc.goto("?debug");
      await dc.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const dbg = await dc.page.$eval("#whoami", (el) => ({ shown: el.offsetParent !== null, who: document.getElementById("whoami_who").textContent }));
      t.ok(dbg.shown && /Crowd One/.test(dbg.who), "under ?debug the whoami strip shows the signed-in profile: " + JSON.stringify(dbg.who));
      const authHidden = await c.page.$eval("#auth", (el) => el.classList.contains("hide"));
      t.ok(authHidden, "auth screen is dismissed after boot");
      t.ok(c.errors.length === 0, "zero console errors — got " + c.errors.length + ": " + c.errors.slice(0, 3).join(" | "));
      t.ok(h.unexpectedRequests.length === 0, "no unexpected network egress — got: " + h.unexpectedRequests.slice(0, 3).join(", "));
    } finally { await h.close(); }
  },
};
