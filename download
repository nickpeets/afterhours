/* GATE 9 — guest-path: unauthenticated viewer, cold.
 * No session: the auth screen must stand alone, interactive, error-free.
 */
"use strict";
const { Harness } = require("../lib/harness");

module.exports = {
  name: "guest-path",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const c = await h.newClient("guest");   // no login() — cold, signed out
      await c.goto();
      await c.page.waitForSelector("#auth", { timeout: 15000 });
      const shot = await c.page.evaluate(() => {
        const vis = (id) => { const el = document.getElementById(id); return el && getComputedStyle(el).display !== "none" && !el.classList.contains("hide"); };
        return {
          auth: vis("auth"), lobby: vis("lobby"), setup: vis("setup"),
          room: document.getElementById("room").classList.contains("show"),
          loginTab: !!document.getElementById("tab_login"),
          stamp: (document.getElementById("buildstamp") || {}).textContent || "",
        };
      });
      t.ok(shot.auth, "auth screen shows for a cold guest");
      t.ok(!shot.lobby && !shot.setup && !shot.room, "no other screen is stacked (lobby=" + shot.lobby + " setup=" + shot.setup + " room=" + shot.room + ")");
      t.ok(shot.stamp === ctx.stamp, "footer stamp matches the artifact stamp (" + shot.stamp + ")");
      await c.page.click("#tab_login");
      const loginVisible = await c.page.evaluate(() => getComputedStyle(document.getElementById("loginPanel")).display !== "none");
      t.ok(loginVisible, "login tab is interactive");
      await c.page.click("#tab_signup");
      const signupVisible = await c.page.evaluate(() => getComputedStyle(document.getElementById("signupPanel")).display !== "none");
      t.ok(signupVisible, "signup tab is interactive");
      const errs = c.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
      t.ok(h.unexpectedRequests.length === 0, "no unexpected network egress — " + h.unexpectedRequests.slice(0, 3).join(", "));
    } finally { await h.close(); }
  },
};
