/* GATE 96 — packs-holidays: Halloween NOW, the Holidays pack, vaulting
 * (feat/packs-halloween-now-holidays — PR A of the 10/20–10/21 brief).
 *
 * Nick's rulings: the Halloween pack is on NOW for everyone, no tier or chip
 * gate, through Oct 31 PT; on Nov 1 PT it vaults and the Holidays pack takes
 * over, through Jan 1 PT, switching itself on through the rotation PR #112
 * built (lc_tonight_pack: the enabled row whose window holds now()).  A pack
 * whose window has passed is VAULTED: gone from the tray entirely (not
 * greyed, not a ghost, not a tile) and kept in the DB for reuse.
 *
 * THE DDL (tools/DDL-packs-holidays.sql) is handed to Nick; its STATUS line
 * says whether production has run it.  The double MODELS it — the Halloween
 * row's moved window, the Holidays row, the widened allow-list,
 * lc_pack_status — so every claim below is "the client against the server as
 * that file leaves it", and claim S pins the double's data to the SQL text.
 *
 * The claims, through window.__lc and the real DOM against index.html:
 *   S.  STATIC: the eight Holidays looks are FILTERS functions with no
 *       per-pixel op; PACK_LOOKS catalogues them; the DDL file guards on the
 *       three 2026-10-19 read-backs, widens the one allow-list line to the
 *       double's 33, moves the Halloween window, inserts the Holidays row
 *       as HOLIDAYS_PACK, creates lc_pack_status and the Studio view, and
 *       deletes nothing; the handover is ONE instant on the server model
 *       (06:59:59Z Nov 1 → halloween, 07:00:00Z → holidays) and the same
 *       on the phone (lcPackLive / lcPackStatus on fixed instants)
 *   1.  HOLIDAYS LIVE: the tray opens on Tonight, the tab is named
 *       "Holidays", the tiles are exactly the eight 2D looks in the pack's
 *       order, badged Tonight and FREE, each with pack art (the look drawn
 *       over the neon plate — eight different pictures, no clip-art icon
 *       shown); the eight ck- slugs are not tiles; the pack line names it
 *   2.  THE EIGHT RENDER at 360/375/390/414 from a bottom chair: TAP TO TRY
 *       draws frames that differ from the bare frame and are not flat; 3 or
 *       4 to a row, no sideways scroll; nothing picked
 *   3.  WEAR IT on a Holidays look: set_filter accepts the slug, every other
 *       phone badges it by name; a slug on no list is still refused
 *   4.  VAULTED: with Halloween's window passed and Holidays live, no
 *       Halloween look is a tile — not even hidden — and no ghost; the
 *       server still holds the row (status vaulted); a page whose only pack
 *       is vaulted shows "Tonight", no tiles, the no-pack line; a vaulted
 *       row given a new window is live again at the next openRoom (reuse)
 *   5.  THE HANDOVER on a phone left open: the Halloween window closes while
 *       the tray is up — Tonight empties on the phone's own clock and the
 *       tab reads "Tonight"; the next openRoom reads the Holidays pack
 *   6.  HALLOWEEN NOW: on the server model with the clock inside the moved
 *       window, tonight_pack is halloween for a plain signed-in user with no
 *       tier, no chips and no subscription — nothing gates it
 *   7.  zero console errors
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Harness } = require("../lib/harness");
const { HALLOWEEN_PACK, HOLIDAYS_PACK, FILTER_LOOKS, BackendDouble } = require("../lib/backend-double");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 100));
  }
};
const HOL_2D = ["fairylights", "snowfall", "frosted", "fireplace", "candycane", "snowglobe", "tinsel", "countdown"];
const HOL_CK = ["ck-santa", "ck-reindeer", "ck-elf", "ck-sweater", "ck-krampus", "ck-nutcracker", "ck-snowman", "ck-champagne"];
const HOL_NAMES = "Fairy Lights|Snowfall|Frosted Glass|Fireplace Glow|Candy Cane|Snow Globe|Tinsel|Midnight Countdown";

const TRAY = () => {
  const sh = document.getElementById("rt_shelf"), rack = document.getElementById("rt_shelfrack");
  const tiles = [...rack.querySelectorAll(".lc-shelf__tile")].map((b) => {
    const bb = b.getBoundingClientRect(), art = b.querySelector(".lc-shelf__art"), icon = b.querySelector(".lc-shelf__icon");
    return { look: b.dataset.look, tab: b.dataset.tab, hidden: b.hidden, amber: b.classList.contains("is-amber"), w: bb.width, h: bb.height, top: Math.round(bb.top),
      badge: (b.querySelector(".lc-shelf__kind") || {}).textContent || "", name: (b.querySelector(".lc-shelf__name") || {}).textContent || "", cost: (b.querySelector(".lc-shelf__cost") || {}).textContent || "",
      art: art ? { src: art.src.slice(0, 40) + "…" + art.src.length, len: art.src.length, w: art.naturalWidth, h: art.naturalHeight, shown: getComputedStyle(art).display !== "none" } : null,
      iconShown: icon ? getComputedStyle(icon).display !== "none" : false };
  });
  const ctl = (id) => { const e = document.getElementById(id); if (!e) return null; return { display: getComputedStyle(e).display, text: e.textContent.trim() }; };
  const tabEl = document.querySelector('#rt_shelftabs .lc-tray__tab[data-tab="tonight"]');
  return { open: sh.classList.contains("is-open"), locked: sh.classList.contains("is-locked"), tab: window.__lc.lookTrayTabNow(), tabLabel: tabEl ? tabEl.textContent : null, tiles,
    shown: tiles.filter((x) => !x.hidden).map((x) => x.look), tonightTiles: tiles.filter((x) => x.tab === "tonight").map((x) => x.look),
    ghosts: [...document.querySelectorAll("#rt_shelfghosts .lc-tray__ghost")].map((g) => g.dataset.ghost),
    scrollW: rack.scrollWidth, clientW: rack.clientWidth,
    pack: ctl("rt_shelfpack"), empty: ctl("rt_shelfempty"),
    tonight: window.__lc.TONIGHT_PACK, live: window.__lc.lcTonightPack() };
};

module.exports = {
  name: "packs-holidays",
  async run(t, ctx) {
    const html = ctx.html;
    const body = (re) => (html.match(re) || [""])[0];

    /* ---------- S. STATIC ---------- */
    const filtersBody = body(/const FILTERS=\{[\s\S]*?\n\};/);
    const fnOf = (name) => body(new RegExp("\\n  " + name + "\\(g, w, h\\)\\{[\\s\\S]*?\\n  \\}"));
    t.ok(HOL_2D.every((n) => fnOf(n).length > 100 && filtersBody.includes("\n  " + n + "(g, w, h){")),
      `the eight Holidays looks are FILTERS draw functions (${HOL_2D.map((n) => n + ":" + fnOf(n).length).join(", ")} chars)`);
    t.ok(HOL_2D.every((n) => !/getImageData|putImageData|createImageData|\.filter\s*=/.test(fnOf(n))),
      "none of the eight touches a pixel buffer or a CSS filter — 2D composites, gradients, strokes and copies of the frame only");
    t.ok(HOL_2D.every((n) => new RegExp("\\n  " + n + ":\\s*\\{ icon:").test(body(/const PACK_LOOKS=\{[\s\S]*?\};/))), "PACK_LOOKS catalogues the eight with an icon and a name");
    t.ok(/function lcPackStatus\(p, t\)\{[\s\S]*?"vaulted"[\s\S]*?"scheduled"[\s\S]*?"live"/.test(html), "lcPackStatus names a pack live / scheduled / vaulted / off on the clock, the server's four words");
    t.ok(/function packArt\(slug\)\{[\s\S]*?FILTERS\[slug\]\(g,w,h\)/.test(html), "packArt draws a pack tile's picture with the look's own FILTERS function over the neon plate — the art is the look, never clip-art");

    const ddlPath = path.join(__dirname, "..", "DDL-packs-holidays.sql");
    const ddl = fs.existsSync(ddlPath) ? fs.readFileSync(ddlPath, "utf8") : "";
    t.ok(ddl.length > 4000 && /^-- STATUS: (NOT RUN|RUN IN PRODUCTION)/m.test(ddl), "tools/DDL-packs-holidays.sql exists and its STATUS line says whether production has run it");
    t.ok(/a8ca64f4a6e17501e1761c4961aa0c1d/.test(ddl) && /18c19ce96c662a68bc82e327a14f5df4/.test(ddl) && /00ed780667ebed70cab458368bc616c1/.test(ddl),
      "md5-guarded on the three 2026-10-19 read-backs: set_filter a8ca64f4…, lc_config 18c19ce9…, lc_tonight_pack 00ed7806…");
    t.ok(/if exists \(select 1 from public\.look_packs where slug = 'holidays'\)/.test(ddl) && /to_regprocedure\('public\.lc_pack_status\(public\.look_packs\)'\) is not null/.test(ddl) && /2026-10-24 07:00:00\+00'::timestamptz or r\.ends_at <> '2026-11-02 08:00:00\+00'/.test(ddl),
      "…and refuses if a holidays row or lc_pack_status already exists, or if the Halloween row is not PR #112's");
    const ddlList = (ddl.match(/if name not in \(([^)]*)\) then raise exception 'no such filter'/g) || []).pop() || "";
    const ddlSlugs = [...ddlList.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
    t.ok(ddlSlugs.length === 33 && [...HOL_2D, ...HOL_CK].every((s) => ddlSlugs.includes(s)) && ddlSlugs.slice().sort().join(",") === FILTER_LOOKS.slice().sort().join(","),
      `the spliced allow-list is the seventeen of 2026-10-19 plus the Holidays sixteen (${ddlSlugs.length} names) — exactly the double's`);
    t.ok(/88c4017d9db2fc1dd69cf877729e4c41/.test(ddl) && /length\(v_after\) <> 1569/.test(ddl), "the splice post-checks set_filter to 1569 chars, md5 88c4017d… (computed from the SOURCE section of DESIGN-filter-rules.md)");
    const checks = ddl.match(/add  constraint room_members_filter(?:_pick)?_curated\s+check \([\s\S]*?\)\);/g) || [];
    t.ok(checks.length === 2 && checks.every((c) => [...c.matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]).sort().join(",") === FILTER_LOOKS.slice().sort().join(",")), "both room_members CHECKs are widened to the same 33 names");
    const upd = (ddl.match(/update public\.look_packs\n\s+set starts_at[\s\S]*?where slug = 'halloween';/) || [""])[0];
    t.ok(/2026-10-21 00:00'::timestamp at time zone 'America\/Los_Angeles'/.test(upd) && /2026-11-01 00:00'::timestamp at time zone 'America\/Los_Angeles'/.test(upd) && /enabled\s+= true/.test(upd),
      "the Halloween row is moved to 2026-10-21 00:00 → 2026-11-01 00:00 America/Los_Angeles, enabled (on now, through Oct 31 PT)");
    t.ok(HALLOWEEN_PACK.starts_at === "2026-10-21T07:00:00+00:00" && HALLOWEEN_PACK.ends_at === "2026-11-01T07:00:00+00:00", "the double's HALLOWEEN_PACK is that window: Oct 21 07:00Z (00:00 PDT) through Nov 1 07:00Z (00:00 PDT)");
    const ddlRow = (ddl.match(/insert into public\.look_packs[\s\S]*?true\);/) || [""])[0];
    const rowSlugs = [...(ddlRow.match(/array\[[\s\S]*?\]/) || [""])[0].matchAll(/'([a-z0-9-]+)'/g)].map((m) => m[1]);
    t.ok(rowSlugs.join(",") === HOLIDAYS_PACK.looks.join(",") && /'holidays', 'Holidays'/.test(ddlRow) && /2026-11-01 00:00'::timestamp at time zone 'America\/Los_Angeles'/.test(ddlRow) && /2027-01-02 00:00'::timestamp at time zone 'America\/Los_Angeles'/.test(ddlRow),
      "the DDL's Holidays row is the double's HOLIDAYS_PACK: the sixteen slugs in order, named Holidays, Nov 1 00:00 to Jan 2 00:00 America/Los_Angeles (Jan 1 the last night)");
    t.ok(HOLIDAYS_PACK.starts_at === HALLOWEEN_PACK.ends_at && HOLIDAYS_PACK.starts_at === "2026-11-01T07:00:00+00:00" && HOLIDAYS_PACK.ends_at === "2027-01-02T08:00:00+00:00",
      "the Holidays window opens at the instant Halloween's closes — one handover instant, no gap, no overlap");
    t.ok(/create function public\.lc_pack_status\(p public\.look_packs\)/.test(ddl) && /'vaulted'/.test(ddl) && /create view public\.look_packs_status with \(security_invoker = true\)/.test(ddl) && /revoke all on table public\.look_packs_status from public, anon, authenticated/.test(ddl) && /revoke all on function public\.lc_pack_status\(public\.look_packs\) from public, anon, authenticated/.test(ddl),
      "lc_pack_status (live | scheduled | vaulted | off) and the Studio-only look_packs_status view, both sealed from anon/authenticated");
    const live = ddl.split("\n").filter((l) => !/^\s*--/.test(l)).join("\n");
    t.ok(!/delete from public\.look_packs/.test(live) && !/drop table public\.look_packs/.test(live), "vaulting keeps rows: the live DDL never deletes from or drops look_packs (the UNDO is commentary)");
    t.ok(/create table public\.look_packs/.test(ddl) === false && /alter table public\.look_packs/.test(live) === false, "no new column for vaulting — status is computed from the window on the server clock, nothing stored that can go stale");

    // the server model: the handover is one instant; a vaulted row stays
    const M = new BackendDouble();
    M.addLookPack({ ...HALLOWEEN_PACK }); M.addLookPack({ ...HOLIDAYS_PACK });
    const at = (s) => Date.parse(s);
    const hand = [at("2026-11-01T06:59:59Z"), at("2026-11-01T07:00:00Z")].map((x) => (M.tonightPack(x) || {}).slug || null);
    t.ok(hand.join(",") === "halloween,holidays", `the server model hands over at one instant: 06:59:59Z Nov 1 → ${hand[0]}, 07:00:00Z → ${hand[1]}`);
    const st = (x) => M.packStatuses(x).map((p) => p.slug + "=" + p.status).join(" ");
    t.ok(st(at("2026-10-20T23:59:59Z")) === "halloween=scheduled holidays=scheduled" && st(at("2026-10-25T12:00:00Z")) === "halloween=live holidays=scheduled" && st(at("2026-11-01T07:00:00Z")) === "halloween=vaulted holidays=live" && st(at("2027-01-02T08:00:00Z")) === "halloween=vaulted holidays=vaulted",
      "lc_pack_status on the model: scheduled before Oct 21, Halloween live through Oct 31, vaulted from Nov 1 as Holidays goes live, both vaulted from Jan 2 — and both rows still there");
    t.ok(M.lookPacks.length === 2 && M.tonightPack(at("2027-01-02T08:00:00Z")) === null, "a vaulted row is kept, and never tonight_pack");

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
        D.addUser({ id: hostId, name: "Host " + id, email: hostId + "@holidays.test" });
        const room = D.addRoom({ id, host_id: hostId, name: "Holiday Night " + id, phase: "spotlight", round: 1 });
        D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_000_000);
        seats.forEach((u, i) => { D.addUser({ id: u, name: u }); D.addMember(room, u, "chair", { seat_index: i }); });
        return room;
      };

      /* S (runtime half): lcPackLive / lcPackStatus on the phone at the edges */
      const probe = await (async () => {
        const c = await h.newClient("probe"); c.login(D.addUser({ id: "u_probe", name: "Probe" }));
        await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none'])", { state: "visible", timeout: 15000 });
        const r = await c.page.evaluate(([hw, hol]) => {
          const T = ["2026-11-01T06:59:59Z", "2026-11-01T07:00:00Z", "2027-01-02T07:59:59Z", "2027-01-02T08:00:00Z"].map((s) => Date.parse(s));
          return { hwLive: T.map((x) => window.__lc.lcPackLive(hw, x)), holLive: T.map((x) => window.__lc.lcPackLive(hol, x)),
            hwSt: T.map((x) => window.__lc.lcPackStatus(hw, x)), holSt: T.map((x) => window.__lc.lcPackStatus(hol, x)), off: window.__lc.lcPackStatus({ ...hol, enabled: false }, T[1]) };
        }, [HALLOWEEN_PACK, HOLIDAYS_PACK]);
        await c.close();
        return r;
      })();
      t.ok(probe.hwLive.join(",") === "true,false,false,false" && probe.holLive.join(",") === "false,true,true,false",
        `the phone's clock agrees: Halloween in at 23:59:59 PDT Oct 31 and out at 00:00 Nov 1, when Holidays comes in; Holidays out at 00:00 PST Jan 2 (${probe.hwLive.join(",")} / ${probe.holLive.join(",")})`);
      t.ok(probe.hwSt.join(",") === "live,vaulted,vaulted,vaulted" && probe.holSt.join(",") === "scheduled,live,live,vaulted" && probe.off === "off",
        `lcPackStatus on the phone: Halloween live → vaulted, Holidays scheduled → live → vaulted, a disabled row is off (${probe.hwSt.join(",")} / ${probe.holSt.join(",")})`);

      /* ---------- 1. HOLIDAYS LIVE ---------- */
      D.lookPacks = [];
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() - 7_200_000), ends_at: iso(now() - 3_600_000) });   // Halloween: window passed an hour ago — vaulted
      D.addLookPack({ ...HOLIDAYS_PACK, starts_at: iso(now() - 3_600_000), ends_at: iso(now() + 3_600_000) });     // Holidays: on tonight
      const r1 = mkRoom("r_hol", "u_h1", ["u_p0", "u_p1", "u_p2"]);
      D.addUser({ id: "u_pw", name: "Watcher" }); D.addMember(r1, "u_pw", "spectator");
      const host1 = await boot("host1", "u_h1", {}, r1, "u_p0");
      const P0 = await boot("p0", "u_p0", {}, r1, "u_p0");
      const P1 = await boot("p1", "u_p1", {}, r1, "u_p0");
      const P2 = await boot("p2", "u_p2", {}, r1, "u_p0");
      const PW = await boot("pw", "u_pw", {}, r1, "u_p0");
      t.ok(await openTray(P1), "Holidays on: the tray opens for a chair");
      await waitFor(() => P1.page.evaluate(() => { const a = [...document.querySelectorAll("#rt_shelfrack .lc-shelf__art")]; return a.length === 8 && a.every((i) => i.complete && i.naturalWidth > 0); }), 5000, "the eight pack-art pictures to load");
      const s1 = await P1.page.evaluate(TRAY);
      t.ok(s1.tonight && s1.tonight.slug === "holidays" && s1.tonight.looks.join(",") === HOLIDAYS_PACK.looks.join(",") && s1.live && s1.live.slug === "holidays",
        "the client holds the Holidays pack from lc_config, live on the phone's clock");
      t.ok(s1.tab === "tonight" && s1.tabLabel === "Holidays", `the tray opens on Tonight and the tab is named for the pack ("${s1.tabLabel}")`);
      t.ok(s1.shown.join(",") === HOL_2D.join(","), `the tiles are exactly the eight 2D looks in the pack's order (${s1.shown.join(",")})`);
      const tt = s1.tiles.filter((x) => x.tab === "tonight");
      t.ok(tt.every((x) => x.badge === "Tonight" && x.cost === "FREE" && !x.amber) && tt.map((x) => x.name).join("|") === HOL_NAMES, `each badged Tonight, FREE, teal, named (${tt.map((x) => x.name).join(", ")})`);
      t.ok(tt.every((x) => x.art && x.art.shown && x.art.w === 96 && x.art.h === 60 && x.art.len > 2000 && !x.iconShown) && new Set(tt.map((x) => x.art.src)).size === 8,
        `every tile wears pack art — a 96×60 picture of its own look over the neon plate, eight different ones, the icon not shown (${tt.map((x) => x.art ? x.art.len : "none").join("/")} bytes)`);
      t.ok(HOL_CK.every((s) => !s1.tiles.some((x) => x.look === s)), "the eight ck- disguise slugs are not tiles — no lens exists for them yet, so nothing can be picked");
      t.ok(s1.pack.display !== "none" && /Holidays pack/.test(s1.pack.text) && s1.empty.display === "none", `the pack line names it ("${s1.pack.text}")`);

      /* ---------- 4 (first half). VAULTED beside a live pack ---------- */
      t.ok(HALLOWEEN_PACK.looks.every((s) => !s1.tiles.some((x) => x.look === s)) && !s1.ghosts.some((g) => HALLOWEEN_PACK.looks.includes(g)),
        "Halloween is vaulted: none of its thirteen is a tile (not even a hidden one) and none is a ghost — gone from the tray entirely");
      t.ok(D.lookPacks.some((p) => p.slug === "halloween") && D.packStatuses().map((p) => p.slug + "=" + p.status).join(" ") === "halloween=vaulted holidays=live",
        `…and the server still holds the row (${D.packStatuses().map((p) => p.slug + "=" + p.status).join(", ")})`);

      /* ---------- 2. THE EIGHT RENDER at four widths ---------- */
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
        t.ok(shown.length === 8 && shown.every((x) => x.w >= 84 && x.h >= 88) && rows === Math.ceil(8 / cols) && s.scrollW <= s.clientW + 1,
          `${W}: eight tiles at least 84×88, ${cols} to a row in ${rows} rows, no sideways scroll`);
        await waitFor(() => c.page.evaluate(() => { const m = window.__lc.lookMyTile(); return !!(m && m.querySelector(".chair__feed video") && m.querySelector(".chair__feed video").readyState >= 2); }), 10000, W + ": the wearer's own video");
        for (const look of HOL_2D) {
          t.ok(await tap(c, look), `${W}: taps ${look}`);
          await waitFor(() => c.page.evaluate((l) => window.__lc.TRYON_STATE.look === l && window.__lc.TRYON_STATE.frames > 3, look), 5000, W + ": " + look + " frames");
          const snap = await c.page.evaluate(SNAP, look);
          t.ok(snap.ok && snap.frames > 3 && snap.diffFrac > 0.05 && !snap.flat && snap.mean > 2 && snap.mean < 253,
            `${W}: ${look} renders — ${snap.frames} frames on a ${snap.w}×${snap.h} canvas, ${Math.round((snap.diffFrac || 0) * 100)}% of pixels changed from the bare frame, not flat (mean ${Math.round(snap.mean || 0)})` + (snap.ok ? "" : " — " + snap.why));
          await c.page.evaluate(() => document.getElementById("rt_shelfcancel").click());
        }
        t.ok(callsBy("w" + W) === 0 && D.memberRow(inRl2 ? rl2 : rl, "u_r" + W).filter == null, `${W}: eight trials, nothing picked, set_filter never called`);
        await c.close();
      }

      /* ---------- 3. WEAR IT on a Holidays look ---------- */
      const row = (uid) => D.memberRow(r1, uid);
      const before = callsBy("p1");
      t.ok(await tap(P1, "snowfall"), "u_p1 taps Snowfall");
      await waitFor(() => P1.page.evaluate(() => window.__lc.TRYON_STATE.look === "snowfall"), 3000, "the trial to arm");
      await P1.page.evaluate(() => document.getElementById("rt_shelfwear").click());
      await waitFor(() => row("u_p1").filter === "snowfall", 5000, "the pick to land");
      t.ok(row("u_p1").filter === "snowfall" && row("u_p1").filter_pick === "snowfall" && callsBy("p1") === before + 1, "WEAR IT: set_filter accepted 'snowfall' once — the row holds it and the pick is spent");
      await waitFor(() => P1.page.evaluate(() => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.name === "snowfall" && window.__lc.FILTER_STATE.framesDrawn > 3), 8000, "u_p1's pipeline up with snowfall");
      t.ok(true, "the pipeline is up drawing the pack look (FILTER_STATE.name snowfall, frames flowing)");
      for (const c of [host1, P0, P2, PW]) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat1").classList.contains("has-filter")), 8000, c.name + ": badge on seat 1");
      const badges = {};
      for (const c of [host1, P0, P2, PW]) badges[c.name] = await c.page.evaluate(() => ({ t: document.querySelector("#rt_seat1 .chair__filter-t").textContent, i: document.querySelector("#rt_seat1 .chair__filter-i").textContent, paid: document.getElementById("rt_seat1").classList.contains("has-filter--paid") }));
      t.ok(Object.values(badges).every((b) => b.t === "SNOWFALL" && b.i === "❄️" && !b.paid), `every other phone badges seat 1 by the pack look's name and icon (${Object.values(badges).map((b) => b.t).join(" / ")}), teal — free, no gate`);
      const pick = (c, name) => c.page.evaluate((n) => window.__lc.filterPick(n), name);
      const stranger = await pick(P0, "ck-santa-x");
      t.ok(stranger.ok === false && /no such filter/.test(stranger.error), `a slug on no list is still refused ("${stranger.error}")`);
      const reservedPick = await pick(P0, "ck-champagne");
      t.ok(reservedPick.ok === true && row("u_p0").filter === "ck-champagne", "a reserved Holidays ck- slug IS on the server's list (the allow-list is ahead of the lens)");
      const halloweenPick = await pick(P2, "lantern");
      t.ok(halloweenPick.ok === true && row("u_p2").filter === "lantern", "a vaulted pack's slug stays on the allow-list (vaulting is the tray's business, the list is never narrowed) — the tray just never offers it");

      /* ---------- 4 (second half). A page whose only pack is vaulted; reuse ---------- */
      D.lookPacks = [];
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() - 7_200_000), ends_at: iso(now() - 3_600_000) });
      const r4 = mkRoom("r_vault", "u_h4", ["u_v0", "u_v1", "u_v2"]);
      const V = await boot("vault", "u_v1", {}, r4, "u_v0");
      t.ok(await openTray(V), "only a vaulted pack: the tray opens");
      await V.page.evaluate(() => window.__lc.lookTrayTab("tonight"));
      const s4 = await V.page.evaluate(TRAY);
      t.ok(s4.tonight === null && s4.tabLabel === "Tonight" && s4.tonightTiles.length === 0 && s4.ghosts.length === 0 && /No themed pack tonight/.test(s4.empty.text) && s4.pack.display === "none",
        `lc_config said null; the tab reads "${s4.tabLabel}", zero Tonight tiles in the DOM, no ghosts, the no-pack line ("${s4.empty.text}")`);
      t.ok(D.lookPacks.length === 1 && D.packStatus(D.lookPacks[0]) === "vaulted", "…and the vaulted row is still on the server");
      await V.close();
      // reuse: the same row given a new window is scheduled, then live, at the next openRoom
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() - 60_000), ends_at: iso(now() + 3_600_000) });
      t.ok(D.lookPacks.length === 1 && D.packStatus(D.lookPacks[0]) === "live", "reuse: the vaulted row with a new window is live again — no new row, nothing deleted");
      const r4b = mkRoom("r_reuse", "u_h4b", ["u_w0", "u_w1", "u_w2"]);
      const Rr = await boot("reuse", "u_w1", {}, r4b, "u_w0");
      t.ok(await openTray(Rr), "reuse: the tray opens");
      const s4b = await Rr.page.evaluate(TRAY);
      t.ok(s4b.tonight && s4b.tonight.slug === "halloween" && s4b.tabLabel === "Halloween" && s4b.shown.length === 6, `reuse: the next openRoom sees it live again (tab "${s4b.tabLabel}", ${s4b.shown.length} tiles)`);
      await Rr.close();

      /* ---------- 5. THE HANDOVER on a phone left open ---------- */
      D.lookPacks = [];
      const T0 = now() + 2_500;
      D.addLookPack({ ...HALLOWEEN_PACK, starts_at: iso(now() - 3_600_000), ends_at: iso(T0) });
      D.addLookPack({ ...HOLIDAYS_PACK, starts_at: iso(T0), ends_at: iso(T0 + 3_600_000) });
      const r5 = mkRoom("r_hand", "u_h5", ["u_x0", "u_x1", "u_x2"]);
      const X = await boot("handover", "u_x1", {}, r5, "u_x0");
      t.ok(await openTray(X), "handover: the tray opens with Halloween still on");
      const s5a = await X.page.evaluate(TRAY);
      t.ok(s5a.tonight && s5a.tonight.slug === "halloween" && s5a.tabLabel === "Halloween" && s5a.shown.length === 6, `handover: Halloween's six while its window is open (closes in ${Math.round((Date.parse(s5a.tonight.ends_at) - Date.now()) / 100) / 10}s)`);
      await waitFor(() => Date.now() >= T0 + 200, 6000, "the handover instant");
      t.ok((D.tonightPack() || {}).slug === "holidays" && D.packStatuses().map((p) => p.slug + "=" + p.status).join(" ") === "halloween=vaulted holidays=live", "the server has handed over: tonight_pack is holidays, Halloween is vaulted");
      await X.page.evaluate(() => window.__lc.lookTrayTab("tonight"));
      const s5b = await X.page.evaluate(TRAY);
      t.ok(s5b.live === null && s5b.tabLabel === "Tonight" && s5b.tonightTiles.length === 0 && s5b.ghosts.length === 0 && /No themed pack tonight/.test(s5b.empty.text),
        `handover: on the phone's own clock Halloween is gone — tab "${s5b.tabLabel}", zero Tonight tiles, no ghosts (the new pack is read at the next openRoom, no polling)`);
      const r5b = mkRoom("r_hand2", "u_h5b", ["u_y0", "u_x1b", "u_y2"]);
      D.addMember(r5b, "u_x1", "chair", { seat_index: 1 });
      await X.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r5b) });
      await waitFor(() => X.page.evaluate(() => window.__lc.TONIGHT_PACK && window.__lc.TONIGHT_PACK.slug === "holidays"), 8000, "the re-read on the next openRoom");
      t.ok(await openTray(X), "handover: the tray opens in the next room");
      const s5c = await X.page.evaluate(TRAY);
      t.ok(s5c.tonight.slug === "holidays" && s5c.tabLabel === "Holidays" && s5c.shown.join(",") === HOL_2D.join(","), `handover: the next openRoom reads the Holidays pack (tab "${s5c.tabLabel}", ${s5c.shown.length} tiles)`);
      await X.close();

      /* ---------- 6. HALLOWEEN NOW, for everyone ---------- */
      D.lookPacks = [];
      D.addLookPack({ ...HALLOWEEN_PACK }); D.addLookPack({ ...HOLIDAYS_PACK });   // the rows exactly as the DDL leaves them
      const skew0 = D.clockSkew;
      D.clockSkew = Date.parse("2026-10-25T04:00:00Z") - Date.now();   // Oct 24, 9pm PDT — inside the moved window, before the old Oct 24 start would have mattered either way
      const r6 = mkRoom("r_now", "u_h6", ["u_z0", "u_z1", "u_z2"]);
      const plain = D.profiles.get("u_z1");
      t.ok(plain && !plain.subscription && !plain.tier && (plain.coins === 120), "u_z1 is a plain signed-in user: no subscription, no tier, the default chips");
      const Z = await boot("now", "u_z1", {}, r6, "u_z0");
      t.ok(await openTray(Z), "Halloween now: the tray opens");
      const s6 = await Z.page.evaluate(TRAY);
      const cfg = D.rpcLog.filter((r) => r.clientId === "now" && r.name === "lc_config").length;
      /* the phone-side half (tab label, pack line) runs on the phone's REAL clock and would
         change colour with the calendar, so it is not asserted here — claims 1 and 5 prove it
         with windows moved onto tonight; this claim is the server's answer to a plain user */
      t.ok(cfg >= 1 && s6.tonight && s6.tonight.slug === "halloween" && s6.tonight.looks.join(",") === HALLOWEEN_PACK.looks.join(","),
        "with the server clock inside the moved window, lc_config reports the Halloween row for a plain user — no tier, no chips, no subscription asked");
      t.ok((D.tonightPack() || {}).slug === "halloween" && D.packStatuses().map((p) => p.slug + "=" + p.status).join(" ") === "halloween=live holidays=scheduled", "…and the model says Halloween live, Holidays scheduled");
      D.clockSkew = skew0;
      await Z.close();

      /* ---------- 7. errors ---------- */
      for (const c of [host1, P0, P1, P2, PW]) t.ok(c.errors.length === 0, `${c.name}: zero console errors` + (c.errors.length ? " — " + c.errors.slice(0, 3).join(" | ") : ""));
    } finally {
      await h.close();
    }
  },
};
