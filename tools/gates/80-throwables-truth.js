/* GATE 80 — throwables-truth: cheers and jeers are a GAME MECHANIC — who can
 * throw, who can be hit, what a throw does and does not touch, and the ways
 * it comes off.  Ships with feat/throwables.
 * SOURCE: tools/DESIGN-throwables-and-mask.md (the ruling);
 * tools/DESIGN-throwables-server.md (the server side — RUN IN PRODUCTION
 * 2026-10-08; the double mirrors the DDL as it ran, md5s in that doc's run
 * log).
 *
 * THE SHAPE UNDER TEST.  A throw is TARGET-ROW state the server owns
 * (room_members.throw_kind / throw_at / throw_until, plus throwables_on; the
 * host's rooms.throwables_on).  Five doors, all RPCs; the thrower lives in a
 * server-only ledger.  Every device draws the overlay from the row's server
 * start/expiry through serverNow(); nothing is a timer.  The throw is a DOM
 * layer over the tile: it never touches his camera, his published track or
 * the filter pipeline.
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.  The double
 * carries the four columns, the switch, the ledger (unreadable through
 * table()), the DDL's rejections IN ORDER, the wipes inside ask_question /
 * start_moment / every role change, and the guard trigger's refusal of a
 * direct client write of a throw column.  If the double let a client wipe
 * or set a throw on its own, every "wiped" below would be the client
 * grading its own homework.  The Moment is DOUBLE ONLY (unbuilt in
 * production), as gate 71 already records.
 *
 * The claims, all through window.__lc and the real DOM against index.html:
 *   S.  STATIC: no client write of a throw column; one call site per RPC;
 *       the page's set and numbers match the double's (the server's copy);
 *       the overlay code has no face detection and no pipeline call
 *   1.  crowd can throw; chair, host, bench refused; a bench target refused;
 *       the thrower gets his counts back from the call
 *   2.  the overlay is on the target's tile on EVERY client, his self-view
 *       included; the feed says "🍅 a jeer landed" with no name; reduced
 *       motion shows the still badge
 *   3.  THE KEY GATE: his published track, his pipeline and his look are
 *       unchanged by the throw (badge still on, FILTER_STATE identical,
 *       the call still publishes the same track id, no videoSource swap)
 *   4.  a second throw while live is refused and does not charge
 *   5.  host clear mid-flight: gone everywhere; the cooldown starts AT THE
 *       WIPE (next throw "cooling down"); the wiped throw still charged
 *   6.  cooldown at EXPIRY: expired → still refused; past the cooldown →
 *       lands (the double's clock moved, the clients re-synced)
 *   7.  rations: cheers and jeers counted apart; refusals free; a third
 *       jeer refused; leave+rejoin does not refill
 *   8.  opt-out mid-show wipes what is on him and refuses new; opt back in
 *       and a throw lands again; the seat's switch paints his row
 *   9.  host switch off wipes every live throw and refuses new; on allows
 *  10.  ASK wipes — through the host's real ask path — with NO beat where
 *       he is asked and still hit; his look drops as before; pick untouched
 *  11.  the Moment (double seam): wipes both faces, refuses during
 *  12.  leaving the chair (a pass) wipes
 *  13.  a throw lands and shows with his camera off
 *  14.  a late joiner sees the remaining time only
 *  15.  CLOCK SKEW: a client 30s wrong still shows the right window
 *  16.  reduced motion off: the animation, rewound by the elapsed time
 *  17.  ANONYMITY: no other client's realtime intake or table read ever
 *       carries the thrower; the ledger is refused
 *   G.  THE ADDED RULE: a chair's own direct room_members write of a throw
 *       column, and the host's direct rooms write of the switch, are
 *       refused with the guard's words and change nothing
 *  18.  zero console errors on every client
 */
"use strict";
const { Harness } = require("../lib/harness");
const { THROW_LIMITS, THROW_KINDS, THROW_GUARD_MSG, ROOMS_THROW_GUARD_MSG } = require("../lib/backend-double");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 120));
  }
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/* what the ROOM shows on this client, per seat: the overlay's state */
const TILES = () => {
  const out = {};
  for (let i = 0; i < 3; i++) {
    const el = document.getElementById("rt_seat" + i);
    const ov = el.querySelector(".chair__throw");
    const fx = el.querySelector(".chair__throw-fx"), badge = el.querySelector(".chair__throw-badge");
    out[i] = { uid: el.dataset.heartuid || null, hit: el.classList.contains("has-throw"), kind: el.dataset.throw || "",
               cheer: el.classList.contains("has-throw--cheer"), jeer: el.classList.contains("has-throw--jeer"),
               cooling: el.classList.contains("throw-cooling"),
               shown: getComputedStyle(ov).display, fxShown: getComputedStyle(fx).display, badgeShown: getComputedStyle(badge).display,
               badge: badge.textContent, fxN: fx.querySelectorAll("i").length,
               delay: (fx.querySelector("i") || {}).style ? fx.querySelector("i").style.animationDelay : null,
               filterBadged: el.classList.contains("has-filter") };
  }
  return out;
};
const PIPE = () => {
  const lv = window.__lc.DAILY && window.__lc.DAILY.participants().local.tracks.video;
  const custom = window.__dailyControl && window.__dailyControl.customVideoTrack();
  return { F: window.__lc.FILTER_STATE, trackId: lv && lv.track ? lv.track.id : null, customId: custom ? custom.id : null,
           swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0,
           room: window.__lc.FILTER_ROOM };
};
const FEED = () => [...document.querySelectorAll("#rt_livelayer .feed")].map((e) => e.textContent);
/* an OBSERVER on a client's realtime intake + a fast sampler (gate 71's):
   keep any beat where the target is asked AND still hit */
const ARM_OBSERVER = (target) => {
  const snap = () => {
    const r = window.__lc.CURRENT_ROOM || {};
    const st = (window.__lc.THROW_ROOM || {})[target] || null;
    const s = { asked: r.spotlight_target === target, hit: !!(st && st.live), t: performance.now() };
    window.__g80.log.push(s);
    if (s.asked && s.hit) window.__g80.violations.push(s);
  };
  window.__g80 = { log: [], violations: [], stop: null };
  const orig = window.__realtimePush;
  window.__realtimePush = (evt) => { const r = orig(evt); snap(); return r; };
  const iv = setInterval(snap, 10);
  window.__g80.stop = () => { clearInterval(iv); window.__realtimePush = orig; snap(); return { n: window.__g80.log.length, v: window.__g80.violations }; };
};
/* a RECORDER of every realtime payload a client receives (anonymity) */
const ARM_RECORDER = () => {
  window.__g80rt = [];
  const orig = window.__realtimePush;
  window.__realtimePush = (evt) => { window.__g80rt.push(JSON.parse(JSON.stringify(evt))); return orig(evt); };
};

module.exports = {
  name: "throwables",
  async run(t, ctx) {
    const html = ctx.html;
    /* ---------- S. STATIC ---------- */
    const memberWrites = (html.match(/sb\.from\("room_members"\)\.(update|upsert|insert|delete)\(/g) || []).length;
    t.ok(memberWrites === 0, `no client write to room_members of any kind (${memberWrites} found) — no throw column has a client door`);
    const roomsWrites = [...html.matchAll(/sb\.from\("rooms"\)\.(?:update|upsert|insert)\(([\s\S]{0,300}?)\)/g)].map((m) => m[1]);
    t.ok(roomsWrites.every((w) => !/throw/.test(w)), `no raw rooms write touches throwables_on (${roomsWrites.length} rooms write(s) scanned)`);
    for (const name of ["throw_at", "throw_counts", "set_throwables", "host_clear_throw", "host_set_throwables"])
      t.ok((html.match(new RegExp('sb\\.rpc\\("' + name + '"', "g")) || []).length === 1, `exactly one ${name} RPC call site`);
    const cfg = (html.match(/const THROWABLES=\{[\s\S]*?\n\};/) || [""])[0];
    const pageKinds = [...cfg.matchAll(/id:"([a-z]+)",\s*cls:"(cheer|jeer)"/g)].map((m) => [m[1], m[2]]);
    t.ok(pageKinds.length === 8 && pageKinds.every(([id, cls]) => THROW_KINDS[id] === cls) && Object.keys(THROW_KINDS).length === 8,
      `the page's set is the server's set, eight kinds, same class each (${pageKinds.map((k) => k[0]).join(",")})`);
    const nums = {};
    for (const k of ["live_secs", "cooldown_secs", "cheers", "jeers"]) nums[k] = Number((cfg.match(new RegExp(k + ":(\\d+)")) || [])[1]);
    t.ok(Object.keys(nums).every((k) => nums[k] === THROW_LIMITS[k]), `the page's defaults are the server's numbers (${JSON.stringify(nums)})`);
    const section = (html.match(/THROWABLES \(feat\/throwables\) — cheers and jeers[\s\S]*?\$\("rt_throwtoggle"\)\.onclick=[\s\S]*?\n\};/) || [""])[0];
    t.ok(section.length > 2000, "the throwables section is where this gate thinks it is");
    t.ok(!/FaceDetector|faceLandmark|FaceMesh|camkit|CAMKIT|loadLens/.test(section), "no face detection and no lens in the overlay code — splats hit the glass");
    t.ok(!/filterStart|filterStop|setInputDevices|setLocalVideo|canvasTrack|applyFilter/.test(section), "the throw code never calls the pipeline or the camera");
    t.ok(/\.chair\.has-throw \.chair__throw-badge\{ display:flex; \}/.test(html) && /@media \(prefers-reduced-motion: reduce\)\{\s*\.chair\.has-throw \.chair__throw-fx\{ display:none; \}/.test(html),
      "reduced motion: the still badge replaces the animation in CSS");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@throw.test" });
      ["u_a", "u_b", "u_c", "u_bench", "u_w1", "u_w2", "u_w3", "u_late", "u_skew", "u_motion"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_throw", host_id: hostU, name: "Throw Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 600_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      D.addMember(room, "u_b", "chair", { seat_index: 1 });
      D.addMember(room, "u_c", "kept", { seat_index: 2 });
      D.addMember(room, "u_bench", "line");
      D.addMember(room, "u_w1", "spectator");
      D.addMember(room, "u_w2", "spectator");
      /* u_late / u_skew / u_motion get their rows when they boot: the double's
         clock is pushed minutes ahead below, and a row seeded now would be
         swept to 'gone' (3 min, production-faithful) before its man arrives */

      const boot = async (name, uid, opts = {}, before = null) => {
        const c = await h.newClient(name, opts); c.login(uid);
        if (before) await c.context.addInitScript(before);
        await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_a"), 8000, name + ": chairs render");
        return c;
      };
      const publishing = async (c) => waitFor(() => c.page.evaluate(() =>
        window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 12_000, c.name + " publishing");
      const resync = async (cs) => { for (const c of cs) await c.page.evaluate(() => window.__lc.syncServerClock()); };
      /* JUMP THE SERVER'S CLOCK.  The double's clock moves forward (the only
         way to cross a 10s window and a 20s cooldown without burning real
         seconds); every client re-syncs its offset, exactly as a phone would
         on its next server_now.  Every member's last_seen moves WITH the
         clock: the jumps add up to more than the 3-minute burial window
         between two real heartbeats, and a chair swept to 'gone' mid-gate is
         the harness's artefact, not the show's.  Observation of a server
         clock, not a client decision — nothing here touches a throw column. */
      const jump = async (ms, cs) => { D.clockSkew += ms; for (const m of D.members) m.last_seen = D.iso(); await resync(cs || all); };
      const host = await boot("host", hostU);
      const A = await boot("a", "u_a");
      const B = await boot("b", "u_b");
      const C = await boot("c", "u_c");
      const W1 = await boot("w1", "u_w1");
      const W2 = await boot("w2", "u_w2");
      await publishing(A); await publishing(B); await publishing(C);
      const all = [host, A, B, C, W1, W2];
      const everyone = async (fn, cs = all) => { const out = {}; for (const c of cs) out[c.name] = await c.page.evaluate(fn); return out; };
      const row = (uid) => D.memberRow(room, uid);
      const live = (uid) => D.throwLive(row(uid));
      const throwFrom = (c, target, kind) => c.page.evaluate(({ target, kind }) => window.__lc.throwAt(target, kind), { target, kind });
      const hitOnAll = async (seat, on, cs = all) => { for (const c of cs) await waitFor(() => c.page.evaluate((s) => document.getElementById("rt_seat" + s).classList.contains("has-throw"), seat).then((v) => v === on), 8000, `${c.name}: seat ${seat} ${on ? "hit" : "clear"}`); };
      for (const c of [host, W2, A]) await c.page.evaluate(ARM_RECORDER);

      /* ---------- 3 (setup). the key gate's BEFORE: u_a wears a look ---------- */
      t.ok((await A.page.evaluate(() => window.__lc.filterPick("grade"))).ok === true, "u_a: wears 'grade' before anything is thrown");
      await waitFor(() => A.page.evaluate(() => window.__lc.FILTER_STATE.active === true), 8000, "u_a's pipeline up");
      for (const c of all) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("has-filter")), 8000, c.name + ": look badge on seat 0");
      const before = await A.page.evaluate(PIPE);

      /* ---------- 1. who throws, who is hit ---------- */
      const crowdCta = await W1.page.evaluate(() => getComputedStyle(document.getElementById("rt_throwbtn")).display);
      t.ok(crowdCta === "flex", "the crowd has the 🍅 THROW control in the composer");
      t.ok((await everyone(() => getComputedStyle(document.getElementById("rt_throwbtn")).display, [host, A, C])).host === "none", "…the host does not");
      t.ok((await A.page.evaluate(() => getComputedStyle(document.getElementById("rt_throwbtn")).display)) === "none", "…a chair does not");
      await waitFor(() => W1.page.evaluate(() => !!window.__lc.THROW_COUNTS), 8000, "w1's counts from throw_counts");
      t.ok(JSON.stringify(await W1.page.evaluate(() => window.__lc.THROW_COUNTS)) === JSON.stringify({ cheers_left: 5, jeers_left: 2 }), "w1's tray reads 5 cheers · 2 jeers before his first throw (throw_counts)");
      const tray = await W1.page.evaluate(() => { document.getElementById("rt_throwbtn").click(); const tr = document.getElementById("rt_throwtray");
        return { open: tr.classList.contains("is-open"), tiles: [...tr.querySelectorAll(".lc-shelf__tile")].map((b) => b.dataset.kind), targets: [...tr.querySelectorAll(".lc-throwtray__target")].map((b) => b.dataset.uid), picked: window.__lc.THROW_TARGET, meta: document.getElementById("rt_throwmeta").textContent }; });
      t.ok(tray.open && tray.tiles.length === 8 && tray.targets.join() === "u_a,u_b,u_c" && tray.picked === "u_a" && /5 CHEERS · 2 JEERS LEFT/.test(tray.meta),
        `the tray: eight throws, the three seated men as targets (kept included), first picked, "${tray.meta}"`);
      /* the real control: pick tomato on u_a through the tray */
      await W1.page.evaluate(() => document.querySelector('#rt_throwrack [data-kind="tomato"]').click());
      await waitFor(() => live("u_a"), 5000, "w1's tomato to land on u_a");
      const r1 = row("u_a");
      t.ok(r1.throw_kind === "tomato" && r1.throw_at && Date.parse(r1.throw_until) - Date.parse(r1.throw_at) === 10_000, `server row: throw_kind='tomato', server start and a 10s expiry`);
      t.ok(D.throwLedger.length === 1 && D.throwLedger[0].thrower_id === "u_w1" && D.throwLedger[0].cls === "jeer", "the ledger (server-only) records w1's jeer");
      await waitFor(() => W1.page.evaluate(() => (window.__lc.THROW_COUNTS || {}).jeers_left === 1), 5000, "w1's counts from the call");
      t.ok(true, "the thrower gets his remaining counts back from the throw call itself (jeers_left 1)");
      const rb = await throwFrom(B, "u_a", "petals");
      t.ok(rb.ok === false && /only the crowd throws/.test(rb.error), `a CHAIR is refused: "${rb.error}"`);
      const rh = await throwFrom(host, "u_a", "petals");
      t.ok(rh.ok === false && /the host does not throw/.test(rh.error), `the HOST is refused: "${rh.error}"`);
      const Bn = await boot("bench", "u_bench");
      const rbn = await throwFrom(Bn, "u_b", "petals");
      t.ok(rbn.ok === false && /only the crowd throws/.test(rbn.error), `the BENCH is refused: "${rbn.error}"`);
      const rt = await throwFrom(W2, "u_bench", "petals");
      t.ok(rt.ok === false && /not in a chair/.test(rt.error), `a bench TARGET is refused: "${rt.error}"`);
      const rk = await throwFrom(W2, "u_w1", "petals");
      t.ok(rk.ok === false && /not in a chair/.test(rk.error), `a crowd TARGET is refused: "${rk.error}"`);
      const rx = await throwFrom(W2, "u_b", "knife");
      t.ok(rx.ok === false && /no such throw/.test(rx.error), `a throw outside the curated set is refused: "${rx.error}"`);
      t.ok(D.throwLedger.length === 1, "…and none of those refusals charged anyone");
      await Bn.close();

      /* ---------- 2. the overlay, everywhere, and the feed ---------- */
      await hitOnAll(0, true);
      const tiles2 = await everyone(TILES);
      t.ok(Object.values(tiles2).every((tl) => tl[0].hit && tl[0].kind === "tomato" && tl[0].jeer && tl[0].shown === "block"),
        "the tomato is on seat 0 on EVERY client — host, the target's own self-view, both other seats, the crowd");
      t.ok(Object.values(tiles2).every((tl) => !tl[1].hit && !tl[2].hit), "…and on nobody else's tile");
      t.ok(Object.values(tiles2).every((tl) => tl[0].badgeShown === "flex" && tl[0].fxShown === "none" && tl[0].badge === "🍅"),
        "reduced motion (the harness default): the still 🍅 badge shows and the animation does not");
      const feeds = await everyone(FEED);
      t.ok(Object.values(feeds).every((f) => f.some((l) => /🍅 a jeer landed/.test(l))), "the feed on every client: '🍅 a jeer landed'");
      t.ok(Object.values(feeds).every((f) => !f.some((l) => /u_w1|Crowd|w1/.test(l))), "…with no name on it");
      const rooms2 = await everyone(() => window.__lc.THROW_ROOM);
      t.ok(Object.values(rooms2).every((r) => r.u_a && r.u_a.live && r.u_a.kind === "tomato" && r.u_a.remainingMs > 0 && r.u_a.remainingMs <= 10_000),
        "THROW_ROOM on every client: u_a live, tomato, remaining within the window");

      /* ---------- 3. THE KEY GATE: track, pipeline, look untouched ---------- */
      await sleep(600);
      const after = await A.page.evaluate(PIPE);
      t.ok(after.trackId === before.trackId && after.customId === before.customId && after.trackId === after.F.canvasTrackId,
        `the target still publishes the SAME track (${after.trackId}) — the throw never touched his call`);
      const stable = (F) => JSON.stringify(["active", "name", "kind", "killed", "rawTrackAlive", "canvasTrackId", "canvasTrackState", "rawTrackId", "cloneTrackId", "deviceId"].map((k) => F[k]));
      t.ok(stable(after.F) === stable(before.F), "FILTER_STATE (every field but the live frame counters) is identical before and after the throw");
      t.ok(after.swaps === before.swaps, `no videoSource swap (${after.swaps})`);
      t.ok(tiles2.a[0].filterBadged && row("u_a").filter === "grade" && row("u_a").filter_pick === "grade", "his look is still on (badge + row) under the throw");

      /* ---------- 4. one live throw per chair ---------- */
      const r4 = await throwFrom(W2, "u_a", "petals");
      t.ok(r4.ok === false && /already live/.test(r4.error), `a second throw while one is live is refused: "${r4.error}"`);
      t.ok(D.throwLedger.length === 1 && D.throwCounts(room, "u_w2").cheers_left === 5, "…and it did not charge w2");
      const tray4 = await W2.page.evaluate(() => { document.getElementById("rt_throwbtn").click(); return [...document.querySelectorAll(".lc-throwtray__target")].map((b) => b.textContent); });
      t.ok(/HIT/.test(tray4[0]), `w2's tray says why: ${JSON.stringify(tray4)}`);

      /* ---------- 5. host clear mid-flight; cooldown starts AT THE WIPE ---------- */
      const sheet = await host.page.evaluate(() => { document.getElementById("rt_safebtn").click();
        return { rows: [...document.querySelectorAll("#rp_throws button")].map((b) => ({ uid: b.dataset.uid, text: b.textContent })), sw: document.getElementById("rp_throwswitch").textContent }; });
      t.ok(sheet.rows.length === 1 && sheet.rows[0].uid === "u_a" && /Clear 🍅/.test(sheet.rows[0].text) && /OFF/.test(sheet.sw),
        `the host's 🛡 sheet lists the one live throw and the show switch (${JSON.stringify(sheet)})`);
      const hcA = await A.page.evaluate(() => window.__lc.hostClearThrow("u_a"));
      t.ok(hcA.ok === false && /only the host/.test(hcA.error), `host_clear_throw from a chair is refused: "${hcA.error}"`);
      const wipeAt = D.now();
      await host.page.evaluate(() => document.querySelector("#rp_throws button").click());
      await waitFor(() => !live("u_a"), 5000, "the host's clear to land");
      const r5 = row("u_a");
      t.ok(Math.abs(Date.parse(r5.throw_until) - wipeAt) < 1500 && r5.throw_kind === "tomato", "server: throw_until = now (the wipe), kind left behind");
      await hitOnAll(0, false);
      t.ok(true, "the overlay is gone on every client");
      const r5b = await throwFrom(W2, "u_a", "petals");
      t.ok(r5b.ok === false && /cooling down/.test(r5b.error), `a throw right after the wipe is refused: "${r5b.error}" — the cooldown started at the wipe`);
      t.ok(D.throwLedger.length === 1 && D.throwCounts(room, "u_w1").jeers_left === 1, "the wiped tomato still cost w1 his jeer; the refusal cost w2 nothing");
      t.ok((await W2.page.evaluate(TILES))[0].cooling === true, "the tile says cooling on the crowd's client");
      await jump(21_000, all);          // past the 20s cooldown (the server's clock moved; the clients re-synced)
      const r5c = await throwFrom(W2, "u_a", "petals");
      t.ok(r5c.ok === true, "past the cooldown a throw lands again");
      await waitFor(() => live("u_a"), 5000, "petals live on u_a");

      /* ---------- 6. cooldown at EXPIRY ---------- */
      await jump(11_000, all);          // the petals expired on their own
      t.ok(!live("u_a") && D.throwCooling(row("u_a")), "server: expired, in the cooldown — nothing ran at expiry, it is a comparison");
      await hitOnAll(0, false);
      t.ok(true, "the overlay came off on every client at expiry (the next clock tick)");
      const r6 = await throwFrom(W1, "u_a", "petals");
      t.ok(r6.ok === false && /cooling down/.test(r6.error), `refused during the post-expiry cooldown: "${r6.error}"`);
      await jump(20_000, all);
      const r6b = await throwFrom(W1, "u_a", "confetti");
      t.ok(r6b.ok === true && r6b.cheers_left === 4, `past it, confetti lands (w1 cheers_left ${r6b.cheers_left})`);
      await waitFor(() => live("u_a"), 5000, "confetti live");
      await jump(31_000, all);          // let it run out and cool, for the blocks below

      /* ---------- 7. rations ---------- */
      t.ok((await (async () => { const r = await throwFrom(W2, "u_b", "pie"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "w2: a pie on u_b (jeer 1)");
      t.ok((await (async () => { const r = await throwFrom(W2, "u_c", "boo"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "w2: a boo on u_c, the KEPT finalist (jeer 2 — Nick #1: kept can be hit)");
      await waitFor(() => live("u_c"), 5000, "boo live on the kept man");
      await jump(31_000, all);
      const r7 = await throwFrom(W2, "u_b", "cricket");
      t.ok(r7.ok === false && /no jeers left/.test(r7.error), `w2's third jeer is refused: "${r7.error}"`);
      t.ok((await (async () => { const r = await throwFrom(W2, "u_b", "sparkle"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "…but his cheers are counted apart: sparkle lands");
      await waitFor(() => W2.page.evaluate(() => { const c = window.__lc.THROW_COUNTS; return c && c.jeers_left === 0 && c.cheers_left === 3; }), 5000, "w2's tray counts");
      const spent = await W2.page.evaluate(() => [...document.querySelectorAll("#rt_throwrack .is-spent")].map((b) => b.dataset.kind).sort().join());
      t.ok(spent === "boo,cricket,pie,tomato", `the four jeer tiles read spent on w2's tray (${spent})`);
      /* leave and rejoin: the row is deleted and recreated; the ration is the person's */
      await W2.page.evaluate(() => window.__lc.leaveRoom());
      await waitFor(() => !row("u_w2"), 5000, "w2's row gone (leave_room)");
      await W2.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await waitFor(() => row("u_w2") && row("u_w2").role === "spectator", 8000, "w2 back as a fresh spectator row");
      await waitFor(() => W2.page.evaluate(() => { const c = window.__lc.THROW_COUNTS; return c && c.jeers_left === 0 && c.cheers_left === 3; }), 8000, "w2's counts after the rejoin");
      t.ok(true, "after leave + rejoin his counts are the same (3 cheers, 0 jeers) — the ration follows the person, not the row");
      await jump(31_000, all);

      /* ---------- 8. opt-out mid-show ---------- */
      t.ok((await (async () => { const r = await throwFrom(W1, "u_b", "hearts"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "w1: hearts on u_b");
      await hitOnAll(1, true);
      const tog0 = await B.page.evaluate(() => ({ shown: getComputedStyle(document.getElementById("rt_throwtoggle")).display, text: document.getElementById("rt_throwtoggle").textContent }));
      t.ok(tog0.shown === "flex" && tog0.text === "🍅 ON", `the seat's switch reads on (${tog0.text})`);
      await B.page.evaluate(() => document.getElementById("rt_throwtoggle").click());   // the real control
      await waitFor(() => row("u_b").throwables_on === false, 5000, "u_b's opt-out to land");
      t.ok(!live("u_b"), "server: opting out wiped the hearts on him");
      await hitOnAll(1, false);
      await waitFor(() => B.page.evaluate(() => document.getElementById("rt_throwtoggle").textContent === "🚫 OFF"), 5000, "his switch to read off");
      const r8 = await throwFrom(W2, "u_b", "petals");
      t.ok(r8.ok === false && /throwables off/.test(r8.error), `a throw at him is refused: "${r8.error}"`);
      t.ok(/OPTED OUT/.test(await W2.page.evaluate(() => document.querySelectorAll(".lc-throwtray__target")[1].textContent)), "w2's tray says OPTED OUT on him");
      await B.page.evaluate(() => document.getElementById("rt_throwtoggle").click());
      await waitFor(() => row("u_b").throwables_on === true, 5000, "u_b back in");
      await jump(31_000, all);
      t.ok((await (async () => { const r = await throwFrom(W2, "u_b", "petals"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "opted back in: a throw lands again");
      await hitOnAll(1, true);

      /* ---------- 9. the host's switch ---------- */
      t.ok((await (async () => { const r = await throwFrom(W1, "u_c", "sparkle"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "w1: sparkle on u_c (two live throws now)");
      await hitOnAll(2, true);
      const hsA = await A.page.evaluate(() => window.__lc.hostSetThrowables(false));
      t.ok(hsA.ok === false && /only the host/.test(hsA.error), `host_set_throwables from a chair is refused: "${hsA.error}"`);
      await host.page.evaluate(() => { document.getElementById("rt_safebtn").click(); document.getElementById("rp_throwswitch").click(); });
      await waitFor(() => D.rooms.get(room).throwables_on === false, 5000, "the switch to land");
      t.ok(!live("u_b") && !live("u_c"), "server: off wiped EVERY live throw in the room");
      await hitOnAll(1, false); await hitOnAll(2, false);
      t.ok(true, "both overlays gone on every client");
      await jump(31_000, all);
      const r9 = await throwFrom(W1, "u_a", "petals");
      t.ok(r9.ok === false && /off for this show/.test(r9.error), `a throw while off is refused: "${r9.error}"`);
      await waitFor(() => W1.page.evaluate(() => /TURNED THROWABLES OFF/.test(document.getElementById("rt_throwmeta").textContent) && document.getElementById("rt_throwtray").classList.contains("is-blocked")), 5000, "w1's tray to read off");
      t.ok(true, "the crowd's tray reads THE HOST TURNED THROWABLES OFF");
      await host.page.evaluate(() => { document.getElementById("rt_safebtn").click(); document.getElementById("rp_throwswitch").click(); });
      await waitFor(() => D.rooms.get(room).throwables_on === true, 5000, "the switch back on");
      t.ok((await (async () => { const r = await throwFrom(W1, "u_a", "petals"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "switched back on: a throw lands");
      await hitOnAll(0, true);

      /* ---------- 10. ASK wipes, atomically, and the show rules hold ---------- */
      t.ok(row("u_a").filter === "grade", "u_a still wears his look going into the ask");
      for (const c of [A, host, W1]) await c.page.evaluate(ARM_OBSERVER, "u_a");
      await host.page.evaluate(() => window.__lc.egOpenDrawer("u_a"));   // the real ask path
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_a", 8000, "the ask to land on u_a");
      t.ok(D.rpcLog.some((r) => r.name === "ask_question" && r.args.target === "u_a"), "ask_question fired at u_a through the host's real ask path");
      t.ok(!live("u_a") && row("u_a").filter === null && row("u_a").filter_pick === "grade",
        "server: the ask wiped the throw AND dropped his look inside itself; his pick is untouched");
      await waitFor(() => A.page.evaluate(() => window.__lc.CURRENT_ROOM.spotlight_target === "u_a" && !(window.__lc.THROW_ROOM.u_a || {}).live), 8000, "u_a asked and clear");
      await sleep(800);
      const obs = {}; for (const c of [A, host, W1]) obs[c.name] = await c.page.evaluate(() => window.__g80.stop());
      for (const [n, o] of Object.entries(obs))
        t.ok(o.v.length === 0, `${n}: across ${o.n} observed beats, NO beat where u_a is asked AND still hit — the wipe rides the same member statement as the filter clear (violations: ${JSON.stringify(o.v.slice(0, 2))})`);
      await hitOnAll(0, false);
      await waitFor(() => A.page.evaluate(() => window.__lc.FILTER_STATE.active === false), 8000, "his pipeline down from the ask");
      t.ok(true, "show rules unchanged: his look dropped on ASK as before, his pick stays");
      const r10 = await throwFrom(W1, "u_a", "petals");
      t.ok(r10.ok === false && /cooling down/.test(r10.error), `right after the ask's wipe: "${r10.error}" (the cooldown started at the wipe)`);
      D.rpc("host", "clear_spotlight_target", { room_id: room });
      await jump(31_000, all);

      /* ---------- 11. the Moment (double seam) ---------- */
      D.addMember(room, "u_w3", "spectator");   // a fresh ration for the later blocks (w1 and w2 spend theirs above, on purpose)
      const W3 = await boot("w3", "u_w3"); all.push(W3);
      t.ok((await (async () => { const r = await throwFrom(W3, "u_b", "petals"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "w3: petals on u_b before the moment");
      await hitOnAll(1, true);
      const mo = D.rpc("b", "start_moment", { room_id: room });
      t.ok(mo.ok === true && !live("u_b"), "the moment's start (double only — unbuilt in production) wiped the throw on him inside the pairing");
      await hitOnAll(1, false);
      await jump(31_000, all);
      const r11 = await throwFrom(W3, "u_b", "petals");
      t.ok(r11.ok === false && /during a moment/.test(r11.error), `refused while paired: "${r11.error}"`);
      t.ok(/THE MOMENT/.test(await W3.page.evaluate(() => { document.getElementById("rt_throwbtn").click(); return document.querySelectorAll(".lc-throwtray__target")[1].textContent; })), "w3's tray says THE MOMENT on him");
      D.rpc("host", "end_moment", { room_id: room });
      await waitFor(() => W3.page.evaluate(() => !window.__lc.CURRENT_ROOM.moment_a), 8000, "the moment to end on the crowd's client");
      t.ok((await (async () => { const r = await throwFrom(W3, "u_b", "petals"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "after the moment: lands again");
      await hitOnAll(1, true);

      /* ---------- 12. leaving the chair wipes ---------- */
      await host.page.evaluate(() => window.__lc.hostPass("u_b"));
      await waitFor(() => row("u_b").role === "spectator", 5000, "u_b passed");
      t.ok(!live("u_b"), "server: the pass wiped the throw with the seat (the trigger's wipe)");
      await waitFor(() => W1.page.evaluate(() => document.getElementById("rt_seat1").classList.contains("is-empty") && !document.getElementById("rt_seat1").classList.contains("has-throw")), 8000, "seat 1 empty and clear on the crowd's client");
      t.ok(true, "seat 1 is empty and clear everywhere");
      await jump(31_000, all);

      /* ---------- 13. camera off ---------- */
      await C.page.evaluate(() => window.__lc.DAILY.setLocalVideo(false));
      await sleep(400);
      t.ok((await (async () => { const r = await throwFrom(W3, "u_c", "pie"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "w3: a pie on u_c with his camera off");
      await hitOnAll(2, true);
      t.ok((await everyone(TILES)).c[2].hit, "…it lands on whatever his tile shows, his own self-view included");
      await C.page.evaluate(() => window.__lc.DAILY.setLocalVideo(true));

      /* ---------- 14. a late joiner sees the remaining time only ---------- */
      await jump(6_000, all);            // 6s into the pie
      D.addMember(room, "u_late", "spectator");
      const L = await boot("late", "u_late");
      await waitFor(() => L.page.evaluate(() => (window.__lc.THROW_ROOM.u_c || {}).live === true), 8000, "the late joiner to see the pie");
      const late = await L.page.evaluate(() => ({ st: window.__lc.THROW_ROOM.u_c, tile: (() => { const el = document.getElementById("rt_seat2"); const i = el.querySelector(".chair__throw-fx i"); return { hit: el.classList.contains("has-throw"), delay: i ? i.style.animationDelay : null }; })() }));
      t.ok(late.tile.hit && late.st.remainingMs > 2000 && late.st.remainingMs < 5000 && late.st.elapsedMs > 5000,
        `late joiner: hit, ${Math.round(late.st.remainingMs)}ms left of 10s (elapsed ${Math.round(late.st.elapsedMs)}ms) — from the server's stamps, not a fresh ten seconds`);
      t.ok(/^-\d{4,}ms$/.test(late.tile.delay || ""), `…and the animation is rewound by the elapsed time (animation-delay ${late.tile.delay})`);
      await L.close();

      /* ---------- 15. CLOCK SKEW: a phone 30 seconds wrong ---------- */
      D.addMember(room, "u_skew", "spectator");
      const S = await boot("skew", "u_skew", {}, "(() => { const real = Date.now; Date.now = () => real() + 30000; })()");
      const off = await S.page.evaluate(() => window.__lc.SERVER_OFFSET);
      const offRef = await W1.page.evaluate(() => window.__lc.SERVER_OFFSET);   // a client with a true clock, same server
      t.ok(off - offRef < -28_000 && off - offRef > -32_000, `the skewed client measured its offset against the server: ${Math.round(off - offRef)}ms relative to a true clock`);
      await waitFor(() => S.page.evaluate(() => (window.__lc.THROW_ROOM.u_c || {}).live === true), 8000, "the skewed client to see the pie");
      const sk = await S.page.evaluate(() => ({ st: window.__lc.THROW_ROOM.u_c, hit: document.getElementById("rt_seat2").classList.contains("has-throw") }));
      t.ok(sk.hit && sk.st.remainingMs > 1000 && sk.st.remainingMs < 5000, `with its clock 30s fast it still shows the pie for the right window (${Math.round(sk.st.remainingMs)}ms left) — serverNow(), not Date.now()`);
      await jump(5_000, [...all, S]);  // the pie expires on the server
      await waitFor(() => S.page.evaluate(() => !document.getElementById("rt_seat2").classList.contains("has-throw")), 8000, "the skewed client to drop it at the server's expiry");
      t.ok(true, "…and drops it at the server's expiry, not its own");
      await S.close();
      await jump(26_000, all);

      /* ---------- 16. reduced motion OFF: the animation ---------- */
      D.addMember(room, "u_motion", "spectator");
      const M = await boot("motion", "u_motion", { reducedMotion: "no-preference" });
      t.ok((await (async () => { const r = await throwFrom(W3, "u_a", "confetti"); if (!r.ok) t.note("refused: " + r.error); return r.ok === true; })()), "w3: confetti on u_a");
      await waitFor(() => M.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("has-throw")), 8000, "the motion client to see it");
      const mt = await M.page.evaluate(TILES);
      t.ok(mt[0].fxShown === "block" && mt[0].badgeShown === "none" && mt[0].fxN === 8 && mt[0].cheer,
        `without reduced motion: the animation shows (${mt[0].fxN} falling pieces), the still badge does not`);
      const rm = (await everyone(TILES, [W1]))["w1"][0];
      t.ok(rm.fxShown === "none" && rm.badgeShown === "flex" && rm.badge === "🎉", "…while the reduced-motion client shows the 🎉 badge for the same throw");
      await M.close();

      /* ---------- 17. ANONYMITY ---------- */
      const rts = await everyone(() => window.__g80rt, [host, W2, A]);
      for (const [n, evts] of Object.entries(rts)) {
        const mem = evts.filter((e) => e.table === "room_members");
        const leak = evts.filter((e) => e.table === "throw_ledger" || JSON.stringify(e.new || {}).includes("thrower"));
        t.ok(mem.length > 0 && leak.length === 0, `${n}: ${evts.length} realtime payloads received, ${mem.length} member rows, none from the ledger and none naming a thrower`);
      }
      const ledgerRead = await W2.page.evaluate(() => sb.from("throw_ledger").select("*").then((r) => (r.error ? r.error.message : "READ " + JSON.stringify(r.data))));
      t.ok(/permission denied/.test(ledgerRead), `a crowd client's read of the ledger is refused: "${ledgerRead}"`);
      const seatedRead = await A.page.evaluate(() => sb.from("room_members").select("*").eq("room_id", window.__lc.CURRENT_ROOM.id).in("role", ["chair", "kept"]).then((r) => JSON.stringify(r.data)));
      t.ok(!/thrower|u_w1|u_w2/.test(seatedRead), "the seated read (the client's one direct room_members SELECT) carries no thrower");

      /* ---------- G. THE ADDED RULE: no direct write of a throw column ---------- */
      const wipeTry = await A.page.evaluate(() => sb.from("room_members").update({ throw_until: new Date().toISOString() }).eq("room_id", window.__lc.CURRENT_ROOM.id).eq("user_id", "u_a").then((r) => (r.error ? r.error.message : "ACCEPTED")));
      t.ok(wipeTry === THROW_GUARD_MSG, `a chair's own direct wipe is refused with the trigger's words: "${wipeTry}"`);
      t.ok(live("u_a"), "…and his row is unchanged (the confetti is still live)");
      const setTry = await A.page.evaluate(() => sb.from("room_members").update({ throw_kind: "pie", throw_at: new Date().toISOString(), throw_until: new Date(Date.now() + 3600e3).toISOString() }).eq("user_id", "u_a").then((r) => (r.error ? r.error.message : "ACCEPTED")));
      t.ok(setTry === THROW_GUARD_MSG && row("u_a").throw_kind === "confetti", `a direct SET of a throw is refused the same way; kind still '${row("u_a").throw_kind}'`);
      const optTry = await A.page.evaluate(() => sb.from("room_members").update({ throwables_on: false }).eq("user_id", "u_a").then((r) => (r.error ? r.error.message : "ACCEPTED")));
      t.ok(optTry === THROW_GUARD_MSG && row("u_a").throwables_on === true, "a direct opt-out write is refused; the switch is a function's alone");
      const roomTry = await host.page.evaluate(() => sb.from("rooms").update({ throwables_on: false }).eq("id", window.__lc.CURRENT_ROOM.id).then((r) => (r.error ? r.error.message : "ACCEPTED")));
      t.ok(roomTry === ROOMS_THROW_GUARD_MSG && D.rooms.get(room).throwables_on === true, `the host's direct write of the show switch is refused: "${roomTry}"`);

      /* ---------- 18. quiet ---------- */
      for (const c of all) t.ok(c.errors.length === 0, `${c.name}: zero console errors (${c.errors.slice(0, 2).join(" | ")})`);
      t.ok(h.unexpectedRequests.length === 0, "no network egress");
    } finally { await h.close(); }
  },
};
