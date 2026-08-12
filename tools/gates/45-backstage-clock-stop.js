/* GATE 45 — backstage-clock-stop: an empty winner's room never runs a
 * countdown.  Ships with fix/backstage-clock-stop.
 *
 * WHERE THIS CAME FROM.  Anomaly d8 of the b0809.1727 conductor run is two
 * claims in one sentence: the offerer is UNAWARE her counterpart is gone, and
 * she WAITS OUT the full window.  PR #41 fixed the first and left the second.
 * The live run at b0811.2124 caught it: his tile went to "waiting for …" the
 * instant he left — and her three-minute clock kept ticking against an empty
 * room.
 *
 * Gate 44 could not have caught this.  It asserts that she is TOLD, which is
 * exactly the half that was already right.  A gate written against the half you
 * understand cannot fail on the half you don't — which is the whole argument
 * for keeping a live run in the loop, and the reason this gate exists.
 *
 * THE RULING (owner, 2026-08-11): an empty winner's room running a countdown is
 * the room lying to her.  `bsGoodnight` fires on last-counterpart-departure
 * regardless of phase — same beat, same goodnight, unfenced.
 *
 * This gate owns BOTH halves of d8:
 *   1. she is TOLD — the goodnight beat carries his departure, in show language
 *   2. her CLOCK STOPS — no ticking interval, no "on" clock chip, and the night
 *      ends rather than leaving her parked in an empty room
 *
 * It also pins the one fence that must SURVIVE the unfencing: a mutual reveal.
 * Once contacts have been swapped the night is theirs, and his leaving must not
 * yank her out of it — `bsGoodnight`'s own BSD_PHASE==="revealed" early return
 * is asserted structurally, because a runtime reveal needs both sides to offer
 * and that is gate 31's subject, not this one.
 */
"use strict";
const { Harness } = require("../lib/harness");

function jsOf(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join("\n/* --- */\n");
}

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 150));
  }
};

async function tap(c, sel) {
  const b = await c.page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!b) throw new Error("tap target missing: " + sel);
  await c.page.touchscreen.tap(b.x, b.y);
}

async function keepByTouch(host, targetUid) {
  await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 10000, "decide card");
  await tap(host, "#eg_dkeep");
  await host.page.waitForTimeout(180);
  await tap(host, `#rt_chairs [data-heartuid="${targetUid}"]`);
  await waitFor(() => host.page.evaluate(() => !!document.querySelector("#room .lc-beat--kept")), 8000, "the kept beat");
}

module.exports = {
  name: "backstage-clock-stop",
  async run(t, ctx) {
    /* ---------- STATIC: the fence that must survive ---------- */
    const js = jsOf(ctx.html);
    const gn = js.slice(js.indexOf("function bsGoodnight"), js.indexOf("function bsGoodnight") + 400);
    t.ok(/BSD_PHASE\s*===\s*"revealed"\s*\)\s*return/.test(gn),
      "bsGoodnight still refuses to interrupt a mutual reveal (the one fence the ruling keeps)");
    const handler = js.slice(js.indexOf('case "backstage_left"'), js.indexOf('case "backstage_left"') + 1400);
    t.ok(/bsGoodnight\(/.test(handler),
      "the backstage_left handler reaches bsGoodnight");
    t.ok(!/BSD_PHASE\s*===\s*"deciding"\s*\)\s*bsGoodnight/.test(handler),
      "…and no longer only when BSD_PHASE is deciding — the phase fence is gone");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@clock.test" });
      ["u_s1", "u_s2"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (n, u) => {
        const c = await h.newClient(n, { isMobile: true, hasTouch: true });
        c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };

      const host = await boot("host", hostU);
      const winner = await boot("winner", "u_s1");
      const room = D.addRoom({ id: "r_clock", host_id: hostU, name: "Jack's Room", phase: "deciding", round: 3 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 120000);
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      for (const c of [host, winner]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }

      await keepByTouch(host, "u_s1");
      await waitFor(() => D.rooms.get(room).status === "ended" && D.rooms.get(room).winner_id === "u_s1", 8000, "show ended");

      /* ---- both backstage, both in the call, HER CLOCK RUNNING ---- */
      await tap(host, "#room .lc-beat__cta");
      await waitFor(() => host.page.evaluate(() => document.getElementById("backstage").classList.contains("show")), 10000, "host backstage");
      await waitFor(() => winner.page.evaluate(() => !!document.getElementById("fin_backstage")), 25000, "the winner's card");
      await tap(winner, "#fin_backstage");
      await waitFor(() => winner.page.evaluate(() => document.getElementById("backstage").classList.contains("show")), 10000, "winner backstage");

      await host.page.evaluate(() => window.__dailyControl.addRemote("u_s1"));
      await winner.page.evaluate(() => window.__dailyControl.addRemote("u_host"));
      await waitFor(() => host.page.evaluate(() => window.__lc.BS_STATE.clockOn), 8000, "her private-time clock to start");

      const before = await host.page.evaluate(() => ({
        clockOn: window.__lc.BS_STATE.clockOn,
        chipOn: document.getElementById("bs_clock").classList.contains("on"),
        clockText: document.getElementById("bs_clock").textContent.trim(),
        backstage: document.getElementById("backstage").classList.contains("show"),
      }));
      t.ok(before.clockOn && before.chipOn && before.backstage,
        `fixture sanity: her clock is genuinely running before he goes (${before.clockText})`);

      /* ================= he leaves, NOT in the deciding phase ================= */
      const phaseAtExit = await host.page.evaluate(() => window.__lc.BS_STATE.phase);
      t.ok(phaseAtExit !== "deciding",
        `fixture sanity: this is the NON-deciding path — the one PR #41 left running (phase: ${JSON.stringify(phaseAtExit)})`);

      await tap(winner, "#bs_leave");

      /* --- half 1: her clock STOPS --- */
      await waitFor(() => host.page.evaluate(() => !window.__lc.BS_STATE.clockOn), 10000,
        "her clock to STOP when the last counterpart leaves");
      const after = await host.page.evaluate(() => ({
        clockOn: window.__lc.BS_STATE.clockOn,
        chipOn: document.getElementById("bs_clock").classList.contains("on"),
        backstage: document.getElementById("backstage").classList.contains("show"),
        toast: document.getElementById("toast").textContent || "",
        bsRoom: window.__lc.BS_STATE.room,
      }));
      t.ok(after.clockOn === false, "her private-time clock is no longer running");
      t.ok(after.chipOn === false, "…and the clock chip is dark — nothing on screen is still counting down");
      t.ok(after.bsRoom === null, "the winner's room is torn down rather than left open and empty");
      t.ok(after.backstage === false, "she is not parked alone in a room with nobody in it");

      /* --- half 2: she is TOLD, in show language --- */
      t.ok(/slipped out/i.test(after.toast) && /goodnight/i.test(after.toast),
        `the goodnight beat carries his departure (toast: ${JSON.stringify(after.toast)})`);

      /* --- and the clock does not resurrect on a later tick --- */
      await host.page.waitForTimeout(1800);
      const settled = await host.page.evaluate(() => ({
        clockOn: window.__lc.BS_STATE.clockOn,
        chipOn: document.getElementById("bs_clock").classList.contains("on"),
      }));
      t.ok(!settled.clockOn && !settled.chipOn,
        "it stays stopped — no interval survives the teardown to restart it");

      const errs = [host, winner].flatMap((cl) => cl.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors in both windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
