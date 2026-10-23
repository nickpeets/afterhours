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
      await c.goto("#shows");   // THE TABS (D4): the LIVE NOW card is on the Shows tab — the #shows deep link lands there
      await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      t.ok(true, "cold start reaches the lobby");
      t.ok(await c.page.evaluate(() => !!window.__lc), "window.__lc diagnostic export is present");
      await c.page.waitForSelector(".roomcard", { timeout: 10000 });
      t.ok(true, "the live fixture room renders a lobby card");
      const meta = await c.page.$eval(".roomcard .meta", (el) => el.textContent);
      t.ok(/\d+ in the room/.test(meta), "room card shows a member count: " + JSON.stringify(meta.trim().slice(0, 40)));
      /* ruling 10/15: the whoami strip (name · email · window) is debug-only */
      const strip = await c.page.$eval("#whoami", (el) => ({ shown: getComputedStyle(el).display !== "none", text: el.textContent.trim() }));
      t.ok(!strip.shown && strip.text === "", "whoami strip is hidden and empty without ?debug (no email on the You tab) — " + JSON.stringify(strip));
      const d = await h.newClient("boot-debug");
      d.login(fx.crowd[0]);
      await d.goto("?debug");
      await d.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const who = await d.page.$eval("#whoami_who", (el) => el.textContent);
      const stripD = await d.page.$eval("#whoami", (el) => getComputedStyle(el).display !== "none");
      t.ok(stripD && /Crowd One/.test(who), "under ?debug the whoami strip shows the signed-in profile");
      await d.close();
      const authHidden = await c.page.$eval("#auth", (el) => el.classList.contains("hide"));
      t.ok(authHidden, "auth screen is dismissed after boot");
      t.ok(c.errors.length === 0, "zero console errors — got " + c.errors.length + ": " + c.errors.slice(0, 3).join(" | "));
      t.ok(h.unexpectedRequests.length === 0, "no unexpected network egress — got: " + h.unexpectedRequests.slice(0, 3).join(", "));
    } finally { await h.close(); }
  },
};
