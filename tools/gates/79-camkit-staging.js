/* GATE 79 — camkit-staging: what ?camkit turns ON, and what it leaves alone.
 * Ships with feat/camera-kit-staging.  Gate 75's other half: 75 is the page
 * WITHOUT the flag (inert, whatever the config says); this is the page WITH
 * it, beside one without, in the same room.
 *
 * THE CLAIM.  index.html ships a staging Camera Kit config behind a test
 * flag.  On a page loaded with ?camkit the two shipped looks are amber ✦
 * tiles, the server accepts their slugs, and every show rule holds for them
 * exactly as it does for a teal look.  On a page loaded WITHOUT the flag, in
 * the same room at the same time, there is no ✦ tile and no SDK request —
 * even while another member wears a lens.  That is Nick's phone test: two
 * phones on ?camkit, a third without.
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.
 *   - the SERVER'S list.  The double's set_filter allow-list carries the two
 *     shipped slugs because it MIRRORS THE DDL in tools/DESIGN-filter-rules.md
 *     ("Lens slugs ck-objects / ck-express").  This gate never calls
 *     allowFilterLook: if the page ships a slug the double does not know, a
 *     pick here is rejected and block 2 fails — the page and the server's
 *     list disagreeing is exactly what it is for.  Block S compares the two
 *     lists outright.
 *   - the SDK.  The page's own shipped sdkUrl is left in place and
 *     harness.js routes it (any @snap/camera-kit address) to
 *     camera-kit-shim.js, so the battery stays offline and "one request, to
 *     the shipped address" is read off the wire.  The shim only knows ITS
 *     token, group and lens ids, so the flagged clients are configured with
 *     those — the SHIPPED slugs, names and icons are kept, each slug pointed
 *     at a shim lens.  What that cannot prove (the real token, the real
 *     lenses, WebGL, the watermark) is tools/camkit-smoke.js and the phones.
 *
 * The claims, every one through the real page:
 *   S. the page's shipped slugs are exactly the lens slugs on the server's
 *      list; an unlisted ck- slug is still "no such filter"
 *   1. ?camkit, config as shipped: CAMKIT_STATE.on, the rack is teal then the
 *      two shipped looks, their tiles amber with the shipped names — and
 *      zero SDK requests from painting them; every PARTIAL config is inert
 *      even with the flag
 *   T. THE SDK LOADS ON FIRST SHELF OPEN WITH ?camkit, NEVER ON A FLAGLESS
 *      PAGE (Nick's ruling on Snap's terms; this gate used to claim "with
 *      the flag the SDK still loads on first USE, not on first sight").  The
 *      first time the real 🎭 button opens the shelf on a ?camkit page the
 *      SDK is loaded — one request, to the shipped address — and Snap's
 *      terms dialog is on screen before any look is picked, raised by a
 *      hidden session that is never given a source, never played and never
 *      published; he agrees there and the hidden session is destroyed.  The
 *      phone without ?camkit opens its shelf too: no request, no dialog
 *   2. pick, through the real ✦ tile: the server accepts the shipped slug,
 *      the lens goes live on a SECOND session and is what the call
 *      publishes, with NO dialog at the lens start; still ONE SDK request
 *      from the wearer and one lens fetch; amber badge on every flagged
 *      client
 *   3. THE PHONE WITHOUT ?camkit, same room, same moment: two teal tiles and
 *      no ✦; no badge it has no name for; zero SDK requests — and its own
 *      teal look still works
 *   4. one per show: a second pick (the other ✦, or teal) is rejected
 *   5. DROP ON ASK, through the host's real ask path: field cleared inside
 *      the ask, lens down, bare camera published, badge gone
 *   6. the second shipped look, and HOST FORCE-OFF: lens down, camera back,
 *      lock kept
 *   7. zero console errors, zero leaked requests
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
  return { tiles: [...sh.querySelectorAll(".lc-shelf__tile")].map((b) => ({ look: b.dataset.look, amber: b.classList.contains("is-amber"),
             name: b.querySelector(".lc-shelf__name").textContent, icon: b.querySelector(".lc-shelf__icon").textContent, cost: b.querySelector(".lc-shelf__cost").textContent })),
           foot: document.getElementById("rt_shelffoot").textContent, state: window.__lc.CAMKIT_STATE, looks: window.__lc.FILTER_LOOKS.map((l) => l.id) };
};
const TILE = (seat) => {
  const el = document.getElementById("rt_seat" + seat);
  return { uid: el.dataset.heartuid || null, badged: el.classList.contains("has-filter"), paid: el.classList.contains("has-filter--paid"),
           text: (el.querySelector(".chair__filter-t") || {}).textContent || "" };
};
const PIPE = () => {
  const lv = window.__lc.DAILY && window.__lc.DAILY.participants().local.tracks.video;
  const cam = window.__dailyControl && window.__dailyControl.cameraTrack();
  const K = window.__camkitControl;
  return { F: window.__lc.FILTER_STATE, K: window.__lc.CAMKIT_STATE, state: lv ? lv.state : null, trackId: lv && lv.track ? lv.track.id : null, camId: cam ? cam.id : null,
           swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0,
           shim: K ? { sessions: K.sessions(), lensLoads: K.lensLoads(), bootstraps: K.bootstraps().length } : null };
};
const LENS_UP = () => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.kind === "lens" &&
  window.__lc.DAILY.participants().local.tracks.video.track && window.__lc.DAILY.participants().local.tracks.video.track.id === window.__lc.FILTER_STATE.canvasTrackId;
const CAMERA_BACK = () => { const lv = window.__lc.DAILY.participants().local.tracks.video; const cam = window.__dailyControl.cameraTrack();
  return window.__lc.FILTER_STATE.active === false && lv.state === "playable" && !!lv.track && !!cam && lv.track.id === cam.id; };

module.exports = {
  name: "camkit-staging",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@staging.test" });
      ["u_a", "u_b", "u_c"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_staging", host_id: hostU, name: "Staging Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 600_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      D.addMember(room, "u_b", "chair", { seat_index: 1 });
      D.addMember(room, "u_c", "chair", { seat_index: 2 });
      const boot = async (name, uid, query) => {
        const c = await h.newClient(name); c.login(uid); await c.goto(query);
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_a"), 8000, name + ": chairs render");
        return c;
      };
      const publishing = (c) => waitFor(() => c.page.evaluate(() =>
        window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 12_000, c.name + " publishing");
      /* two phones (and the host) on ?camkit; the third phone without */
      const host = await boot("host", hostU, "?camkit");
      const A = await boot("a", "u_a", "?camkit&debug");
      const B = await boot("b", "u_b", "?camkit");
      const C = await boot("c", "u_c", "");
      await publishing(A); await publishing(B); await publishing(C);
      const flagged = [host, A, B], all = [host, A, B, C];
      const requestsBy = (name) => h.camkitRequests.filter((r) => r.client === name).length;
      const tapTile = (c, look) => c.page.evaluate((look) => {
        if (!document.getElementById("rt_shelf").classList.contains("is-open")) document.getElementById("rt_filterbtn").click();
        const b = document.querySelector('#rt_shelfrack .lc-shelf__tile[data-look="' + look + '"]');
        if (!b) return { found: false };
        const amber = b.classList.contains("is-amber"); b.click();
        return { found: true, amber };
      }, look);
      const badgeGone = async (clients, seat) => { for (const c of clients) await waitFor(() => c.page.evaluate((s) => !document.getElementById("rt_seat" + s).classList.contains("has-filter"), seat), 8000, c.name + ": badge gone from seat " + seat); };

      /* ---------- S. the page's list and the server's list ---------- */
      const shipped = await A.page.evaluate(() => ({ sdkUrl: window.__lc.CAMKIT.sdkUrl, group: window.__lc.CAMKIT.lensGroupId,
        looks: Object.entries(window.__lc.CAMKIT.looks).map(([slug, v]) => ({ slug, lensId: v.lensId, name: v.name, icon: v.icon })) }));
      const slugs = shipped.looks.map((l) => l.slug);
      const serverLens = D.filterLooks.filter((n) => n !== "grade" && n !== "noir");
      t.ok(slugs.length === 2 && slugs.every((s) => /^ck-[a-z0-9-]+$/.test(s)), `the page ships two ck- lens slugs (${slugs.join(", ")})`);
      t.ok(serverLens.slice().sort().join(",") === slugs.slice().sort().join(","),
        `the server's list (the double, mirroring the DDL) carries exactly those lens slugs — page: ${slugs.join(", ")} · server: ${serverLens.join(", ")}`);
      const [S1, S2] = slugs;
      const nope = await C.page.evaluate(() => window.__lc.filterPick("ck-nope"));
      t.ok(nope.ok === false && /no such filter/.test(nope.error) && D.memberRow(room, "u_c").filter_pick === null,
        `an unlisted ck- slug is still rejected by set_filter ("${nope.error}") — the prefix is a naming habit, not a pass`);

      /* ---------- 1. ?camkit, config exactly as shipped ---------- */
      const s1 = await A.page.evaluate(SHELF);
      t.ok(s1.state.flag === true && s1.state.on === true && s1.looks.join(",") === ["grade", "noir", ...slugs].join(","),
        `?camkit, nothing configured by the harness: CAMKIT_STATE.on true and the rack is teal then the two shipped looks (${s1.looks})`);
      const amber1 = s1.tiles.filter((x) => x.amber);
      t.ok(s1.tiles.length === 4 && amber1.map((x) => x.look).join(",") === slugs.join(",") && amber1.every((x) => x.cost === "✦"),
        `four tiles, the two shipped looks amber ✦ (${s1.tiles.map((x) => x.look + (x.amber ? "*" : "")).join(",")})`);
      t.ok(amber1.every((x, i) => x.name === shipped.looks[i].name && x.icon === shipped.looks[i].icon && x.name !== x.look),
        `each ✦ tile carries its shipped name and icon ("${amber1.map((x) => x.name).join('", "')}")`);
      t.ok(/Amber = face-tracked/.test(s1.foot), `the foot line names the amber set ("${s1.foot}")`);
      await A.page.waitForTimeout(600);
      t.ok(s1.state.sdkLoads === 0 && s1.state.termsAsked === false && h.camkitRequests.length === 0,
        `the rack is painted and nothing has been requested: with the flag the SDK is still not loaded at boot or by painting tiles — only by the shelf being OPENED (requests=${h.camkitRequests.length})`);
      /* the flag is necessary, not sufficient: any field missing is still inert */
      const live = await B.page.evaluate(() => ({ sdkUrl: window.__lc.CAMKIT.sdkUrl, apiToken: window.__lc.CAMKIT.apiToken, lensGroupId: window.__lc.CAMKIT.lensGroupId, looks: { ...window.__lc.CAMKIT.looks } }));
      for (const missing of ["sdkUrl", "apiToken", "lensGroupId", "looks"]) {
        await B.page.evaluate((cfg) => Object.assign(window.__lc.CAMKIT, cfg), { ...live, [missing]: missing === "looks" ? {} : null });
        const s = await B.page.evaluate(SHELF);
        t.ok(s.state.flag === true && s.state.on === false && s.tiles.length === 2 && !s.tiles.some((x) => x.amber) && h.camkitRequests.length === 0,
          `?camkit but no ${missing}: inert — on=false, two teal tiles, zero requests`);
      }
      await B.page.evaluate((cfg) => Object.assign(window.__lc.CAMKIT, cfg), live);

      /* from here the flagged clients talk to the SHIM: its token, its group,
         its lens ids — under the page's own sdkUrl, slugs, names and icons */
      const shimLooks = { [S1]: { ...shipped.looks[0], lensId: "lens-fox" }, [S2]: { ...shipped.looks[1], lensId: "lens-halo" } };
      for (const c of flagged) await c.camkitConfigure({ sdkUrl: shipped.sdkUrl, looks: shimLooks });

      /* ---------- T. first sight of the shelf ---------- */
      const DIALOG = () => { const el = document.querySelector('[data-testid="tos-dialog"]'), dg = el && el.shadowRoot && el.shadowRoot.querySelector("dialog");
        return { open: !!(dg && dg.open), modal: !!(dg && dg.matches(":modal")), buttons: dg ? [...dg.querySelectorAll("button")].map((b) => b.textContent.trim()) : [],
                 shim: window.__camkitControl ? window.__camkitControl.legal() : null, K: window.__lc.CAMKIT_STATE }; };
      const openShelf = (c) => c.page.evaluate(() => { const sh = document.getElementById("rt_shelf"); if (!sh.classList.contains("is-open")) document.getElementById("rt_filterbtn").click(); return sh.classList.contains("is-open"); });
      await A.camkitFault("legal", "prompt");   // u_a has never accepted Snap's terms on this phone
      t.ok(await openShelf(A), "u_a opens the shelf with the real 🎭 button");
      await waitFor(() => A.page.evaluate(DIALOG).then((d) => d.open), 8000, "Snap's terms dialog at first sight of the shelf");
      const dT = await A.page.evaluate(DIALOG);
      t.ok(dT.open && dT.modal && dT.buttons.join("|") === "Dismiss|I Agree" && dT.shim.shown === 1 && dT.K.terms === "asking",
        `first shelf open with ?camkit: Snap's terms are on screen before any look is picked (${dT.buttons.join(" / ")})`);
      const hid = await A.page.evaluate(PIPE);
      t.ok(hid.shim.sessions.length === 1 && hid.shim.sessions[0].sourceId === null && hid.shim.sessions[0].played.length === 0 && hid.swaps === 0 && hid.F.active === false && hid.trackId === hid.camId,
        "…raised by a HIDDEN session — given no source, never played — while the call goes on publishing his untouched camera");
      t.ok(h.camkitRequests.length === 1 && requestsBy("a") === 1 && h.camkitRequests[0].url === shipped.sdkUrl && D.memberRow(room, "u_a").filter == null,
        `…the SDK was loaded for it — ONE request, from u_a, to the page's shipped address — and nothing has been picked (${h.camkitRequests.map((r) => r.client + " → " + r.url.slice(0, 44) + "…").join(", ")})`);
      t.ok(await openShelf(C), "u_c (no ?camkit) opens his shelf too");
      await C.page.waitForTimeout(700);
      const dC = await C.page.evaluate(DIALOG);
      t.ok(dC.open === false && dC.K.termsAsked === false && requestsBy("c") === 0, "…and on the phone without ?camkit that asks nothing and loads nothing");
      t.ok(await A.page.evaluate(() => { const el = document.querySelector('[data-testid="tos-dialog"]'); const b = el && [...el.shadowRoot.querySelectorAll("button")].find((x) => x.textContent.trim() === "I Agree"); if (!b) return false; b.click(); return true; }),
        "u_a taps I Agree");
      await waitFor(() => A.page.evaluate(() => window.__lc.CAMKIT_STATE.terms === "agreed" && window.__camkitControl.sessions()[0].destroyed === true), 8000, "the hidden session to be destroyed");
      t.ok((await A.page.evaluate(DIALOG)).open === false && (await A.page.evaluate(PIPE)).swaps === 0, "the dialog is gone and the hidden session destroyed — it was never published");

      /* ---------- 2. pick, through the real ✦ tile ---------- */
      const tap = await tapTile(A, S1);
      t.ok(tap.found && tap.amber, `u_a taps the ✦ tile for '${S1}'`);
      await waitFor(() => D.memberRow(room, "u_a").filter === S1, 5000, "the pick to land on the server");
      t.ok(D.memberRow(room, "u_a").filter_pick === S1, `the server accepts the shipped slug with no widening: filter='${S1}', filter_pick='${S1}'`);
      await waitFor(() => A.page.evaluate(LENS_UP), 10_000, "u_a's lens to go live from the field");
      const a2 = await A.page.evaluate(PIPE);
      t.ok(a2.F.kind === "lens" && a2.F.name === S1 && a2.trackId === a2.F.canvasTrackId && a2.swaps === 1,
        `wearer: the pipeline came up as a LENS and the call publishes it — one videoSource swap (kind=${a2.F.kind}, swaps=${a2.swaps})`);
      const d2 = await A.page.evaluate(DIALOG);
      t.ok(h.camkitRequests.length === 1 && requestsBy("a") === 1 && d2.shim.shown === 1 && d2.open === false,
        `still exactly ONE SDK request, the one made at the shelf — and NO dialog at the lens start: the terms were already answered (dialogs shown=${d2.shim.shown})`);
      t.ok(a2.shim.bootstraps === 1 && a2.shim.lensLoads.length === 1 && a2.shim.lensLoads[0].groupId === CAMKIT_TEST.lensGroupId && a2.shim.sessions.length === 2 && a2.shim.sessions[0].destroyed === true
          && a2.shim.sessions[1].destroyed === false && a2.shim.sessions[1].played.join(",") === "capture" && (await A.page.evaluate(() => window.__camkitControl.overlaps())) === 0,
        "…one bootstrap, one lens fetch (the terms were asked with this same lens), and a SECOND session — the hidden one gone before it came — playing the CAPTURE target");
      await A.page.waitForTimeout(1100);
      const dbg = await A.page.evaluate(() => { const el = document.getElementById("vfilter"); return { text: el ? el.textContent : null, frames: window.__lc.FILTER_STATE.framesDrawn }; });
      await A.page.waitForTimeout(700);
      const frames2 = await A.page.evaluate(() => window.__lc.FILTER_STATE.framesDrawn);
      t.ok(dbg.text && dbg.text.startsWith("FILTER " + S1 + " (lens)") && dbg.frames > 0 && frames2 > dbg.frames,
        `?camkit&debug: the readout names the look as a lens and its frame counter climbs (${dbg.frames} → ${frames2})`);
      for (const c of flagged) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("has-filter--paid")), 8000, c.name + ": amber badge on seat 0");
      const badges2 = {}; for (const c of flagged) badges2[c.name] = await c.page.evaluate(TILE, 0);
      t.ok(Object.values(badges2).every((x) => x.badged && x.paid && x.text === shipped.looks[0].name.toUpperCase()),
        "amber badge on seat 0 on every ?camkit client, naming the look: " + Object.entries(badges2).map(([n, x]) => n + "=" + x.text).join(" "));

      /* ---------- 3. the phone without ?camkit ---------- */
      await C.page.waitForTimeout(600);
      const s3 = await C.page.evaluate(SHELF);
      t.ok(s3.state.flag === false && s3.state.on === false && s3.tiles.length === 2 && !s3.tiles.some((x) => x.amber) && s3.looks.join(",") === "grade,noir" && s3.foot === "Teal = free, no tracking.",
        `u_c (no ?camkit) while u_a wears a lens: two teal tiles, no ✦, the old foot line (${s3.tiles.map((x) => x.look).join(",")})`);
      const c3 = await C.page.evaluate(TILE, 0);
      t.ok(c3.uid === "u_a" && c3.badged === false && c3.paid === false, "…and it paints no badge on u_a's tile — a look it has no name for (the lens itself is in u_a's published video, which every viewer receives)");
      t.ok(requestsBy("c") === 0 && s3.state.sdkLoads === 0, `…and it has requested nothing: zero SDK requests from the flagless client (${requestsBy("c")})`);
      t.ok((await C.page.evaluate(() => window.__lc.filterPick("grade"))).ok === true, "u_c: his own teal look is still his to pick");
      await waitFor(() => C.page.evaluate(() => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.kind === "2d"), 8000, "u_c's teal look to come up");
      t.ok(requestsBy("c") === 0, "…as a 2D source, still with zero SDK requests");
      for (const c of all) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat2").classList.contains("has-filter")), 8000, c.name + ": teal badge on seat 2");
      t.ok(true, "his teal badge shows on every client, flagged or not");

      /* ---------- 4. one per show ---------- */
      const p4a = await A.page.evaluate((s) => window.__lc.filterPick(s), S2);
      const p4b = await A.page.evaluate(() => window.__lc.filterPick("grade"));
      t.ok(p4a.ok === false && /locked for this show/.test(p4a.error) && p4b.ok === false && /locked for this show/.test(p4b.error),
        `one per show: u_a's second pick is rejected whether it is the other ✦ or a teal ("${p4a.error}")`);
      const a4 = await A.page.evaluate(PIPE);
      t.ok(a4.F.active && a4.F.name === S1 && a4.swaps === 1 && a4.shim.sessions.length === 2 && a4.shim.sessions[1].destroyed === false && D.memberRow(room, "u_a").filter === S1, "…and his lens is undisturbed — same live session, no second swap");

      /* ---------- 5. DROP ON ASK ---------- */
      await host.page.evaluate(() => window.__lc.egOpenDrawer("u_a"));
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_a", 8000, "the ask to land on u_a");
      t.ok(D.memberRow(room, "u_a").filter === null && D.memberRow(room, "u_a").filter_pick === S1, "ASK: the server cleared his field inside the ask (lock kept)");
      await waitFor(() => A.page.evaluate(CAMERA_BACK), 10_000, "u_a asked, unmasked, camera back");
      const a5 = await A.page.evaluate(PIPE);
      t.ok(a5.F.active === false && a5.trackId === a5.camId && a5.state === "playable" && a5.shim.sessions.every((x) => x.destroyed === true),
        "…the lens is down, its session destroyed, and the bare camera is what the call publishes");
      await badgeGone(flagged, 0);
      t.ok(true, "badge gone from seat 0 on every ?camkit client");
      const p5 = await A.page.evaluate((s) => window.__lc.filterPick(s), S1);
      t.ok(p5.ok === false && /while asked/.test(p5.error), `set_filter rejected while asked: "${p5.error}"`);

      /* ---------- 6. the second look, and host force-off ---------- */
      const tapB = await tapTile(B, S2);
      t.ok(tapB.found && tapB.amber, `u_b taps the ✦ tile for '${S2}'`);
      await waitFor(() => D.memberRow(room, "u_b").filter === S2, 5000, "u_b's pick to land");
      await waitFor(() => B.page.evaluate(LENS_UP), 10_000, "u_b's lens to go live");
      const b6 = await B.page.evaluate(PIPE);
      const dB = await B.page.evaluate(DIALOG);
      t.ok(b6.F.name === S2 && b6.shim.lensLoads.map((l) => l.lensId).join(",") === "lens-fox,lens-halo" && b6.shim.sessions.length === 2 && b6.shim.sessions[0].destroyed === true && b6.shim.sessions[0].played.length === 0 && dB.shim.shown === 0 && (await B.page.evaluate(() => window.__camkitControl.overlaps())) === 0,
        "u_b's shelf opening asked the terms too — with the first ✦ lens, on a hidden session, and silently, because on his phone they were already accepted — and then his own look went live on its own lens, on a second session");
      t.ok(requestsBy("b") === 1 && h.camkitRequests.length === 2,
        `u_b's client is the second (and only other) SDK request, made when he opened his shelf (${h.camkitRequests.map((r) => r.client).join(",")})`);
      const hc = await A.page.evaluate(() => window.__lc.hostClearFilter("u_b"));
      t.ok(hc.ok === false && /only the host/.test(hc.error) && D.memberRow(room, "u_b").filter === S2, `host_clear_filter from a chair is rejected ("${hc.error}")`);
      t.ok((await host.page.evaluate(() => window.__lc.hostClearFilter("u_b"))).ok === true, "the host forces u_b's lens off");
      await waitFor(() => B.page.evaluate(CAMERA_BACK), 10_000, "u_b's camera back");
      const b6b = await B.page.evaluate(PIPE);
      t.ok(b6b.shim.sessions.every((x) => x.destroyed) && b6b.trackId === b6b.camId && D.memberRow(room, "u_b").filter === null && D.memberRow(room, "u_b").filter_pick === S2,
        "host force-off: lens down, session destroyed, camera back; his lock stays");
      await badgeGone(flagged, 1);
      t.ok(requestsBy("c") === 0 && requestsBy("host") === 0, "through all of it: zero SDK requests from the flagless client, and zero from the host (a viewer paints a badge from the row)");

      /* ---------- 7. quiet ---------- */
      for (const c of all) {
        const errs = c.errors.filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, `zero console errors on ${c.name} — ${errs.slice(0, 2).join(" | ")}`);
      }
      const leaks = h.unexpectedRequests.filter((u) => !/favicon/.test(u));
      t.ok(leaks.length === 0, `zero leaked requests — ${leaks.slice(0, 3).join(" | ")}`);
    } finally { await h.close(); }
  },
};
