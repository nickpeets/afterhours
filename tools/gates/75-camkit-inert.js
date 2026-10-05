/* GATE 75 — camkit-inert: Camera Kit ships INERT.  Ships with feat/camera-kit
 * (the foundation of filter step 3).
 *
 * THE CLAIM.  index.html carries a CAMKIT config with no SDK address, no API
 * token, no lens group and no looks.  In that state nothing Camera Kit-related
 * is ever requested, no amber tile renders, and the two teal looks behave
 * exactly as they did before this branch.  And "configured" is not "loaded":
 * even with every field set, the SDK is requested by the first lens look a
 * member's row asks this client to draw — never at boot, never by painting
 * the shelf.
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.  harness.js
 * records EVERY request for the SDK module (Harness.camkitRequests) at the
 * network route, so "nothing loaded" is read off the wire, not off the app's
 * own counter; the app's counter (CAMKIT_STATE.sdkLoads) is checked against
 * it.  A lens slug is only wearable once the server allows it, so the blocks
 * that put one on a row first widen the double's allow-list
 * (allowFilterLook) — standing in for production DDL that HAS NOT BEEN RUN.
 *
 * The claims, through window.__lc against the real index.html:
 *   S. STATIC: the shipped literal is null/empty; there is exactly ONE
 *      dynamic import in the file and it is import(CAMKIT.sdkUrl); no
 *      <script> tag or string literal names a Camera Kit host; the loader has
 *      exactly the callers it should (the reconciler warms, filterStart
 *      prepares — nothing at boot); a CSP, if one ever appears, must name
 *      Snap's two runtime hosts
 *   1. shipped state: CAMKIT_STATE.on false, the rack is the two teal looks,
 *      two tiles, none amber, the foot line unchanged, zero SDK requests
 *   2. a teal look still goes on and off through the real pick → reconcile
 *      path, as a 2D source
 *   3. a lens slug on the row while inert (the server allowing it, the
 *      client not configured): he publishes RAW, no badge, no request
 *   4. every PARTIAL configuration is still inert (any one of sdkUrl /
 *      apiToken / lensGroupId / looks missing)
 *   5. full configuration: the amber tiles render with the design's amber —
 *      and there is STILL no SDK request until a look is wanted
 *   6. zero console errors, zero leaked requests
 */
"use strict";
const { Harness, CAMKIT_TEST } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 120));
  }
};
const SHELF = () => {
  window.__lc.updateJoinBtn();
  const sh = document.getElementById("rt_shelf");
  const tiles = [...sh.querySelectorAll(".lc-shelf__tile")].map((b) => ({
    look: b.dataset.look, amber: b.classList.contains("is-amber"), name: b.querySelector(".lc-shelf__name").textContent,
    cost: b.querySelector(".lc-shelf__cost").textContent, border: getComputedStyle(b).borderTopColor, bg: getComputedStyle(b).backgroundColor,
    costInk: getComputedStyle(b.querySelector(".lc-shelf__cost")).color }));
  return { tiles, foot: document.getElementById("rt_shelffoot").textContent, state: window.__lc.CAMKIT_STATE,
           looks: window.__lc.FILTER_LOOKS.map((l) => l.id) };
};
const PIPE = () => {
  const lv = window.__lc.DAILY && window.__lc.DAILY.participants().local.tracks.video;
  const cam = window.__dailyControl && window.__dailyControl.cameraTrack();
  return { F: window.__lc.FILTER_STATE, state: lv ? lv.state : null, trackId: lv && lv.track ? lv.track.id : null, camId: cam ? cam.id : null,
           swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0 };
};

module.exports = {
  name: "camkit-inert",
  async run(t, ctx) {
    /* ---------- S. STATIC ---------- */
    const html = ctx.html;
    const lit = (html.match(/const CAMKIT=\{([^}]*looks:\{\}[^}]*)\};/) || [])[1] || "";
    t.ok(/sdkUrl:null/.test(lit) && /apiToken:null/.test(lit) && /lensGroupId:null/.test(lit) && /looks:\{\}/.test(lit),
      "the shipped CAMKIT literal has no SDK address, no token, no lens group and no looks (" + (lit ? lit.slice(0, 70) + "…" : "LITERAL NOT FOUND") + ")");
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    const code = scripts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // prose is not code
    const imports = [...code.matchAll(/(?<![\w.$])import\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
    t.ok(imports.length === 1 && imports[0] === "CAMKIT.sdkUrl",
      `exactly one dynamic import in the file, and it is import(CAMKIT.sdkUrl) (found: ${JSON.stringify(imports)})`);
    const tags = [...html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g)].map((m) => m[1]);
    t.ok(tags.every((s) => !/camera-kit|snapar|sc-cdn|snapchat/i.test(s)), `no <script> tag loads Camera Kit (${tags.length} external script tag(s) scanned)`);
    t.ok(!/["'`][^"'`\n]*(@snap\/camera-kit|snapar\.com|sc-cdn\.net)[^"'`\n]*["'`]/.test(code),
      "no string literal in the code names a Camera Kit package or host — the address exists only as configuration");
    const callers = (fn) => [...code.matchAll(new RegExp("(?<![\\w.$])" + fn + "\\(", "g"))].length;
    const body = (re) => (code.match(re) || [""])[0];
    const syncBody = body(/async function filterSyncOnce\(\)\{[\s\S]*?\n\}/), startBody = body(/async function filterStart\(name\)\{[\s\S]*?\n\}/);
    const warmBody = body(/function camkitWarm\(slug\)\{[\s\S]*?\n\}/);
    t.ok(callers("camkitWarm") === 2 && /camkitWarm\(want\)/.test(syncBody),
      `camkitWarm has ONE caller — the reconciler (declaration + ${callers("camkitWarm") - 1} call)`);
    t.ok(callers("camkitPrepare") === 3 && /camkitPrepare\(name\)/.test(startBody) && /camkitPrepare\(slug\)/.test(warmBody),
      `camkitPrepare has TWO callers — filterStart and camkitWarm (declaration + ${callers("camkitPrepare") - 1} calls); nothing at boot`);
    const csp = (html.match(/<meta[^>]+http-equiv=["']Content-Security-Policy["'][^>]*>/i) || [null])[0];
    t.ok(!csp || (/snapar\.com/.test(csp) && /sc-cdn\.net/.test(csp)),
      csp ? "a CSP meta exists and names Snap's runtime hosts (*.snapar.com, *.sc-cdn.net)" : "no CSP meta in index.html — nothing blocks the SDK's runtime hosts (if one is ever added it must allow *.snapar.com and *.sc-cdn.net)");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@inert.test" });
      ["u_a", "u_b", "u_c"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_inert", host_id: hostU, name: "Inert Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 600_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      D.addMember(room, "u_b", "chair", { seat_index: 1 });
      D.addMember(room, "u_c", "chair", { seat_index: 2 });
      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_a"), 8000, name + ": chairs render");
        await waitFor(() => c.page.evaluate(() =>
          window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 12_000, name + " publishing");
        return c;
      };
      const A = await boot("a", "u_a");
      const B = await boot("b", "u_b");
      const C = await boot("c", "u_c");
      await A.page.waitForTimeout(800);   // let anything a boot would request get requested

      /* ---------- 1. shipped state ---------- */
      const s1 = await A.page.evaluate(SHELF);
      t.ok(s1.state.on === false && s1.state.sdkLoads === 0 && s1.state.booted === false && s1.state.looks.length === 0,
        `shipped: CAMKIT_STATE.on false, nothing loaded, no lens looks (${JSON.stringify(s1.state)})`);
      t.ok(s1.looks.join(",") === "grade,noir", `the rack is the two teal looks and nothing else (${s1.looks})`);
      t.ok(s1.tiles.length === 2 && s1.tiles.every((x) => !x.amber) && s1.tiles.every((x) => x.cost === "FREE"),
        `two tiles on the shelf, none amber, both FREE (${s1.tiles.map((x) => x.look + (x.amber ? "*" : "")).join(",")})`);
      t.ok(s1.foot === "Teal = free, no tracking.", `the shelf's foot line is unchanged ("${s1.foot}")`);
      t.ok(h.camkitRequests.length === 0, `zero requests for the SDK after three clients booted and joined (${h.camkitRequests.length})`);
      const shippedCfg = await A.page.evaluate(() => ({ ...window.__lc.CAMKIT, looks: Object.keys(window.__lc.CAMKIT.looks).length }));
      t.ok(shippedCfg.sdkUrl === null && shippedCfg.apiToken === null && shippedCfg.lensGroupId === null && shippedCfg.looks === 0,
        "the LIVE config object the page booted with matches the shipped literal (all null / empty)");

      /* ---------- 2. a teal look, unchanged ---------- */
      t.ok((await A.page.evaluate(() => window.__lc.filterPick("grade"))).ok === true, "u_a: filterPick('grade') accepted");
      await waitFor(() => A.page.evaluate(() => window.__lc.FILTER_STATE.active === true), 8000, "u_a's teal look to come up");
      const a2 = await A.page.evaluate(PIPE);
      t.ok(a2.F.name === "grade" && a2.F.kind === "2d" && a2.trackId === a2.F.canvasTrackId && a2.swaps === 1,
        `the teal look goes on through pick → reconcile as a 2D source, one videoSource swap (kind=${a2.F.kind}, swaps=${a2.swaps})`);
      t.ok((await A.page.evaluate(() => window.__lc.filterDrop())).ok === true, "u_a: filterDrop() accepted");
      /* FILTER_STATE goes idle BEFORE the device switch back has landed — wait for the call itself to say camera */
      await waitFor(() => A.page.evaluate(() => { const lv = window.__lc.DAILY.participants().local.tracks.video; const cam = window.__dailyControl.cameraTrack();
        return window.__lc.FILTER_STATE.active === false && lv.state === "playable" && lv.track && cam && lv.track.id === cam.id; }), 8000, "u_a's teal look to come down and the camera to be back");
      const a2b = await A.page.evaluate(PIPE);
      t.ok(a2b.trackId === a2b.camId && a2b.state === "playable" && a2b.F.kind === null, "…and off again: the camera is published, playable");
      t.ok(h.camkitRequests.length === 0, "still zero SDK requests — a teal look never touches Camera Kit");

      /* ---------- 3. a lens slug on the row while the client is inert ---------- */
      const before3 = await B.page.evaluate(PIPE);
      const rej = await B.page.evaluate(() => window.__lc.filterPick("foxears"));
      t.ok(rej.ok === false && /no such filter/.test(rej.error), `production today: a lens slug is rejected by set_filter ("${rej.error}")`);
      D.allowFilterLook("foxears");   // the DDL that has NOT been run in production
      t.ok((await B.page.evaluate(() => window.__lc.filterPick("foxears"))).ok === true, "(server widened) u_b: the server now accepts 'foxears' — the client is still inert");
      await waitFor(() => B.page.evaluate(() => (window.__lc.FILTER_ROOM.u_b || {}).name === "foxears"), 8000, "u_b's client to observe his field");
      await B.page.waitForTimeout(1200);
      const b3 = await B.page.evaluate(PIPE);
      t.ok(b3.F.active === false && b3.trackId === before3.trackId && b3.trackId === b3.camId && b3.swaps === 0 && b3.state === "playable",
        `a look this client cannot draw: he publishes RAW — same camera track, no swap (track ${b3.trackId}, swaps=${b3.swaps})`);
      const direct = await B.page.evaluate(() => window.__lc.filterStart("foxears"));
      t.ok(direct === false, "filterStart('foxears') declines outright while inert (no such filter)");
      const badge3 = await A.page.evaluate(() => document.getElementById("rt_seat1").classList.contains("has-filter"));
      t.ok(badge3 === false, "…and no client paints a badge for a look it has no name for");
      t.ok(h.camkitRequests.length === 0, "zero SDK requests — an inert client does not go looking for the SDK because a row named a lens");

      /* ---------- 4. every partial configuration is still inert ---------- */
      const full = { sdkUrl: CAMKIT_TEST.sdkUrl, apiToken: CAMKIT_TEST.apiToken, lensGroupId: CAMKIT_TEST.lensGroupId, looks: CAMKIT_TEST.looks };
      for (const missing of ["sdkUrl", "apiToken", "lensGroupId", "looks"]) {
        await B.camkitConfigure({ ...full, [missing]: missing === "looks" ? {} : null });
        await B.page.evaluate(() => window.__lc.filterReconcile());
        await B.page.waitForTimeout(400);
        const s4 = await B.page.evaluate(SHELF);
        const p4 = await B.page.evaluate(PIPE);
        t.ok(s4.state.on === false && s4.tiles.length === 2 && !s4.tiles.some((x) => x.amber) && p4.F.active === false && h.camkitRequests.length === 0,
          `without ${missing}: still inert — on=false, two teal tiles, his lens row publishes raw, zero requests`);
      }

      /* ---------- 5. full configuration: tiles, and STILL no request ---------- */
      await C.camkitConfigure();
      const s5 = await C.page.evaluate(SHELF);
      t.ok(s5.state.on === true && s5.looks.join(",") === "grade,noir,foxears,halo",
        `fully configured: CAMKIT_STATE.on true and the rack is teal then amber (${s5.looks})`);
      const amber = s5.tiles.filter((x) => x.amber);
      t.ok(s5.tiles.length === 4 && amber.length === 2 && amber.map((x) => x.look).join(",") === "foxears,halo",
        `four tiles, the two lens looks amber (${s5.tiles.map((x) => x.look + (x.amber ? "*" : "")).join(",")})`);
      t.ok(amber[0].name === "Fox Ears" && amber[1].name === "halo" && amber.every((x) => x.cost === "✦"),
        `a look configured with a name shows it, a bare lens id falls back to its slug ("${amber[0].name}", "${amber[1].name}")`);
      t.ok(amber.every((x) => x.border === "rgba(255, 194, 77, 0.6)" && x.bg === "rgba(255, 194, 77, 0.14)" && x.costInk === "rgb(255, 217, 138)"),
        `the amber tile carries the design's values — border ${amber[0].border}, fill ${amber[0].bg}, cost ink ${amber[0].costInk}`);
      const teal = s5.tiles.filter((x) => !x.amber);
      t.ok(teal.every((x) => x.border === "rgba(45, 227, 208, 0.7)"), "the teal tiles are untouched beside them");
      t.ok(/Amber = face-tracked/.test(s5.foot), `the foot line names the amber set once there is one ("${s5.foot}")`);
      await C.page.evaluate(() => { document.getElementById("rt_filterbtn").click(); });
      await C.page.waitForTimeout(800);
      const s5b = await C.page.evaluate(() => ({ open: document.getElementById("rt_shelf").classList.contains("is-open"), st: window.__lc.CAMKIT_STATE }));
      t.ok(s5b.open === true && s5b.st.sdkLoads === 0 && h.camkitRequests.length === 0,
        `configured, shelf open, amber tiles on screen — and STILL zero SDK requests: the SDK loads on first USE, not on first sight (requests=${h.camkitRequests.length})`);

      /* ---------- 6. quiet ---------- */
      for (const c of [A, B, C]) {
        const errs = c.errors.filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, `zero console errors on ${c.name} — ${errs.slice(0, 2).join(" | ")}`);
      }
      const leaks = h.unexpectedRequests.filter((u) => !/favicon/.test(u));
      t.ok(leaks.length === 0, `zero leaked requests — ${leaks.slice(0, 3).join(" | ")}`);
    } finally { await h.close(); }
  },
};
