/* GATE 89 — combos-reaction: three of the crowd make a STANDING OVATION or a
 * BOOED OFF, and a throw in his reaction window counts double (ruling 10/11,
 * items 3 and 4; feat/combos-reaction).
 *
 * THE RULE THAT CHANGES.  Until now a chair with a live throw refused every
 * other throw.  Now, while a throw is live, a SAME-polarity throw from a
 * DIFFERENT crowd member inside the combo window (5s from the landing) is
 * accepted as a JOIN: charged to that thrower, counted toward the combo, and
 * it does not restart or stack the overlay.  At 3 the combo fires, once:
 * cheers are a STANDING OVATION (a room-wide effect and +1 heart to him),
 * jeers are BOOED OFF (a banner over his tile and a nudge to the HOST alone).
 * Neither has any automatic consequence.  For 6s after his answer ends every
 * throw at him counts double — cracks, mends and the combo — and is still
 * charged once.  The throwers stay anonymous: the room sees a count.
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.  The double's
 * throw_at mirrors the SQL in tools/DESIGN-combos-server.md statement for
 * statement (the same refusals in the same order, the join, the count, the
 * once-only fire, the heart with no sender, the window's weight and its
 * waived cooldown), carries throw_n / throw_combo_at on the member row and
 * react_user / react_until on the rooms row, opens the window where its
 * phase leaves 'spotlight' with a man on the clock, and refuses a client's
 * direct write of any of the four columns in the guards' words.
 * WHAT IT FAKES: time (the double's clock is jumped, the pages re-sync to
 * it); the answer's end (the double walks spotlight -> openfloor on
 * skip_phase / advance_phase as production does, but through setPhase, not
 * engine_set_phase); and four of the throwers are sessions with no browser
 * (their throws reach every page through the same realtime rows).  The SQL's
 * own behaviour — the md5 guards, the row locks, the undo — is proven by the
 * dry run recorded in DESIGN-combos-server.md, not here.
 *
 * The claims, through window.__lc and the real DOM against index.html:
 *   S.  STATIC: the page's six numbers are the server's; no client write of
 *       the four columns; the painters make no server call and roll no dice;
 *       the design doc carries the SQL, its md5 guards and the undo
 *   1.  a throw lands as before: count 1, no badge
 *   2.  THE JOIN: a second crowd member's same-polarity throw, through the
 *       real tray, is accepted while the first is live — the count goes to 2
 *       on every client and the overlay does NOT restart; two throwers do
 *       not fire a combo
 *   3.  the SAME thrower again is refused and not charged, however often
 *   4.  the OPPOSITE polarity while live is refused; the tray refuses first
 *   5.  the third different thrower fires it: STANDING OVATION on every
 *       client, the same frame on two phones, a card without the burst under
 *       reduced motion — and exactly ONE heart, with no sender
 *   6.  a fourth joiner is charged and counted; the combo does not fire again
 *   7.  ANONYMITY: nothing the server sent names a thrower
 *   8.  rations: every accepted throw charged once
 *   9.  the effect ends on the server's clock; then his cooldown
 *  10.  the combo window closes at 5s though the throw is live to 10s
 *  11.  BOOED OFF: the banner on his tile on every client; the nudge on the
 *       HOST and nobody else; no heart, no call, he keeps his chair
 *  12.  THE REACTION WINDOW opens when her skip ends his answer: "react now"
 *       on his tile on every client and in the tray, nobody else's
 *  13.  in it one jeer is 2 cracks and 2 toward the combo, charged once; two
 *       throwers make a combo; a rose mends double; his cooldown is waived
 *  14.  it EXPIRES: the cue goes, a throw counts once, the cooldown is back
 *  15.  the clock running out (advance_phase) opens the same window
 *  16.  THE ADDED RULE: direct writes of the four columns are refused
 *  17.  the key gate: through all of it he publishes the same track
 *  18.  zero console errors
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Harness } = require("../lib/harness");
const { THROW_LIMITS, THROW_GUARD_MSG, CROWN_BLOCK_MSG, ROOMS_REACT_GUARD_MSG } = require("../lib/backend-double");

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

/* what one seat shows on this client */
const SEAT = (i) => {
  const el = document.getElementById("rt_seat" + i), badge = el.querySelector(".chair__combo"), booed = el.querySelector(".chair__booed"), cue = el.querySelector(".chair__react");
  const fx = window.__lc.THROW_FX[i];
  return { uid: el.dataset.heartuid || null, combo: Number(el.dataset.combo || 0),
    badgeShown: badge ? getComputedStyle(badge).display : "none", badge: badge ? badge.textContent : "",
    booed: el.classList.contains("is-booed"), booedShown: booed ? getComputedStyle(booed).display : "none", booedText: booed ? booed.textContent : "",
    booedAnim: booed ? getComputedStyle(booed.firstChild).animationName : "none",
    ovation: el.classList.contains("is-ovation"),
    react: el.classList.contains("is-react"), cueShown: cue ? getComputedStyle(cue).display : "none", cue: cue ? cue.textContent : "",
    cueAnim: cue ? getComputedStyle(cue).animationName : "none",
    hit: el.classList.contains("has-throw"), kind: el.dataset.throw || "", fxAt: fx ? fx.at : null, fxKey: fx ? fx.key : null,
    hearts: Number((el.querySelector(".chair__hearts-n") || {}).textContent || 0),
    cracks: Number(el.dataset.cracks || 0) };
};
const OVATION = () => {
  const el = document.getElementById("rt_ovation"), cv = el && el.querySelector("canvas");
  let ink = 0;
  if (cv && cv.width) { const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) ink++; }
  return { on: !!(el && el.classList.contains("is-on")), shown: el ? getComputedStyle(el).display : "none", text: el ? el.textContent : "", ink,
    canvasShown: cv ? getComputedStyle(cv).display : "none", w: cv ? cv.width : 0, h: cv ? cv.height : 0,
    cardAnim: el ? getComputedStyle(el.querySelector(".lc-ovation__card")).animationName : "none" };
};
const FEED = () => [...document.querySelectorAll("#rt_livelayer .feed")].map((e) => e.textContent);
const TRAY = () => { const tr = document.getElementById("rt_throwtray"); if (!tr.classList.contains("is-open")) document.getElementById("rt_throwbtn").click();
  return [...document.querySelectorAll(".lc-throwtray__target")].map((b) => b.textContent); };
const PIPE = () => {
  const lv = window.__lc.DAILY && window.__lc.DAILY.participants().local.tracks.video;
  return { active: window.__lc.FILTER_STATE.active, trackId: lv && lv.track ? lv.track.id : null,
    swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0 };
};

module.exports = {
  name: "combos-reaction",
  async run(t, ctx) {
    const html = ctx.html;
    /* ---------- S. STATIC ---------- */
    const cfg = (html.match(/const THROWABLES=\{[\s\S]*?\n\};/) || [""])[0];
    const num = (k) => Number((cfg.match(new RegExp(k + ":(\\d+)")) || [])[1]);
    const KEYS = ["combo_secs", "combo_n", "combo_fx_secs", "ovation_hearts", "react_secs", "react_mult"];
    t.ok(KEYS.every((k) => num(k) === THROW_LIMITS[k]), `the page's six numbers are the server's (${KEYS.map((k) => k + " " + num(k)).join(", ")})`);
    t.ok(new RegExp('\\["live_secs","cooldown_secs","cheers","jeers","cracks_to_shatter","rose_mends",' + KEYS.map((k) => '"' + k + '"').join(",") + "\\]").test(html),
      "…and throw_counts() overwrites all six from throw_limits(): the server is the referee");
    const writes = (html.match(/sb\.from\("(?:room_members|rooms)"\)\.(?:update|upsert|insert)\(([\s\S]{0,300}?)\)/g) || []).join(" ");
    t.ok(!/throw_n|throw_combo_at|react_user|react_until/.test(writes), "no client write of throw_n, throw_combo_at, react_user or react_until anywhere in the page");
    const combo = (html.match(/CROWD COMBOS AND THE REACTION WINDOW \(ruling 10\/11, items 3 and 4\) ----[\s\S]*?\n\/\* ---- THE WIRE/) || [""])[0];
    t.ok(combo.length > 3000 && !/sb\.rpc\(|sb\.from\(|Math\.random/.test(combo), "the combo and window painters make no server call and roll no dice — they draw what the rows say");
    t.ok(/else if\(AMHOST\)\{/.test(combo) && (combo.match(/The room is booing/g) || []).length === 2, "the booing nudge is written once, behind AMHOST (a feed line and a toast)");
    const doc = fs.readFileSync(path.join(__dirname, "..", "DESIGN-combos-server.md"), "utf8");
    t.ok(["create or replace function public.throw_at(", "rooms_overlay_round", "2d89b8e0fff960634f280523015ed916", "f1ac023562851e459c0ec07027cc2929", "ea08f4f65a326fa485c0864c1e81baa1",
      "REFUSE ON DRIFT", "UNDO", "NOT RUN IN PRODUCTION"].every((x) => doc.includes(x)),
      "tools/DESIGN-combos-server.md carries the SQL, the md5s it is guarded by, the undo, and says it has not run");
    t.ok(doc.includes(ROOMS_REACT_GUARD_MSG) && doc.includes(CROWN_BLOCK_MSG) && doc.includes(THROW_GUARD_MSG) && doc.includes("'a throw is already live'"), "the double's refusals are the SQL's words, letter for letter");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@combo.test" });
      [["u_a", "Dex"], ["u_b", "Marco"], ["u_c", "Sam"]].forEach(([id, name]) => D.addUser({ id, name }));
      const CROWD = ["u_w1", "u_w2", "u_w3", "u_w4", "u_still", "u_x5", "u_x6", "u_x7", "u_x8"];
      CROWD.forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_combo", host_id: hostU, name: "Combo Night", phase: "openfloor", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_000_000);
      ["u_a", "u_b", "u_c"].forEach((u, i) => D.addMember(room, u, "chair", { seat_index: i }));
      CROWD.forEach((u) => D.addMember(room, u, "spectator"));
      ["x5", "x6", "x7", "x8"].forEach((n) => D.loginClient(n, "u_" + n));   // four throwers with no browser: their throws reach the pages as rows
      const MOTION = { reducedMotion: "no-preference" };
      const boot = async (name, uid, opts = {}) => {
        const c = await h.newClient(name, opts); c.login(uid);
        await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_a"), 8000, name + ": chairs render");
        return c;
      };
      const host = await boot("host", hostU, MOTION);
      const A = await boot("a", "u_a", MOTION);
      const W1 = await boot("w1", "u_w1", MOTION);
      const W2 = await boot("w2", "u_w2", MOTION);
      const W3 = await boot("w3", "u_w3", MOTION);
      const W4 = await boot("w4", "u_w4", MOTION);
      const R = await boot("still", "u_still");           // the harness default: reduced motion
      const all = [host, A, W1, W2, W3, W4, R], movers = [host, A, W1, W2, W3, W4];
      const each = async (fn, cs = all, arg) => { const out = {}; for (const c of cs) out[c.name] = await c.page.evaluate(fn, arg); return out; };
      const row = (uid) => D.memberRow(room, uid);
      const rm = () => D.rooms.get(room);
      const throwFrom = (c, target, kind) => c.page.evaluate(({ target, kind }) => window.__lc.throwAt(target, kind), { target, kind });
      const throwAs = (name, target, kind) => { try { return D.rpc(name, "throw_at", { room_id: room, target, kind }); } catch (e) { return { ok: false, error: String(e.message) }; } };
      const jump = async (ms) => {
        D.clockSkew += ms;
        for (const m of D.members) m.last_seen = D.iso();
        for (const r of D.rooms.values()) if (r.status === "live") r.host_seen_at = D.iso();
        for (const c of all) await c.page.evaluate(() => window.__lc.syncServerClock());
      };
      const seatIs = async (seat, pred, what, cs = all) => { for (const c of cs) await waitFor(() => c.page.evaluate(SEAT, seat).then(pred), 8000, `${c.name}: ${what}`); };
      const hearts = (uid) => D.events.filter((e) => e.room_id === room && e.type === "heart" && e.payload && e.payload.target === uid);
      const ledger = () => D.throwLedger.length;
      const left = (uid) => D.throwCounts(room, uid);
      /* WHAT THIS FAKES: the 5s combo window is real time on the double's clock, and a loaded machine can spend
         more than that between two steps of this gate.  Before a step that must fall inside the window the
         double's clock is wound BACK so the live throw is half a second old again (and every page re-syncs). */
      const young = async (uid) => { const el = D.now() - Date.parse(row(uid).throw_at); if (el > 1200) await jump(-(el - 500)); };
      const pipeA0 = await A.page.evaluate(PIPE);

      /* ---------- 1. a throw lands as before ---------- */
      const l1 = await throwFrom(W1, "u_a", "hearts");
      t.ok(l1.ok === true && l1.joined === false && row("u_a").throw_n === 1 && row("u_a").throw_combo_at === null, "w1's heart burst lands on Dex as it always did: count 1, no combo");
      await seatIs(0, (s) => s.hit && s.kind === "hearts", "the heart burst on Dex");
      const s1 = await each(SEAT, all, 0);
      t.ok(Object.values(s1).every((s) => s.combo === 1 && s.badgeShown === "none" && !s.ovation && !s.booed), "every client: one thrower, no count badge, no banner");
      const first = { at: row("u_a").throw_at, until: row("u_a").throw_until, fx: s1.w3.fxAt, key: s1.w3.fxKey };

      /* ---------- 2. THE JOIN ---------- */
      await young("u_a");
      const tray2 = await W2.page.evaluate(TRAY);
      t.ok(/Dex/.test(tray2[0]) && /JOIN THE CHEER/.test(tray2[0]), `w2's tray offers the join while it is live: ${JSON.stringify(tray2)}`);
      const rpc2 = D.rpcLog.length;
      await W2.page.evaluate(() => { document.querySelector('.lc-throwtray__target[data-uid="u_a"]').click(); document.querySelector('#rt_throwrack [data-kind="confetti"]').click(); });
      await waitFor(() => row("u_a").throw_n === 2, 5000, "w2's confetti to join");
      t.ok(D.rpcLog.slice(rpc2).filter((r) => r.name === "throw_at" && r.clientId === "w2").length === 1 && ledger() === 2,
        "w2's confetti through the real tray is ACCEPTED while w1's heart burst is live: a different kind, the same polarity — a join, charged to him");
      t.ok(row("u_a").throw_at === first.at && row("u_a").throw_until === first.until && row("u_a").throw_kind === "hearts", "the server row: the count is 2 and the throw itself has not moved (same stamp, same end, same kind)");
      await seatIs(0, (s) => s.combo === 2 && s.badgeShown === "block", "the count ×2 on Dex");
      const s2 = await each(SEAT, all, 0);
      t.ok(Object.values(s2).every((s) => s.badge === "×2" && s.kind === "hearts"), "every client shows the count ×2 on his tile — host, his own self-view, the crowd, the reduced-motion phone");
      t.ok(s2.w3.fxAt === first.fx && s2.w3.fxKey === first.key && s2.w1.fxAt === first.fx, "the overlay did NOT restart or stack: every phone is still drawing the first throw from its own stamp");
      t.ok(row("u_a").throw_combo_at === null && hearts("u_a").length === 0 && Object.values(await each(OVATION)).every((o) => !o.on), "TWO throwers do not fire a combo: no ovation, no heart");

      /* ---------- 3. the same thrower again ---------- */
      const again = [await throwFrom(W1, "u_a", "sparkle"), await throwFrom(W1, "u_a", "confetti"), await throwFrom(W2, "u_a", "petals")];
      t.ok(again.every((r) => r.ok === false && /already live/.test(r.error)) && row("u_a").throw_n === 2 && ledger() === 2,
        `the SAME thrower again — w1 twice more, w2 once more — is refused ("${again[0].error}") and not charged: one man cannot make a crowd`);
      const tray3 = await W1.page.evaluate(TRAY);
      t.ok(/HIT/.test(tray3[0]), `…and his own tray says so: ${JSON.stringify(tray3)}`);

      /* ---------- 4. the opposite polarity ---------- */
      const opp = await throwFrom(W3, "u_a", "tomato");
      t.ok(opp.ok === false && /already live/.test(opp.error) && ledger() === 2 && left("u_w3").jeers_left === 2, `an OPPOSITE-polarity throw while it is live is refused as before ("${opp.error}"), uncharged`);
      const rpc4 = D.rpcLog.length;
      const toast4 = await W3.page.evaluate(() => { const tr = document.getElementById("rt_throwtray"); if (!tr.classList.contains("is-open")) document.getElementById("rt_throwbtn").click();
        document.querySelector('.lc-throwtray__target[data-uid="u_a"]').click(); document.querySelector('#rt_throwrack [data-kind="boo"]').click(); return document.getElementById("toast").textContent; });
      t.ok(/a cheer is on him/.test(toast4) && D.rpcLog.slice(rpc4).filter((r) => r.name === "throw_at").length === 0, `…and the tray refuses a jeer first, without a call ("${toast4}")`);

      /* ---------- 5. STANDING OVATION ---------- */
      await young("u_a");
      const heartsBefore = (await each(SEAT, [W4], 0)).w4.hearts;
      await W3.page.evaluate(() => document.querySelector('#rt_throwrack [data-kind="sparkle"]').click());
      await waitFor(() => row("u_a").throw_combo_at, 5000, "the combo to fire");
      const firedAt = Date.parse(row("u_a").throw_combo_at);
      t.ok(row("u_a").throw_n === 3 && ledger() === 3, "the THIRD different thrower (w3's sparkle) fires the combo on the server: count 3, combo stamped");
      const hv = hearts("u_a");
      t.ok(hv.length === 1 && hv[0].user_id === null && hv[0].payload.ovation === true, "…and Dex gets +1 heart: ONE room event, type heart, his id as target — and NO sender");
      for (const c of all) await waitFor(() => c.page.evaluate(OVATION).then((o) => o.on), 8000, c.name + ": the ovation");
      const ov = await each(OVATION);
      t.ok(Object.values(ov).every((o) => o.shown === "flex" && /STANDING OVATION/.test(o.text) && /Dex/.test(o.text) && /\+1/.test(o.text)), "STANDING OVATION across the room on EVERY client, with his name and the +1");
      for (const c of all) await waitFor(() => c.page.evaluate(SEAT, 0).then((s) => s.hearts === heartsBefore + 1 && s.ovation), 8000, c.name + ": his heart and the gold frame");
      t.ok(true, `every client: his heart count went ${heartsBefore} → ${heartsBefore + 1} and his frame is lit`);
      for (const c of movers) await c.page.evaluate(() => window.__lc.throwFreeze(900));
      const frz = await each(() => { const cv = document.querySelector("#rt_ovation canvas"); return { url: cv.toDataURL().length + ":" + cv.toDataURL().slice(-64), w: cv.width, h: cv.height, t: window.__lc.COMBO_ROOM.ovation && window.__lc.COMBO_ROOM.ovation.t }; }, [W1, W2, W4]);
      const ovInk = await each(OVATION, movers);
      for (const c of movers) await c.page.evaluate(() => window.__lc.throwFreeze(null));
      t.ok(Object.values(ovInk).every((o) => o.ink > 400 && o.canvasShown === "block"), `motion phones: a burst of confetti behind the card (${ovInk.w1.ink} inked pixels)`);
      t.ok(frz.w1.w === frz.w2.w && frz.w1.url === frz.w2.url && frz.w1.url === frz.w4.url, "…the SAME frame on three crowd phones: seeded from his combo, timed from the server's stamp");
      t.ok(ov.still.on && ovInk.w1.cardAnim === "lc-ovation" && ov.still.cardAnim === "none" && ov.still.ink === 0 && ov.still.canvasShown === "none",
        "reduced motion: the card, still — no burst drawn, nothing animated");
      const feed5 = await each(FEED);
      t.ok(Object.values(feed5).every((f) => f.filter((x) => /STANDING OVATION for Dex/.test(x)).length === 1), "the feed says it once on every client: STANDING OVATION for Dex · +1 ♥");
      t.ok(Object.values(await each(() => window.__lc.COMBO_NUDGES.length)).every((n) => n === 0), "an ovation nudges nobody");

      /* ---------- 6. a fourth joiner ---------- */
      await young("u_a");
      const j4 = await throwFrom(W4, "u_a", "petals");
      t.ok(j4.ok === true && j4.joined === true && j4.n === 4 && ledger() === 4, "a fourth joiner (w4, inside the window) is accepted, charged and counted: ×4");
      await sleep(600);
      t.ok(hearts("u_a").length === 1 && Date.parse(row("u_a").throw_combo_at) === firedAt, "…but the combo fires ONCE: still exactly one ovation heart, the same stamp");
      t.ok(Object.values(await each(FEED)).every((f) => f.filter((x) => /STANDING OVATION/.test(x)).length === 1), "…and no client announces it twice");

      /* ---------- 7. anonymity ---------- */
      const sent = JSON.stringify({ rows: D.members.filter((m) => m.room_id === room && (m.role === "chair" || m.role === "kept")), events: D.events.filter((e) => e.room_id === room), room: rm() });
      t.ok(!/u_w[1-4]|u_x[5-8]|u_still/.test(sent), "ANONYMITY: no thrower's id is on any chair's row, on the rooms row or in any room event — the room has a count, never a name");
      t.ok(!/thrower|u_w1|u_w2|u_w3/.test(JSON.stringify(j4)) && Object.keys(j4).sort().join(",") === "at,cheers_left,cls,combo,counted,jeers_left,joined,kind,n,ok,until",
        `what throw_at hands the joiner back names nobody (${Object.keys(j4).sort().join(", ")})`);
      t.ok(!/u_w[1-4]|u_x[5-8]/.test(JSON.stringify(await host.page.evaluate(() => window.__lc.COMBO_ROOM))), "…and nothing the HOST's page holds about the combo names one either");

      /* ---------- 8. rations ---------- */
      t.ok(["u_w1", "u_w2", "u_w3", "u_w4"].every((u) => left(u).cheers_left === 4 && left(u).jeers_left === 2), "rations: four accepted throws, each charged once to its own thrower; the refused ones cost nothing");

      /* ---------- 9. the effect ends on the server's clock ---------- */
      await jump(THROW_LIMITS.combo_fx_secs * 1000 + 300);
      for (const c of all) await waitFor(() => c.page.evaluate(OVATION).then((o) => !o.on), 8000, c.name + ": the ovation to end");
      t.ok(Object.values(await each(SEAT, all, 0)).every((s) => !s.ovation && s.hit), "four seconds on (server time) the ovation is over on every client; the throw itself is still live");
      await jump(7000);
      await seatIs(0, (s) => !s.hit && s.combo === 0 && s.badgeShown === "none", "Dex's throw to end");
      const cool9 = await throwFrom(W4, "u_a", "hearts");
      t.ok(cool9.ok === false && /cooling down/.test(cool9.error), `when the live throw ends his cooldown starts, as before ("${cool9.error}")`);

      /* ---------- 10. the window closes at 5s ---------- */
      const b1 = throwAs("x5", "u_b", "tomato");
      t.ok(b1.ok === true && row("u_b").cracks === 1, "(a tomato lands on Marco)");
      await jump(THROW_LIMITS.combo_secs * 1000 + 500);
      const late = await throwFrom(W2, "u_b", "boo");
      t.ok(late.ok === false && /already live/.test(late.error) && row("u_b").throw_n === 1 && row("u_b").cracks === 1 && left("u_w2").jeers_left === 2,
        "5.5s in, the combo window has closed: a same-polarity throw is refused again though the tomato is still live");
      const tray10 = await W2.page.evaluate(TRAY);
      t.ok(/Marco/.test(tray10[1]) && /HIT/.test(tray10[1]), `…and the tray says HIT, not JOIN: ${JSON.stringify(tray10)}`);

      /* ---------- 11. BOOED OFF ---------- */
      const rpc11 = D.rpcLog.length, ev11 = D.events.length;
      const c1 = throwAs("x5", "u_c", "pie"), c2 = throwAs("x6", "u_c", "boo");
      t.ok(c1.ok && c2.ok && c2.joined === true && row("u_c").throw_n === 2 && row("u_c").cracks === 2 && row("u_c").throw_combo_at === null, "two jeers from two throwers on Sam: joined, 2 cracks (a join is a landed jeer), no combo");
      await seatIs(2, (s) => s.combo === 2 && !s.booed, "×2 on Sam, no banner");
      const c3 = throwAs("x7", "u_c", "cricket");
      t.ok(c3.ok && c3.combo === true && row("u_c").throw_combo_at && row("u_c").cracks === 3, "the third different jeer fires it on the server — and his frame is at 3 cracks");
      await seatIs(2, (s) => s.booed && s.booedShown === "flex", "BOOED OFF on Sam");
      const s11 = await each(SEAT, all, 2);
      t.ok(Object.values(s11).every((s) => /BOOED OFF/.test(s.booedText) && s.badge === "×3" && s.cracks === 3), "BOOED OFF: the banner is over his tile on EVERY client, with the count ×3 and the shattered frame");
      t.ok(s11.w1.booedAnim === "lc-booed" && s11.still.booedAnim === "none", "the banner stamps down on motion phones and simply appears under reduced motion");
      await sleep(400);
      const nudges = await each(() => ({ n: window.__lc.COMBO_NUDGES, feed: [...document.querySelectorAll("#rt_livelayer .feed")].map((e) => e.textContent).filter((x) => /booing/.test(x)), toast: document.getElementById("toast").textContent }));
      t.ok(nudges.host.n.length === 1 && nudges.host.n[0].uid === "u_c" && nudges.host.feed.length === 1 && /The room is booing Sam/.test(nudges.host.feed[0]) && /The room is booing Sam/.test(nudges.host.toast),
        `the HOST is nudged, once: "${nudges.host.feed[0]}"`);
      t.ok(all.filter((c) => c !== host).every((c) => nudges[c.name].n.length === 0 && nudges[c.name].feed.length === 0 && !/booing/.test(nudges[c.name].toast)),
        "…and NOBODY ELSE is: not Sam, not the crowd — the nudge is hers alone");
      t.ok(hearts("u_c").length === 0 && D.events.slice(ev11).length === 0 && row("u_c").role === "chair" && D.rpcLog.slice(rpc11).filter((r) => /^(pass_member|keep_member|timeout_member|decide_|step_down|skip_phase|ask_question|host_|end_|start_|reset_)/.test(r.name)).length === 0,
        "NO automatic consequence: no heart, no room event, and no client called anything that moves the show — Sam keeps his chair; it informs her, she decides");
      t.ok(Object.values(await each(OVATION)).every((o) => !o.on), "…and a booing is not an ovation: no room-wide effect");

      /* ---------- 12. THE REACTION WINDOW opens ---------- */
      await jump(40_000);   // every throw and cooldown over
      const r0 = rm(); r0.phase = "spotlight"; r0.phase_deadline = null; r0.spotlight_target = null; r0.round = 0; D.emit("rooms", "UPDATE", { ...r0 });   // (awaiting her question)
      for (const m of D.members) if (m.room_id === room && m.cracks) { m.cracks = 0; D.emit("room_members", "UPDATE", { ...m }); }                      // (clean frames)
      D.rpc("host", "skip_phase", { room_id: room });
      t.ok(rm().react_user === null, "she skips a spotlight nobody was asked in: no window opens");
      const r1 = rm(); r1.phase = "spotlight"; r1.phase_deadline = null; r1.spotlight_target = null; r1.round = 0; D.emit("rooms", "UPDATE", { ...r1 });
      D.rpc("host", "ask_question", { room_id: room, question_id: 1, target: "u_a" });
      t.ok(rm().spotlight_target === "u_a" && rm().react_user === null, "(she asks Dex: he is on the clock, no window yet)");
      const during = throwAs("x7", "u_a", "boo");
      t.ok(during.ok && during.counted === 1 && row("u_a").cracks === 1, "a jeer DURING his answer counts once (1 crack)");
      await jump(11_000);   // (his boo has ended: he is cooling down, 11s into a 30s answer)
      t.ok(Object.values(await each(SEAT, all, 0)).every((s) => !s.react) && D.throwCooling(row("u_a")), "no cue while he is still answering");
      D.rpc("host", "skip_phase", { room_id: room });
      t.ok(rm().phase === "openfloor" && rm().react_user === "u_a" && Math.abs(Date.parse(rm().react_until) - (D.now() + THROW_LIMITS.react_secs * 1000)) < 300,
        "SHE MOVES ON (skip_phase): the server opens his reaction window — react_user is Dex, react_until is six seconds out");
      await seatIs(0, (s) => s.react && s.cueShown === "block", "react now on Dex");
      const s12 = [await each(SEAT, all, 0), await each(SEAT, all, 1), await each(SEAT, all, 2)];
      t.ok(Object.values(s12[0]).every((s) => /REACT ×2/.test(s.cue)) && Object.values(s12[1]).every((s) => !s.react) && Object.values(s12[2]).every((s) => !s.react),
        `"react now" is on HIS tile on every client ("${s12[0].w1.cue}") and on nobody else's`);
      t.ok(s12[0].w1.cueAnim === "lc-react" && s12[0].still.cueAnim === "none", "the cue pulses quietly on motion phones and is still under reduced motion");
      const cr = await W1.page.evaluate(() => window.__lc.COMBO_ROOM.react);
      t.ok(cr && cr.uid === "u_a" && cr.leftMs > 3000 && cr.leftMs <= THROW_LIMITS.react_secs * 1000 && cr.mult === 2, `the page reads the window off the rooms row and the server clock (${cr && cr.leftMs}ms left)`);
      const tray12 = await W1.page.evaluate(TRAY);
      t.ok(/Dex/.test(tray12[0]) && /REACT ×2/.test(tray12[0]) && !/REACT/.test(tray12[1]), `…and the tray says it too: ${JSON.stringify(tray12)}`);

      /* ---------- 13. inside the window ---------- */
      const before13 = ledger();
      const w13 = throwAs("x6", "u_a", "tomato");
      t.ok(w13.ok && w13.joined === false && w13.counted === 2 && w13.n === 2 && row("u_a").cracks === 3, "inside the window ONE jeer counts DOUBLE: 2 cracks (1 → 3) and 2 toward the combo — and his cooldown did not refuse it");
      t.ok(ledger() === before13 + 1 && left("u_x6").jeers_left === 0, "…and the thrower's ration is charged ONCE for it (x6: his boo at Sam and this tomato — none left)");
      await seatIs(0, (s) => s.combo === 2 && s.badge === "×2" && s.cracks === 3, "×2 on Dex after one throw");
      t.ok(true, "every client shows ×2 on his tile after a single throw");
      const w13b = throwAs("x8", "u_a", "pie");
      t.ok(w13b.ok && w13b.joined && w13b.n === 4 && w13b.combo === true && row("u_a").cracks === 3, "a second thrower in the window: 2 + 2 = 4 — the combo fires on TWO throwers; cracks stay capped at 3");
      await seatIs(0, (s) => s.booed, "BOOED OFF on Dex");
      await waitFor(() => host.page.evaluate(() => window.__lc.COMBO_NUDGES.length === 2), 5000, "the host's second nudge");
      t.ok(true, "…BOOED OFF over his tile, and the host's second nudge");
      const other = throwAs("x8", "u_b", "boo");
      t.ok(other.ok && other.counted === 1 && row("u_b").cracks === 1, "the window is HIS: a jeer at Marco in the same six seconds counts once");

      /* ---------- 14. it expires ---------- */
      await jump(THROW_LIMITS.react_secs * 1000 + 400);
      await seatIs(0, (s) => !s.react && s.cueShown === "none", "the cue to go");
      t.ok((await W1.page.evaluate(() => window.__lc.COMBO_ROOM.react)) === null, "six seconds on the window has EXPIRED: the cue is gone from every client");
      await jump(40_000);
      const after = throwAs("x5", "u_a", "hearts");
      t.ok(after.ok && after.counted === 1 && after.n === 1, "…and a throw at him counts once again");

      /* ---------- 15. the clock running out; the rose; the waived cooldown ---------- */
      await jump(40_000);
      const r2 = rm(); r2.phase = "spotlight"; r2.phase_deadline = null; r2.spotlight_target = null; r2.round = 0; r2.react_user = null; r2.react_until = null; D.emit("rooms", "UPDATE", { ...r2 });
      D.rpc("host", "ask_question", { room_id: room, question_id: 2, target: "u_a" });
      const early = D.rpc("w1", "advance_phase", { room_id: room });
      t.ok(early && early.noop === true && rm().react_user === null, "(mid-answer a crowd phone's advance_phase is a no-op and opens nothing)");
      await jump(15_000);
      const liveNow = throwAs("x5", "u_a", "confetti");   // a cheer lands halfway through his answer: over at 25s, cooling until 45s
      await jump(15_500);                                 // his 30s are up (a page's own tick may nudge advance_phase first — the call below is then a no-op)
      t.ok(liveNow.ok && D.throwCooling(row("u_a")), "(a cheer landed during his answer and ended: he is cooling down as his clock runs out)");
      D.rpc("w1", "advance_phase", { room_id: room });
      t.ok(rm().phase === "openfloor" && rm().react_user === "u_a", "HIS CLOCK RUNS OUT (anybody's advance_phase, past the deadline): the same window opens");
      const rose = await throwFrom(W1, "u_a", "petals");
      t.ok(rose.ok === true && rose.counted === 2 && row("u_a").cracks === 1, "inside his window his cooldown does NOT apply, and a ROSE mends double (3 → 1)");
      const marco = await throwFrom(W2, "u_b", "petals");
      t.ok(marco.ok === true && marco.counted === 1, "(Marco, outside any window, takes a rose that counts once)");
      await young("u_a");
      const w3c = await throwFrom(W3, "u_a", "hearts");
      await waitFor(() => hearts("u_a").length === 2, 5000, "the second ovation heart");
      t.ok(w3c.ok && w3c.joined && w3c.combo === true && hearts("u_a").filter((e) => e.user_id === null).length === 2, "cheers in his window: two throwers make a STANDING OVATION, and its heart lands exactly once more (2 in all)");
      for (const c of all) await waitFor(() => c.page.evaluate(OVATION).then((o) => o.on), 8000, c.name + ": the second ovation");
      t.ok(true, "…and the room sees it");

      /* ---------- 16. THE ADDED RULE ---------- */
      const g1 = await A.page.evaluate(async () => { const { error } = await sb.from("room_members").update({ throw_n: 9 }).eq("room_id", window.__lc.CURRENT_ROOM.id).eq("user_id", "u_a"); return error ? error.message : "NO ERROR"; });
      const g2 = await A.page.evaluate(async () => { const { error } = await sb.from("room_members").update({ throw_combo_at: new Date().toISOString() }).eq("room_id", window.__lc.CURRENT_ROOM.id).eq("user_id", "u_a"); return error ? error.message : "NO ERROR"; });
      t.ok(g1 === THROW_GUARD_MSG && g2 === THROW_GUARD_MSG, `a chair's direct write of his own count, or of a combo, is refused: "${g1}"`);
      const untilBefore = rm().react_until;
      const g3 = await host.page.evaluate(async () => { const { error } = await sb.from("rooms").update({ react_user: "u_b", react_until: new Date(Date.now() + 3600e3).toISOString() }).eq("id", window.__lc.CURRENT_ROOM.id); return error ? error.message : "NO ERROR"; });
      t.ok(g3 === ROOMS_REACT_GUARD_MSG && rm().react_user === "u_a" && rm().react_until === untilBefore, `the host cannot open a window around the show: "${g3}"`);

      /* ---------- 17. the key gate ---------- */
      const pipeA1 = await A.page.evaluate(PIPE);
      t.ok(pipeA1.trackId === pipeA0.trackId && pipeA1.swaps === pipeA0.swaps && pipeA1.active === pipeA0.active, "THE KEY GATE: through the joins, the ovations, the booing and the windows, Dex still publishes the same track with no source swap");

      /* ---------- 18. quiet ---------- */
      const errs = all.flatMap((c) => c.errors.map((e) => c.name + ": " + e)).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors on every client — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
