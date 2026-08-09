/* GATE 31 — backstage-polish: the winner's room is in the show's design
 * vocabulary, the mutual-offer reveal rides the OFFER EVENT (not a clock),
 * the swap prompt is labeled, and no placeholder copy survives.  Ships
 * with fix/backstage-polish.
 *
 * Live findings: (a) the share controls rendered as raw browser-default
 * buttons; (b) "TIME'S UP" fired while the swap clock still showed 0:60;
 * (c) the reveal was gated on a 3s poll / a timer, so a chair saw the
 * handle only after the top clock ran out; (d) filler text ("sdfsd") in
 * a winners surface.
 *
 * Now: #bsdecide, the platform chips, and the handle input are styled;
 * the decision banner names its trigger ("Cameras off"/"She cut the
 * feed"), never "TIME'S UP" over a running clock; the offer window clock
 * is labeled; offer_swap emits a 'swap' ledger event and both clients
 * reveal the instant BOTH offers exist — secrecy holds until then.
 *
 * Proven: two backstage clients (host + winner) reach the decision layer;
 * one offers → the other sees NOTHING; both offer → both reveal within
 * the skew budget while the offer clock still counts; computed styles
 * are non-default; a grep gate over the whole file finds no placeholder.
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 120));
  }
};

module.exports = {
  name: "backstage-polish",
  async run(t, ctx) {
    /* ---------- (d) STATIC: no placeholder copy in any surface ---------- */
    const html = ctx.html;
    const junk = ["sdfsd", "asdf", "lorem", "ipsum", "qwerty", "foobar", "test123", "placeholder text", "xxxxx"];
    const hits = junk.filter((j) => new RegExp(j, "i").test(html));
    t.ok(hits.length === 0, `no placeholder/filler strings in the build (found: ${hits.join(", ") || "none"})`);

    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      D.addUser({ id: "u_win", name: "Winner" });
      const boot = async (n, u) => {
        const c = await h.newClient(n); c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const winner = await boot("winner", "u_win");
      const room = D.addRoom({ id: "r_bs", host_id: hostU, name: "BS Night", phase: "deciding", round: 3 });
      D.rooms.get(room).winner_id = "u_win";
      D.addMember(room, "u_win", "kept", { seat_index: 0 });
      for (const c of [host, winner]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      // both walk into the winner's room, then into the decision layer
      await host.page.evaluate(() => window.__lc.enterBackstage("u_win", "Winner"));
      await winner.page.evaluate(() => window.__lc.enterBackstage("u_win", "Winner"));
      await host.page.waitForTimeout(800);
      await host.page.evaluate(() => window.__lc.bsEnterDecision("callclock"));
      await winner.page.evaluate(() => window.__lc.bsEnterDecision("callclock"));
      await waitFor(() => host.page.evaluate(() => window.__lc.BS_STATE.phase === "deciding"), 8000, "host in the decision layer");
      await waitFor(() => winner.page.evaluate(() => window.__lc.BS_STATE.phase === "deciding"), 8000, "winner in the decision layer");

      /* ---------- (a) styling: computed styles are not browser-default ---------- */
      const style = await host.page.evaluate(() => {
        const chip = document.querySelector("#bsd_chips .ctypechip:not(.on)");
        const inp = document.getElementById("bsd_val");
        const overlay = document.getElementById("bsdecide");
        const cs = getComputedStyle(chip), is = getComputedStyle(inp), os = getComputedStyle(overlay);
        return { chipRadius: cs.borderRadius, chipFont: cs.fontFamily,
                 chipBg: cs.backgroundColor, inpRadius: is.borderRadius,
                 overlayDisplay: os.display };
      });
      t.ok(style.chipRadius === "999px", `platform chips are pills, not default buttons (radius ${style.chipRadius})`);
      t.ok(/Baloo|Azeret/.test(style.chipFont),
        `chips use the show's typeface (${style.chipFont}), not the UA default`);
      t.ok(style.chipBg !== "rgba(0, 0, 0, 0)" && style.chipBg !== "transparent",
        `unselected chips carry the show's chip background (${style.chipBg})`);
      t.ok(style.inpRadius !== "0px", `the handle input is styled (radius ${style.inpRadius}), not a raw field`);
      t.ok(style.overlayDisplay === "flex", "the decision overlay lays out (flex), not default block flow");

      /* ---------- (b) the banner names its trigger, not "TIME'S UP" ---------- */
      const title = await host.page.evaluate(() => window.__lc.BS_STATE.title);
      t.ok(/cameras off/i.test(title) && !/time.?s up/i.test(title),
        `the decision banner names the trigger ("${title}"), never TIME'S UP over a running clock`);
      const label = await host.page.evaluate(() =>
        [...document.querySelectorAll("#bsdecide .bsd-swaplabel")].some((e) => /offer window/i.test(e.textContent)));
      t.ok(label, "the offer-window clock is labeled");

      /* ---------- (c) reveal rides the offer EVENT, mutual-only ---------- */
      // host offers first → the WINNER must still see NOTHING
      await host.page.evaluate(() => {
        document.querySelector('#bsd_chips .ctypechip[data-t="Instagram"]').click();
        document.getElementById("bsd_val").value = "@hostess";
        document.getElementById("bsd_offer").click();
      });
      await host.page.waitForTimeout(1500);   // ample time for any errant reveal
      t.ok(!(await winner.page.evaluate(() => window.__lc.BS_STATE.revealed)),
        "one offer only → the other side reveals NOTHING (secrecy holds)");
      t.ok(!(await host.page.evaluate(() => window.__lc.BS_STATE.revealed)),
        "…and the offerer sees nothing yet either");

      // the winner offers → BOTH reveal, on the event, within the skew budget
      const tOffer = Date.now();
      await winner.page.evaluate(() => {
        document.querySelector('#bsd_chips .ctypechip[data-t="Phone"]').click();
        document.getElementById("bsd_val").value = "503-555-0199";
        document.getElementById("bsd_offer").click();
      });
      await waitFor(() => host.page.evaluate(() => window.__lc.BS_STATE.revealed), 3000, "host reveals on the second offer");
      await waitFor(() => winner.page.evaluate(() => window.__lc.BS_STATE.revealed), 3000, "winner reveals on the second offer");
      const revealMs = Date.now() - tOffer;
      t.ok(revealMs <= 2000, `both sides revealed ${revealMs}ms after the mutual offer — event-fold, not a clock (≤2000ms)`);
      // each sees the OTHER's handle
      const hostSaw = await host.page.evaluate(() => window.__lc.BS_STATE.revealWhat);
      const winSaw = await winner.page.evaluate(() => window.__lc.BS_STATE.revealWhat);
      t.ok(/503-555-0199/.test(hostSaw), `the host sees the winner's handle (${hostSaw})`);
      t.ok(/@hostess/.test(winSaw), `the winner sees the host's handle (${winSaw})`);
      // …and the offer clock had NOT expired when the reveal happened
      t.ok(await host.page.evaluate(() => {
        const c = document.getElementById("bsd_count");
        return c && !/0:0[0-2]$/.test(c.textContent);
      }), "the reveal happened while the offer clock was still counting — no clock gated it");

      const errs = [host, winner].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
