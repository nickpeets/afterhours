/* GATE 94 — looks-packs: themed packs and the Halloween pack (feat/looks-v2
 * PR B, ruling 10/18).  A pack is a named list of look slugs with a date
 * window (Pacific), a row of public.look_packs; the server names tonight's
 * through lc_config (`tonight_pack`), so Nick switches packs with no deploy;
 * the tray's Tonight tab shows that pack.  The Halloween pack (Oct 24 –
 * Nov 1) carries six 2D looks the client draws today and seven ck- disguise
 * slugs reserved in the allow-list ahead of their lenses.
 *
 * THE DDL (tools/DDL-looks-packs.sql) RAN IN PRODUCTION 2026-10-19; its
 * STATUS line and the run log in tools/DESIGN-looks-v2.md say so, with the
 * read-back md5s.  The double MODELS it: look_packs rows, lc_config's
 * tonight_pack, the widened allow-list.  So every claim below is "the client
 * against the server as that DDL leaves it", and claim S pins the double's
 * data to the SQL text so the two cannot drift apart silently.
 *
 * WHAT DOES NOT CHANGE, and what this gate leans on: every show rule is the
 * server's (gate 71), WEAR IT is the one door (gate 92), the stand-in lens
 * set on a ?camkit page (gate 79).  The claims, through window.__lc and
 * the real DOM against index.html:
 *   S.  STATIC: the six pack looks are FILTERS functions that use no
 *       per-pixel op (no getImageData / putImageData / filter=); the DDL
 *       file names the table, the function, the thirteen slugs and the
 *       Pacific window; the double's HALLOWEEN_PACK is the DDL's row and its
 *       allow-list carries every pack slug; lcPackLive is exact at the
 *       window's edges (pure, on fixed instants)
 *   1.  NO PACK: lc_config says null — the Tonight tab is empty and says
 *       so, the tray opens on Classics (PR A's rule holds)
 *   2.  INSIDE THE WINDOW: a pack whose window holds now — the client took
 *       it from lc_config at boot; the tray opens on Tonight; the tiles are
 *       exactly the six 2D looks, in the pack's order, badged Tonight and
 *       FREE; the seven ck- slugs with no lens behind them are NOT tiles;
 *       the pack line names the pack
 *   3.  OUTSIDE THE WINDOW: a pack that ended, a pack not yet begun, a
 *       disabled pack — each leaves Tonight empty; a pack whose window
 *       closes while the page is open is gone from Tonight on the phone's
 *       own clock
 *   4.  THE 2D LOOKS RENDER at 360, 375, 390 and 414: from a bottom chair,
 *       TAP TO TRY on each of the six draws frames onto the trial canvas
 *       that differ from the bare frame and are not one flat colour; the
 *       rack holds the six in 3-wide or 4-wide rows with no sideways scroll
 *   5.  WEAR IT on a pack look: set_filter accepts the slug (the allow-list
 *       as the DDL leaves it), the row holds it, the pipeline comes up
 *       drawing that look, every other phone badges it by the pack look's
 *       name
 *   6.  THE SHOW RULES STILL HOLD for a pack look: a second pick is
 *       refused (locked), an asked man's pick is refused, the host forces
 *       it off and the pick stays spent, a slug no pack and no list carries
 *       is refused
 *   7.  THE STAND-IN LENSES: on a ?camkit page with a pack on, Tonight is
 *       the pack's six and then the page's two staging lenses
 *   8.  A PACK SWITCH is seen at the next openRoom: the server's row
 *       changes, the client re-reads lc_config when it enters a room
 *   9.  A PACK THIS PHONE CANNOT DRAW (only ck- slugs, no lens configured):
 *       Tonight has no tiles and says the looks aren't available here
 *  10.  zero console errors
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Harness } = require("../lib/harness");
const { HALLOWEEN_PACK, FILTER_LOOKS } = require("../lib/backend-double");

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
const PACK_2D = ["candlelight", "nightvision", "vhs", "fog", "cobweb", "lantern"];
const PACK_CK = ["ck-vampire", "ck-skeleton", "ck-zombie", "ck-witch", "ck-devil", "ck-pumpkin", "ck-ghost"];

const TRAY = () => {
  const sh = document.getElementById("rt_shelf"), rack = document.getElementById("rt_shelfrack");
  const tiles = [...rack.querySelectorAll(".lc-shelf__tile")].map((b) => {
    const bb = b.getBoundingClientRect();
    return { look: b.dataset.look, tab: b.dataset.tab, hidden: b.hidden, amber: b.classList.contains("is-amber"), w: bb.width, h: bb.height, top: Math.round(bb.top),
      badge: (b.querySelector(".lc-shelf__kind") || {}).textContent || "", name: (b.querySelector(".lc-shelf__name") || {}).textContent || "", cost: (b.querySelector(".lc-shelf__cost") || {}).textContent || "" };
  });
  const ctl = (id) => { const e = document.getElementById(id); if (!e) return null; return { display: getComputedStyle(e).display, text: e.textContent.trim() }; };
  return { open: sh.classList.contains("is-open"), locked: sh.classList.contains("is-locked"), tab: window.__lc.lookTrayTabNow(), tiles,
    shown: tiles.filter((x) => !x.hidden).map((x) => x.look), scrollW: rack.scrollWidth, clientW: rack.clientWidth,
    pack: ctl("rt_shelfpack"), empty: ctl("rt_shelfempty"), foot: (document.getElementById("rt_shelffoot") || {}).textContent || "",
    tonight: window.__lc.TONIGHT_PACK, live: window.__lc.lcTonightPack() };
};

module.exports = {
  name: "looks-packs",
  async run(t, ctx) {
    const html = ctx.html;
    const body = (re) => (html.match(re) || [""])[0];

    /* ---------- S. STATIC ---------- */
    const filtersBody = body(/const FILTERS=\{[\s\S]*?\n\};/);
    const fnOf = (name) => body(new RegExp("\\n  " + name + "\\(g, w, h\\)\\{[\\s\\S]*?\\n  \\}"));
    t.ok(PACK_2D.every((n) => fnOf(n).length > 100 && filtersBody.includes("\n  " + n + "(g, w, h){")),
      `the six pack looks are FILTERS draw functions (${PACK_2D.map((n) => n + ":" + fnOf(n).length).join(", ")} chars)`);
    t.ok(PACK_2D.every((n) => !/getImageData|putImageData|createImageData|\.filter\s*=/.test(fnOf(n))),
      "none of the six touches a pixel buffer or a CSS filter — 2D composites, gradients, strokes and copies of the frame only");
    t.ok(/const PACK_LOOKS=\{[\s\S]*?\};/.test(html) && PACK_2D.every((n) => new RegExp("\\n  " + n + ":\\s*\\{ icon:").test(body(/const PACK_LOOKS=\{[\s\S]*?\};/))),
      "PACK_LOOKS catalogues the six with an icon and a name");
    t.ok(/tonight_pack/.test(body(/async function lcConfigLoad\(\)\{[\s\S]*?\n\}/) + body(/function lcPackFrom\(data\)\{[\s\S]*?\n\}/)) && /lcConfigLoad\(\)/.test(body(/async function openRoom\(r\)\{[\s\S]*?I_WAS_PASSED=false;[\s\S]*?\n  lcConfigLoad\(\)/)),
      "lc_config's tonight_pack is read at boot and again at every openRoom");
    const ddlPath = path.join(__dirname, "..", "DDL-looks-packs.sql");
    const ddl = fs.existsSync(ddlPath) ? fs.readFileSync(ddlPath, "utf8") : "";
    t.ok(ddl.length > 2000 && /STATUS: RUN IN PRODUCTION 2026-10-19/.test(ddl) && /a8ca64f4a6e17501e1761c4961aa0c1d \/ 1373/.test(ddl) && /18c19ce96c662a68bc82e327a14f5df4/.test(ddl) && /00ed780667ebed70cab458368bc616c1/.test(ddl),
      "tools/DDL-looks-packs.sql exists and its STATUS line says it ran in production 2026-10-19, with the three read-back md5s — the server the double models is the server as it is");
    t.ok(/create table public\.look_packs/.test(ddl) && /create or replace function public\.lc_tonight_pack\(\)/.test(ddl) && /'tonight_pack', public\.lc_tonight_pack\(\)/.test(ddl),
      "the DDL creates look_packs and lc_tonight_pack, and lc_config gains tonight_pack");
    t.ok(/enable row level security/.test(ddl) && /revoke all on table public\.look_packs from public, anon, authenticated/.test(ddl) && /revoke all on function public\.lc_tonight_pack\(\) from public, anon, authenticated/.test(ddl),
      "the table is sealed: RLS on, no grants, lc_tonight_pack revoked — lc_config is the one door");
    t.ok(/a9d3bf79f637cf84c3017b616dfd9ec5/.test(ddl) && /fc61398880b405cbe1dd7d317b913bfd/.test(ddl) && /to_regclass\('public\.look_packs'\) is not null/.test(ddl),
      "md5-guarded on set_filter (2026-10-06) and lc_config (2026-10-09), and refuses if look_packs already exists");
    const ddlList = (ddl.match(/if name not in \(([^)]*)\) then raise exception 'no such filter'/g) || []).pop() || "";
    const ddlSlugs = [...ddlList.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
    t.ok(ddlSlugs.length === 17 && [...PACK_2D, ...PACK_CK].every((s) => ddlSlugs.includes(s)) && ["grade", "noir", "ck-objects", "ck-express"].every((s) => ddlSlugs.includes(s)),
      `the spliced allow-list carries the four of 2026-10-06 and the pack's thirteen (${ddlSlugs.length} names)`);
    /* PR A of the 10/20–10/21 brief (tools/DDL-packs-holidays.sql) widens the
       list by the Holidays pack's sixteen and MOVES the Halloween window
       (on now, through Oct 31 PT); the double mirrors the server as that
       file leaves it, so the seventeen here are a subset of the double's
       list and the row's slugs still match — the window pins are gate 96's */
    t.ok(ddlSlugs.every((s) => FILTER_LOOKS.includes(s)) && FILTER_LOOKS.length === 33, `the double's allow-list carries the seventeen of this DDL (and the Holidays sixteen of PR A's — ${FILTER_LOOKS.length} names)`);
    const ddlRow = (ddl.match(/insert into public\.look_packs[\s\S]*?true\);/) || [""])[0];
    const rowSlugs = [...(ddlRow.match(/array\[[\s\S]*?\]/) || [""])[0].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
    t.ok(rowSlugs.join(",") === HALLOWEEN_PACK.looks.join(",") && /'halloween', 'Halloween'/.test(ddlRow) && /2026-10-24 00:00'::timestamp at time zone 'America\/Los_Angeles'/.test(ddlRow) && /2026-11-02 00:00'::timestamp at time zone 'America\/Los_Angeles'/.test(ddlRow),
      "the DDL's Halloween row is the double's HALLOWEEN_PACK's thirteen slugs in order; the 2026-10-19 window was Oct 24 00:00 to Nov 2 00:00 America/Los_Angeles (moved by PR A's DDL — gate 96)");
    t.ok(HALLOWEEN_PACK.starts_at === "2026-10-21T07:00:00+00:00" && HALLOWEEN_PACK.ends_at === "2026-11-01T07:00:00+00:00",
      "the window's instants as PR A moves them: Oct 21 07:00Z (00:00 PDT) through Nov 1 07:00Z (00:00 PDT — Oct 31 the last night)");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const now = () => Date.now();
      const iso = (ms) => new Date(ms).toISOString();
      const boot = async (name, uid, opts = {}, rm, seat0, query = "") => {
        const c = await h.newClient(name, opts); c.login(uid);
        await c.goto(query);
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
      const mkRoom = (id, hostId, seats) => {
        D.addUser({ id: hostId, name: "Host " + id, email: hostId + "@packs.test" });
        const room = D.addRoom({ id, host_id: hostId, name: "Pack Night " + id, phase: "spotlight", round: 1 });
        D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_000_000);
        seats.forEach((u, i) => { D.addUser({ id: u, name: u }); D.addMember(room, u, "chair", { seat_index: i }); });
        return room;
      };

      /* ---------- S (runtime half). lcPackLive at the window's edges ---------- */
      const probe = await (async () => {
        const c = await h.newClient("probe"); c.login(D.addUser({ id: "u_probe", name: "Probe" }));
        await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none'])", { state: "visible", timeout: 15000 });
        const r = await c.page.evaluate((p) => [Date.parse("2026-10-21T06:59:59Z"), Date.parse("2026-10-21T07:00:00Z"), Date.parse("2026-11-01T06:59:59Z"), Date.parse("2026-11-01T07:00:00Z")].map((t) => window.__lc.lcPackLive(p, t)), HALLOWEEN_PACK);
        await c.close();
        return r;
      })();
      t.ok(probe.join(",") === "false,true,true,false", `lcPackLive on the Halloween row (PR A's window): the second before it opens is out, 00:00 PDT Oct 21 is in, 23:59:59 PDT Oct 31 is in, 00:00 PDT Nov 1 is out (${probe.join(",")})`);

      /* ---------- 1. NO PACK ---------- */
      const r1 = mkRoom("r_nopack", "u_h1", ["u_n0", "u_n1", "u_n2"]);
      const N = await boot("nopack", "u_n1", {}, r1, "u_n0");
      t.ok(await openTray(N), "no pack: the tray opens");
      const s1 = await N.page.evaluate(TRAY);
      t.ok(s1.tonight === null && s1.live === null && D.rpcLog.some((r) => r.clientId === "nopack" && r.name === "lc_config"), "lc_config was read and said tonight_pack null — the client holds no pack");
      t.ok(s1.tab === "classics" && s1.shown.join(",") === "grade,noir", `the tray opens on Classics (${s1.tab}: ${s1.shown.join(",")})`);
      await N.page.evaluate(() => window.__lc.lookTrayTab("tonight"));
      const s1t = await N.page.evaluate(TRAY);
      t.ok(s1t.shown.length === 0 && s1t.empty.display !== "none" && /No themed pack tonight/.test(s1t.empty.text) && s1t.pack.display === "none",
        `Tonight is empty and says so ("${s1t.empty.text}"); no pack line`);
      await N.close();

      /* ---------- 2. INSIDE THE WINDOW ---------- */
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() - 3_600_000), ends_at: iso(now() + 3_600_000) });   // the Halloween row, its window moved onto tonight
      const r2 = mkRoom("r_pack", "u_h2", ["u_p0", "u_p1", "u_p2"]);
      D.addUser({ id: "u_pw", name: "Watcher" }); D.addMember(r2, "u_pw", "spectator");
      const host2 = await boot("host2", "u_h2", {}, r2, "u_p0");
      const P0 = await boot("p0", "u_p0", {}, r2, "u_p0");
      const P1 = await boot("p1", "u_p1", {}, r2, "u_p0");
      const P2 = await boot("p2", "u_p2", {}, r2, "u_p0");
      const PW = await boot("pw", "u_pw", {}, r2, "u_p0");
      t.ok(await openTray(P1), "pack on: the tray opens for a chair");
      const s2 = await P1.page.evaluate(TRAY);
      t.ok(s2.tonight && s2.tonight.slug === "halloween" && s2.tonight.looks.join(",") === HALLOWEEN_PACK.looks.join(",") && s2.live && s2.live.slug === "halloween",
        "the client holds the Halloween pack from lc_config, and it is live on the phone's clock");
      t.ok(s2.tab === "tonight", `the tray opens on Tonight (${s2.tab})`);
      t.ok(s2.shown.join(",") === PACK_2D.join(","), `the Tonight tiles are exactly the six 2D looks in the pack's order (${s2.shown.join(",")})`);
      const tonightTiles = s2.tiles.filter((x) => x.tab === "tonight");
      t.ok(tonightTiles.every((x) => x.badge === "Tonight" && x.cost === "FREE" && !x.amber) && tonightTiles.map((x) => x.name).join("|") === "Candlelight|Night Vision|Haunted VHS|Fog|Cobwebs|Jack-o'-Lantern",
        `each badged Tonight, FREE, teal, named (${tonightTiles.map((x) => x.name).join(", ")})`);
      t.ok(PACK_CK.every((s) => !s2.tiles.some((x) => x.look === s)), "the seven ck- disguise slugs are not tiles — no lens exists for them, so nothing can be picked");
      t.ok(s2.pack.display !== "none" && /Halloween pack/.test(s2.pack.text) && s2.empty.display === "none", `the pack line names it ("${s2.pack.text}")`);
      t.ok(s2.foot === "Teal = free, no tracking.", "the foot line is the teal one — no lens on this page");
      const classics = await P1.page.evaluate(() => { window.__lc.lookTrayTab("classics"); return window.__lc.FILTER_LOOKS.filter((l) => l.tab === "classics").map((l) => l.id).join(","); });
      t.ok(classics === "grade,noir", "the Classics are untouched by a pack");
      await P1.page.evaluate(() => window.__lc.lookTrayTab("tonight"));

      /* ---------- 3. OUTSIDE THE WINDOW ---------- */
      const outside = async (label, rows, uid, rm, seat0) => {
        D.lookPacks = [];
        rows.forEach((r) => D.addLookPack(r));
        const c = await boot("out_" + label, uid, {}, rm, seat0);
        t.ok(await openTray(c), `${label}: the tray opens`);
        await c.page.evaluate(() => window.__lc.lookTrayTab("tonight"));
        const s = await c.page.evaluate(TRAY);
        t.ok(s.tonight === null && s.shown.length === 0 && /No themed pack tonight/.test(s.empty.text) && s.pack.display === "none", `${label}: lc_config said null, Tonight is empty (${s.shown.length} tiles)`);
        await c.close();
      };
      const r3 = mkRoom("r_out", "u_h3", ["u_o0", "u_o1", "u_o2", "u_o3"]);
      await outside("ended an hour ago", [{ ...HALLOWEEN_PACK, starts_at: iso(now() - 7_200_000), ends_at: iso(now() - 3_600_000) }], "u_o1", r3, "u_o0");
      await outside("starts tomorrow", [{ ...HALLOWEEN_PACK, starts_at: iso(now() + 86_400_000), ends_at: iso(now() + 2 * 86_400_000) }], "u_o2", r3, "u_o0");
      await outside("disabled", [{ ...HALLOWEEN_PACK, starts_at: iso(now() - 3_600_000), ends_at: iso(now() + 3_600_000), enabled: false }], "u_o3", r3, "u_o0");
      // a window that closes while the page is open: the phone's own clock takes it off Tonight
      D.lookPacks = [];
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() - 3_600_000), ends_at: iso(now() + 2_500) });
      D.addUser({ id: "u_o4", name: "u_o4" }); D.addMember(r3, "u_o4", "chair", { seat_index: 1 });
      const O4 = await boot("out_closing", "u_o4", {}, r3, "u_o0");
      t.ok(await openTray(O4), "closing: the tray opens with the pack still on");
      const sc1 = await O4.page.evaluate(TRAY);
      t.ok(sc1.tonight && sc1.tonight.slug === "halloween" && sc1.shown.length === 6, `closing: six tiles while the window is open (ends in ${Math.round((Date.parse(sc1.tonight.ends_at) - Date.now()) / 100) / 10}s)`);
      await waitFor(() => Date.now() >= Date.parse(sc1.tonight.ends_at) + 200, 6000, "the window to close");
      await O4.page.evaluate(() => window.__lc.lookTrayTab("tonight"));
      const sc2 = await O4.page.evaluate(TRAY);
      t.ok(sc2.tonight && sc2.tonight.slug === "halloween" && sc2.live === null && sc2.shown.length === 0 && /No themed pack tonight/.test(sc2.empty.text),
        "closing: the window shut while the page was open — the client still holds the row, but Tonight is empty on the phone's own clock");
      await O4.close();
      D.lookPacks = [];
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() - 3_600_000), ends_at: iso(now() + 3_600_000) });   // back on for the rest

      /* ---------- 4. THE 2D LOOKS RENDER at four widths ---------- */
      const rl = mkRoom("r_render", "u_hr", ["u_rtop", "u_r360", "u_r375"]);
      const rl2 = mkRoom("r_render2", "u_hr2", ["u_rtop2", "u_r390", "u_r414"]);
      const SNAP = async (look) => {
        const mine = window.__lc.lookMyTile(), cv = mine && mine.querySelector(".chair__tryon"), video = mine && mine.querySelector(".chair__feed video");
        if (!cv || !video) return { ok: false, why: !cv ? "no trial canvas" : "no video" };
        const g = cv.getContext("2d"), w = cv.width, h = cv.height;
        const got = g.getImageData(0, 0, w, h).data;
        const raw = document.createElement("canvas"); raw.width = w; raw.height = h;
        raw.getContext("2d").drawImage(video, 0, 0, w, h);
        const ref = raw.getContext("2d").getImageData(0, 0, w, h).data;
        let diff = 0, flat = true, sum = 0, first = [got[0], got[1], got[2]];
        for (let i = 0; i < got.length; i += 4) {
          if (Math.abs(got[i] - ref[i]) + Math.abs(got[i + 1] - ref[i + 1]) + Math.abs(got[i + 2] - ref[i + 2]) > 24) diff++;
          if (flat && (Math.abs(got[i] - first[0]) + Math.abs(got[i + 1] - first[1]) + Math.abs(got[i + 2] - first[2]) > 24)) flat = false;
          sum += got[i] + got[i + 1] + got[i + 2];
        }
        const n = got.length / 4;
        return { ok: true, look, w, h, frames: window.__lc.TRYON_STATE.frames, diffFrac: diff / n, flat, mean: sum / (n * 3) };
      };
      for (const W of [360, 375, 390, 414]) {
        const inRl2 = W >= 390;
        const c = await boot("w" + W, "u_r" + W, { viewport: { width: W, height: 780 } }, inRl2 ? rl2 : rl, inRl2 ? "u_rtop2" : "u_rtop");
        t.ok(await openTray(c), `${W}: the tray opens`);
        await c.page.evaluate(() => window.__lc.lookTrayTab("tonight"));
        const s = await c.page.evaluate(TRAY);
        const shown = s.tiles.filter((x) => !x.hidden);
        const rows = [...new Set(shown.map((x) => x.top))].length;
        const cols = Math.floor((s.clientW + 8) / (84 + 8));
        t.ok(shown.length === 6 && shown.every((x) => x.w >= 84 && x.h >= 88) && rows === Math.ceil(6 / cols) && s.scrollW <= s.clientW + 1,
          `${W}: six tiles at least 84×88, ${cols} to a row in ${rows} rows, no sideways scroll`);
        await waitFor(() => c.page.evaluate(() => { const m = window.__lc.lookMyTile(); return !!(m && m.querySelector(".chair__feed video") && m.querySelector(".chair__feed video").readyState >= 2); }), 10000, W + ": the wearer's own video");
        for (const look of PACK_2D) {
          t.ok(await tap(c, look), `${W}: taps ${look}`);
          await waitFor(() => c.page.evaluate((l) => window.__lc.TRYON_STATE.look === l && window.__lc.TRYON_STATE.frames > 3, look), 5000, W + ": " + look + " frames");
          const snap = await c.page.evaluate(SNAP, look);
          t.ok(snap.ok && snap.frames > 3 && snap.diffFrac > 0.05 && !snap.flat && snap.mean > 2 && snap.mean < 253,
            `${W}: ${look} renders — ${snap.frames} frames on a ${snap.w}×${snap.h} canvas, ${Math.round((snap.diffFrac || 0) * 100)}% of pixels changed from the bare frame, not flat (mean ${Math.round(snap.mean || 0)})` + (snap.ok ? "" : " — " + snap.why));
          await c.page.evaluate(() => document.getElementById("rt_shelfcancel").click());
        }
        t.ok(callsBy("w" + W) === 0 && D.memberRow(inRl2 ? rl2 : rl, "u_r" + W).filter == null, `${W}: six trials, nothing picked, set_filter never called`);
        await c.close();
      }

      /* ---------- 5. WEAR IT on a pack look ---------- */
      const row = (uid) => D.memberRow(r2, uid);
      const before = callsBy("p1");
      t.ok(await tap(P1, "lantern"), "u_p1 taps the jack-o'-lantern border");
      await waitFor(() => P1.page.evaluate(() => window.__lc.TRYON_STATE.look === "lantern"), 3000, "the trial to arm");
      await P1.page.evaluate(() => document.getElementById("rt_shelfwear").click());
      await waitFor(() => row("u_p1").filter === "lantern", 5000, "the pick to land");
      t.ok(row("u_p1").filter === "lantern" && row("u_p1").filter_pick === "lantern" && callsBy("p1") === before + 1, "WEAR IT: set_filter accepted 'lantern' once — the row holds it and the pick is spent");
      await waitFor(() => P1.page.evaluate(() => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.name === "lantern"), 8000, "u_p1's pipeline up with lantern");
      await waitFor(() => P1.page.evaluate(() => window.__lc.FILTER_STATE.framesDrawn > 3), 8000, "frames through the pipeline");
      t.ok(true, "the pipeline is up drawing the pack look (FILTER_STATE.name lantern, frames flowing)");
      for (const c of [host2, P0, P2, PW]) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat1").classList.contains("has-filter")), 8000, c.name + ": badge on seat 1");
      const badges = {};
      for (const c of [host2, P0, P2, PW]) badges[c.name] = await c.page.evaluate(() => ({ t: document.querySelector("#rt_seat1 .chair__filter-t").textContent, i: document.querySelector("#rt_seat1 .chair__filter-i").textContent, paid: document.getElementById("rt_seat1").classList.contains("has-filter--paid") }));
      t.ok(Object.values(badges).every((b) => b.t === "JACK-O'-LANTERN" && b.i === "🎃" && !b.paid), `every other phone badges seat 1 by the pack look's name and icon (${Object.values(badges).map((b) => b.t).join(" / ")}), teal`);
      const s5 = await P1.page.evaluate(TRAY);
      t.ok(s5.locked && s5.shown.length === 0 && s5.pack.display === "none", "the tray says the pick is spent, every tile hidden, the pack line down");

      /* ---------- 6. THE SHOW RULES STILL HOLD ---------- */
      const pick = (c, name) => c.page.evaluate((n) => window.__lc.filterPick(n), name);
      const again = await pick(P1, "fog");
      t.ok(again.ok === false && /filter locked for this show/.test(again.error) && row("u_p1").filter === "lantern", `a second pick is refused ("${again.error}") — the lock holds for a pack look`);
      D.rpc("host2", "ask_question", { room_id: r2, target: "u_p2", question: "Boo?" });
      await waitFor(() => P2.page.evaluate(() => window.__lc.CURRENT_ROOM && window.__lc.CURRENT_ROOM.spotlight_target === "u_p2"), 8000, "u_p2 asked");
      const asked = await pick(P2, "fog");
      t.ok(asked.ok === false && /not allowed while asked/.test(asked.error) && row("u_p2").filter == null, `an asked man's pack pick is refused ("${asked.error}")`);
      const stranger = await pick(P0, "ck-vampire-x");
      t.ok(stranger.ok === false && /no such filter/.test(stranger.error), `a slug on no list is refused ("${stranger.error}")`);
      const reservedPick = await pick(P0, "ck-ghost");
      t.ok(reservedPick.ok === true && row("u_p0").filter === "ck-ghost", "a reserved ck- slug IS on the server's list (set_filter accepts ck-ghost: the allow-list is ahead of the lens)…");
      await sleep(600);
      const p0 = await P0.page.evaluate(() => ({ active: window.__lc.FILTER_STATE.active, can: window.__lc.FILTER_LOOKS.some((l) => l.id === "ck-ghost"), swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0 }));
      t.ok(p0.active === false && p0.can === false && p0.swaps === 0, "…and a phone with no lens for it publishes the bare camera, untouched (filterCanDraw says no; the tray never offered it)");
      const forced = await host2.page.evaluate(() => window.__lc.hostClearFilter("u_p1"));
      await waitFor(() => row("u_p1").filter == null, 5000, "the host's force-off to land");
      t.ok(forced.ok === true && row("u_p1").filter == null && row("u_p1").filter_pick === "lantern", "the host forces the pack look off; the pick stays spent");
      await waitFor(() => P1.page.evaluate(() => window.__lc.FILTER_STATE.active === false), 8000, "u_p1's pipeline down");
      t.ok(true, "…and the wearer's pipeline comes down");

      /* ---------- 7. THE STAND-IN LENSES on a ?camkit page ---------- */
      const rk = mkRoom("r_camkit", "u_hk", ["u_k0", "u_k1", "u_k2"]);
      const K = await boot("camkit", "u_k1", {}, rk, "u_k0", "?camkit");
      t.ok(await openTray(K), "?camkit with a pack on: the tray opens");
      await K.page.evaluate(() => window.__lc.lookTrayTab("tonight"));
      const sk = await K.page.evaluate(TRAY);
      const lensSlugs = await K.page.evaluate(() => Object.keys(window.__lc.CAMKIT.looks));
      t.ok(sk.shown.join(",") === [...PACK_2D, ...lensSlugs].join(","), `Tonight is the pack's six and then the page's staging lenses (${sk.shown.join(",")})`);
      t.ok(sk.tiles.filter((x) => x.amber).map((x) => x.look).join(",") === lensSlugs.join(",") && /Amber = face-tracked/.test(sk.foot), "the lenses are amber, the foot line says so; the pack's six stay teal");
      await K.close();

      /* ---------- 8. A PACK SWITCH is seen at the next openRoom ---------- */
      const sw1 = await P2.page.evaluate(() => window.__lc.TONIGHT_PACK && window.__lc.TONIGHT_PACK.slug);
      D.lookPacks = [];
      D.addLookPack({ slug: "fognight", name: "Fog Night", icon: "🌫️", looks: ["fog", "cobweb"], starts_at: iso(now() - 60_000), ends_at: iso(now() + 3_600_000) });
      const sw2 = await P2.page.evaluate(() => window.__lc.TONIGHT_PACK && window.__lc.TONIGHT_PACK.slug);
      t.ok(sw1 === "halloween" && sw2 === "halloween", "the server's row changed; a page that has not re-entered a room still holds the old pack (no polling)");
      const rs = mkRoom("r_switch", "u_hs", ["u_s0", "u_s1", "u_s2"]);
      const S1 = await boot("switch", "u_s1", {}, rs, "u_s0");
      t.ok(await openTray(S1), "switch: a fresh room entry");
      const ss = await S1.page.evaluate(TRAY);
      t.ok(ss.tonight && ss.tonight.slug === "fognight" && ss.shown.join(",") === "fog,cobweb" && /Fog Night pack/.test(ss.pack.text), `openRoom re-read lc_config: Tonight is the new pack (${ss.tonight && ss.tonight.slug}: ${ss.shown.join(",")})`);
      // the same page, the server switches again, the page enters another room: the new pack again
      D.lookPacks = [];
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() - 3_600_000), ends_at: iso(now() + 3_600_000) });
      const rs2 = mkRoom("r_switch2", "u_hs2", ["u_t0", "u_s1x", "u_t2"]);
      D.addMember(rs2, "u_s1", "chair", { seat_index: 1 });
      await S1.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(rs2) });
      await waitFor(() => S1.page.evaluate(() => window.__lc.TONIGHT_PACK && window.__lc.TONIGHT_PACK.slug === "halloween"), 8000, "the re-read on the second openRoom");
      t.ok(true, "…and again on the next openRoom (halloween is back)");
      await S1.close();

      /* ---------- 9. A PACK THIS PHONE CANNOT DRAW ---------- */
      D.lookPacks = [];
      D.addLookPack({ slug: "lensonly", name: "Lens Only", icon: "✦", looks: PACK_CK.slice(), starts_at: iso(now() - 60_000), ends_at: iso(now() + 3_600_000) });
      const rn = mkRoom("r_lensonly", "u_hn", ["u_q0", "u_q1", "u_q2"]);
      const Q = await boot("lensonly", "u_q1", {}, rn, "u_q0");
      t.ok(await openTray(Q), "lens-only pack: the tray opens");
      const sq = await Q.page.evaluate(TRAY);
      t.ok(sq.tonight && sq.tonight.slug === "lensonly" && sq.tab === "classics", "a pack with nothing this phone can draw: the tray opens on Classics");
      await Q.page.evaluate(() => window.__lc.lookTrayTab("tonight"));
      const sq2 = await Q.page.evaluate(TRAY);
      t.ok(sq2.shown.length === 0 && /aren't available on this phone/.test(sq2.empty.text) && /Lens Only pack/.test(sq2.pack.text), `Tonight has no tiles and says so ("${sq2.empty.text}")`);
      await Q.close();

      /* ---------- 10. errors ---------- */
      for (const c of [host2, P0, P1, P2, PW]) t.ok(c.errors.length === 0, `${c.name}: zero console errors` + (c.errors.length ? " — " + c.errors.slice(0, 3).join(" | ") : ""));
    } finally {
      await h.close();
    }
  },
};
