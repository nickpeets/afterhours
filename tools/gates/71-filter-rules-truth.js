/* GATE 71 — filter-rules-truth: a filter is a GAME MECHANIC — who can wear
 * one, who can see that they are, and the three ways it comes off.  Ships
 * with feat/filter-rules (step 2 of 3), stacked on #83's pipeline.
 * SOURCE: design/Last Call Filters.dc.html (THE RULES), Discovery.dc C2/C3/H3.
 *
 * THE SHAPE UNDER TEST.  The look is a MEMBER FIELD the server owns:
 * room_members.filter (publishing now) + room_members.filter_pick (the one
 * pick this show — the lock).  Four doors, all RPCs; ask_question and the
 * moment's start clear the field INSIDE themselves.  Clients OBSERVE the
 * field: the wearer's client runs filterStart/filterStop (step 1) to match
 * its own row, every client paints the badge from the row.  No per-viewer
 * toggle exists anywhere.
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.  The double
 * carries the two columns and the same rejections production will have
 * (locked / asked / in a moment / a chair calling host_clear_filter), and it
 * clears the field inside its ask_question and start_moment cases — emitted
 * BEFORE the rooms row, one transaction's worth.  If the double let a client
 * clear the field on its own, every "cleared" below would be the client
 * grading its own homework.  (The Moment itself is NOT BUILT anywhere —
 * app, double or SPEC; start_moment/end_moment in the double are the seam
 * the rules need, labelled ASSUMED there.  Block 7 drives that seam
 * directly on the double, because there is no client path to drive; every
 * observation is still the real client's.)
 *
 * The claims, all through window.__lc against the real index.html:
 *   1. pick: field set on the row, badge on EVERY client's tile (wearer's
 *      own too — one face, every viewer), wearer's FILTER_STATE.active true
 *      and the call publishes the canvas track
 *   2. second pick rejected ("locked for this show"); FILTER_ROOM unchanged
 *   3. wearer drop: field cleared, badge gone everywhere, FILTER_STATE.active
 *      false, re-pick still rejected — the lock outlives the look
 *   4. host_clear_filter: rejected from a chair, works from the host — field
 *      cleared, wearer's pipeline down, badge gone
 *   5. ask_question on a wearer, through the host's real ask path: the field
 *      clears in the SAME room update as the ask — an observer wrapped round
 *      the wearer's realtime intake records NO beat where asked=true and the
 *      filter is still set; FILTER_STATE.active false; set_filter rejected
 *      while asked
 *   6. bench member picks: field set, NOTHING published, no filterStart
 *      (no canvas track, no videoSource swap); promoted to a chair: the
 *      pipeline comes up exactly once (one videoSource swap), badge shows
 *   7. moment start with one masked (him), one bare (her — no member row
 *      to clear): his field clears atomically with the pairing (no beat
 *      paired && filtered), set_filter rejected for both during; after the
 *      moment ends, still rejected — locked
 *   8. STATIC: no client code path writes the filter field to the room —
 *      gate 61's scan extended here (no room_members write of any kind, and
 *      the only doors are the three RPC names)
 *   9. zero console errors on every client
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

/* what the ROOM says on this client, per seat */
const TILES = () => {
  const out = {};
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById("rt_seat" + i);
    out[i] = { uid: el.dataset.heartuid || null, badged: el.classList.contains("has-filter"),
               text: (el.querySelector(".chair__filter-t") || {}).textContent || "",
               shown: getComputedStyle(el.querySelector(".chair__filter")).display };
  }
  return out;
};
const PIPE = () => {
  const lv = window.__lc.DAILY && window.__lc.DAILY.participants().local.tracks.video;
  const custom = window.__dailyControl && window.__dailyControl.customVideoTrack();
  const cam = window.__dailyControl && window.__dailyControl.cameraTrack();
  return { F: window.__lc.FILTER_STATE, trackId: lv && lv.track ? lv.track.id : null,
           customId: custom ? custom.id : null, camId: cam ? cam.id : null, room: window.__lc.FILTER_ROOM,
           swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0 };
};
/* an OBSERVER on a client's realtime intake + a fast sampler: after every
   push, and every 10ms besides, snapshot (asked-or-paired, my field) and
   keep any beat where both are true.  Observation only — it reads exports. */
const ARM_OBSERVER = (kind) => {
  const me = window.__lc.ME.id;
  const snap = () => {
    const r = window.__lc.CURRENT_ROOM || {};
    const inBeat = kind === "asked" ? r.spotlight_target === me : (r.moment_a === me || r.moment_b === me);
    const mine = (window.__lc.FILTER_ROOM[me] || {}).name || null;
    const s = { inBeat, filter: mine, t: performance.now() };
    window.__g71.log.push(s);
    if (inBeat && mine) window.__g71.violations.push(s);
    return s;
  };
  window.__g71 = { log: [], violations: [], stop: null };
  const orig = window.__realtimePush;
  window.__realtimePush = (evt) => { const r = orig(evt); snap(); return r; };
  const iv = setInterval(snap, 10);
  window.__g71.stop = () => { clearInterval(iv); window.__realtimePush = orig; snap(); return { n: window.__g71.log.length, v: window.__g71.violations }; };
};

module.exports = {
  name: "filter-rules",
  async run(t, ctx) {
    /* ---------- 8. STATIC: no client write of the field, ever ---------- */
    const html = ctx.html;
    const memberWrites = (html.match(/sb\.from\("room_members"\)\.(update|upsert|insert|delete)\(/g) || []).length;
    t.ok(memberWrites === 0, `no client write to room_members of any kind (${memberWrites} found) — the filter field has no client door`);
    const roomsWrites = [...html.matchAll(/sb\.from\("rooms"\)\.(?:update|upsert|insert)\(([\s\S]{0,300}?)\)/g)].map((m) => m[1]);
    t.ok(roomsWrites.every((w) => !/filter|moment_/.test(w)),
      `no raw rooms write touches filter or moment fields (${roomsWrites.length} rooms write(s) scanned)`);
    for (const name of ["set_filter", "drop_filter", "host_clear_filter"])
      t.ok((html.match(new RegExp('sb\\.rpc\\("' + name + '"', "g")) || []).length === 1, `exactly one ${name} RPC call site`);
    t.ok(!/URLSearchParams\(location\.search\)\.get\("filter"\)/.test(html),
      "the step-1 ?filter= URL opt-in is retired — the room field is the one door onto the pipeline");
    /* the reconciler is the ONLY caller of filterStart/filterStop outside the
       pipeline's own guards (watchdog, videoLeave, filterStart's own failure
       path) — nothing else in the client decides a look is on or off */
    const startCallers = [...html.matchAll(/(?<![\w.])filterStart\(/g)].length;
    t.ok(startCallers >= 2, `filterStart is referenced ${startCallers}× (declaration + reconciler)`);
    const syncBody = (html.match(/async function filterSyncOnce\(\)\{[\s\S]*?\n\}/) || [""])[0];
    t.ok(/await filterStart\(want\)/.test(syncBody) && /await filterStop\(\)/.test(syncBody),
      "filterSyncOnce starts and stops the pipeline from MY row's field and nothing else");
    const outside = html.replace(syncBody, "").replace(/async function filterStart\(name\)\{[\s\S]*?\n\}/, "")
      .replace(/async function videoLeave\(\)\{[\s\S]*?\n\}/, "").replace(/function videoWatchdog\(\)\{[\s\S]*?\n\}/, "")
      .replace(/async function applyFilter\(\)\{[\s\S]*?\n\}/, "").replace(/async function filterStop\(\)\{[\s\S]*?\n\}/, "")
      .replace(/window\.__lc\s*=\s*\{[\s\S]*$/, "")
      .replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");   // prose is not a call site
    t.ok(!/(?<![\w.])filterStart\(/.test(outside) && !/(?<![\w.])filterStop\(/.test(outside),
      "…and no other client path calls filterStart/filterStop (the URL door, the shelf, nothing)");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@rules.test" });
      ["u_a", "u_b", "u_c", "u_bench", "u_watch"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_rules", host_id: hostU, name: "Rules Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 600_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      D.addMember(room, "u_b", "chair", { seat_index: 1 });
      D.addMember(room, "u_c", "chair", { seat_index: 2 });
      D.addMember(room, "u_bench", "line");
      D.addMember(room, "u_watch", "spectator");

      const boot = async (name, uid) => {
        const c = await h.newClient(name); c.login(uid); await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_a"), 8000, name + ": chairs render");
        return c;
      };
      const publishing = async (c) => {
        await waitFor(() => c.page.evaluate(() =>
          window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 12_000, c.name + " publishing");
      };
      const host = await boot("host", hostU);
      const A = await boot("a", "u_a");
      const B = await boot("b", "u_b");
      const C = await boot("c", "u_c");
      const W = await boot("w", "u_watch");
      await publishing(A); await publishing(B); await publishing(C);
      const all = [host, A, B, C, W];
      const everyone = async (fn) => { const out = {}; for (const c of all) out[c.name] = await c.page.evaluate(fn); return out; };
      const badgedOn = (tiles, seat) => Object.entries(tiles).map(([n, t]) => [n, t[seat].badged && t[seat].shown === "flex", t[seat].text]);

      /* ---------- 1. pick ---------- */
      const p1 = await A.page.evaluate(() => window.__lc.filterPick("grade"));
      t.ok(p1.ok === true, "u_a: filterPick('grade') accepted by the server");
      const rowA = D.memberRow(room, "u_a");
      t.ok(rowA.filter === "grade" && rowA.filter_pick === "grade", `server row: filter='${rowA.filter}', filter_pick='${rowA.filter_pick}' (the lock is set with the pick)`);
      await waitFor(() => A.page.evaluate(() => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.name === "grade"), 8000, "u_a's pipeline to come up from the field");
      const a1 = await A.page.evaluate(PIPE);
      t.ok(a1.F.active && a1.trackId === a1.F.canvasTrackId && a1.customId === a1.F.canvasTrackId,
        `wearer: FILTER_STATE.active, and the call really publishes the canvas track (${a1.trackId})`);
      for (const c of all) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("has-filter")), 8000, c.name + ": badge on seat 0");
      const tiles1 = await everyone(TILES);
      const b1 = badgedOn(tiles1, 0);
      t.ok(b1.every(([, on]) => on), "badge rendered on seat 0 on EVERY client — host, wearer, both rivals, the crowd: " + b1.map(([n, on]) => n + "=" + on).join(" "));
      t.ok(b1.every(([, , txt]) => txt === "WARM GRADE"), `…naming the look (${b1[0][2]})`);
      t.ok(Object.values(tiles1).every((tl) => !tl[1].badged && !tl[2].badged), "…and on nobody else's tile");
      const rooms1 = await everyone(() => window.__lc.FILTER_ROOM);
      t.ok(Object.values(rooms1).every((r) => r.u_a && r.u_a.name === "grade" && r.u_a.locked === true && Object.keys(r).length === 1),
        "FILTER_ROOM on every client: { u_a: { name:'grade', locked:true } } and nothing else");

      /* ---------- 2. second pick ---------- */
      const p2 = await A.page.evaluate(() => window.__lc.filterPick("noir"));
      t.ok(p2.ok === false && /locked for this show/.test(p2.error), `second pick rejected by the server: "${p2.error}"`);
      await A.page.waitForTimeout(600);
      const a2 = await A.page.evaluate(PIPE);
      t.ok(a2.F.active && a2.F.name === "grade" && a2.room.u_a.name === "grade" && D.memberRow(room, "u_a").filter === "grade",
        "FILTER_ROOM and the pipeline unchanged — still 'grade'");
      const bad = await A.page.evaluate(() => window.__lc.filterPick("fox-ears"));
      t.ok(bad.ok === false, `a look outside the curated rack is rejected ("${bad.error}") — no uploads, no amber set`);

      /* ---------- 3. wearer drop ---------- */
      const d3 = await A.page.evaluate(() => window.__lc.filterDrop());
      t.ok(d3.ok === true, "u_a: filterDrop() accepted");
      t.ok(D.memberRow(room, "u_a").filter === null && D.memberRow(room, "u_a").filter_pick === "grade",
        "server row: filter cleared, filter_pick kept — the lock outlives the look");
      await waitFor(() => A.page.evaluate(() => window.__lc.FILTER_STATE.active === false), 8000, "u_a's pipeline to come down from the field");
      const a3 = await A.page.evaluate(PIPE);
      t.ok(a3.F.active === false && a3.trackId === a3.camId, `wearer: FILTER_STATE.active false, the call publishes the raw camera track again (${a3.trackId})`);
      for (const c of all) await waitFor(() => c.page.evaluate(() => !document.getElementById("rt_seat0").classList.contains("has-filter")), 8000, c.name + ": badge gone from seat 0");
      const tiles3 = await everyone(TILES);
      t.ok(Object.values(tiles3).every((tl) => !tl[0].badged && tl[0].shown === "none"), "badge gone on every client");
      const rooms3 = await everyone(() => window.__lc.FILTER_ROOM);
      t.ok(Object.values(rooms3).every((r) => r.u_a && r.u_a.name === null && r.u_a.locked === true),
        "FILTER_ROOM on every client: { u_a: { name:null, locked:true } }");
      const p3 = await A.page.evaluate(() => window.__lc.filterPick("grade"));
      t.ok(p3.ok === false && /locked for this show/.test(p3.error), `re-pick after a drop still rejected: "${p3.error}"`);
      /* the shelf tells him the same thing */
      const shelf3 = await A.page.evaluate(() => {
        document.getElementById("rt_filterbtn").click();
        const sh = document.getElementById("rt_shelf");
        return { open: sh.classList.contains("is-open"), locked: sh.classList.contains("is-locked"),
                 meta: document.getElementById("rt_shelfmeta").textContent, tiles: sh.querySelectorAll(".lc-shelf__tile").length,
                 drop: getComputedStyle(document.getElementById("rt_filterdrop")).display, cta: getComputedStyle(document.getElementById("rt_filterbtn")).display };
      });
      t.ok(shelf3.cta === "flex" && shelf3.open && shelf3.locked && /LOCKED/.test(shelf3.meta) && shelf3.tiles === 2 && shelf3.drop === "none",
        `the wearer's shelf: CTA shown, opens, reads locked ("${shelf3.meta}"), ${shelf3.tiles} free tiles, no drop control when bare`);
      await A.page.evaluate(() => document.getElementById("rt_filterbtn").click());

      /* ---------- 4. host_clear_filter ---------- */
      t.ok((await B.page.evaluate(() => window.__lc.filterPick("noir"))).ok === true, "u_b: picks 'noir'");
      await waitFor(() => B.page.evaluate(() => window.__lc.FILTER_STATE.active === true), 8000, "u_b's pipeline up");
      for (const c of all) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat1").classList.contains("has-filter")), 8000, c.name + ": badge on seat 1");
      const hc1 = await A.page.evaluate(() => window.__lc.hostClearFilter("u_b"));
      t.ok(hc1.ok === false && /only the host/.test(hc1.error), `host_clear_filter from a CHAIR is rejected: "${hc1.error}"`);
      t.ok(D.memberRow(room, "u_b").filter === "noir", "…and u_b's field is untouched");
      /* the host's door is the 🛡 sheet's extra row — drive the real control */
      const sheet = await host.page.evaluate(() => {
        document.getElementById("rt_safebtn").click();
        const rows = [...document.querySelectorAll("#rp_filters button")].map((b) => ({ uid: b.dataset.uid, text: b.textContent }));
        const head = (document.getElementById("rp_filterhead") || {}).textContent || "";
        return { rows, head };
      });
      t.ok(/FORCE A FILTER OFF/.test(sheet.head) && sheet.rows.length === 1 && sheet.rows[0].uid === "u_b" && /Noir/.test(sheet.rows[0].text),
        `the host's 🛡 sheet carries the one extra row, listing exactly the man wearing one (${JSON.stringify(sheet.rows)})`);
      const chairSheet = await A.page.evaluate(() => { document.getElementById("rt_safebtn").click(); const n = document.querySelectorAll("#rp_filters").length; document.getElementById("reportmodal").remove(); return n; });
      t.ok(chairSheet === 0, "…a chair's 🛡 sheet has no such row");
      await host.page.evaluate(() => document.querySelector("#rp_filters button").click());
      await waitFor(() => D.memberRow(room, "u_b").filter === null, 5000, "the host's force-off to land");
      t.ok(D.memberRow(room, "u_b").filter_pick === "noir", "host force-off: field cleared; his lock stays (he cannot pick again)");
      await waitFor(() => B.page.evaluate(() => window.__lc.FILTER_STATE.active === false), 8000, "u_b's pipeline down from the field");
      for (const c of all) await waitFor(() => c.page.evaluate(() => !document.getElementById("rt_seat1").classList.contains("has-filter")), 8000, c.name + ": badge gone from seat 1");
      t.ok(true, "u_b: pipeline down and badge gone on every client after the host's force-off");
      t.ok(D.rpcLog.some((r) => r.name === "host_clear_filter" && r.clientId === "host" && r.args.user_id === "u_b"), "…via the host_clear_filter RPC from the host's client (rpcLog)");

      /* ---------- 5. FORCED DROP ON ASK ---------- */
      t.ok((await C.page.evaluate(() => window.__lc.filterPick("grade"))).ok === true, "u_c: picks 'grade'");
      await waitFor(() => C.page.evaluate(() => window.__lc.FILTER_STATE.active === true), 8000, "u_c's pipeline up");
      for (const c of all) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat2").classList.contains("has-filter")), 8000, c.name + ": badge on seat 2");
      const ctaBefore = await C.page.evaluate(() => document.getElementById("rt_filterbtn").classList.contains("is-inert"));
      t.ok(ctaBefore === false, "u_c's composer CTA is live before the ask");
      for (const c of [C, host, W]) await c.page.evaluate(ARM_OBSERVER, "asked");
      await host.page.evaluate(() => window.__lc.egOpenDrawer("u_c"));   // the real ask path: preset target, then fire
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_c", 8000, "the ask to land on u_c");
      t.ok(D.rpcLog.some((r) => r.name === "ask_question" && r.args.target === "u_c"), "ask_question fired at u_c through the host's real ask path");
      t.ok(D.memberRow(room, "u_c").filter === null && D.memberRow(room, "u_c").filter_pick === "grade",
        "server: the ask cleared his field inside itself (lock kept)");
      await waitFor(() => C.page.evaluate(() => window.__lc.FILTER_STATE.active === false && window.__lc.CURRENT_ROOM.spotlight_target === "u_c"), 8000, "u_c asked and unmasked");
      await C.page.waitForTimeout(800);
      const obs = {}; for (const c of [C, host, W]) obs[c.name] = await c.page.evaluate(() => window.__g71.stop());
      for (const [n, o] of Object.entries(obs))
        t.ok(o.v.length === 0, `${n}: across ${o.n} observed beats, NO beat where u_c is asked AND still filtered — the clear rides the same room update as the ask (violations: ${JSON.stringify(o.v.slice(0, 2))})`);
      const c5 = await C.page.evaluate(PIPE);
      t.ok(c5.F.active === false && c5.trackId === c5.camId, "wearer: FILTER_STATE.active false, the raw camera track is published");
      for (const c of all) await waitFor(() => c.page.evaluate(() => !document.getElementById("rt_seat2").classList.contains("has-filter")), 8000, c.name + ": badge gone from seat 2");
      t.ok(true, "badge gone on every client the beat the spotlight landed");
      const p5 = await C.page.evaluate(() => window.__lc.filterPick("noir"));
      t.ok(p5.ok === false && /while asked/.test(p5.error), `set_filter rejected while asked: "${p5.error}"`);
      const cta5 = await C.page.evaluate(() => ({ inert: document.getElementById("rt_filterbtn").classList.contains("is-inert"), open: document.getElementById("rt_shelf").classList.contains("is-open") }));
      t.ok(cta5.inert && !cta5.open, "his composer CTA is parked (inert) and the shelf is closed while he answers");

      /* ---------- 6. the bench ---------- */
      const Bn = await boot("bench", "u_bench");
      const swaps0 = await Bn.page.evaluate(() => window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0);
      const p6 = await Bn.page.evaluate(() => window.__lc.filterPick("noir"));
      t.ok(p6.ok === true, "u_bench (on the bench): filterPick('noir') accepted — a bench member CAN pick");
      t.ok(D.memberRow(room, "u_bench").filter === "noir", "server row: field set for the bench member");
      await waitFor(() => Bn.page.evaluate(() => (window.__lc.FILTER_ROOM.u_bench || {}).name === "noir"), 8000, "the bench member's own client to observe his field");
      await Bn.page.waitForTimeout(1500);
      const b6 = await Bn.page.evaluate(PIPE);
      t.ok(b6.F.active === false && b6.F.canvasTrackId === null && b6.swaps === swaps0 && b6.customId === null,
        `bench: nothing published, so no filterStart — no canvas track, no videoSource swap (swaps=${b6.swaps})`);
      const benchCta = await Bn.page.evaluate(() => getComputedStyle(document.getElementById("rt_filterbtn")).display);
      t.ok(benchCta === "flex", "the bench member has the 🎭 FILTER control (the pick applies when he publishes)");
      /* promote: seat 0 opens (u_a passed), she seats him through her real door */
      D.rpc("host", "pass_member", { room_id: room, user_id: "u_a" });
      await waitFor(() => host.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("is-empty")), 8000, "seat 0 to open on the host");
      await host.page.evaluate(() => window.__lc.hostSeat("u_bench"));
      await waitFor(() => D.memberRow(room, "u_bench").role === "chair", 5000, "the promotion to land");
      await waitFor(() => Bn.page.evaluate(() => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.name === "noir"), 15_000, "the promoted man's pipeline to come up");
      await Bn.page.waitForTimeout(1500);
      const b6b = await Bn.page.evaluate(PIPE);
      t.ok(b6b.swaps - swaps0 === 1 && b6b.trackId === b6b.F.canvasTrackId,
        `promoted: the pipeline came up exactly ONCE (videoSource swaps +${b6b.swaps - swaps0}) and the call publishes the canvas track`);
      for (const c of [host, B, C, W, Bn]) await waitFor(() => c.page.evaluate(() => { const el = document.getElementById("rt_seat0"); return el.dataset.heartuid === "u_bench" && el.classList.contains("has-filter"); }), 8000, c.name + ": badge on the promoted man");
      t.ok(true, "badge shows on his new chair on every client");

      /* ---------- 7. THE MOMENT strips it ---------- */
      for (const c of [Bn, host]) await c.page.evaluate(ARM_OBSERVER, "paired");
      const mo = D.rpc("bench", "start_moment", { room_id: room });   // the seam: buyer + host, on the double (no client path exists — the Moment is unbuilt)
      t.ok(mo.ok === true && mo.pair[0] === "u_bench" && mo.pair[1] === hostU, `moment started for the pair [${mo.pair}] — one masked (him), one bare (her)`);
      t.ok(D.memberRow(room, "u_bench").filter === null && D.memberRow(room, "u_bench").filter_pick === "noir", "server: his field cleared inside the pairing (lock kept)");
      t.ok(!D.memberRow(room, hostU), "…her side: the host has no member row, so there is no field to clear (bare stays bare)");
      await waitFor(() => Bn.page.evaluate(() => window.__lc.FILTER_STATE.active === false && window.__lc.CURRENT_ROOM.moment_a === "u_bench"), 8000, "him paired and unmasked");
      await Bn.page.waitForTimeout(600);
      const obs7 = {}; for (const c of [Bn, host]) obs7[c.name] = await c.page.evaluate(() => window.__g71.stop());
      for (const [n, o] of Object.entries(obs7))
        t.ok(o.v.length === 0, `${n}: across ${o.n} observed beats, NO beat where he is paired AND still filtered (violations: ${JSON.stringify(o.v.slice(0, 2))})`);
      for (const c of [host, B, C, W, Bn]) await waitFor(() => c.page.evaluate(() => !document.getElementById("rt_seat0").classList.contains("has-filter")), 8000, c.name + ": badge gone on pairing");
      const p7a = await Bn.page.evaluate(() => window.__lc.filterPick("grade"));
      t.ok(p7a.ok === false && /during a moment/.test(p7a.error), `set_filter rejected for him during the moment: "${p7a.error}"`);
      const p7b = await host.page.evaluate(() => window.__lc.filterPick("grade"));
      t.ok(p7b.ok === false && /not a member/.test(p7b.error), `set_filter rejected for her during the moment (no member row): "${p7b.error}"`);
      const cta7 = await Bn.page.evaluate(() => document.getElementById("rt_filterbtn").classList.contains("is-inert"));
      t.ok(cta7 === true, "his composer CTA is parked while paired");
      D.rpc("host", "end_moment", { room_id: room });
      await waitFor(() => Bn.page.evaluate(() => !window.__lc.CURRENT_ROOM.moment_a), 8000, "the moment to end on his client");
      const p7c = await Bn.page.evaluate(() => window.__lc.filterPick("grade"));
      t.ok(p7c.ok === false && /locked for this show/.test(p7c.error), `after the moment: still rejected — locked ("${p7c.error}"); the look does not come back on its own`);
      t.ok(D.memberRow(room, "u_bench").filter === null, "…and his field stays clear");

      /* ---------- 9. quiet ---------- */
      for (const c of [...all, Bn]) {
        const errs = c.errors.filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, `zero console errors on ${c.name} — ${errs.slice(0, 2).join(" | ")}`);
      }
    } finally { await h.close(); }
  },
};
