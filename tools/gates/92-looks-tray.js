/* GATE 92 — looks-tray: the tray and the cracks (feat/looks-v2 PR A, ruling
 * 10/17).  The scrolling strip is gone; a bottom sheet of big tiles with
 * tabs took its place, a tap TRIES a look on the wearer's own tile and only
 * WEAR IT spends the pick; the cracks are glass fractures drawn the same on
 * every phone, and the shatter leaves a cracked frame.
 *
 * WHAT DOES NOT CHANGE, and what this gate leans on: every show rule is the
 * server's (gate 71), the slug allow-list is the server's (gate 71, 79),
 * the cracks are a server count (gate 88).  This gate proves the NEW client
 * surface on top of those: layout, the trial, the one door, the take-off,
 * the cracks' sameness — and it proves its own teeth with a MUTANT.
 *
 * The claims, through window.__lc and the real DOM against index.html:
 *   S.  STATIC: the tile's tap handler calls lookTry and never filterPick;
 *       lookTry makes no RPC and never touches DAILY; the strip's
 *       overflow-x is gone from the looks rack; every tray control is 44px
 *   1.  LAYOUT at 360, 375, 390 and 414: the tray opens as a bottom sheet
 *       inside the viewport, the rack does not scroll sideways, every
 *       tile is at least 84 wide and 88 tall, rows hold 3 or 4 — and,
 *       from a BOTTOM chair, during a trial at least 60% of the wearer's
 *       own tile is in view (the sheet collapses to the bar; Nick, 10/17)
 *   2.  TAP TO TRY: a tap arms a trial — a canvas on the wearer's own tile
 *       only, frames drawn; the server row is bare, no set_filter was
 *       called, nothing is published (no videoSource swap, FILTER idle),
 *       no other phone paints a badge; six seconds later the canvas is
 *       gone and the bar offers WEAR IT
 *   3.  CANCEL reverts: no canvas, no trial, still bare
 *   4.  WEAR IT spends it: set_filter is called ONCE, the server confirms
 *       (filter and filter_pick set), the pipeline comes up, the tray says
 *       the pick is spent and names the look
 *   5.  TAKE IT OFF: the look comes off, the pick stays spent, the tray
 *       says so, every tile is hidden and a tap on one is refused
 *   6.  the bench: a trial with no self-view arms the bar without a
 *       picture and says so; WEAR IT from the bench is accepted (gate 71's
 *       rule) and set_filter was called exactly once for it
 *   7.  the ASK ends a trial (the tray closes, nothing was picked)
 *   8.  the tabs: Tonight is empty without a pack and says so, Classics
 *       holds the two free looks, Earned lists the gameplay looks greyed
 *       with a lock and an "earn it by…", Shop is greyed "coming soon" —
 *       and none of the greyed tiles is a wearable tile
 *   9.  CRACKS: two phones at the same width draw byte-identical paths for
 *       the same frame, every crack has its three strokes, crack 1 does
 *       not change when crack 2 lands, and the two tiles' pixels match
 *  10.  SHATTER leaves a cracked frame: shards exist, the frame is
 *       is-shattered, reduced motion plays no shard fall
 *  11.  THE MUTANT: served a page whose lookTry publishes (one line
 *       changed), claim 2's "server row is bare" check FAILS — the gate
 *       has teeth
 *  12.  zero console errors
 */
"use strict";
const { Harness } = require("../lib/harness");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch").default || require("pixelmatch");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 100));
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const TRAY = () => {
  const sh = document.getElementById("rt_shelf"), rack = document.getElementById("rt_shelfrack");
  const r = sh.getBoundingClientRect();
  const tiles = [...rack.querySelectorAll(".lc-shelf__tile")].map((b) => {
    const bb = b.getBoundingClientRect();
    return { look: b.dataset.look, tab: b.dataset.tab, hidden: b.hidden, w: bb.width, h: bb.height, top: Math.round(bb.top), left: Math.round(bb.left),
      badge: (b.querySelector(".lc-shelf__kind") || {}).textContent || "", trying: b.classList.contains("is-trying"), worn: b.classList.contains("is-worn") };
  });
  const ghosts = [...document.querySelectorAll("#rt_shelfghosts .lc-tray__ghost")].map((g) => ({ id: g.dataset.ghost, lock: !!g.querySelector(".lc-tray__ghost-lock"),
    how: (g.querySelector(".lc-tray__ghost-how") || {}).textContent || "", wearable: g.classList.contains("lc-shelf__tile"), shown: getComputedStyle(g).display !== "none" }));
  const ctl = (id) => { const e = document.getElementById(id); if (!e) return null; const bb = e.getBoundingClientRect(); return { display: getComputedStyle(e).display, h: bb.height, text: e.textContent.trim() }; };
  return {
    open: sh.classList.contains("is-open"), locked: sh.classList.contains("is-locked"), top: r.top, bottom: r.bottom, left: r.left, right: r.right,
    vw: window.innerWidth, vh: window.innerHeight, scrollW: rack.scrollWidth, clientW: rack.clientWidth, rackOverflowX: getComputedStyle(rack).overflowX,
    tiles, ghosts, tab: window.__lc.lookTrayTabNow(),
    tabs: [...document.querySelectorAll("#rt_shelftabs .lc-tray__tab")].map((b) => ({ tab: b.dataset.tab, selected: b.getAttribute("aria-selected") === "true", h: b.getBoundingClientRect().height })),
    meta: document.getElementById("rt_shelfmeta").textContent, foot: document.getElementById("rt_shelffoot").textContent,
    empty: ctl("rt_shelfempty"), tryBar: ctl("rt_shelftry"), tryText: (document.getElementById("rt_shelftryt") || {}).textContent || "",
    wear: ctl("rt_shelfwear"), cancel: ctl("rt_shelfcancel"), worn: ctl("rt_shelfworn"), wornText: (document.getElementById("rt_shelfwornt") || {}).textContent || "", drop: ctl("rt_filterdrop"),
  };
};
const TRIAL = () => {
  const mine = window.__lc.lookMyTile();
  const cv = mine ? mine.querySelector(".chair__tryon") : null;
  return { state: window.__lc.TRYON_STATE, myTile: mine ? mine.id : null, canvas: !!cv, canvasZ: cv ? getComputedStyle(cv).zIndex : null,
    cracksZ: mine && mine.querySelector(".chair__cracks") ? getComputedStyle(mine.querySelector(".chair__cracks")).zIndex : null,
    F: window.__lc.FILTER_STATE, swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0,
    badges: [0, 1, 2].map((i) => document.getElementById("rt_seat" + i).classList.contains("has-filter")) };
};
const SEAT = (i) => {
  const el = document.getElementById("rt_seat" + i), svg = el.querySelector(".chair__cracks");
  const q = (c) => svg ? [...svg.querySelectorAll("path." + c)].map((p) => p.getAttribute("d")) : [];
  return { uid: el.dataset.heartuid || null, cracks: Number(el.dataset.cracks || 0), has: el.classList.contains("has-cracks"), shattered: el.classList.contains("is-shattered"),
    lite: q("ck-lite"), dark: q("ck-dark"), hi: q("ck-hi"), shards: svg ? [...svg.querySelectorAll("path.ck-shard")].map((p) => ({ d: p.getAttribute("d"), anim: getComputedStyle(p).animationName, op: getComputedStyle(p).opacity })) : [],
    mends: svg ? svg.querySelectorAll("path.ck-mend").length : 0, w: el.offsetWidth, h: el.offsetHeight, rect: (() => { const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })() };
};

module.exports = {
  name: "looks-tray",
  async run(t, ctx) {
    const html = ctx.html;
    /* ---------- S. STATIC ---------- */
    const body = (re) => (html.match(re) || [""])[0];
    const tryBody = body(/async function lookTry\(id\)\{[\s\S]*?\n\}/);
    const paintBody = body(/function filterPaintComposer\(\)\{[\s\S]*?\n\}/);
    const tileHandler = body(/rack\.querySelectorAll\("\.lc-shelf__tile"\)\.forEach\(t=>t\.onclick=\(\)=>\{[\s\S]*?\n\s*\}\);/);
    t.ok(tryBody.length > 500 && !/sb\.rpc\(|sb\.from\(|filterPick\(|DAILY\.|setInputDevicesAsync/.test(tryBody) && /TRY-ON NEVER PUBLISHES/.test(html),
      "lookTry makes no RPC, never calls filterPick and never touches DAILY — the trial cannot publish");
    t.ok(tileHandler.length > 0 && /lookTry\(t\.dataset\.look\)/.test(tileHandler) && !/filterPick/.test(tileHandler),
      "the tile's tap handler calls lookTry (TAP TO TRY) and never filterPick");
    t.ok(/\$\("rt_shelfwear"\)\.onclick=\(\)=>\{ lookWear\(\); \};/.test(html) && /const r=await filterPick\(id\);/.test(body(/async function lookWear\(\)\{[\s\S]*?\n\}/)),
      "WEAR IT is the one door from the tray to set_filter (lookWear → filterPick)");
    t.ok(/#rt_shelf \.lc-shelf__rack\{ display:grid;[^}]*overflow:visible/.test(html), "the looks rack is a grid with no sideways overflow (the strip's overflow-x is gone from it)");
    t.ok(/min-height:88px/.test(body(/#rt_shelf \.lc-shelf__tile\{[^}]*\}/)) && /min-height:44px/.test(body(/\.lc-tray__tab\{[^}]*\}/)) && /min-height:46px/.test(body(/\.lc-tray__wear\{[^}]*\}/)),
      "tiles are 88px tall, tabs and the trial buttons at least 44px — thumb targets");
    t.ok(/EARNED_LOOKS/.test(paintBody) && !/EARNED_LOOKS[\s\S]{0,400}lc-shelf__tile/.test(body(/const EARNED_LOOKS=\[[\s\S]*?\];/)) && !/SHOP_LOOKS[\s\S]*?filterPick/.test(body(/const SHOP_LOOKS=\[[\s\S]*?\];/)),
      "Earned and Shop are data the painter greys — never wearable tiles, never a pick");
    t.ok(/function pressureFracture\(uid, k, W, H\)/.test(html) && !/Math\.random/.test(body(/function pressureImpact[\s\S]*?function pressurePaintTiles/)),
      "the fracture art is seeded (no Math.random anywhere in the crack painters)");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@tray.test" });
      [["u_a", "Dex"], ["u_b", "Marco"], ["u_c", "Sam"], ["u_bench", "Benchy"]].forEach(([id, name]) => D.addUser({ id, name }));
      ["u_w1", "u_w2", "u_w3", "u_w4", "u_w5", "u_w6", "u_mut"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_tray", host_id: hostU, name: "Tray Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_000_000);
      ["u_a", "u_b", "u_c"].forEach((u, i) => D.addMember(room, u, "chair", { seat_index: i }));
      D.addMember(room, "u_bench", "line");
      ["u_w1", "u_w2", "u_w3", "u_w4", "u_w5", "u_w6"].forEach((u) => D.addMember(room, u, "spectator"));
      const boot = async (name, uid, opts = {}, rm = room, seat0 = "u_a") => {
        const c = await h.newClient(name, opts); c.login(uid);
        await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(rm) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate((s0) => document.getElementById("rt_seat0").dataset.heartuid === s0, seat0), 8000, name + ": chairs render");
        return c;
      };
      const openTray = (c) => c.page.evaluate(() => { window.__lc.updateJoinBtn(); if (!document.getElementById("rt_shelf").classList.contains("is-open")) document.getElementById("rt_filterbtn").click(); return document.getElementById("rt_shelf").classList.contains("is-open"); });
      const tap = (c, look) => c.page.evaluate((look) => { const b = document.querySelector('#rt_shelfrack .lc-shelf__tile[data-look="' + look + '"]'); if (!b) return false; b.click(); return true; }, look);
      const callsBy = (clientName) => D.rpcLog.filter((r) => r.name === "set_filter" && r.clientId === clientName).length;
      const row = (uid) => D.memberRow(room, uid);

      /* ---------- 1. LAYOUT at four widths ---------- */
      /* a room of its own: closing a window leaves the room, and the cast
         below must still be seated */
      /* two layout rooms, every measured phone in a BOTTOM chair (seat 1 or 2
         — the row the sheet rises over); seat 0 holds a stand-in */
      const lhost = D.addUser({ id: "u_lhost", name: "Layout Host", email: "lhost@tray.test" });
      const lhost2 = D.addUser({ id: "u_lhost2", name: "Layout Host 2", email: "lhost2@tray.test" });
      const rl = D.addRoom({ id: "r_layout", host_id: lhost, name: "Layout Night", phase: "spotlight", round: 1 });
      const rl2 = D.addRoom({ id: "r_layout2", host_id: lhost2, name: "Layout Night 2", phase: "spotlight", round: 1 });
      D.rooms.get(rl).phase_deadline = D.iso(D.now() + 3_000_000);
      D.rooms.get(rl2).phase_deadline = D.iso(D.now() + 3_000_000);
      ["u_l360", "u_l375", "u_l390", "u_l414", "u_top1", "u_top2"].forEach((id) => D.addUser({ id, name: id }));
      D.addMember(rl, "u_top1", "chair", { seat_index: 0 }); D.addMember(rl, "u_l360", "chair", { seat_index: 1 }); D.addMember(rl, "u_l375", "chair", { seat_index: 2 });
      D.addMember(rl2, "u_top2", "chair", { seat_index: 0 }); D.addMember(rl2, "u_l390", "chair", { seat_index: 1 }); D.addMember(rl2, "u_l414", "chair", { seat_index: 2 });
      const layoutClients = [];
      const VISIBLE = () => {
        const mine = window.__lc.lookMyTile(), sh = document.getElementById("rt_shelf"), bar = document.getElementById("inputbar");
        if (!mine) return { tile: null, frac: 0 };
        const r = mine.getBoundingClientRect();
        const covered = (el) => { const b = el.getBoundingClientRect(); const x = Math.max(0, Math.min(r.right, b.right) - Math.max(r.left, b.left)), y = Math.max(0, Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top)); return x * y; };
        const inView = Math.max(0, Math.min(r.right, innerWidth) - Math.max(r.left, 0)) * Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
        const area = r.width * r.height;
        return { tile: mine.id, frac: area ? (inView - covered(sh) - covered(bar)) / area : 0, sheetTop: sh.getBoundingClientRect().top, tileBottom: r.bottom, trying: sh.classList.contains("is-trying") };
      };
      for (const W of [360, 375, 390, 414]) {
        const inRl2 = W >= 390;
        const c = await boot("w" + W, "u_l" + W, { viewport: { width: W, height: 780 } }, inRl2 ? rl2 : rl, inRl2 ? "u_top2" : "u_top1");
        layoutClients.push(c);
        t.ok(await openTray(c), `${W}: the tray opens for a chair`);
        await c.page.evaluate(() => window.__lc.lookTrayTab("classics"));
        const s = await c.page.evaluate(TRAY);
        const shown = s.tiles.filter((x) => !x.hidden);
        const rows = [...new Set(shown.map((x) => x.top))].length, perRow = shown.length / Math.max(1, rows);
        t.ok(s.open && s.top >= 0 && s.bottom <= s.vh + 1 && s.left >= 0 && s.right <= s.vw + 1, `${W}: a bottom sheet inside the viewport (top ${Math.round(s.top)}, bottom ${Math.round(s.bottom)} of ${s.vh})`);
        t.ok(s.scrollW <= s.clientW + 1 && s.rackOverflowX !== "auto" && s.rackOverflowX !== "scroll", `${W}: the rack does not scroll sideways (scrollWidth ${s.scrollW} ≤ ${s.clientW})`);
        t.ok(shown.length === 2 && shown.every((x) => x.w >= 84 && x.h >= 88), `${W}: every tile is at least 84×88 (${shown.map((x) => Math.round(x.w) + "×" + Math.round(x.h)).join(", ")})`);
        // with two classics there is one row; the grid's column count is what matters — measure it from the rack width
        const cols = Math.floor((s.clientW + 8) / (84 + 8));
        t.ok(cols >= 3 && cols <= 4 && rows === 1 && perRow <= 4, `${W}: the grid holds ${cols} to a row (3–4), ${rows} row for the two classics`);
        t.ok(s.tabs.length === 4 && s.tabs.every((x) => x.h >= 44) && s.tabs.map((x) => x.tab).join(",") === "tonight,classics,earned,shop", `${W}: four tabs, each at least 44px tall`);
        // the trial from a bottom chair: the sheet collapses to the bar and the wearer's own tile stays in view
        await waitFor(() => c.page.evaluate(() => { const m = window.__lc.lookMyTile(); return !!(m && m.querySelector(".chair__feed video")); }), 10000, W + ": the wearer's own video on his tile");
        const v0 = await c.page.evaluate(VISIBLE);
        t.ok(await tap(c, "noir"), `${W}: taps Noir from a bottom chair (${v0.tile})`);
        await waitFor(() => c.page.evaluate(() => window.__lc.TRYON_STATE.frames > 0), 5000, W + ": the trial");
        const v = await c.page.evaluate(VISIBLE);
        t.ok(v.trying && v.frac >= 0.6, `${W}: during the trial ${Math.round(v.frac * 100)}% of the wearer's own tile is in view (sheet top ${Math.round(v.sheetTop)} vs tile bottom ${Math.round(v.tileBottom)}; with the full tray open it was ${Math.round(v0.frac * 100)}%)`);
        const bits = await c.page.evaluate(() => ({ rack: getComputedStyle(document.getElementById("rt_shelfrack")).display, tabs: getComputedStyle(document.getElementById("rt_shelftabs")).display, bar: getComputedStyle(document.getElementById("rt_shelftry")).display }));
        t.ok(bits.rack === "none" && bits.tabs === "none" && bits.bar !== "none", `${W}: the sheet is only the bar while trying`);
        await c.page.evaluate(() => document.getElementById("rt_shelfcancel").click());
        const v2 = await c.page.evaluate(() => ({ trying: document.getElementById("rt_shelf").classList.contains("is-trying"), rack: getComputedStyle(document.getElementById("rt_shelfrack")).display }));
        t.ok(!v2.trying && v2.rack !== "none", `${W}: Cancel brings the looks back`);
      }
      for (const c of layoutClients) await c.close();   // (a close leaves the room — after all four have measured)

      /* ---------- the cast ---------- */
      const host = await boot("host", hostU);
      const A = await boot("a", "u_a");
      const B = await boot("b", "u_b");
      const C = await boot("c", "u_c", { reducedMotion: "no-preference" });
      const Bn = await boot("bench", "u_bench");
      const W1 = await boot("w1", "u_w1");
      const W2 = await boot("w2", "u_w2");
      const all = [host, A, B, C, Bn, W1, W2];
      const each = async (fn, cs = all) => { const out = {}; for (const c of cs) out[c.name] = await c.page.evaluate(fn); return out; };

      /* ---------- 2. TAP TO TRY ---------- */
      t.ok(await openTray(A), "u_a (chair) opens the tray");
      await A.page.evaluate(() => window.__lc.lookTrayTab("classics"));
      const before = callsBy("a");
      t.ok(await tap(A, "noir"), "u_a taps Noir");
      await waitFor(() => A.page.evaluate(() => window.__lc.TRYON_STATE.frames > 3), 5000, "the trial to draw frames");
      const tr = await A.page.evaluate(TRIAL), trayA = await A.page.evaluate(TRAY);
      t.ok(tr.state.look === "noir" && tr.state.preview === true && tr.canvas && tr.myTile === "rt_seat0", `the trial is on u_a's OWN tile (${tr.myTile}), a canvas drawing frames (${tr.state.frames})`);
      t.ok(Number(tr.canvasZ) < Number(tr.cracksZ || 3), `the trial canvas sits under the cracks (z ${tr.canvasZ} < ${tr.cracksZ || 3}) — a look never touches them`);
      t.ok(row("u_a").filter == null && row("u_a").filter_pick == null && callsBy("a") === before, "the server row is bare and set_filter was not called — a trial spends nothing");
      t.ok(tr.F.active === false && tr.swaps === 0, "nothing is published: the pipeline is idle and the call never swapped its videoSource");
      const others = await each(() => [0, 1, 2].map((i) => document.getElementById("rt_seat" + i).classList.contains("has-filter")), [host, B, C, W1]);
      t.ok(Object.values(others).every((b) => b.every((x) => x === false)), "no other phone paints a badge on seat 0 during the trial");
      t.ok(trayA.tryBar.display !== "none" && /Trying Noir/.test(trayA.tryText) && trayA.wear.display !== "none" && trayA.cancel.display !== "none" && trayA.tiles.find((x) => x.look === "noir").trying,
        `the bar says what is being tried ("${trayA.tryText}") with WEAR IT and Cancel; the tile is ringed`);
      await sleep(6300);
      const tr2 = await A.page.evaluate(TRIAL), trayA2 = await A.page.evaluate(TRAY);
      t.ok(tr2.canvas === false && tr2.state.look === "noir" && tr2.state.preview === false && /Preview over/.test(trayA2.tryText) && trayA2.wear.display !== "none",
        `six seconds on: the canvas is gone, the trial is over, the bar still offers WEAR IT ("${trayA2.tryText}")`);
      t.ok(row("u_a").filter == null && callsBy("a") === before && tr2.F.active === false, "…and still nothing was picked or published");

      /* ---------- 3. CANCEL ---------- */
      t.ok(await tap(A, "grade"), "u_a taps Warm Grade (a second trial)");
      await waitFor(() => A.page.evaluate(() => window.__lc.TRYON_STATE.frames > 0 && window.__lc.TRYON_STATE.look === "grade"), 5000, "the second trial");
      await A.page.evaluate(() => document.getElementById("rt_shelfcancel").click());
      const tr3 = await A.page.evaluate(TRIAL), trayA3 = await A.page.evaluate(TRAY);
      t.ok(tr3.state.look === null && tr3.canvas === false && trayA3.tryBar.display === "none" && row("u_a").filter == null && callsBy("a") === before,
        "Cancel reverts: no trial, no canvas, no bar, the row still bare");

      /* ---------- 4. WEAR IT ---------- */
      t.ok(await tap(A, "noir"), "u_a taps Noir again");
      await waitFor(() => A.page.evaluate(() => window.__lc.TRYON_STATE.look === "noir"), 3000, "the trial to arm");
      await A.page.evaluate(() => document.getElementById("rt_shelfwear").click());
      await waitFor(() => row("u_a").filter === "noir", 5000, "the pick to land");
      t.ok(row("u_a").filter === "noir" && row("u_a").filter_pick === "noir" && callsBy("a") === before + 1, "WEAR IT: set_filter called ONCE, the server confirms filter and filter_pick");
      await waitFor(() => A.page.evaluate(() => window.__lc.FILTER_STATE.active === true), 8000, "u_a's pipeline up");
      for (const c of [host, B, W1]) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("has-filter")), 8000, c.name + ": badge on seat 0");
      t.ok(true, "…the pipeline is up and every phone paints the badge — the look is published now, and only now");
      const trayA4 = await A.page.evaluate(TRAY), tr4 = await A.page.evaluate(TRIAL);
      t.ok(trayA4.locked && /LOCKED/.test(trayA4.meta) && trayA4.worn.display !== "none" && /spent/.test(trayA4.wornText) && /Noir/.test(trayA4.wornText) && trayA4.tryBar.display === "none" && tr4.canvas === false && tr4.state.look === null,
        `the tray says the pick is spent and names the look ("${trayA4.wornText}"); no trial survives the lock`);
      t.ok(trayA4.drop.display !== "none" && /TAKE IT OFF/.test(trayA4.drop.text), `the take-off control is offered ("${trayA4.drop.text}")`);

      /* ---------- 5. TAKE IT OFF ---------- */
      await A.page.evaluate(() => document.getElementById("rt_filterdrop").click());
      await waitFor(() => row("u_a").filter == null, 5000, "the drop to land");
      await waitFor(() => A.page.evaluate(() => window.__lc.FILTER_STATE.active === false), 8000, "u_a's pipeline down");
      const trayA5 = await A.page.evaluate(TRAY);
      t.ok(row("u_a").filter_pick === "noir" && trayA5.locked && /TAKEN OFF/.test(trayA5.meta) && /took it off/.test(trayA5.wornText) && trayA5.drop.display === "none",
        `take-off works and the pick stays spent — the tray says so ("${trayA5.wornText}")`);
      t.ok(trayA5.tiles.every((x) => x.hidden) && trayA5.ghosts.every((g) => !g.shown), "every tile is hidden once the pick is spent");
      const again = await A.page.evaluate(() => window.__lc.lookTry("grade"));
      t.ok(again.ok === false && again.error === "locked" && callsBy("a") === before + 1, `a trial after the lock is refused on the client ("${again.error}") and nothing was called`);

      /* ---------- 6. the bench ---------- */
      t.ok(await openTray(Bn), "u_bench (on the bench) opens the tray");
      await Bn.page.evaluate(() => window.__lc.lookTrayTab("classics"));
      t.ok(await tap(Bn, "grade"), "u_bench taps Warm Grade");
      await sleep(300);
      const trB = await Bn.page.evaluate(TRIAL), trayB = await Bn.page.evaluate(TRAY);
      t.ok(trB.state.look === "grade" && trB.state.preview === false && trB.canvas === false && trB.myTile === null && /bench/.test(trayB.tryText),
        `no self-view on the bench: the bar arms without a picture and says so ("${trayB.tryText}")`);
      const bBefore = callsBy("bench");
      await Bn.page.evaluate(() => document.getElementById("rt_shelfwear").click());
      await waitFor(() => row("u_bench").filter_pick === "grade", 5000, "the bench pick to land");
      t.ok(row("u_bench").filter === "grade" && callsBy("bench") === bBefore + 1, "WEAR IT from the bench is accepted (gate 71's rule) — one set_filter");

      /* ---------- 8. the tabs ---------- */
      t.ok(await openTray(C), "u_c opens the tray");
      const tabs = {};
      for (const tb of ["tonight", "classics", "earned", "shop"]) { await C.page.evaluate((x) => window.__lc.lookTrayTab(x), tb); tabs[tb] = await C.page.evaluate(TRAY); }
      t.ok(tabs.tonight.empty.display !== "none" && /No themed pack tonight/.test(tabs.tonight.empty.text) && tabs.tonight.tiles.every((x) => x.hidden),
        `Tonight without a pack: no tiles, the empty line ("${tabs.tonight.empty.text}")`);
      t.ok(tabs.classics.tiles.filter((x) => !x.hidden).map((x) => x.look).join(",") === "grade,noir" && tabs.classics.tiles.every((x) => x.badge === "Classic"),
        "Classics: the two free looks, badged Classic");
      const earned = tabs.earned.ghosts;
      t.ok(earned.length === 3 && earned.every((g) => g.shown && g.lock && /^earn it by /.test(g.how) && !g.wearable) && tabs.earned.tiles.every((x) => x.hidden),
        `Earned: ${earned.length} greyed gameplay looks with a lock and "earn it by…" (${earned.map((g) => g.id).join(", ")}); no wearable tile`);
      t.ok(tabs.shop.ghosts.length >= 1 && tabs.shop.ghosts.every((g) => g.shown && /coming soon/.test(g.how) && !g.wearable) && tabs.shop.tiles.every((x) => x.hidden),
        "Shop: greyed, coming soon, nothing to buy");
      const ghostTap = await C.page.evaluate(() => { const g = document.querySelector("#rt_shelfghosts .lc-tray__ghost"); g.click(); return window.__lc.TRYON_STATE.look; });
      t.ok(ghostTap === null && row("u_c").filter == null, "a tap on a greyed tile does nothing");
      t.ok(Object.values(tabs).every((s) => s.foot === "Teal = free, no tracking."), "the foot line is unchanged");

      /* ---------- 9. CRACKS: the same on two phones ---------- */
      const throwFrom = (c, target, kind) => c.page.evaluate(({ target, kind }) => window.__lc.throwAt(target, kind), { target, kind });
      t.ok((await throwFrom(W1, "u_c", "tomato")).ok === true && row("u_c").cracks === 1, "w1's tomato lands on Sam: one crack on the server");
      for (const c of [A, B, host]) await waitFor(() => c.page.evaluate(() => Number(document.getElementById("rt_seat2").dataset.cracks) === 1), 8000, c.name + ": crack 1 painted");
      const s1 = { a: await A.page.evaluate(SEAT, 2), b: await B.page.evaluate(SEAT, 2), host: await host.page.evaluate(SEAT, 2) };
      t.ok(s1.a.lite.length === 1 && s1.a.dark.length === 1 && s1.a.hi.length === 1 && s1.a.lite[0] === s1.a.dark[0] && s1.a.hi[0] !== s1.a.lite[0] && /M[\d.]+,[\d.]+L/.test(s1.a.lite[0]) && (s1.a.lite[0].match(/Z/g) || []).length === 2,
        "one crack is three strokes — dark and bright on one fracture path (rays + two rings), and a highlight offset from it");
      t.ok(s1.a.w === s1.b.w && s1.a.h === s1.b.h && s1.a.lite.join("|") === s1.b.lite.join("|") && s1.a.hi.join("|") === s1.b.hi.join("|") && s1.a.lite.join("|") === s1.host.lite.join("|"),
        `three phones at the same width draw byte-identical paths for Sam's frame (${s1.a.w}×${s1.a.h}, ${s1.a.lite[0].length} chars)`);
      const shotOf = async (c) => { const r = (await c.page.evaluate(SEAT, 2)).rect; if (!(r.w > 0 && r.h > 0)) throw new Error(c.name + ": seat 2 has no box (" + JSON.stringify(r) + ")"); return PNG.sync.read(await c.page.screenshot({ clip: { x: r.x, y: r.y, width: r.w, height: r.h }, animations: "disabled", caret: "hide" })); };
      // freeze the two frames on the same instant: the fake camera paints; mask it by comparing the crack layer alone (hide the video)
      for (const c of [A, B]) await c.page.evaluate(() => { document.querySelectorAll("#rt_seat2 video, #rt_seat2 .chair__sil, #rt_seat2 .vid").forEach((v) => { v.style.visibility = "hidden"; }); });
      const pa = await shotOf(A), pb = await shotOf(B);
      let diffN = -1;
      if (pa.width === pb.width && pa.height === pb.height) { const d = new PNG({ width: pa.width, height: pa.height }); diffN = pixelmatch(pa.data, pb.data, d.data, pa.width, pa.height, { threshold: 0.1 }); }
      t.ok(diffN === 0, `the two tiles' crack pixels match (${pa.width}×${pa.height}, ${diffN} differing pixels)`);
      for (const c of [A, B]) await c.page.evaluate(() => { document.querySelectorAll("#rt_seat2 video, #rt_seat2 .chair__sil, #rt_seat2 .vid").forEach((v) => { v.style.visibility = ""; }); });
      t.ok((await throwFrom(W2, "u_c", "pie")).ok === true && row("u_c").cracks === 2, "w2's pie: two cracks");
      await waitFor(() => A.page.evaluate(() => Number(document.getElementById("rt_seat2").dataset.cracks) === 2), 8000, "crack 2 painted");
      const s2 = await A.page.evaluate(SEAT, 2);
      t.ok(s2.lite.length === 2 && s2.lite[0] === s1.a.lite[0] && s2.lite[1] !== s2.lite[0], "crack 1 is the same path when crack 2 lands; crack 2 is its own fracture");

      /* ---------- 10. SHATTER ---------- */
      const W3 = await boot("w3", "u_w3");
      t.ok((await throwFrom(W3, "u_c", "tomato")).ok === true && row("u_c").cracks === 3, "w3's tomato: three — the frame shatters");
      for (const c of [A, C]) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat2").classList.contains("is-shattered")), 8000, c.name + ": shattered");
      await sleep(1300);
      const shA = await A.page.evaluate(SEAT, 2), shC = await C.page.evaluate(SEAT, 2);
      t.ok(shA.shattered && shA.shards.length >= 8 && shA.lite.length >= 5 && shA.shards.every((x) => /^M[-\d.,L]+Z$/.test(x.d)),
        `the shattered frame: ${shA.shards.length} shards and ${shA.lite.length} fracture paths (the three and the rim giving way)`);
      t.ok(shA.shards.every((x) => x.anim === "none") , "reduced motion (u_a): no shard fall plays — static crack art");
      t.ok(shC.shards.map((x) => x.d).join("|") === shA.shards.map((x) => x.d).join("|"), "the shards are the same polygons on the phone with motion on");
      t.ok(shC.shards.every((x) => Number(x.op) === 0), "with motion on, a second after the shatter the shards have fallen and faded — the cracked frame stays");

      /* ---------- 7 (run last among the room claims: the ASK collapses the other chairs to a strip). the ASK ends a trial ---------- */
      t.ok(await openTray(B), "u_b opens the tray");
      await B.page.evaluate(() => window.__lc.lookTrayTab("classics"));
      t.ok(await tap(B, "noir"), "u_b taps Noir");
      await waitFor(() => B.page.evaluate(() => window.__lc.TRYON_STATE.frames > 0), 5000, "u_b's trial");
      D.rpc("host", "ask_question", { room_id: room, target: "u_b", question: "Why?" });
      await waitFor(() => B.page.evaluate(() => window.__lc.TRYON_STATE.look === null && !document.getElementById("rt_shelf").classList.contains("is-open")), 8000, "the ASK to end u_b's trial");
      t.ok(row("u_b").filter == null && row("u_b").filter_pick == null && callsBy("b") === 0, "the ASK ended the trial and closed the tray; nothing was picked");

      /* ---------- 11. THE MUTANT ---------- */
      const marker = "lookTry(t.dataset.look);   // TAP TO TRY — never a pick";
      t.ok(html.includes(marker), "the mutation site exists in the page");
      const mutant = html.replace(marker, "filterPick(t.dataset.look);   // MUTANT: a tap publishes");
      const mhost = D.addUser({ id: "u_mhost", name: "Mutant Host", email: "mhost@tray.test" });
      const rm = D.addRoom({ id: "r_mut", host_id: mhost, name: "Mutant Night", phase: "spotlight", round: 1 });
      D.rooms.get(rm).phase_deadline = D.iso(D.now() + 3_000_000);
      D.addMember(rm, "u_mut", "chair", { seat_index: 0 });
      const M = await h.newClient("mut", { html: mutant }); M.login("u_mut");
      await M.goto();
      await M.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
      if (!(await M.page.evaluate(() => !!window.__lc.CURRENT_ROOM))) await M.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(rm) });
      await M.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => M.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_mut"), 8000, "the mutant seated");
      const row2 = (uid) => D.memberRow(rm, uid);
      t.ok(await openTray(M), "the mutant opens the tray");
      await M.page.evaluate(() => window.__lc.lookTrayTab("classics"));
      t.ok(await tap(M, "noir"), "the mutant taps Noir");
      await sleep(800);
      const mutantBare = row2("u_mut").filter == null && callsBy("mut") === 0;
      t.ok(mutantBare === false, `claim 2's check ("the server row is bare and set_filter was not called") FAILS on the mutant — the gate has teeth (row.filter=${row2("u_mut").filter}, set_filter calls=${callsBy("mut")})`);
      await M.close();

      /* ---------- 12. errors ---------- */
      for (const c of all) t.ok(c.errors.length === 0, `${c.name}: zero console errors` + (c.errors.length ? " — " + c.errors.slice(0, 3).join(" | ") : ""));
      await h.close();
    } catch (e) { await h.close(); throw e; }
  },
};
