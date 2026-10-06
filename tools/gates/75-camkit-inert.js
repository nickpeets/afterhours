/* GATE 75 — camkit-inert: without ?camkit, Camera Kit is INERT.  Shipped with
 * feat/camera-kit (the foundation of filter step 3) as "Camera Kit ships
 * inert"; REVISED by feat/camera-kit-staging, which fills the config in.
 *
 * THE CLAIM.  index.html now carries a real STAGING configuration (a pinned
 * SDK address, Snap's staging token, a lens group, two looks) — and Snap
 * watermarks every staging lens — so the feature is test-flagged: a page is
 * Camera Kit-capable only when its URL carries ?camkit.  A page loaded
 * WITHOUT the flag behaves exactly as the empty config did before: nothing
 * Camera Kit-related is ever requested, no amber tile renders, a lens slug on
 * a row is a look the client cannot name, and the two teal looks are
 * untouched.  Every client in this gate is a flagless page.  (What the flag
 * turns ON is gate 79's; the lens itself is gates 76-78's.)
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.  harness.js
 * records EVERY request for the SDK module (Harness.camkitRequests) at the
 * network route, so "nothing loaded" is read off the wire, not off the app's
 * own counter; the app's counter (CAMKIT_STATE.sdkLoads) is checked against
 * it.  The route matches ANY @snap/camera-kit address, so the shipped esm.sh
 * URL would be counted (and served the shim) if anything asked for it.  The
 * double's allow-list carries the two shipped slugs (the DDL in
 * tools/DESIGN-filter-rules.md); the shim-only slug 'foxears' is widened per
 * test with allowFilterLook, as before.
 *
 * The claims, through window.__lc against the real index.html:
 *   S. STATIC: the shipped literal is a complete staging config — the SDK
 *      address pins the SDK AND every dependency to an exact version, the
 *      token is a real token (never printed here), the group is a UUID, the
 *      looks are two `ck-` slugs; the flag is read once from the URL and
 *      camkitOn() cannot be true without it; there is exactly ONE dynamic
 *      import in the file and it is import(CAMKIT.sdkUrl); no <script> tag
 *      names a Camera Kit host and the ONE string literal that names the
 *      package is the config's sdkUrl; the loader has exactly the callers it
 *      should — a lens being started or warmed, and the shelf button asking
 *      Snap's terms on its first opening (public API only, nothing from the
 *      kit's internals) — and nothing at boot; the two applyLens calls, and
 *      only they, stop their clock for the terms dialog; a CSP, if one ever
 *      appears, must name the runtime hosts
 *   1. flagless, config FILLED IN: CAMKIT_STATE.on false, the rack is the two
 *      teal looks, two tiles, none amber, the foot line unchanged, zero SDK
 *      requests
 *   2. a teal look still goes on and off through the real pick → reconcile
 *      path, as a 2D source
 *   3. a lens slug on the row of a flagless client — an unknown one AND a
 *      shipped one the server accepts: he publishes RAW, no badge, no request
 *   4. no configuration turns a flagless page on: every partial one, and the
 *      harness's complete one
 *   5. THE SDK LOADS ON FIRST SHELF OPEN WITH ?camkit, NEVER ON A FLAGLESS
 *      PAGE — this is the flagless half: shelf open, still two teal tiles,
 *      no request, no terms asked (the ?camkit half is gate 77 block E and
 *      gate 79 block T)
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
    const lit = (html.match(/\nconst CAMKIT=\{\n([\s\S]*?)\n\};/) || [])[1] || "";
    const field = (re) => (lit.match(re) || [])[1] || null;
    const sdkUrl = field(/sdkUrl:"([^"]*)"/), token = field(/apiToken:"([^"]*)"/), group = field(/lensGroupId:"([^"]*)"/);
    const exact = /^\d+\.\d+\.\d+$/;
    const sdkM = (sdkUrl || "").match(/^https:\/\/esm\.sh\/@snap\/camera-kit@([^?\/]+)\?bundle&deps=(.+)$/);
    const deps = sdkM ? sdkM[2].split(",").map((d) => { const i = d.lastIndexOf("@"); return { name: d.slice(0, i), ver: d.slice(i + 1) }; }) : [];
    t.ok(!!sdkM && exact.test(sdkM[1]),
      `the shipped SDK address is esm.sh's ?bundle build of ONE exact SDK version (${sdkM ? "@snap/camera-kit@" + sdkM[1] : "NOT FOUND: " + String(sdkUrl).slice(0, 60)})`);
    t.ok(deps.length >= 10 && deps.every((d) => d.name && exact.test(d.ver)) && new Set(deps.map((d) => d.name)).size === deps.length,
      `…and ?deps= pins every dependency inside the bundle to an exact version — no ranges, no tags (${deps.length}: ${deps.map((d) => d.name + "@" + d.ver).join(", ")})`);
    /* the token is Snap's STAGING token and is public by construction — but a
       gate log is no place for it: only its SHAPE is asserted and printed */
    t.ok(!!token && /^[\w-]{10,}\.[\w-]{10,}\.[\w-]{10,}$/.test(token) && !/PASTE/.test(token),
      `the shipped apiToken is a real three-part token, not a placeholder (${token ? token.length + " chars, " + token.split(".").length + " parts" : "MISSING"})`);
    t.ok(!!group && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(group), `the shipped lensGroupId is a lens-group UUID (${group})`);
    const looksSrc = (lit.match(/looks:\{([\s\S]*?)\n  \},/) || [])[1] || "";
    const shippedLooks = [...looksSrc.matchAll(/"([^"]+)":\{ lensId:"(\d+)", name:"([^"]+)", icon:"([^"]+)" \}/g)].map((m) => ({ slug: m[1], lensId: m[2], name: m[3] }));
    t.ok(shippedLooks.length === 2 && shippedLooks.every((l) => /^ck-[a-z0-9-]+$/.test(l.slug)) && shippedLooks[0].lensId !== shippedLooks[1].lensId,
      `two looks ship, each a lowercase ck- slug onto its own lens id, each with a name and an icon (${shippedLooks.map((l) => l.slug + "→" + l.lensId + " \"" + l.name + "\"").join(", ")})`);
    t.ok(/target:"capture"/.test(lit) && /mirror:false/.test(lit), "target is still \"capture\" and mirror still false, as #87 set them");
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map((m) => m[1]).join("\n");
    const code = scripts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1");   // prose is not code
    const imports = [...code.matchAll(/(?<![\w.$])import\s*\(([^)]*)\)/g)].map((m) => m[1].trim());
    t.ok(imports.length === 1 && imports[0] === "CAMKIT.sdkUrl",
      `exactly one dynamic import in the file, and it is import(CAMKIT.sdkUrl) (found: ${JSON.stringify(imports)})`);
    const tags = [...html.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g)].map((m) => m[1]);
    t.ok(tags.every((s) => !/camera-kit|snapar|sc-cdn|snapchat/i.test(s)), `no <script> tag loads Camera Kit (${tags.length} external script tag(s) scanned)`);
    const named = [...code.matchAll(/["'`][^"'`\n]*(@snap\/camera-kit|snapar\.com|sc-cdn\.net)[^"'`\n]*["'`]/g)].map((m) => m[0]);
    t.ok(named.length === 1 && named[0] === JSON.stringify(sdkUrl),
      `exactly ONE string literal in the code names a Camera Kit package or host, and it is the config's sdkUrl — the address exists only as configuration (found ${named.length})`);
    /* the flag: read once from the URL into a const; camkitOn() is gated on it;
       and nothing else can switch it — it has exactly five mentions */
    const flagDecl = [...code.matchAll(/const CAMKIT_FLAG\s*=\s*new URLSearchParams\(location\.search\)\.has\("camkit"\);/g)].length;
    const onBody = (code.match(/function camkitOn\(\)\{[\s\S]*?\n\}/) || [""])[0];
    const flagUses = [...code.matchAll(/(?<![\w.$])CAMKIT_FLAG(?![\w$])/g)].length;
    t.ok(flagDecl === 1 && /return !!\(CAMKIT_FLAG && /.test(onBody),
      "the test flag is a const read once from the URL (?camkit), and camkitOn() cannot be true without it");
    t.ok(flagUses === 5 && !/CAMKIT_FLAG\s*=[^=]/.test(code.replace(/const CAMKIT_FLAG\s*=/, "")),
      `CAMKIT_FLAG is never assigned again — its declaration, camkitOn, the state readout, and the export's getter name + return (${flagUses} mentions)`);
    const callers = (fn) => [...code.matchAll(new RegExp("(?<![\\w.$])" + fn + "\\(", "g"))].length;
    const body = (re) => (code.match(re) || [""])[0];
    const syncBody = body(/async function filterSyncOnce\(\)\{[\s\S]*?\n\}/), startBody = body(/async function filterStart\(name\)\{[\s\S]*?\n\}/);
    const warmBody = body(/function camkitWarm\(slug\)\{[\s\S]*?\n\}/);
    t.ok(callers("camkitWarm") === 2 && /camkitWarm\(want\)/.test(syncBody),
      `camkitWarm has ONE caller — the reconciler (declaration + ${callers("camkitWarm") - 1} call)`);
    /* feat/camera-kit-staging, Nick's ruling on Snap's terms: THE SDK LOADS ON
       FIRST SHELF OPEN WITH ?camkit, NEVER ON A FLAGLESS PAGE.  So the loader
       has a third caller — camkitTermsEarly, which the shelf button calls
       when it OPENS the shelf, and which returns at once unless camkitOn()
       (false without the flag).  Still nothing at boot. */
    const prepBody = body(/async function camkitPrepare\(slug\)\{[\s\S]*?\n\}/), earlyBody = body(/function camkitTermsEarly\(\)\{[\s\S]*?\n\}/);
    const btnBody = body(/\$\("rt_filterbtn"\)\.onclick=\(\)=>\{[\s\S]*?\n\};/);
    t.ok(callers("camkitPrepare") === 4 && /camkitPrepare\(name\)/.test(startBody) && /camkitPrepare\(slug\)/.test(warmBody) && /camkitPrepare\(first\.id\)/.test(earlyBody),
      `camkitPrepare has THREE callers — filterStart, camkitWarm and camkitTermsEarly (declaration + ${callers("camkitPrepare") - 1} calls); nothing at boot`);
    t.ok(callers("camkitBoot") === 2 && /camkitBoot\(\)/.test(prepBody),
      `camkitBoot (SDK load + bootstrap) has ONE caller — camkitPrepare (declaration + ${callers("camkitBoot") - 1} call)`);
    t.ok(callers("camkitTermsEarly") === 2 && /if\(opening\) camkitTermsEarly\(\);/.test(btnBody) && /if\(CAMKIT_TERMS\.asked \|\| !camkitOn\(\) \|\| CAMKIT_RT\.dead\) return;/.test(earlyBody),
      `camkitTermsEarly has ONE caller — the shelf button, when it OPENS the shelf — and returns at once unless camkitOn() (declaration + ${callers("camkitTermsEarly") - 1} call)`);
    t.ok(!/\.container\b/.test(earlyBody) && !/legalState/.test(code) && /prep\.kit\.createSession\(\)/.test(earlyBody) && /session\.applyLens\(prep\.lens\)/.test(earlyBody) && /camkitSessionEnd\(session\)/.test(earlyBody)
        && !/setSource|\.play\(|captureStream|setInputDevicesAsync/.test(earlyBody),
      "the early ask is the SDK's PUBLIC API only — createSession, applyLens, then the session ended — with no source, no play, no capture and no call in it, and nothing reaches into the kit's internals");
    const held = [...code.matchAll(/camkitTimed\(([^;]*), true\);/g)].map((m) => m[1]).sort();
    t.ok(held.length === 2 && held[0] === 'session.applyLens(prep.lens), CAMKIT.startMs, "applyLens"' && held[1] === 'session.applyLens(prep.lens), CAMKIT.startMs, "terms applyLens"',
      `exactly TWO timed calls hold their clock while Snap's terms are on screen, and both are applyLens under the start ceiling — the lens start's and the hidden terms session's (${held.length})`);
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

      /* ---------- 1. flagless, with the config filled in ---------- */
      const s1 = await A.page.evaluate(SHELF);
      t.ok(s1.state.on === false && s1.state.flag === false && s1.state.sdkLoads === 0 && s1.state.booted === false && s1.state.looks.length === 0,
        `no ?camkit: CAMKIT_STATE.on false, nothing loaded, no lens looks (${JSON.stringify(s1.state)})`);
      t.ok(s1.looks.join(",") === "grade,noir", `the rack is the two teal looks and nothing else (${s1.looks})`);
      t.ok(s1.tiles.length === 2 && s1.tiles.every((x) => !x.amber) && s1.tiles.every((x) => x.cost === "FREE"),
        `two tiles on the shelf, none amber, both FREE (${s1.tiles.map((x) => x.look + (x.amber ? "*" : "")).join(",")})`);
      t.ok(s1.foot === "Teal = free, no tracking.", `the shelf's foot line is unchanged ("${s1.foot}")`);
      t.ok(h.camkitRequests.length === 0, `zero requests for the SDK after three clients booted and joined (${h.camkitRequests.length})`);
      const shippedCfg = await A.page.evaluate(() => ({ sdkUrl: window.__lc.CAMKIT.sdkUrl, hasToken: !!window.__lc.CAMKIT.apiToken, lensGroupId: window.__lc.CAMKIT.lensGroupId,
        looks: Object.keys(window.__lc.CAMKIT.looks), flag: window.__lc.CAMKIT_FLAG }));
      t.ok(shippedCfg.sdkUrl === sdkUrl && shippedCfg.hasToken && shippedCfg.lensGroupId === group && shippedCfg.looks.join(",") === shippedLooks.map((l) => l.slug).join(",") && shippedCfg.flag === false,
        `…and that is WITH the config filled in: the LIVE config object the page booted with is the complete shipped literal (${shippedCfg.looks.join(", ")}); only the flag is missing`);

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
      t.ok(rej.ok === false && /no such filter/.test(rej.error), `a lens slug in no production list is rejected by set_filter ("${rej.error}")`);
      D.allowFilterLook("foxears");   // the shim-only slug: no production DDL names it
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
      /* 3b. the same, for a slug the page SHIPS and the server ACCEPTS (no
         widening: the double's list mirrors the DDL).  This is the phone
         without ?camkit whose row names a staging lens. */
      const real = shippedLooks[0].slug;
      const before3b = await C.page.evaluate(PIPE);
      const acc = await C.page.evaluate((s) => window.__lc.filterPick(s), real);
      t.ok(acc.ok === true && D.memberRow(room, "u_c").filter === real, `u_c (no ?camkit): the server accepts the shipped slug '${real}' with no widening — it is on his row`);
      await waitFor(() => C.page.evaluate((s) => (window.__lc.FILTER_ROOM.u_c || {}).name === s, real), 8000, "u_c's client to observe his field");
      await C.page.waitForTimeout(1200);
      const c3 = await C.page.evaluate(PIPE);
      t.ok(c3.F.active === false && c3.trackId === before3b.trackId && c3.trackId === c3.camId && c3.swaps === 0 && c3.state === "playable",
        `…and his flagless client publishes RAW — same camera track, no swap (swaps=${c3.swaps})`);
      t.ok((await C.page.evaluate((s) => window.__lc.filterStart(s), real)) === false, `filterStart('${real}') declines outright on a flagless page`);
      const badge3b = [];
      for (const c of [A, B, C]) badge3b.push(await c.page.evaluate(() => document.getElementById("rt_seat2").classList.contains("has-filter")));
      t.ok(badge3b.every((x) => x === false), "no flagless client paints a badge for it");
      t.ok(h.camkitRequests.length === 0, "zero SDK requests — a filled-in config and a lens slug on the row still load nothing without the flag");

      /* ---------- 4. no configuration turns a flagless page on ---------- */
      const full = { sdkUrl: CAMKIT_TEST.sdkUrl, apiToken: CAMKIT_TEST.apiToken, lensGroupId: CAMKIT_TEST.lensGroupId, looks: CAMKIT_TEST.looks };
      for (const missing of ["sdkUrl", "apiToken", "lensGroupId", "looks", null]) {
        await B.camkitConfigure(missing ? { ...full, [missing]: missing === "looks" ? {} : null } : full);
        await B.page.evaluate(() => window.__lc.filterReconcile());
        await B.page.waitForTimeout(400);
        const s4 = await B.page.evaluate(SHELF);
        const p4 = await B.page.evaluate(PIPE);
        t.ok(s4.state.on === false && s4.tiles.length === 2 && !s4.tiles.some((x) => x.amber) && p4.F.active === false && h.camkitRequests.length === 0,
          (missing ? `without ${missing}` : "the harness's COMPLETE config (his row names its 'foxears')") + ": still inert on a flagless page — on=false, two teal tiles, his lens row publishes raw, zero requests");
      }

      /* ---------- 5. flagless, shelf open ---------- */
      await C.page.evaluate(() => { document.getElementById("rt_filterbtn").click(); });
      await C.page.waitForTimeout(800);
      const s5 = await C.page.evaluate(() => ({ open: document.getElementById("rt_shelf").classList.contains("is-open"), st: window.__lc.CAMKIT_STATE,
        tiles: [...document.querySelectorAll("#rt_shelfrack .lc-shelf__tile")].map((b) => ({ look: b.dataset.look, amber: b.classList.contains("is-amber") })),
        foot: document.getElementById("rt_shelffoot").textContent }));
      t.ok(s5.open === true && s5.tiles.length === 2 && s5.tiles.every((x) => !x.amber) && s5.foot === "Teal = free, no tracking.",
        `the shelf, open, on a flagless page with a lens slug on the row: two teal tiles, no amber, the old foot line (${s5.tiles.map((x) => x.look).join(",")})`);
      t.ok(s5.st.sdkLoads === 0 && h.camkitRequests.length === 0, `…and still zero SDK requests (requests=${h.camkitRequests.length})`);
      const terms5 = await C.page.evaluate(() => ({ asked: window.__lc.CAMKIT_STATE.termsAsked, open: window.__lc.camkitTermsOpen(), dialog: !!document.querySelector('[data-testid="tos-dialog"]') }));
      t.ok(terms5.asked === false && terms5.open === false && terms5.dialog === false,
        "…and nothing asked for Snap's terms: opening the shelf is the one thing that loads the SDK on a ?camkit page, and without the flag it loads nothing and asks nothing");

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
