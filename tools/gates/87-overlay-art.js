/* GATE 87 — overlay-art: the throw is a PICTURE now, the same picture on every
 * phone; the answer clock has a fuse; the ask has a sweep.  Ships with
 * feat/overlay-art (PR A of tools/DESIGN-overlay-gameplay.md, ruling 10/11:
 * items 1, 5-Wire and 6).  Client only — no server change, no DDL.
 *
 * WHAT CHANGED.  A throw was an emoji on CSS keyframes.  It is now drawn on a
 * canvas over the tile by throwDrawFrame(), a pure function of (kind, seed,
 * elapsed SERVER ms, window, canvas size), and the seed is
 * throwSeed(target, throw_at) — the throw's own two facts, which every client
 * holds identically.  The Wire is an SVG fuse around the asked man's frame,
 * read off the existing answer clock.  The ASK wipe is a beam across his
 * tile that washes the throw's last frame away.
 *
 * WHAT THE HARNESS FAKES, SAID PLAINLY.  "Pixel-identical on two clients"
 * is proven here between browser contexts of ONE Chromium build on one
 * machine.  That proves the picture has no other input than the throw (no
 * Math.random, no local clock, no per-client state) — which is the ruling.
 * It does NOT prove an iPhone and an Android rasterise the same anti-aliased
 * edge: two different GPUs will differ by a pixel of blur on a curve while
 * drawing the same shapes in the same places.  The phone test is the proof of
 * the look; this gate is the proof of the sameness.
 * The harness's default is reduced motion, so every "motion" client here is
 * booted with reducedMotion:"no-preference" on purpose.
 *
 * The claims:
 *   S.  STATIC: the art has no Math.random / local clock; all eight kinds
 *       have a plan, a frame and a still; the overlay code never calls the
 *       camera or the pipeline; the ruling is committed, unchanged in its
 *       headings, as tools/DESIGN-overlay-gameplay.md
 *   1.  REAL ART, THE SAME ON EVERY PHONE: a live throw's canvas, held on one
 *       exact frame, is pixel-identical on two crowd clients, the host and
 *       the target's own self-view; it is painted (not blank); it moves
 *       (frames differ); and the live canvas IS throwDrawFrame's output
 *   2.  SEEDED FROM THE THROW: all eight kinds render identically on two
 *       clients at three moments each; the same kind on a different throw_at
 *       or a different target is a different picture
 *   3.  ONE CLOCK: with the freeze off, every client is on the same frame of
 *       the throw — a phone whose clock is 30s wrong included
 *   4.  REDUCED MOTION: no animation, a drawn still badge; no sweep; the
 *       wire's spark does not flicker
 *   5.  THE KEY GATE STILL HOLDS: his track, his pipeline and the call's
 *       video source are untouched by the art, the wire and the wipe
 *   6.  THE WIPE: she asks him through the real ask path with a tomato on
 *       him — the room's truth drops the throw at once, the sweep plays on
 *       every motion client AFTER the round card has gone (never under it),
 *       it washes the throw, and the tile is clean after; a host clear is
 *       NOT a sweep (the ghost fades); an ask with nothing on him still
 *       sweeps (the beat), washing nothing
 *   7.  THE WIRE: on the asked man's frame only, on every client; its length
 *       is the answer clock's fraction; it follows the SERVER clock when the
 *       clock jumps and on the skewed phone (whose card clock agrees with
 *       it); it turns urgent with the clock; nothing happens at zero; it is
 *       gone when the answer is over
 *   8.  zero console errors
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { Harness } = require("../lib/harness");

const KINDS = ["petals", "hearts", "confetti", "sparkle", "tomato", "pie", "boo", "cricket"];
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

/* in-page helpers, installed once per client */
const INSTALL = () => {
  const hash = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(16) + ":" + s.length; };
  const ink = (cv) => { if (!cv || !cv.width) return 0; const d = cv.getContext("2d").getImageData(0, 0, cv.width, cv.height).data; let n = 0; for (let i = 3; i < d.length; i += 4) if (d[i] > 8) n++; return n; };
  window.__g87 = {
    hash, ink,
    /* hold seat i on exact frames and report each: the live canvas, hashed */
    frames(i, times) {
      const cv = document.querySelector("#rt_seat" + i + " .chair__throw-fx canvas"), fx = window.__lc.THROW_FX[i];
      if (!cv || !fx) return null;
      const out = { w: cv.width, h: cv.height, seed: fx.seed, kind: fx.kind, at: fx.at, f: {}, ink: {}, same: {} };
      for (const t of times) {
        window.__lc.throwFreeze(t);
        out.f[t] = hash(cv.toDataURL()); out.ink[t] = ink(cv);
        out.same[t] = cv.toDataURL() === window.__lc.throwSnapshot(fx.kind, fx.uid, fx.at, t, cv.width, cv.height);
      }
      window.__lc.throwFreeze(null);
      return out;
    },
    snaps(kinds, uid, at, times, w, h) {
      const out = {};
      for (const k of kinds) for (const t of times) {
        const url = window.__lc.throwSnapshot(k, uid, at, t, w, h); out[k + "@" + t] = hash(url);
      }
      return out;
    },
    seat(i) {
      const el = document.getElementById("rt_seat" + i), cv = el.querySelector(".chair__throw-fx canvas"), badge = el.querySelector(".chair__throw-badge");
      const fxEl = el.querySelector(".chair__throw-fx"), wipe = el.querySelector(".chair__wipe"), wire = el.querySelector(".chair__wire"), rays = el.querySelector(".chair__wire-rays"), fuse = el.querySelector(".chair__wire-fuse");
      const fx = window.__lc.THROW_FX[i] || null;
      return { uid: el.dataset.heartuid || null, hit: el.classList.contains("has-throw"), ghost: el.classList.contains("is-ghost"), held: el.classList.contains("is-held"), wiping: el.classList.contains("is-wiping"),
        fx: fx ? { t: fx.t, seed: fx.seed, kind: fx.kind, ghost: fx.ghost } : null,
        fxShown: getComputedStyle(fxEl).display, fxAnim: getComputedStyle(fxEl).animationName, canvasInk: ink(cv),
        badgeShown: getComputedStyle(badge).display, badgeKind: badge.dataset.kind || "", badgeInk: ink(badge.querySelector("canvas")),
        wipeShown: wipe ? getComputedStyle(wipe).display : null, beamAnim: wipe ? getComputedStyle(wipe, "::before").animationName : null,
        wire: el.classList.contains("has-wire"), urgent: el.classList.contains("wire-urgent"), wireShown: wire ? getComputedStyle(wire).display : null,
        frac: wire && wire.dataset.frac ? Number(wire.dataset.frac) : null,
        dash: fuse && fuse.getAttribute("stroke-dasharray") ? fuse.getAttribute("stroke-dasharray").split(" ").map(Number) : null,
        raysShown: rays ? getComputedStyle(rays).display : null, raysAnim: rays ? getComputedStyle(rays).animationName : null };
    },
    /* a fast sampler: was the sweep ever on screen while a beat card was up? */
    arm(i) {
      const el = document.getElementById("rt_seat" + i), log = { n: 0, beat: 0, wiping: 0, held: 0, under: 0, hitWhileAsked: 0, firstWipe: null, beatGone: null };
      const iv = setInterval(() => {
        const beat = !!document.querySelector("#room .lc-beat"), wiping = el.classList.contains("is-wiping");
        log.n++; if (beat) log.beat++; if (wiping) log.wiping++; if (el.classList.contains("is-held")) log.held++;
        if (beat && wiping) log.under++;
        if (!beat && log.beat && log.beatGone == null) log.beatGone = performance.now();
        if (wiping && log.firstWipe == null) log.firstWipe = performance.now();
        const r = window.__lc.CURRENT_ROOM || {};
        if (r.spotlight_target === el.dataset.heartuid && el.classList.contains("has-throw")) log.hitWhileAsked++;
      }, 15);
      window.__g87.stop = () => { clearInterval(iv); return log; };
    },
  };
};
const PIPE = () => {
  const lv = window.__lc.DAILY && window.__lc.DAILY.participants().local.tracks.video;
  return { active: window.__lc.FILTER_STATE.active, name: window.__lc.FILTER_STATE.name, trackId: lv && lv.track ? lv.track.id : null,
    swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0 };
};

module.exports = {
  name: "overlay-art",
  async run(t, ctx) {
    const html = ctx.html;
    /* ---------- S. STATIC ---------- */
    const art = (html.match(/THE THROW ART \(feat\/overlay-art[\s\S]*?\n\/\* ---- painters ---- \*\//) || [""])[0];
    t.ok(art.length > 8000, `the art is where this gate thinks it is (${art.length} chars)`);
    t.ok(!/Math\.random|Date\.now|performance\.now|crypto\.|new Date/.test(art), "the art has no Math.random and no clock of its own — a frame is a function of the throw and the time it is handed");
    const overlay = (html.match(/THE THROW ART \(feat\/overlay-art[\s\S]*?\n\/\* a sheet is open/) || [""])[0];
    t.ok(overlay.length > art.length && !/Math\.random/.test(overlay), "no Math.random anywhere in the overlay layer — art, painters, wipe or wire");
    t.ok(/function throwSeed\(uid, atMs\)/.test(art) && /seed:throwSeed\(uid, st\.at\)/.test(overlay), "the seed is throwSeed(target, throw_at) — the throw's own two facts");
    for (const k of KINDS) {
      const n = (art.match(new RegExp('kind==="' + k + '"', "g")) || []).length;
      t.ok(n >= 3, `${k}: a plan, a frame and a still (${n} branches)`);
    }
    t.ok(!/filterStart|filterStop|setInputDevices|setLocalVideo|canvasTrack|applyFilter|getUserMedia|captureStream|FaceDetector|camkit|CAMKIT/.test(overlay),
      "the overlay code never touches his camera, his track, the pipeline or a face");
    t.ok(!/sb\.rpc\(|sb\.from\(/.test(overlay), "the overlay layer makes no server call of its own — the wipe and the wire are pictures of state, not state");
    const design = fs.readFileSync(path.join(__dirname, "..", "DESIGN-overlay-gameplay.md"), "utf8");
    t.ok(design.startsWith("## Nick's ruling (10/11): all six, approved") && ["### The six", "### What doesn't change", "### One rule changes, for combos", "### Defaults for Nick", "| Crown tie | holder keeps; round-1 tie means no crown |"].every((x) => design.includes(x)),
      "the ruling is committed as tools/DESIGN-overlay-gameplay.md with every section of it");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@overlay.test" });
      ["u_a", "u_b", "u_c", "u_w1", "u_w2", "u_still", "u_skew"].forEach((id) => D.addUser({ id, name: id }));
      const room = D.addRoom({ id: "r_overlay", host_id: hostU, name: "Overlay Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 600_000);
      ["u_a", "u_b", "u_c"].forEach((u, i) => D.addMember(room, u, "chair", { seat_index: i }));
      ["u_w1", "u_w2", "u_still", "u_skew"].forEach((u) => D.addMember(room, u, "spectator"));
      const MOTION = { reducedMotion: "no-preference" };
      const boot = async (name, uid, opts = {}, before = null) => {
        const c = await h.newClient(name, opts); c.login(uid);
        if (before) await c.context.addInitScript(before);
        await c.goto();
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() => document.getElementById("rt_seat0").dataset.heartuid === "u_a"), 8000, name + ": chairs render");
        await c.page.evaluate(INSTALL);
        return c;
      };
      const host = await boot("host", hostU, MOTION);
      const A = await boot("a", "u_a", MOTION);
      const B = await boot("b", "u_b", MOTION);
      const W1 = await boot("w1", "u_w1", MOTION);
      const W2 = await boot("w2", "u_w2", MOTION);
      const R = await boot("still", "u_still");            // the harness default: reduced motion
      const S = await boot("skew", "u_skew", MOTION, "(() => { const real = Date.now; Date.now = () => real() + 30000; })()");
      const all = [host, A, B, W1, W2, R, S], movers = [host, A, B, W1, W2, S];
      const each = async (fn, cs = all, arg) => { const out = {}; for (const c of cs) out[c.name] = await c.page.evaluate(fn, arg); return out; };
      const row = (uid) => D.memberRow(room, uid);
      const throwFrom = (c, target, kind) => c.page.evaluate(({ target, kind }) => window.__lc.throwAt(target, kind), { target, kind });
      const hitOn = async (seat, on, cs = all) => { for (const c of cs) await waitFor(() => c.page.evaluate((s) => document.getElementById("rt_seat" + s).classList.contains("has-throw"), seat).then((v) => v === on), 8000, `${c.name}: seat ${seat} ${on ? "hit" : "clear"}`); };
      const jump = async (ms) => {
        D.clockSkew += ms;
        for (const m of D.members) m.last_seen = D.iso();
        for (const r of D.rooms.values()) if (r.status === "live") r.host_seen_at = D.iso();
        for (const c of all) await c.page.evaluate(() => window.__lc.syncServerClock());
      };
      await waitFor(() => A.page.evaluate(() => window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 12_000, "u_a publishing");
      await waitFor(() => B.page.evaluate(() => window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 12_000, "u_b publishing");
      const pipeA0 = await A.page.evaluate(PIPE), pipeB0 = await B.page.evaluate(PIPE);
      const off = await each(() => window.__lc.SERVER_OFFSET, [W1, S]);
      t.ok(off.skew - off.w1 < -28_000 && off.skew - off.w1 > -32_000, `fixture: the skewed phone's clock is 30s wrong and it knows by how much (${Math.round(off.skew - off.w1)}ms)`);

      /* ---------- 1. real art, the same on every phone ---------- */
      const r1 = await throwFrom(W1, "u_b", "petals");
      t.ok(r1.ok === true, "w1: petals on u_b land");
      await hitOn(1, true);
      const TIMES = [400, 3000, 8000];
      const fr = {}; await Promise.all(movers.map(async (c) => { fr[c.name] = await c.page.evaluate((times) => window.__g87.frames(1, times), TIMES); }));
      t.ok(movers.every((c) => fr[c.name] && fr[c.name].kind === "petals"), "every motion client is drawing the petals on a canvas over seat 1");
      const seedWant = await W1.page.evaluate((at) => window.__lc.throwSeed("u_b", at), fr.w1.at);
      t.ok(movers.every((c) => fr[c.name].seed === seedWant) && fr.w1.at === Date.parse(row("u_b").throw_at),
        `every client seeds the picture from the same two facts — throwSeed("u_b", throw_at) = ${seedWant}`);
      for (const tm of TIMES)
        t.ok(fr.w1.f[tm] === fr.w2.f[tm] && fr.w1.w === fr.w2.w && fr.w1.h === fr.w2.h, `frame ${tm}ms: two crowd phones show the SAME pixels (${fr.w1.f[tm]} on a ${fr.w1.w}x${fr.w1.h} canvas)`);
      const sameSize = movers.filter((c) => fr[c.name].w === fr.w1.w && fr[c.name].h === fr.w1.h);
      t.ok(sameSize.length === movers.length && sameSize.every((c) => TIMES.every((tm) => fr[c.name].f[tm] === fr.w1.f[tm])),
        `…and so do the host, both chairs (the target's own self-view included) and the skewed phone (${sameSize.length}/${movers.length} clients, all three frames)`);
      t.ok(movers.every((c) => TIMES.every((tm) => fr[c.name].ink[tm] > 400)), `the canvas is painted, not blank (${fr.w1.ink[3000]} inked pixels at 3s)`);
      t.ok(fr.w1.f[400] !== fr.w1.f[3000] && fr.w1.f[3000] !== fr.w1.f[8000], "the picture moves: the three frames are three different pictures");
      t.ok(movers.every((c) => TIMES.every((tm) => fr[c.name].same[tm])), "the live canvas IS throwDrawFrame's output for (kind, seed, frame, size) — no other input reaches it");

      /* ---------- 3. one clock ---------- */
      await sleep(350);
      const live = {}; await Promise.all(movers.map(async (c) => { live[c.name] = await c.page.evaluate(() => ({ s: window.__g87.seat(1), now: window.__lc.THROW_ROOM.u_b })); }));
      const ts = movers.map((c) => live[c.name].s.fx && live[c.name].s.fx.t).filter((x) => x != null);
      t.ok(ts.length === movers.length && Math.max(...ts) - Math.min(...ts) < 700, `freeze off: every phone is on the same frame of the throw (${ts.map(Math.round).join(", ")}ms)`);
      t.ok(Math.abs(live.skew.s.fx.t - live.w1.s.fx.t) < 700 && live.skew.s.fx.t > 300 && live.skew.s.fx.t < 10_000,
        `…including the phone whose clock is 30s fast (frame ${Math.round(live.skew.s.fx.t)}ms, not 30s on) — serverNow(), not Date.now()`);
      t.ok(movers.every((c) => live[c.name].s.fxShown === "block" && live[c.name].s.badgeShown === "none" && live[c.name].s.canvasInk > 400), "motion: the animation shows, the still badge does not");

      /* ---------- 4. reduced motion (the still) ---------- */
      const still = await R.page.evaluate(() => ({ s: window.__g87.seat(1), ok: window.__lc.overlayMotionOK() }));
      t.ok(still.ok === false && still.s.hit && still.s.fxShown === "none" && still.s.badgeShown === "flex" && still.s.badgeKind === "petals",
        "reduced motion: the same throw is a still petals badge, no animation");
      t.ok(still.s.badgeInk > 150 && still.s.canvasInk === 0, `…the badge is drawn art (${still.s.badgeInk} inked pixels) and nothing was animated behind it`);

      /* ---------- 2. seeded from the throw: all eight ---------- */
      const AT = 1_760_000_000_000, ST = [300, 2500, 7000], SW = 350, SH = 432;
      const sn1 = await W1.page.evaluate(({ k, at, st, w, h }) => window.__g87.snaps(k, "u_a", at, st, w, h), { k: KINDS, at: AT, st: ST, w: SW, h: SH });
      const sn2 = await W2.page.evaluate(({ k, at, st, w, h }) => window.__g87.snaps(k, "u_a", at, st, w, h), { k: KINDS, at: AT, st: ST, w: SW, h: SH });
      const snH = await host.page.evaluate(({ k, at, st, w, h }) => window.__g87.snaps(k, "u_a", at, st, w, h), { k: KINDS, at: AT, st: ST, w: SW, h: SH });
      const snLater = await W1.page.evaluate(({ k, at, st, w, h }) => window.__g87.snaps(k, "u_a", at, st, w, h), { k: KINDS, at: AT + 31_000, st: ST, w: SW, h: SH });
      const snOther = await W1.page.evaluate(({ k, at, st, w, h }) => window.__g87.snaps(k, "u_c", at, st, w, h), { k: KINDS, at: AT, st: ST, w: SW, h: SH });
      for (const k of KINDS) {
        const keys = ST.map((x) => k + "@" + x);
        t.ok(keys.every((q) => sn1[q] === sn2[q] && sn1[q] === snH[q]), `${k}: the same throw is the same picture on three clients at ${ST.join("/")}ms`);
        t.ok(keys.some((q) => sn1[q] !== snLater[q]) && keys.some((q) => sn1[q] !== snOther[q]), `${k}: his next throw, or the same throw at another man, is a different picture — the chance comes from the throw`);
        t.ok(new Set(keys.map((q) => sn1[q])).size === ST.length, `${k}: it moves (three moments, three pictures)`);
      }

      /* ---------- 5. the key gate, around the art ---------- */
      const pipeB1 = await B.page.evaluate(PIPE);
      t.ok(pipeB1.trackId === pipeB0.trackId && pipeB1.swaps === pipeB0.swaps && pipeB1.active === pipeB0.active,
        `THE KEY GATE: with the petals drawn on him, u_b publishes the same track (${pipeB1.trackId}), no video source swap, pipeline untouched`);

      /* ---------- 6. the wipe ---------- */
      const r2 = await throwFrom(W2, "u_a", "tomato");
      t.ok(r2.ok === true, "w2: a tomato on u_a");
      await hitOn(0, true);
      await waitFor(() => W1.page.evaluate(() => window.__g87.seat(0).canvasInk > 400), 5000, "the tomato drawn on w1");
      for (const c of all) await c.page.evaluate(() => window.__g87.arm(0));
      const rpcBefore = D.rpcLog.length;
      await host.page.evaluate(() => window.__lc.egOpenDrawer("u_a"));   // the real ask path
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_a", 8000, "the ask to land on u_a");
      t.ok(!D.throwLive(row("u_a")), "server: the ask wiped the throw inside itself (unchanged from gate 80)");
      await hitOn(0, false);
      for (const c of movers) await waitFor(() => c.page.evaluate(() => window.__lc.ASK_WIPES.some((w) => w.uid === "u_a" && w.played)), 9000, c.name + ": the sweep to play");
      const mid = await each(() => window.__g87.seat(0), movers);
      t.ok(Object.values(mid).every((s) => !s.hit), "while the sweep runs the ROOM already says he is clear — the picture never holds the truth back");
      await sleep(1100);
      const logs = await each(() => window.__g87.stop());
      const after = await each(() => ({ s: window.__g87.seat(0), wipes: window.__lc.ASK_WIPES }));
      for (const c of movers) {
        const L = logs[c.name], w = after[c.name].wipes.filter((x) => x.uid === "u_a");
        t.ok(w.length === 1 && w[0].washed === true && w[0].motion === true && L.wiping > 0, `${c.name}: the sweep played once on his tile and it washed a throw (${L.wiping} samples of beam)`);
        t.ok(L.beat > 0 && L.under === 0 && L.held > 0, `${c.name}: the round card came up, the throw's last frame was HELD under it, and the sweep never ran under the card (${L.beat} card samples, ${L.under} overlaps)`);
        t.ok(L.hitWhileAsked === 0, `${c.name}: never a beat where he is asked AND the room still says hit`);
      }
      t.ok(Object.values(after).every((a) => !a.s.hit && !a.s.ghost && !a.s.held && !a.s.wiping && a.s.fx === null && a.s.canvasInk === 0),
        "after the sweep his tile is clean on every client: no throw, no ghost, no beam, an empty canvas");
      t.ok(logs.still.wiping === 0 && logs.still.held === 0 && after.still.wipes.filter((x) => x.uid === "u_a").every((x) => x.motion === false && x.played === null),
        "reduced motion: no sweep — the still badge is simply gone");
      t.ok(!D.rpcLog.slice(rpcBefore).some((r) => /clear_throw|set_throwables/.test(r.name)), "no client asked the server to clear anything: the wipe is the ask's own, the sweep is its picture");
      const pipeA1 = await A.page.evaluate(PIPE);
      t.ok(pipeA1.trackId === pipeA0.trackId && pipeA1.swaps === pipeA0.swaps, "THE KEY GATE: through the tomato, the ask, the sweep and the wire, u_a still publishes the same track with no source swap");

      /* ---------- 7. the wire ---------- */
      const want = () => (Date.parse(D.rooms.get(room).phase_deadline) - D.now()) / 30_000;
      await sleep(1200);   // the reduced-motion client steps once a second
      const w0 = await each(() => ({ s0: window.__g87.seat(0), s1: window.__g87.seat(1), s2: window.__g87.seat(2), st: window.__lc.wireState(), card: (document.getElementById("eg_answerclock") || {}).textContent || "" }));
      const f0 = want();
      for (const c of all) {
        const x = w0[c.name];
        t.ok(x.s0.wire && x.s0.wireShown === "block" && !x.s1.wire && !x.s2.wire, `${c.name}: the fuse is on the asked man's frame and nobody else's`);
        t.ok(x.s0.frac != null && Math.abs(x.s0.frac - f0) < 0.06, `${c.name}: its length is the answer clock's (${x.s0.frac} of the fuse left, the server says ${f0.toFixed(3)})`);
        t.ok(x.s0.dash && Math.abs(x.s0.dash[0] / x.s0.dash[1] - x.s0.frac) < 0.01, `${c.name}: and that is what is drawn (${Math.round(x.s0.dash[0])} of ${Math.round(x.s0.dash[1])}px lit)`);
      }
      const secs = (s) => { const m = /(\d+):(\d\d)/.exec(s); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
      t.ok(Math.abs(w0.skew.s0.frac - w0.w1.s0.frac) < 0.05, `the phone 30s fast burns the same fuse as a true one (${w0.skew.s0.frac} vs ${w0.w1.s0.frac})`);
      t.ok(secs(w0.skew.card) != null && Math.abs(secs(w0.skew.card) - secs(w0.w1.card)) <= 2 && Math.abs(secs(w0.skew.card) - w0.skew.s0.frac * 30) <= 2,
        `…and its card clock agrees with its fuse (${w0.skew.card} beside ${(w0.skew.s0.frac * 30).toFixed(1)}s of fuse) — the card read Date.now() before this PR and showed 0:00 here`);
      t.ok(movers.every((c) => w0[c.name].s0.raysAnim === "lc-wire-spark") && w0.still.s0.raysShown === "none", "the spark flickers on motion phones and does not on the reduced-motion one");
      await jump(10_000);
      await sleep(1200);
      const w1 = await each(() => window.__g87.seat(0));
      const f1 = want();
      t.ok(Object.values(w1).every((s) => s.wire && Math.abs(s.frac - f1) < 0.06) && f0 - f1 > 0.3,
        `the server's clock jumps 10s: every fuse is a third shorter (${Object.values(w1).map((s) => s.frac).join(", ")} — server ${f1.toFixed(3)})`);
      await jump(10_000);
      await sleep(1200);
      const w2 = await each(() => window.__g87.seat(0));
      t.ok(Object.values(w2).every((s) => s.wire && s.urgent && s.frac < 0.34), "inside the last ten seconds the fuse turns urgent with the clock");
      const rpcZero = D.rpcLog.length;
      await jump(11_000);   // past zero
      await sleep(1300);
      const w3 = await each(() => ({ s: window.__g87.seat(0), st: window.__lc.wireState() }), [W1, W2, R, S, A, B]);
      t.ok(Object.values(w3).every((x) => !x.s.wire && x.st === null), "at zero the fuse is simply gone");
      /* "nothing shatters at zero": the Wire has no door of its own (the
         static block: no sb.rpc, no sb.from in the overlay layer).  What DOES
         happen at zero is the show's own, unchanged: the clock-out moves the
         phase on — and it is the SERVER's clock that says when. */
      const early = D.rpcLog.slice(rpcBefore, rpcZero).filter((r) => /advance_phase|skip_phase|resolve_draft/.test(r.name));
      t.ok(early.length === 0, `through the whole answer NO client moved the show on early — the phone 30s fast included (${early.map((r) => r.clientId + ":" + r.name).join(" ") || "none"}); before this PR its own clock said "time" the moment he was asked`);

      /* back to her choosing beat for the last two scenes */
      D.rooms.get(room).spotlight_target = null;
      D.setPhase(room, "spotlight", 600);
      for (const c of [host, W1, W2, R]) await waitFor(() => c.page.evaluate(() => window.__lc.CURRENT_ROOM.phase === "spotlight" && !window.__lc.CURRENT_ROOM.spotlight_target), 8000, c.name + ": the choosing beat");

      /* a host clear is not an ask: the ghost fades, no sweep */
      t.ok((await each(() => window.__g87.seat(0).wire, [W1, R])).w1 === false, "the answer is over: no fuse");
      const r3 = await throwFrom(W1, "u_c", "hearts");
      t.ok(r3.ok === true, "w1: a heart burst on u_c");
      await hitOn(2, true);
      await waitFor(() => W2.page.evaluate(() => window.__g87.seat(2).canvasInk > 200), 5000, "the hearts drawn on w2");
      const wipesBefore = await W2.page.evaluate(() => window.__lc.ASK_WIPES.length);
      await W2.page.evaluate(() => window.__g87.arm(2));
      await host.page.evaluate(() => window.__lc.hostClearThrow("u_c"));
      await hitOn(2, false, [W2]);
      const gh = await W2.page.evaluate(() => window.__g87.seat(2));
      await sleep(800);
      const ghLog = await W2.page.evaluate(() => window.__g87.stop());
      const ghAfter = await W2.page.evaluate(() => ({ s: window.__g87.seat(2), n: window.__lc.ASK_WIPES.length }));
      t.ok((gh.ghost || ghAfter.s.fx === null) && ghLog.wiping === 0 && ghAfter.n === wipesBefore, "a host clear is NOT a sweep: the throw's ghost fades, no beam plays");
      t.ok(!ghAfter.s.ghost && ghAfter.s.fx === null && ghAfter.s.canvasInk === 0, "…and the tile is clean a moment later");

      /* an ask with nothing on him: the beat still plays, washing nothing */
      await host.page.evaluate(() => window.__lc.egOpenDrawer("u_c"));
      await host.page.evaluate(() => window.__lc.egFireSpotlight());
      await waitFor(() => D.rooms.get(room).spotlight_target === "u_c", 8000, "the ask to land on u_c");
      await waitFor(() => W2.page.evaluate(() => window.__lc.ASK_WIPES.some((w) => w.uid === "u_c" && w.played)), 9000, "the sweep on u_c");
      const bare = await W2.page.evaluate(() => window.__lc.ASK_WIPES.filter((w) => w.uid === "u_c"));
      t.ok(bare.length === 1 && bare[0].washed === false, "she asks a man with nothing on him: the sweep is still the beat, and it washes nothing");
      const wc = await each(() => [0, 1, 2].map((i) => window.__g87.seat(i).wire), [W1, R]);
      t.ok(wc.w1.join() === "false,false,true" && wc.still.join() === "false,false,true", "the fuse moved to the new man's frame");

      /* ---------- 8. errors ---------- */
      const errs = all.flatMap((c) => c.errors.map((e) => c.name + ": " + e)).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors on every client — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
