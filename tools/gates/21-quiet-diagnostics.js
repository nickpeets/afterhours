/* GATE 21 — quiet-diagnostics: users NEVER see internals (SPEC, audit
 * F5).  Ships with fix/quiet-diagnostics.
 *
 * The bug: any ✕-severity vdbg line force-showed the raw log panel
 * (z-index 9999) on whatever role's screen it fired on — token HTTP
 * errors and track states on the host's phone mid-show.
 *
 * Now: vdbg is console-always, on-screen ONLY under the deliberate
 * ?debug switch (without it the panel node is never even created — no
 * raw text in the DOM).  The one user-facing camera state is
 * lcCamStatus(), show language only ("finding your camera…"), cleared on
 * recovery/success.
 *
 * Proven here:
 *   - STATIC: the watchdog's stall branch calls lcCamStatus (the
 *     translate tier is wired to the real path, not just exported).
 *   - ✕-severity vdbg WITHOUT ?debug → no #vdebug in the DOM, no raw
 *     diagnostic string anywhere in the page, on host AND crowd screens.
 *   - WITH ?debug=1 → the full log panel exists, visible, raw lines
 *     intact (the deliberate switch still works).
 *   - lcCamStatus renders the show-language chip; null clears it.
 */
"use strict";
const { Harness } = require("../lib/harness");

module.exports = {
  name: "quiet-diagnostics",
  async run(t, ctx) {
    /* ---------- STATIC: the translate tier is wired into the watchdog ---------- */
    const js = ctx.html;
    const wd = js.match(/function videoWatchdog\(\)\{[\s\S]*?\n\}/);
    t.ok(!!wd && /lcCamStatus\(\s*"finding your camera/.test(wd[0]),
      "the watchdog's stall branch speaks show language (lcCamStatus wired in the real path)");

    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      D.addUser({ id: "u_w", name: "Watcher" });
      D.addUser({ id: "u_d", name: "Debugger" });
      const boot = async (name, uid, query) => {
        const c = await h.newClient(name); c.login(uid); await c.goto(query || "");
        await c.page.waitForSelector("#lobby, #room.show", { timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const crowd = await boot("crowd", "u_w");
      const room = D.addRoom({ id: "r_quiet", host_id: hostU, name: "Quiet Night", phase: "openfloor", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(room, "u_w", "spectator");
      for (const c of [host, crowd]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }

      /* --- ✕-severity without ?debug: silence on every role's screen --- */
      const RAW = "token request failed: HTTP 500 — {\"error\":\"boom\"}";
      for (const [label, c] of [["host", host], ["crowd", crowd]]) {
        await c.page.evaluate((m) => { window.__lc.vdbg(m, true); window.__lc.vdbg("joined meeting ✓"); }, RAW);
        const state = await c.page.evaluate((m) => ({
          panel: !!document.getElementById("vdebug"),
          rawInDom: (document.body.innerText || "").includes("token request failed") ||
                    (document.body.innerText || "").includes("HTTP 500"),
        }), RAW);
        t.ok(!state.panel, `${label}: ✕-severity creates NO panel node without ?debug`);
        t.ok(!state.rawInDom, `${label}: no raw diagnostic string anywhere in the DOM`);
      }

      /* --- the show-language chip: renders, and clears on null --- */
      await host.page.evaluate(() => window.__lc.lcCamStatus("finding your camera…"));
      const chip = await host.page.evaluate(() => {
        const el = document.getElementById("camstatus");
        return el ? el.textContent : null;
      });
      t.ok(chip === "finding your camera…", "lcCamStatus renders the show-language chip");
      await host.page.evaluate(() => window.__lc.lcCamStatus(null));
      t.ok(await host.page.evaluate(() => !document.getElementById("camstatus")),
        "lcCamStatus(null) clears the chip completely");

      /* --- with ?debug=1: the deliberate switch shows the full log --- */
      const dbg = await boot("dbg", "u_d", "?debug=1");   // lobby is fine — the panel is page-level
      await dbg.page.evaluate((m) => { window.__lc.vdbg("requesting video token…"); window.__lc.vdbg(m, true); }, RAW);
      const dbgState = await dbg.page.evaluate(() => {
        const el = document.getElementById("vdebug");
        return { exists: !!el, visible: el && el.style.display !== "none",
                 lines: el ? el.textContent : "" };
      });
      t.ok(dbgState.exists && dbgState.visible, "?debug=1: the raw log panel exists and is visible");
      t.ok(/requesting video token/.test(dbgState.lines) && /HTTP 500/.test(dbgState.lines),
        "?debug=1: benign AND ✕-severity lines both land verbatim");

      const errs = [host, crowd, dbg].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
