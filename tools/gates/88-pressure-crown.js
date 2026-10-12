/* GATE 88 — pressure-crown: jeers leave cracks that STAY, and the round's
 * hearts leader wears a crown that blocks jeers.  Ships with
 * feat/pressure-crown (PR B of tools/DESIGN-overlay-gameplay.md, ruling 10/11
 * items 2 and 5-Crown).  Server side: tools/DESIGN-overlay-server.md.
 *
 * THE SHAPE UNDER TEST.  Two server-owned facts and nothing else:
 *   room_members.cracks  his landed jeers this round minus roses, 0..3
 *   rooms.crown_user     who wears the crown this round, or null
 * A crack moves only where a throw LANDS (the member trigger, inside
 * throw_at's own statement); the crown and the reset only at HER CALL (the
 * rooms trigger, when the phase leaves 'deciding').  A "round" is one full
 * pass to her call (Nick's ruling, 10/11).  The client observes both and
 * never writes either.
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.  The double
 * carries both columns, lands every throw through the trigger's mirror
 * (landOnRow — after throw_at's own refusals, so a jeer the crown refuses is
 * not charged), resets cracks when a man leaves his chair, refuses a direct
 * client write of either column with the guards' words, and turns the round
 * over when its phase leaves 'deciding'.  WHAT IT FAKES: the double has no
 * draft, so its phase leaves 'deciding' a beat AFTER her call (when the show
 * walks on) where production's leaves inside decide_pass itself; the double
 * stamps her call and freezes the contenders there.  The SQL's own behaviour
 * (who is a contender, the ties, the md5 guards, the undo) is proven by the
 * dry run recorded in DESIGN-overlay-server.md, not here.  The Moment is DOUBLE ONLY, as gates 71
 * and 80 already record.
 *
 * The claims, through window.__lc and the real DOM against index.html:
 *   S.  STATIC: the page's two numbers are the server's; no client write of
 *       cracks or crown_user; the design doc carries the SQL and its md5s
 *   1.  a landed jeer adds a crack — on the server row and on EVERY client's
 *       frame, the same drawing on every phone; a refused jeer adds none
 *   2.  crack 1 does not move when crack 2 arrives
 *   3.  THE ASK WIPE takes the throw and leaves the cracks
 *   4.  a rose mends one; a heart burst mends nothing
 *   5.  at 3 the frame SHATTERS on every client, the feed says so once, and
 *       NOTHING ELSE HAPPENS — he keeps his chair, nobody calls anything; a
 *       fourth jeer does not go past 3
 *   6.  a late joiner sees the shattered frame and no stale feed line;
 *       reduced motion shows it without the jolt
 *   7.  THE ADDED RULE: a chair's own direct write of cracks, and the host's
 *       direct write of crown_user, are refused and change nothing
 *   8.  HER CALL: every crack resets; the crown goes to the clear hearts
 *       leader among the men she kept in their chairs — not the man she
 *       passed, not the man seated in his place; every client draws it on
 *       his frame and says so once
 *   9.  THE CROWN BLOCKS JEERS: refused by the server in its own words, not
 *       charged; the tray refuses first without a call; cheers still land;
 *       a jeer at anybody else still lands
 *  10.  the crown is not a look: an ASK leaves it on; the Moment hides it
 *       (and his cracks) and gives them back
 *  11.  her next calls: the newcomer, a round in, can take it; on a tie the
 *       holder keeps it; a new clear leader takes it; round 1 tied is no
 *       crown
 *  12.  leaving the chair cleans his frame; a fresh show carries nothing over
 *  13.  zero console errors
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Harness } = require("../lib/harness");
const { THROW_LIMITS, THROW_GUARD_MSG, CROWN_BLOCK_MSG, ROOMS_CROWN_GUARD_MSG } = require("../lib/backend-double");

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
  const el = document.getElementById("rt_seat" + i), svg = el.querySelector(".chair__cracks"), crown = el.querySelector(".chair__crown");
  const paths = svg ? [...svg.querySelectorAll("path.ck-lite")].map((p) => p.getAttribute("d")) : [];
  return { uid: el.dataset.heartuid || null, cracks: Number(el.dataset.cracks || 0), has: el.classList.contains("has-cracks"), shattered: el.classList.contains("is-shattered"),
    shown: svg ? getComputedStyle(svg).display : "none", paths, shards: svg ? svg.querySelectorAll("path.ck-shard").length : 0,
    w: el.offsetWidth, h: el.offsetHeight, jolt: el.classList.contains("shatter-now"),
    crowned: el.classList.contains("has-crown"), crownShown: crown ? getComputedStyle(crown).display : "none", crownAnim: crown ? getComputedStyle(crown).animationName : "none",
    hit: el.classList.contains("has-throw"), paired: el.classList.contains("is-paired") };
};
const FEED = () => [...document.querySelectorAll("#rt_livelayer .feed")].map((e) => e.textContent);

module.exports = {
  name: "pressure-crown",
  async run(t, ctx) {
    const html = ctx.html;
    /* ---------- S. STATIC ---------- */
    const cfg = (html.match(/const THROWABLES=\{[\s\S]*?\n\};/) || [""])[0];
    const num = (k) => Number((cfg.match(new RegExp(k + ":(\\d+)")) || [])[1]);
    t.ok(num("cracks_to_shatter") === THROW_LIMITS.cracks_to_shatter && num("rose_mends") === THROW_LIMITS.rose_mends,
      `the page's two Pressure numbers are the server's (shatter at ${num("cracks_to_shatter")}, a rose mends ${num("rose_mends")})`);
    t.ok(!/cracks\s*:/.test((html.match(/sb\.from\("room_members"\)\.(?:update|upsert|insert)\(([\s\S]{0,300}?)\)/g) || []).join(" ")) &&
         !(html.match(/sb\.from\("rooms"\)\.(?:update|upsert|insert)\(([\s\S]{0,300}?)\)/g) || []).some((w) => /crown/.test(w)),
      "no client write of cracks or crown_user anywhere in the page");
    const pressure = (html.match(/THE PRESSURE AND THE CROWN \(ruling 10\/11, items 2 and 5\)[\s\S]*?\n\/\* ---- THE WIRE/) || [""])[0];
    t.ok(pressure.length > 3000 && !/sb\.rpc\(|sb\.from\(|Math\.random/.test(pressure), "the Pressure and Crown painters make no server call and roll no dice — they draw what the rows say");
    const doc = fs.readFileSync(path.join(__dirname, "..", "DESIGN-overlay-server.md"), "utf8");
    t.ok(["room_members_throw_guard", "rooms_overlay_round", "35ab1411f492782eb961aae3878e7392", "6689d96db3caec67f13da7ae2d2b95bd", "he wears the crown this round", "REFUSE ON DRIFT", "UNDO"].every((x) => doc.includes(x)),
      "tools/DESIGN-overlay-server.md carries the SQL, the md5s it is guarded by, and the undo");
    t.ok(doc.includes(CROWN_BLOCK_MSG) && doc.includes(ROOMS_CROWN_GUARD_MSG) && doc.includes(THROW_GUARD_MSG), "the double's three refusals are the SQL's words, letter for letter");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@pressure.test" });
      [["u_a", "Dex"], ["u_b", "Marco"], ["u_c", "Sam"], ["u_new", "Newcomer"]].forEach(([id, name]) => D.addUser({ id, name }));
      ["u_w1", "u_w2", "u_w3", "u_w4", "u_still", "u_late"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_pressure", host_id: hostU, name: "Pressure Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_000_000);
      ["u_a", "u_b", "u_c"].forEach((u, i) => D.addMember(room, u, "chair", { seat_index: i }));
      D.addMember(room, "u_new", "line");
      ["u_w1", "u_w2", "u_w3", "u_w4", "u_still"].forEach((u) => D.addMember(room, u, "spectator"));
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
      const B = await boot("b", "u_b", MOTION);
      const W1 = await boot("w1", "u_w1", MOTION);
      const W2 = await boot("w2", "u_w2", MOTION);
      const W3 = await boot("w3", "u_w3", MOTION);
      const W4 = await boot("w4", "u_w4", MOTION);
      const R = await boot("still", "u_still");           // the harness default: reduced motion
      const all = [host, A, B, W1, W2, W3, W4, R], watchers = [host, A, B, W1, W2, R];
      const each = async (fn, cs = watchers, arg) => { const out = {}; for (const c of cs) out[c.name] = await c.page.evaluate(fn, arg); return out; };
      const row = (uid) => D.memberRow(room, uid);
      const throwFrom = (c, target, kind) => c.page.evaluate(({ target, kind }) => window.__lc.throwAt(target, kind), { target, kind });
      const jump = async (ms) => {
        D.clockSkew += ms;
        for (const m of D.members) m.last_seen = D.iso();
        for (const r of D.rooms.values()) if (r.status === "live") r.host_seen_at = D.iso();
        for (const c of all) await c.page.evaluate(() => window.__lc.syncServerClock());
      };
      const cracksOn = async (seat, n, cs = watchers) => { for (const c of cs) await waitFor(() => c.page.evaluate((s) => Number(document.getElementById("rt_seat" + s).dataset.cracks || 0), seat).then((v) => v === n), 8000, `${c.name}: seat ${seat} at ${n} crack(s)`); };
      const hitOn = async (seat, on, cs = watchers) => { for (const c of cs) await waitFor(() => c.page.evaluate((s) => document.getElementById("rt_seat" + s).classList.contains("has-throw"), seat).then((v) => v === on), 8000, `${c.name}: seat ${seat} ${on ? "hit" : "clear"}`); };
      const ledger = () => D.throwLedger.length;

      /* ---------- 1. a landed jeer adds a crack ---------- */
      t.ok(row("u_a").cracks === 0 && (await each(SEAT, watchers, 0)).w1.cracks === 0, "fixture: a clean frame to begin with");
      const j1 = await throwFrom(W1, "u_a", "tomato");
      t.ok(j1.ok === true && row("u_a").cracks === 1, "w1's tomato lands: the server row says 1 crack");
      await cracksOn(0, 1);
      await waitFor(async () => { const x = await each(SEAT, [W1, W2], 0); return x.w1.paths.length === 1 && x.w1.paths[0] === x.w2.paths[0]; }, 8000, "both crowd phones to settle on the crack").catch(() => null);
      const s1 = await each(SEAT, watchers, 0);
      t.ok(Object.values(s1).every((s) => s.has && s.shown === "block" && s.paths.length === 1 && !s.shattered), "every client draws one crack on his frame — host, his own self-view, a rival, the crowd, the reduced-motion phone");
      t.ok(s1.w1.w === s1.w2.w && s1.w1.paths[0] === s1.w2.paths[0] && s1.w1.paths[0].length > 30, "two crowd phones draw the SAME crack (seeded from him and which crack it is), not two dice rolls");
      t.ok(Object.values(await each(SEAT, watchers, 1)).every((s) => !s.has && s.cracks === 0), "…and nobody else's frame is touched");
      const before = ledger();
      const j1b = await throwFrom(W2, "u_a", "boo");
      t.ok(j1b.ok === false && /already live/.test(j1b.error) && row("u_a").cracks === 1 && ledger() === before, `a REFUSED jeer ("${j1b.error}") adds no crack and is not charged`);

      /* ---------- 2. crack 1 holds still when crack 2 arrives ---------- */
      await jump(31_000);
      const j2 = await throwFrom(W2, "u_a", "boo");
      t.ok(j2.ok === true && row("u_a").cracks === 2, "w2's boo lands: 2 cracks");
      await cracksOn(0, 2);
      await waitFor(async () => { const x = await each(SEAT, watchers, 0); return Object.values(x).every((s) => s.paths.length === 2) && x.w1.w === s1.w1.w && x.w1.h === s1.w1.h; }, 8000, "every client to draw the second crack at the same frame size").catch(() => null);
      const s2 = await each(SEAT, watchers, 0);
      t.ok(Object.values(s2).every((s) => s.paths.length === 2) && s2.w1.paths[0] === s1.w1.paths[0] && s2.w1.paths[1] !== s2.w1.paths[0], "the second crack is a new line; the first has not moved");

      /* ---------- 3. the ASK wipe takes the throw, not the cracks ---------- */
      await hitOn(0, true);
      await host.page.evaluate(() => window.__lc.egOpenDrawer("u_a"));   // the real ask path
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_a", 8000, "the ask to land on u_a");
      await hitOn(0, false);
      t.ok(!D.throwLive(row("u_a")) && row("u_a").cracks === 2, "server: the ask wiped the live throw and left his 2 cracks");
      await sleep(2600);   // the round card, then the sweep
      const s3 = await each(SEAT, watchers, 0);
      t.ok(Object.values(s3).every((s) => !s.hit && s.cracks === 2 && s.paths.length === 2 && s.shown === "block"), "every client, after the sweep: the throw is gone and both cracks are still on his frame");
      D.rpc("host", "clear_spotlight_target", { room_id: room });
      D.rooms.get(room).spotlight_target = null; D.setPhase(room, "spotlight", 3000);
      await waitFor(() => W1.page.evaluate(() => !window.__lc.CURRENT_ROOM.spotlight_target), 8000, "back to her choosing beat");

      /* ---------- 4. a rose mends one; a heart burst mends nothing ---------- */
      await jump(31_000);
      const c1 = await throwFrom(W1, "u_a", "hearts");
      t.ok(c1.ok === true && row("u_a").cracks === 2, "a heart burst lands and mends nothing (2)");
      await jump(31_000);
      const c2 = await throwFrom(W1, "u_a", "petals");
      t.ok(c2.ok === true && row("u_a").cracks === 1, "a rose lands and mends one (2 -> 1)");
      await cracksOn(0, 1);
      t.ok((await each(SEAT, [W2], 0)).w2.paths.length === 1, "…and the frame shows one crack again");
      const c3 = await throwFrom(W1, "u_b", "petals");
      t.ok(c3.ok === true && row("u_b").cracks === 0, "a rose on a clean frame leaves it at 0");

      /* ---------- 5. shatter at 3 — and nothing else ---------- */
      await jump(31_000);
      t.ok((await throwFrom(W1, "u_a", "pie")).ok === true && row("u_a").cracks === 2, "w1's pie: 2");
      await jump(31_000);
      const feedBefore = await each(FEED);
      const rpcBefore = D.rpcLog.length, phaseBefore = D.rooms.get(room).phase;
      t.ok((await throwFrom(W2, "u_a", "cricket")).ok === true && row("u_a").cracks === 3, "w2's cricket: 3 — the threshold");
      await cracksOn(0, 3);
      const s5 = await each(SEAT, watchers, 0);
      t.ok(Object.values(s5).every((s) => s.shattered && s.shards > 0 && s.paths.length > 3), "every client: his frame is SHATTERED — the three cracks, the frame giving way all round, the shards");
      const feedAfter = await each(FEED);
      for (const c of watchers) {
        const n = feedAfter[c.name].filter((l) => /The room is turning on Dex/.test(l)).length - feedBefore[c.name].filter((l) => /The room is turning on Dex/.test(l)).length;
        t.ok(n === 1, `${c.name}: the feed says "The room is turning on Dex" exactly once (${n})`);
      }
      t.ok([s5.host, s5.a, s5.b, s5.w1, s5.w2].every((s) => s.jolt) && !s5.still.jolt, "motion phones get the one jolt as it shatters; the reduced-motion phone shows the shattered frame without it");
      await sleep(900);
      t.ok(row("u_a").role === "chair" && D.rooms.get(room).phase === phaseBefore && !D.rpcLog.slice(rpcBefore).some((r) => /pass|leave_room|decide|clear_throw|skip_phase|advance_phase|timeout/.test(r.name)),
        "NO AUTOMATIC CONSEQUENCE: he keeps his chair, the phase has not moved, and no client called anything — it informs her, she decides");
      await jump(31_000);
      t.ok((await throwFrom(W3, "u_a", "boo")).ok === true && row("u_a").cracks === 3, "a fourth jeer lands and the count stays at 3");
      t.ok((await each(FEED, [W1])).w1.filter((l) => /The room is turning on Dex/.test(l)).length === feedAfter.w1.filter((l) => /The room is turning on Dex/.test(l)).length, "…and the feed does not say it twice");

      /* ---------- 6. a late joiner ---------- */
      D.addMember(room, "u_late", "spectator");
      const L = await boot("late", "u_late", MOTION); all.push(L);
      await waitFor(() => L.page.evaluate(() => document.getElementById("rt_seat0").classList.contains("is-shattered")), 8000, "the late joiner to see the shattered frame");
      t.ok(!(await L.page.evaluate(FEED)).some((l) => /turning on/.test(l)), "a late joiner sees the shattered frame and no stale feed line");

      /* ---------- 7. the added rule ---------- */
      const mine = await A.page.evaluate(() => sb.from("room_members").update({ cracks: 0 }).eq("room_id", window.__lc.CURRENT_ROOM.id).eq("user_id", "u_a").then((r) => (r.error ? r.error.message : "ACCEPTED")));
      t.ok(mine === THROW_GUARD_MSG && row("u_a").cracks === 3, `a chair's own direct write of cracks is refused with the guard's words ("${mine}") and changes nothing`);
      const hers = await host.page.evaluate(() => sb.from("rooms").update({ crown_user: "u_c" }).eq("id", window.__lc.CURRENT_ROOM.id).then((r) => (r.error ? r.error.message : "ACCEPTED")));
      t.ok(hers === ROOMS_CROWN_GUARD_MSG && D.rooms.get(room).crown_user === null, `the host's direct write of crown_user is refused ("${hers}")`);

      /* ---------- 8. her call ---------- */
      for (let k = 0; k < 4; k++) D.pushEvent(room, "u_w4", "heart", { target: "u_b" });
      for (let k = 0; k < 6; k++) D.pushEvent(room, "u_w4", "heart", { target: "u_c" });     // Sam leads — and she is about to pass him
      for (let k = 0; k < 9; k++) D.pushEvent(room, "u_w4", "heart", { target: "u_new" });   // the bench man is the crowd's darling
      D.setPhase(room, "deliberation", 60);
      D.rpc("host", "advance_phase", { room_id: room });   // -> deciding: HER CALL begins
      t.ok(D.rooms.get(room).phase === "deciding" && D.rooms.get(room).crown_user === null && row("u_a").cracks === 3, "her call begins: no crown yet, and Dex's cracks still stand");
      const feed8 = await each(FEED);
      D.rpc("host", "decide_pass", { room_id: room, target: "u_c" });                  // she passes Sam
      await sleep(40);
      D.setRole(row("u_new"), "chair", 2); D.emit("room_members", "UPDATE", { ...row("u_new") });   // the bench man takes his chair
      D.rpc("host", "advance_phase", { room_id: room });   // the show walks on: the phase leaves 'deciding'
      t.ok(D.rooms.get(room).phase === "spotlight" && D.rooms.get(room).crown_user === "u_b",
        "HER CALL IS MADE: the crown goes to Marco (4) — not to Sam (6), whom she passed, nor to the newcomer (9), seated in his place");
      t.ok(D.members.filter((m) => m.room_id === room).every((m) => m.cracks === 0), "server: every crack in the room is reset");
      await cracksOn(0, 0, [...watchers, L]);
      const s8 = await each(SEAT, [...watchers, L], 0);
      t.ok(Object.values(s8).every((s) => !s.has && !s.shattered && s.paths.length === 0 && s.shown === "none"), "every client: Dex's frame is clean again — no cracks, not shattered");
      for (const c of [...watchers, L]) await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat1").classList.contains("has-crown")), 8000, c.name + ": the crown on seat 1");
      const cr = {}; for (const c of [...watchers, L]) cr[c.name] = await c.page.evaluate(() => [0, 1, 2].map((i) => { const el = document.getElementById("rt_seat" + i), k = el.querySelector(".chair__crown"); return el.classList.contains("has-crown") && !!k && getComputedStyle(k).display === "block"; }).join());
      t.ok(Object.values(cr).every((x) => x === "false,true,false"), "every client draws the crown on Marco's frame and nobody else's");
      const feed8b = await each(FEED);
      for (const c of watchers) {
        const n = feed8b[c.name].filter((l) => /Marco wears the crown this round/.test(l)).length - feed8[c.name].filter((l) => /Marco wears the crown/.test(l)).length;
        t.ok(n === 1, `${c.name}: the feed says "Marco wears the crown this round" exactly once (${n})`);
      }
      t.ok((await W1.page.evaluate(() => window.__lc.PRESSURE_ROOM)).crown === "u_b", "PRESSURE_ROOM.crown is the rooms row's crown_user — observed, not derived");
      await waitFor(() => W3.page.evaluate(() => document.getElementById("rt_seat2").dataset.heartuid === "u_new"), 8000, "the newcomer in seat 2 on the crowd's phone");

      /* ---------- 9. the crown blocks jeers ---------- */
      D.rooms.get(room).spotlight_target = null; D.setPhase(room, "spotlight", 3000);
      await jump(31_000);
      const counts0 = await W3.page.evaluate(() => window.__lc.throwCountsSync());
      const led0 = ledger();
      const blocked = await throwFrom(W3, "u_b", "tomato");
      t.ok(blocked.ok === false && blocked.error === CROWN_BLOCK_MSG, `a jeer at the crown holder is refused by the server in its own words: "${blocked.error}"`);
      const counts1 = await W3.page.evaluate(() => window.__lc.throwCountsSync());
      t.ok(ledger() === led0 && counts1.jeers_left === counts0.jeers_left && row("u_b").cracks === 0 && !D.throwLive(row("u_b")), "…it is not charged, adds no crack, and nothing landed");
      // the tray refuses first, without a call
      await W3.page.evaluate(() => { document.getElementById("rt_throwbtn").click(); });
      await W3.page.evaluate(() => { [...document.querySelectorAll(".lc-throwtray__target")].find((b) => b.dataset.uid === "u_b").click(); });
      const rpc9 = D.rpcLog.length;
      const trayState = await W3.page.evaluate(() => { const tr = document.getElementById("rt_throwtray"); const tile = tr.querySelector('.lc-shelf__tile[data-kind="pie"]'); tile.click(); return { crowned: tr.classList.contains("is-crowned"), dim: Number(getComputedStyle(tile).opacity) }; });
      await sleep(250);
      t.ok(trayState.crowned && trayState.dim < 0.5 && !D.rpcLog.slice(rpc9).some((r) => r.name === "throw_at"), "the tray says it first: with Marco picked the jeers are dimmed and a tap sends nothing");
      const cheer = await throwFrom(W3, "u_b", "confetti");
      t.ok(cheer.ok === true && D.throwLive(row("u_b")), "a cheer at the crown holder lands");
      const other = await throwFrom(W3, "u_new", "tomato");
      t.ok(other.ok === true && row("u_new").cracks === 1, "a jeer at anybody else still lands and cracks his frame");
      await W3.page.evaluate(() => window.__lc.throwTrayOpen(false));

      /* ---------- 10. not a look: the ASK leaves it; the Moment hides it ---------- */
      await jump(31_000);
      await host.page.evaluate(() => window.__lc.egOpenDrawer("u_b"));
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_b", 8000, "the ask to land on Marco");
      await sleep(600);
      t.ok(D.rooms.get(room).crown_user === "u_b" && (await each(SEAT, [W1, host], 1)).w1.crowned, "she asks the crown holder: the crown is still on his frame");
      D.rpc("host", "clear_spotlight_target", { room_id: room });
      D.rooms.get(room).spotlight_target = null; D.setPhase(room, "spotlight", 3000);
      const mo = D.rpc("b", "start_moment", { room_id: room });
      t.ok(mo.ok === true, "the Moment starts with Marco in it (double only — unbuilt in production)");
      await waitFor(() => W1.page.evaluate(() => document.getElementById("rt_seat1").classList.contains("is-paired")), 8000, "the crowd to see the pairing");
      const m1 = (await each(SEAT, [W1], 1)).w1;
      t.ok(m1.paired && m1.crowned && m1.crownShown === "none" && D.rooms.get(room).crown_user === "u_b", "during the Moment his crown is hidden like everything else — and still his");
      D.rpc("host", "end_moment", { room_id: room });
      await waitFor(() => W1.page.evaluate(() => !document.getElementById("rt_seat1").classList.contains("is-paired")), 8000, "the Moment to end");
      t.ok((await each(SEAT, [W1], 1)).w1.crownShown === "block", "…and back on his frame when it ends");

      /* ---------- 11. her next calls ---------- */
      const turn = () => { D.setPhase(room, "deliberation", 60); D.rpc("host", "advance_phase", { room_id: room }); D.rpc("host", "advance_phase", { room_id: room }); };
      turn();   // Marco 4, the newcomer 9 — and he has now sat a round
      t.ok(D.rooms.get(room).crown_user === "u_new" && row("u_new").cracks === 0, "her next call: the newcomer has sat a round, his 9 hearts take the crown — and that round's cracks are reset");
      for (let k = 0; k < 5; k++) D.pushEvent(room, "u_w4", "heart", { target: "u_b" });   // 9 and 9
      turn();
      t.ok(D.rooms.get(room).crown_user === "u_new", "hearts tied at the top: the holder keeps the crown");
      D.pushEvent(room, "u_w4", "heart", { target: "u_b" });   // Marco 10
      turn();
      t.ok(D.rooms.get(room).crown_user === "u_b", "a new clear leader takes it");
      await waitFor(() => W1.page.evaluate(() => document.getElementById("rt_seat1").classList.contains("has-crown") && !document.getElementById("rt_seat2").classList.contains("has-crown")), 8000, "the crown to move back to Marco on the crowd's phone");
      t.ok(true, "…and every phone moves the crown to his frame");
      // round 1, tied, in a room of its own: no crown
      const r2 = D.addRoom({ id: "r_tie", host_id: hostU, name: "Tie Night", phase: "deliberation", round: 3 });
      D.addMember(r2, "u_w1", "chair", { seat_index: 0 }); D.addMember(r2, "u_w2", "chair", { seat_index: 1 }); D.addMember(r2, "u_w3", "chair", { seat_index: 2 });
      D.pushEvent(r2, "u_w4", "heart", { target: "u_w1" }); D.pushEvent(r2, "u_w4", "heart", { target: "u_w2" });
      D.rpc("host", "advance_phase", { room_id: r2 });   // -> deciding
      D.rpc("host", "decide_pass", { room_id: r2, target: "u_w3" });
      D.rpc("host", "advance_phase", { room_id: r2 });   // her call is made
      t.ok(D.rooms.get(r2).phase === "spotlight" && D.rooms.get(r2).crown_user === null, "round 1 with the hearts tied: no crown");

      /* ---------- 12. leaving the chair; a fresh show ---------- */
      await jump(31_000);
      t.ok((await throwFrom(W4, "u_a", "tomato")).ok === true && row("u_a").cracks === 1, "w4's tomato: Dex has a crack again");
      await host.page.evaluate(() => window.__lc.hostPass("u_a"));
      await waitFor(() => row("u_a").role !== "chair", 5000, "Dex passed");
      t.ok(row("u_a").cracks === 0, "leaving the chair cleans his frame (the trigger's reset)");
      D.rpc("host", "reset_to_preshow", { room_id: room });
      t.ok(D.rooms.get(room).crown_user === null && D.members.filter((m) => m.room_id === room).every((m) => m.cracks === 0), "back to preshow: no crown and no cracks carry into the next show");

      /* ---------- 13. quiet ---------- */
      const errs = all.flatMap((c) => c.errors.map((e) => c.name + ": " + e)).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors on every client — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
