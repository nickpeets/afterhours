/* GATE 14 — ask-truth: ask state is a fact about (member, round), never
 * about a chair or a DOM node.  Ships with fix/ask-truth.
 *
 * STATIC (acorn AST, not eyeballs):
 *   - exactly ONE rpc("ask_question") call site, and it lives INSIDE
 *     egFireSpotlight() — the retry-with-skip_phase bypass is gone.
 *   - the asked maps are written in exactly ONE place: askMark().
 *
 * RUNTIME, through real __lc references and the real DOM:
 *   - ask outside the permitted window (openfloor) → REJECTED: the drawer
 *     refuses to open (real chair-tap path AND direct egOpenDrawer), and
 *     egFireSpotlight fires no ask_question RPC.
 *   - ask in the choosing window at a seated member → ACCEPTED: RPC lands,
 *     spotlight_target set, ASKED visual on his chair.
 *   - he leaves, a NEW member takes the same chair → the chair carries NO
 *     ASKED visual, and the target list (askTargets — what the round popup
 *     and the rotation both read) lists only CURRENT occupants.
 *   - deliberation resets every ask visual.
 */
"use strict";
const acorn = require("acorn");
const walk = require("acorn-walk");
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
    await new Promise((r) => setTimeout(r, 250));
  }
};

module.exports = {
  name: "ask-truth",
  async run(t, ctx) {
    /* ---------- STATIC ---------- */
    const js = jsOf(ctx.html);
    const fnRange = (name) => {
      let range = null;
      const ast = acorn.parse(js, { ecmaVersion: "latest" });
      walk.simple(ast, { FunctionDeclaration(n) { if (n.id && n.id.name === name) range = [n.start, n.end]; } });
      return range;
    };
    const askSites = [...js.matchAll(/rpc\(\s*"ask_question"/g)].map((m) => m.index);
    t.ok(askSites.length === 1, `exactly one ask_question call site (found ${askSites.length}) — the skip_phase retry bypass must stay gone`);
    const fireRange = fnRange("egFireSpotlight");
    t.ok(!!fireRange && askSites.length === 1 && askSites[0] > fireRange[0] && askSites[0] < fireRange[1],
      "the single ask_question site sits INSIDE egFireSpotlight (AST range check)");
    // every WRITE to the asked maps ([...]=true) lives inside askMark
    const markRange = fnRange("askMark");
    t.ok(!!markRange, "askMark() exists as a real function declaration");
    const writeSites = [...js.matchAll(/__ASKED_THIS_(?:SHOW|ROUND)(?:\[[^\]]*\])+\s*=\s*true/g)].map((m) => m.index);
    t.ok(writeSites.length > 0 && writeSites.every((i) => markRange && i > markRange[0] && i < markRange[1]),
      `every asked-map mark (=true) lives inside askMark() (${writeSites.length} write(s) checked)`);

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_s2", "u_s3", "u_new"].forEach((id, i) => D.addUser({ id, name: "Suitor " + (i + 1) }));

      const host = await h.newClient("host");
      host.login(hostU);
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      // OPENFLOOR round 1: the ask window is closed
      const room = D.addRoom({ id: "r_ask", host_id: hostU, name: "Ask Night", phase: "openfloor", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 60_000);
      D.addMember(room, "u_s1", "chair", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      D.addMember(room, "u_s3", "chair", { seat_index: 2 });
      await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => host.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_s1"), 8000, "chairs render");

      /* --- outside the window: every door refuses --- */
      await host.page.evaluate(() => document.getElementById("rt_seat0").click());   // real chair-tap path
      await host.page.evaluate(() => window.__lc.egOpenDrawer("u_s1"));              // direct door
      await host.page.waitForTimeout(600);
      const drawerShown = await host.page.evaluate(() =>
        document.getElementById("eg_drawer").style.display !== "none" || document.getElementById("room").classList.contains("is-asking"));
      t.ok(!drawerShown, "openfloor: the drawer refuses to open (chair tap AND direct egOpenDrawer)");
      const rpcsBefore = D.rpcLog.filter((r) => r.name === "ask_question").length;
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await host.page.waitForTimeout(400);
      const rpcsAfter = D.rpcLog.filter((r) => r.name === "ask_question").length;
      t.ok(rpcsAfter === rpcsBefore && !D.rooms.get(room).spotlight_target,
        "openfloor: egFireSpotlight fires NO ask_question RPC and sets no target");
      t.ok(await host.page.evaluate(() => window.__lc.askEligible("u_s1") === false),
        "askEligible says no outside the choosing window");

      /* --- inside the window, at a seated member: accepted --- */
      D.setPhase(room, "spotlight", 60);
      await host.page.evaluate(() => window.__lc.egRefreshRoom());
      await waitFor(() => host.page.evaluate(() => window.__lc.askEligible("u_s1") === true), 8000, "choosing window opens");
      await host.page.evaluate(() => window.__lc.egFireSpotlight());   // no preset: rotation must pick a CURRENT seated member
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_s1", 8000, "rotation asks the first unasked seated chair");
      t.ok(D.rpcLog.some((r) => r.name === "ask_question" && r.args.target === "u_s1"),
        "choosing window: the ask lands (ask_question RPC, target u_s1)");
      await waitFor(() => host.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("is-asked")), 8000,
        "ASKED visual appears on the asked man's chair");
      t.ok(await host.page.evaluate(() => window.__lc.askedThisRound("u_s1") === true),
        "ask state recorded against (u_s1, round 1)");

      /* --- he leaves; a NEW man takes the SAME chair --- */
      D.rpc("host", "pass_member", { room_id: room, user_id: "u_s1" });
      D.addMember(room, "u_new", "chair", { seat_index: 0 });
      D.rooms.get(room).spotlight_target = null;                       // back to choosing
      D.setPhase(room, "spotlight", 60);
      await host.page.evaluate(() => { window.__lc.egRefreshRoom(); return window.__lc.loadRoomState(); });
      await waitFor(() => host.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_new"), 8000,
        "the new man renders in the same chair");
      const seat0 = await host.page.evaluate(() => ({
        asked: document.getElementById("rt_seat0").classList.contains("is-asked"),
        foot: (document.querySelector("#rt_seat0 .chair__foot") || {}).textContent || "",
      }));
      t.ok(!seat0.asked && seat0.foot.trim() !== "ASKED",
        `a NEW occupant inherits NO ASKED state from the chair (is-asked=${seat0.asked}, foot="${seat0.foot.trim()}")`);
      const targets = await host.page.evaluate(() => window.__lc.askTargets().map((m) => m.user_id));
      t.ok(targets.includes("u_new") && !targets.includes("u_s1"),
        `the target list is CURRENT occupants only (got: ${targets.join(",")}) — no departed men`);
      t.ok(await host.page.evaluate(() => window.__lc.askEligible("u_s1") === false),
        "a departed man is not an eligible target even in the choosing window");

      /* --- deliberation resets every ask visual --- */
      await host.page.evaluate(() => window.__lc.egFireSpotlight());   // ask someone this round so a visual exists
      await waitFor(() => host.page.evaluate(() => document.querySelector("#rt_chairs .is-asked") !== null), 8000,
        "an ASKED visual exists before deliberation");
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "deliberation", 60);
      await host.page.evaluate(() => { window.__lc.egRefreshRoom(); return window.__lc.loadRoomState(); });
      await waitFor(() => host.page.evaluate(() =>
        document.querySelectorAll("#rt_chairs .is-asked").length === 0 &&
        ![...document.querySelectorAll("#rt_chairs .chair__foot")].some((f) => f.textContent.trim() === "ASKED")), 8000,
        "deliberation wipes every ASKED visual");
      t.ok(true, "deliberation resets all ask visuals (class and foot text)");

      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
