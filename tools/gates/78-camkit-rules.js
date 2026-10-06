/* GATE 78 — camkit-rules: the SHOW RULES hold for a lens look.  Ships with
 * feat/camera-kit.  Gate 71's sibling: same rules, lens source.
 *
 * WHY IT SHOULD BE TRUE, AND WHY IT IS STILL CHECKED.  The rules act on the
 * member row's server-owned `filter` field and the reconciler makes the
 * pipeline follow the field — neither knows what draws the pixels.  But a
 * lens start is the first ASYNC start this pipeline has had (SDK, lens,
 * session), and a lens stop has a session to destroy; "it is the same code"
 * is exactly the claim that a gate exists to stop anyone having to believe.
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.  Everything
 * gate 71 needs (the double's two columns, its rejections, the clear INSIDE
 * ask_question and start_moment, emitted before the rooms row) plus the
 * Camera Kit shim's real lifecycle (gate 76).  The double's allow-list is
 * widened for the two lens slugs — standing in for production DDL that HAS
 * NOT BEEN RUN; block 0 shows what production does today.  The Moment is
 * still unbuilt; block 5 drives the double's seam directly, as gate 71 does.
 *
 * The claims, every one through the real client's reconciler:
 *   0. production today: the server rejects a lens slug ("no such filter") —
 *      tapping an amber tile loads nothing
 *   1. pick (through the real amber tile): field set, the wearer's pipeline
 *      comes up as a LENS and the call publishes it; an amber badge naming
 *      the look on EVERY client; ONLY the wearer's client ever requests the
 *      SDK — viewers paint a badge from the row and load nothing
 *   2. one per show: a second pick (teal or amber) is rejected, unchanged
 *   3. DROP ON ASK, through the host's real ask path: field cleared inside
 *      the ask, no beat asked-and-filtered on any client, the wearer's
 *      session destroyed and the camera back
 *   4. HOST FORCE-OFF: rejected from a chair; from the host the lens comes
 *      down and the camera is back
 *   5. THE MOMENT STRIPS IT: no beat paired-and-filtered, session destroyed
 *   6. the bench: a bench pick WARMS the SDK in the background (ready by
 *      promotion) but opens no session and publishes nothing; promoted, the
 *      lens comes up exactly once; the wearer's own DROP takes it down
 *   7. zero console errors on every client
 */
"use strict";
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
const TILE = (seat) => {
  const el = document.getElementById("rt_seat" + seat), b = el.querySelector(".chair__filter");
  return { uid: el.dataset.heartuid || null, badged: el.classList.contains("has-filter"), paid: el.classList.contains("has-filter--paid"),
           text: (el.querySelector(".chair__filter-t") || {}).textContent || "", icon: (el.querySelector(".chair__filter-i") || {}).textContent || "",
           shown: getComputedStyle(b).display, edge: getComputedStyle(b).borderTopColor, ink: getComputedStyle(el.querySelector(".chair__filter-t")).color };
};
const PIPE = () => {
  const lv = window.__lc.DAILY && window.__lc.DAILY.participants().local.tracks.video;
  const custom = window.__dailyControl && window.__dailyControl.customVideoTrack();
  const cam = window.__dailyControl && window.__dailyControl.cameraTrack();
  const K = window.__camkitControl;
  return { F: window.__lc.FILTER_STATE, K: window.__lc.CAMKIT_STATE, room: window.__lc.FILTER_ROOM,
           state: lv ? lv.state : null, trackId: lv && lv.track ? lv.track.id : null, customId: custom ? custom.id : null, camId: cam ? cam.id : null,
           swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0,
           hiddenVideos: document.querySelectorAll("body > video").length,
           shim: K ? { sessions: K.sessions(), sources: K.sources() } : null };
};
const LENS_UP = () => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.kind === "lens" &&
  window.__lc.DAILY.participants().local.tracks.video.track && window.__lc.DAILY.participants().local.tracks.video.track.id === window.__lc.FILTER_STATE.canvasTrackId;
const CAMERA_BACK = () => { const lv = window.__lc.DAILY.participants().local.tracks.video; const cam = window.__dailyControl.cameraTrack();
  return window.__lc.FILTER_STATE.active === false && lv.state === "playable" && !!lv.track && !!cam && lv.track.id === cam.id; };
/* gate 71's observer: after every realtime push and every 10ms, snapshot
   (asked-or-paired, my field) and keep any beat where both are true */
const ARM_OBSERVER = (kind) => {
  const me = window.__lc.ME.id;
  const snap = () => {
    const r = window.__lc.CURRENT_ROOM || {};
    const inBeat = kind === "asked" ? r.spotlight_target === me : (r.moment_a === me || r.moment_b === me);
    const mine = (window.__lc.FILTER_ROOM[me] || {}).name || null;
    const s = { inBeat, filter: mine, t: performance.now() };
    window.__g78.log.push(s);
    if (inBeat && mine) window.__g78.violations.push(s);
    return s;
  };
  window.__g78 = { log: [], violations: [], stop: null };
  const orig = window.__realtimePush;
  window.__realtimePush = (evt) => { const r = orig(evt); snap(); return r; };
  const iv = setInterval(snap, 10);
  window.__g78.stop = () => { clearInterval(iv); window.__realtimePush = orig; snap(); return { n: window.__g78.log.length, v: window.__g78.violations }; };
};

module.exports = {
  name: "camkit-rules",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@lensrules.test" });
      ["u_a", "u_b", "u_c", "u_bench", "u_watch"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_lensrules", host_id: hostU, name: "Lens Rules", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 600_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      D.addMember(room, "u_b", "chair", { seat_index: 1 });
      D.addMember(room, "u_c", "chair", { seat_index: 2 });
      D.addMember(room, "u_bench", "line");
      D.addMember(room, "u_watch", "spectator");
      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto("?camkit");   // feat/camera-kit-staging: lens looks exist only on a page loaded with ?camkit
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_a"), 8000, name + ": chairs render");
        await c.camkitConfigure();   // every client ships the same config in production
        return c;
      };
      const publishing = (c) => waitFor(() => c.page.evaluate(() =>
        window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 12_000, c.name + " publishing");
      const host = await boot("host", hostU);
      const A = await boot("a", "u_a");
      const B = await boot("b", "u_b");
      const C = await boot("c", "u_c");
      const W = await boot("w", "u_watch");
      await publishing(A); await publishing(B); await publishing(C);
      const all = [host, A, B, C, W];
      const requestsBy = (name) => h.camkitRequests.filter((r) => r.client === name).length;
      const everyTile = async (clients, seat) => { const out = {}; for (const c of clients) out[c.name] = await c.page.evaluate(TILE, seat); return out; };
      const badgeGone = async (clients, seat) => { for (const c of clients) await waitFor(() => c.page.evaluate((s) => !document.getElementById("rt_seat" + s).classList.contains("has-filter"), seat), 8000, c.name + ": badge gone from seat " + seat); };
      /* the real control: open the shelf, tap the look's tile */
      const tapTile = (c, look) => c.page.evaluate((look) => {
        if (!document.getElementById("rt_shelf").classList.contains("is-open")) document.getElementById("rt_filterbtn").click();
        const b = document.querySelector('#rt_shelfrack .lc-shelf__tile[data-look="' + look + '"]');
        if (!b) return { found: false };
        const amber = b.classList.contains("is-amber"); b.click();
        return { found: true, amber };
      }, look);

      /* ---------- 0. production today ---------- */
      const tap0 = await tapTile(A, "foxears");
      t.ok(tap0.found && tap0.amber, "u_a: the amber Fox Ears tile is on his shelf (the client is configured)");
      await A.page.waitForTimeout(900);
      t.ok(D.memberRow(room, "u_a").filter === null && D.memberRow(room, "u_a").filter_pick === null && D.rpcLog.some((r) => r.name === "set_filter" && r.args.name === "foxears"),
        "production today: set_filter rejects the lens slug — no field, no lock (the DDL has not been run)");
      t.ok(h.camkitRequests.length === 0 && (await A.page.evaluate(() => window.__lc.FILTER_STATE.active)) === false,
        "…and tapping the tile loaded nothing: the SDK follows the server's ROW, not the tap");
      D.allowFilterLook("foxears"); D.allowFilterLook("halo");   // from here on: the server as it will be AFTER the DDL

      /* ---------- 1. pick ---------- */
      const tap1 = await tapTile(A, "foxears");
      t.ok(tap1.found, "u_a taps the amber tile again (server widened)");
      await waitFor(() => D.memberRow(room, "u_a").filter === "foxears", 5000, "the pick to land on the server");
      t.ok(D.memberRow(room, "u_a").filter_pick === "foxears", "server row: filter='foxears', filter_pick='foxears' — the lock is set with the pick");
      await waitFor(() => A.page.evaluate(LENS_UP), 10_000, "u_a's lens to go live from the field");
      const a1 = await A.page.evaluate(PIPE);
      t.ok(a1.F.kind === "lens" && a1.trackId === a1.F.canvasTrackId && a1.customId === a1.F.canvasTrackId && a1.swaps === 1,
        `wearer: the pipeline came up as a LENS and the call publishes it — one videoSource swap (kind=${a1.F.kind}, swaps=${a1.swaps})`);
      t.ok(a1.shim.sessions.length === 1 && a1.shim.sessions[0].lens === "lens-fox" && a1.shim.sources[0].trackId === a1.F.cloneTrackId,
        "…one session, the Fox Ears lens applied, fed the wearer's clone");
      for (const c of all) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("has-filter")), 8000, c.name + ": badge on seat 0");
      const tiles1 = await everyTile(all, 0);
      t.ok(Object.values(tiles1).every((x) => x.badged && x.shown === "flex" && x.text === "FOX EARS"),
        "badge on seat 0 on EVERY client, naming the look: " + Object.entries(tiles1).map(([n, x]) => n + "=" + x.text).join(" "));
      t.ok(Object.values(tiles1).every((x) => x.paid && x.edge === "rgba(255, 194, 77, 0.8)" && x.ink === "rgb(255, 217, 138)"),
        `…and it is the design's AMBER badge on every client (edge ${tiles1.w.edge}, ink ${tiles1.w.ink})`);
      t.ok(requestsBy("a") === 1 && h.camkitRequests.length === 1,
        `ONLY the wearer's client requested the SDK — host, rivals and crowd paint the badge from the row and load nothing (${h.camkitRequests.map((r) => r.client).join(",")})`);
      const others1 = await everyTile([host, B, W], 1);
      t.ok(Object.values(others1).every((x) => !x.badged && !x.paid), "…and nobody else's tile is badged");

      /* ---------- 2. one per show ---------- */
      const p2a = await A.page.evaluate(() => window.__lc.filterPick("halo"));
      const p2b = await A.page.evaluate(() => window.__lc.filterPick("grade"));
      t.ok(p2a.ok === false && /locked for this show/.test(p2a.error) && p2b.ok === false && /locked for this show/.test(p2b.error),
        `a second pick is rejected whether amber or teal: "${p2a.error}"`);
      await A.page.waitForTimeout(500);
      const a2 = await A.page.evaluate(PIPE);
      t.ok(a2.F.active && a2.F.name === "foxears" && a2.swaps === 1 && a2.shim.sessions.length === 1, "…and the lens is undisturbed — same session, no second swap");

      /* ---------- 3. DROP ON ASK ---------- */
      for (const c of [A, host, W]) await c.page.evaluate(ARM_OBSERVER, "asked");
      await host.page.evaluate(() => window.__lc.egOpenDrawer("u_a"));
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_a", 8000, "the ask to land on u_a");
      t.ok(D.memberRow(room, "u_a").filter === null && D.memberRow(room, "u_a").filter_pick === "foxears", "server: the ask cleared his field inside itself (lock kept)");
      await waitFor(() => A.page.evaluate(CAMERA_BACK), 10_000, "u_a asked, unmasked, camera back");
      await A.page.waitForTimeout(700);
      const obs = {}; for (const c of [A, host, W]) obs[c.name] = await c.page.evaluate(() => window.__g78.stop());
      for (const [n, o] of Object.entries(obs))
        t.ok(o.v.length === 0, `${n}: across ${o.n} observed beats, NO beat where u_a is asked AND still wearing the lens (violations: ${JSON.stringify(o.v.slice(0, 2))})`);
      const a3 = await A.page.evaluate(PIPE);
      t.ok(a3.F.active === false && a3.trackId === a3.camId && a3.state === "playable", "wearer: the lens is off and the bare camera is published, playable");
      t.ok(a3.shim.sessions[0].destroyed === true && a3.shim.sources[0].trackReady === "ended" && a3.hiddenVideos === 0,
        "…the session was destroyed and the clone stopped — nothing renders behind an asked face");
      await badgeGone(all, 0);
      t.ok(true, "badge gone on every client");
      const p3 = await A.page.evaluate(() => window.__lc.filterPick("foxears"));
      t.ok(p3.ok === false && /while asked/.test(p3.error), `set_filter rejected while asked: "${p3.error}"`);

      /* ---------- 4. HOST FORCE-OFF ---------- */
      t.ok((await B.page.evaluate(() => window.__lc.filterPick("halo"))).ok === true, "u_b: picks the 'halo' lens");
      await waitFor(() => B.page.evaluate(LENS_UP), 10_000, "u_b's lens to go live");
      for (const c of all) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat1").classList.contains("has-filter--paid")), 8000, c.name + ": amber badge on seat 1");
      const hc1 = await A.page.evaluate(() => window.__lc.hostClearFilter("u_b"));
      t.ok(hc1.ok === false && /only the host/.test(hc1.error) && D.memberRow(room, "u_b").filter === "halo", `host_clear_filter from a CHAIR is rejected ("${hc1.error}"), his lens untouched`);
      const sheet = await host.page.evaluate(() => {
        document.getElementById("rt_safebtn").click();
        return [...document.querySelectorAll("#rp_filters button")].map((b) => ({ uid: b.dataset.uid, text: b.textContent }));
      });
      t.ok(sheet.length === 1 && sheet[0].uid === "u_b" && /halo/i.test(sheet[0].text), `the host's 🛡 sheet lists exactly the man wearing a lens, by its name (${JSON.stringify(sheet)})`);
      await host.page.evaluate(() => document.querySelector("#rp_filters button").click());
      await waitFor(() => D.memberRow(room, "u_b").filter === null, 5000, "the host's force-off to land");
      await waitFor(() => B.page.evaluate(CAMERA_BACK), 10_000, "u_b's camera back");
      const b4 = await B.page.evaluate(PIPE);
      t.ok(b4.shim.sessions[0].destroyed && b4.trackId === b4.camId && D.memberRow(room, "u_b").filter_pick === "halo",
        "host force-off: lens down, session destroyed, camera back; his lock stays");
      await badgeGone(all, 1);
      t.ok(requestsBy("b") === 1 && h.camkitRequests.length === 2, "…and the second wearer's client is the second (and only other) SDK request");

      /* ---------- 5. THE MOMENT ---------- */
      t.ok((await C.page.evaluate(() => window.__lc.filterPick("foxears"))).ok === true, "u_c: picks 'foxears'");
      await waitFor(() => C.page.evaluate(LENS_UP), 10_000, "u_c's lens to go live");
      for (const c of [C, host]) await c.page.evaluate(ARM_OBSERVER, "paired");
      const mo = D.rpc("c", "start_moment", { room_id: room });   // the seam on the double — the Moment is unbuilt (gate 71 block 7)
      t.ok(mo.ok === true && D.memberRow(room, "u_c").filter === null && D.memberRow(room, "u_c").filter_pick === "foxears", "moment started; server cleared his field inside the pairing (lock kept)");
      await waitFor(() => C.page.evaluate(CAMERA_BACK), 10_000, "u_c paired, unmasked, camera back");
      await C.page.waitForTimeout(600);
      const obs5 = {}; for (const c of [C, host]) obs5[c.name] = await c.page.evaluate(() => window.__g78.stop());
      for (const [n, o] of Object.entries(obs5))
        t.ok(o.v.length === 0, `${n}: across ${o.n} observed beats, NO beat where he is paired AND still wearing the lens (violations: ${JSON.stringify(o.v.slice(0, 2))})`);
      const c5 = await C.page.evaluate(PIPE);
      t.ok(c5.shim.sessions[0].destroyed && c5.F.active === false && c5.trackId === c5.camId, "the Moment stripped the lens: session destroyed, bare camera published");
      await badgeGone(all, 2);
      D.rpc("host", "end_moment", { room_id: room });

      /* ---------- 6. the bench ---------- */
      const Bn = await boot("bench", "u_bench");
      t.ok((await Bn.page.evaluate(() => window.__lc.filterPick("halo"))).ok === true, "u_bench (on the bench): picks the 'halo' lens — accepted");
      await waitFor(() => Bn.page.evaluate(() => window.__lc.CAMKIT_STATE.ready.includes("halo")), 10_000, "the bench member's SDK + lens to warm in the background");
      await Bn.page.waitForTimeout(800);
      const n6 = await Bn.page.evaluate(PIPE);
      t.ok(requestsBy("bench") === 1 && n6.K.booted === true, "bench: his pick WARMED the SDK and the lens in the background — ready before he is ever on camera");
      t.ok(n6.F.active === false && n6.swaps === 0 && n6.shim.sessions.length === 0 && n6.shim.sources.length === 0 && n6.hiddenVideos === 0,
        `…but nothing is published: no session, no source, no swap (sessions=${n6.shim.sessions.length}, swaps=${n6.swaps})`);
      D.rpc("host", "pass_member", { room_id: room, user_id: "u_a" });
      await waitFor(() => host.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("is-empty")), 8000, "seat 0 to open on the host");
      await host.page.evaluate(() => window.__lc.hostSeat("u_bench"));
      await waitFor(() => D.memberRow(room, "u_bench").role === "chair", 5000, "the promotion to land");
      await waitFor(() => Bn.page.evaluate(LENS_UP), 15_000, "the promoted man's lens to go live");
      await Bn.page.waitForTimeout(1200);
      const n6b = await Bn.page.evaluate(PIPE);
      t.ok(n6b.swaps === 1 && n6b.shim.sessions.length === 1 && requestsBy("bench") === 1,
        `promoted: the lens came up exactly ONCE — one swap, one session, no second SDK request (swaps=${n6b.swaps}, sessions=${n6b.shim.sessions.length})`);
      for (const c of [host, B, C, W, Bn]) await waitFor(() => c.page.evaluate(() => { const el = document.getElementById("rt_seat0"); return el.dataset.heartuid === "u_bench" && el.classList.contains("has-filter--paid"); }), 8000, c.name + ": amber badge on the promoted man");
      t.ok(true, "the amber badge shows on his new chair on every client");
      t.ok((await Bn.page.evaluate(() => window.__lc.filterDrop())).ok === true, "the wearer's own DROP is accepted");
      await waitFor(() => Bn.page.evaluate(CAMERA_BACK), 10_000, "his camera back after the drop");
      const n6c = await Bn.page.evaluate(PIPE);
      t.ok(n6c.shim.sessions[0].destroyed && n6c.trackId === n6c.camId && D.memberRow(room, "u_bench").filter_pick === "halo", "wearer drop: lens down, session destroyed, camera back, lock kept");
      await badgeGone([host, B, C, W, Bn], 0);

      /* ---------- 7. quiet ---------- */
      for (const c of [...all, Bn]) {
        const errs = c.errors.filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, `zero console errors on ${c.name} — ${errs.slice(0, 2).join(" | ")}`);
      }
      const leaks = h.unexpectedRequests.filter((u) => !/favicon/.test(u));
      t.ok(leaks.length === 0, `zero leaked requests — ${leaks.slice(0, 3).join(" | ")}`);
    } finally { await h.close(); }
  },
};
