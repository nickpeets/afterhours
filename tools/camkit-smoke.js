#!/usr/bin/env node
/* camkit-smoke.js — the REAL Camera Kit SDK, once, by hand.  NOT a gate and
 * never run by verify.sh: it needs the network (esm.sh + Snap) and Snap's
 * staging token, and the battery is offline by contract.
 *
 *   cd tools && node camkit-smoke.js              # the real SDK, the shipped config
 *   cd tools && node camkit-smoke.js --shim       # the tool itself, offline, against the shim
 *   cd tools && node camkit-smoke.js --out=/tmp/x # where the frame PNGs go
 *   cd tools && node camkit-smoke.js --accept-legal   # tap "I Agree" on Snap's terms dialog
 *
 * WHAT IT DOES.  The battery's own harness (the real index.html, the backend
 * double, the Daily shim, Chromium's fake camera) with ONE thing changed:
 * Harness.camkitReal lets the SDK address and Snap's runtime hosts through to
 * the network instead of serving camera-kit-shim.js.  A host, two chairs,
 * each chair loaded with ?camkit&debug.  Each chair opens the shelf with the
 * real button (where the app asks Snap's terms), then picks one of the two
 * shipped looks through the app's own filterPick; the tool then reports what
 * the app's own state says — bootstrap, lens fetch, the frame counter over
 * three seconds, whether the published track is the session's output — plus
 * every host that was contacted, every console error, and a PNG of a
 * published frame per look.  Then the wearer drops the look and it reports
 * the camera coming back.
 *
 * SNAP'S TERMS.  The real SDK shows a modal terms dialog ("Dismiss" / "I
 * Agree") before it will apply any lens, and waits for an answer.  The app
 * asks for it at first sight of the shelf, so this tool opens the shelf with
 * the real button first and reports whether the dialog came up there, then
 * picks, and reports whether it came up again at the lens start.  Nobody is
 * there to answer in a headless browser: by default the tool reports the
 * dialog, waits past the app's start ceiling to show that nothing is latched
 * (the wait is off the clock), and stops there.  --accept-legal makes the
 * tool tap "I Agree" — that is accepting Snap's terms in this throwaway
 * browser profile, so it is a flag a person passes, never a default.
 *
 * WHAT IT CANNOT PROVE.  Headless Chromium on SwiftShader with a synthetic
 * camera is not a phone: there is no face in the fake camera's test pattern,
 * so a face lens has nothing to track; and iOS Safari's WebGL →
 * captureStream() path is not exercised at all.  Those are the phone test's.
 *
 * It never prints the token: every line it writes is scrubbed of it.
 */
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const { Harness, CAMKIT_TEST, resolveChromium } = require("./lib/harness");

const args = process.argv.slice(2);
const SHIM = args.includes("--shim");
const ACCEPT_LEGAL = args.includes("--accept-legal");
const OUT = (args.find((a) => a.startsWith("--out=")) || "").replace("--out=", "") || path.join(os.tmpdir(), "camkit-smoke");
const WAIT_MS = 120_000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await sleep(150);
  }
};

let SECRET = null;
const scrub = (s) => { s = String(s); return SECRET ? s.split(SECRET).join("<token>") : s; };
const say = (...a) => console.log(scrub(a.join(" ")));

async function main() {
  const browser = resolveChromium();
  if (browser.error) { console.error(browser.error + "\n  " + browser.hint); process.exit(3); }
  process.env.LC_CHROMIUM = browser.path;
  fs.mkdirSync(OUT, { recursive: true });

  const h = await Harness.launch({ args: ["--ignore-gpu-blocklist", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  h.camkitReal = !SHIM;
  let failed = 0;
  try {
    const D = h.double;
    const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@smoke.test" });
    ["u_a", "u_b"].forEach((id) => D.addUser({ id, name: id }));
    const room = D.addRoom({ id: "r_smoke", host_id: hostU, name: "Smoke", phase: "spotlight", round: 1 });
    D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_600_000);
    D.addMember(room, "u_a", "chair", { seat_index: 0 });
    D.addMember(room, "u_b", "chair", { seat_index: 1 });
    const boot = async (name, uid) => {
      const c = await h.newClient(name); c.login(uid); await c.goto("?camkit&debug");
      await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
      if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await c.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => c.page.evaluate(() => window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 15_000, name + " publishing");
      return c;
    };
    const A = await boot("a", "u_a");
    const B = await boot("b", "u_b");

    const cfg = await A.page.evaluate(() => ({ flag: window.__lc.CAMKIT_FLAG, sdkUrl: window.__lc.CAMKIT.sdkUrl, token: window.__lc.CAMKIT.apiToken,
      group: window.__lc.CAMKIT.lensGroupId, target: window.__lc.CAMKIT.target, mirror: window.__lc.CAMKIT.mirror, startMs: window.__lc.CAMKIT.startMs,
      looks: Object.entries(window.__lc.CAMKIT.looks).map(([slug, v]) => ({ slug, lensId: v.lensId, name: v.name })),
      ua: navigator.userAgent, gl: (() => { try { const c = document.createElement("canvas"); const g = c.getContext("webgl2"); if (!g) return "no webgl2";
        const e = g.getExtension("WEBGL_debug_renderer_info"); return e ? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : "webgl2 (renderer hidden)"; } catch (e) { return "webgl2 threw: " + e.message; } })() }));
    SECRET = cfg.token && cfg.token.length > 20 ? cfg.token : null;
    say("CAMERA KIT SMOKE —", SHIM ? "SHIM MODE (offline; this exercises the tool, not Snap)" : "REAL SDK");
    say("browser   ", browser.path);
    say("user agent", cfg.ua);
    say("webgl2    ", cfg.gl);
    say("page      ", "?camkit&debug  flag=" + cfg.flag, " target=" + cfg.target, " mirror=" + cfg.mirror);
    say("sdkUrl    ", cfg.sdkUrl);
    say("token     ", cfg.token ? cfg.token.length + " chars, " + cfg.token.split(".").length + " dot-separated parts (not printed)" : "MISSING");
    say("lens group", cfg.group);
    say("looks     ", cfg.looks.map((l) => l.slug + " → lens " + l.lensId + " (" + l.name + ")").join(" · "));
    say("=".repeat(72));
    if (SHIM) {
      const looks = {}; cfg.looks.forEach((l, i) => { looks[l.slug] = { lensId: i ? "lens-halo" : "lens-fox", name: l.name }; });
      for (const c of [A, B]) await c.camkitConfigure({ sdkUrl: cfg.sdkUrl, looks });
    }

    /* Snap's terms dialog, found the way the app's own camkitTermsOpen finds it */
    const DIALOG = () => { const el = document.querySelector('[data-testid="tos-dialog"]'), dg = el && el.shadowRoot && el.shadowRoot.querySelector("dialog");
      return (dg && dg.open) ? { modal: dg.matches(":modal"), buttons: [...dg.querySelectorAll("button")].map((b) => b.textContent.trim()), text: dg.textContent.replace(/\s+/g, " ").trim().slice(0, 260) } : null; };
    const AGREE = () => { const el = document.querySelector('[data-testid="tos-dialog"]'); const b = el && [...el.shadowRoot.querySelectorAll("button")].find((x) => /agree/i.test(x.textContent)); if (!b) return null; b.click(); return b.textContent.trim(); };
    const TERMS = () => ({ terms: window.__lc.CAMKIT_STATE.terms, asked: window.__lc.CAMKIT_STATE.termsAsked, loads: window.__lc.CAMKIT_STATE.sdkLoads });
    const wearers = [[A, cfg.looks[0]], [B, cfg.looks[1]]];
    for (const [c, look] of wearers) {
      if (!look) continue;
      say("LOOK " + look.slug + " (lens " + look.lensId + ") on client " + c.name);
      /* 1. first sight of the shelf, through the real button: the app loads the
            SDK here and asks Snap's terms on a hidden session */
      const t00 = Date.now();
      await c.page.evaluate(() => { const sh = document.getElementById("rt_shelf"); if (!sh.classList.contains("is-open")) document.getElementById("rt_filterbtn").click(); });
      let early = null, unanswered = false;
      /* until the dialog is up, or the app says its early ask is over without one */
      try { early = await waitFor(async () => (await c.page.evaluate(DIALOG)) || ((await c.page.evaluate(TERMS)).terms !== "asking" ? "none" : null), 30_000, "Snap's terms at the shelf"); } catch (e) {}
      if (early === "none") early = null;
      const st0 = await c.page.evaluate(TERMS);
      if (early) {
        say("  SHELF OPEN ", "Snap's terms dialog appeared " + (Date.now() - t00) + "ms after the shelf opened — modal=" + early.modal + ", buttons: " + early.buttons.join(" / ") + "  (app: terms \"" + st0.terms + "\", SDK loads " + st0.loads + ")");
        say("             ", JSON.stringify(early.text));
        if (ACCEPT_LEGAL) {
          say("             ", "--accept-legal: tapped \"" + (await c.page.evaluate(AGREE)) + "\"");
          try { await waitFor(() => c.page.evaluate(() => window.__lc.CAMKIT_STATE.terms === "agreed" && !window.__lc.camkitTermsOpen()), 30_000, "the hidden terms session to finish"); } catch (e) { say("             ", "the app did not report the terms agreed within 30s ✕"); failed++; }
          say("             ", "app: terms \"" + (await c.page.evaluate(TERMS)).terms + "\" — dialog gone, hidden session ended");
        } else { unanswered = true; say("             ", "NOT ANSWERED (nobody here to; --accept-legal taps I Agree)"); }
      } else say("  SHELF OPEN ", "no terms dialog at the shelf  (app: terms \"" + st0.terms + "\", SDK loads " + st0.loads + ")");
      /* 2. the pick */
      const t0 = Date.now();
      const pick = await c.page.evaluate((s) => window.__lc.filterPick(s), look.slug);
      say("  filterPick →", JSON.stringify(pick));
      if (!pick.ok) { failed++; say("-".repeat(72)); continue; }
      let outcome, late = null;
      try {
        outcome = await waitFor(async () => {
          const r = await c.page.evaluate((s) => {
            const K = window.__lc.CAMKIT_STATE, F = window.__lc.FILTER_STATE;
            return { open: window.__lc.camkitTermsOpen(), done: (F.active && F.kind === "lens" && F.name === s) ? "live" : K.dead ? "sdk-dead" : K.lensDead[s] ? "lens-dead" : null };
          }, look.slug);
          if (r.open && !unanswered && !late) { late = { atMs: Date.now() - t0, answered: ACCEPT_LEGAL ? await c.page.evaluate(AGREE) : null }; if (!late.answered) unanswered = true; }
          return r.done;
        }, unanswered ? cfg.startMs + 8000 : WAIT_MS, "the lens to go live or fail");
      } catch (e) { outcome = unanswered ? "STILL WAITING" : "TIMEOUT after " + WAIT_MS + "ms"; }
      if (late) say("  LENS START ", "Snap's terms dialog appeared at the lens start, " + late.atMs + "ms after the pick" + (late.answered ? " — --accept-legal: tapped \"" + late.answered + "\"" : " — NOT ANSWERED"));
      else if (!unanswered) say("  LENS START ", "no terms dialog at the lens start" + (early ? " — the answer given at the shelf held ✓" : ""));
      const ms = Date.now() - t0;
      const st1 = await c.page.evaluate(() => ({ K: window.__lc.CAMKIT_STATE, F: window.__lc.FILTER_STATE }));
      if (outcome === "STILL WAITING") {
        const latched = !!(st1.K.dead || st1.K.lensDead[look.slug]);
        say("  outcome   ", "the terms are unanswered and the app is still waiting " + ms + "ms after the pick — past its " + cfg.startMs + "ms start ceiling, " + (latched ? "but something LATCHED ✕" : "nothing latched ✓ (the wait is off the clock)"));
        say("  CAMKIT_STATE", JSON.stringify(st1.K));
        failed++;   // not a fault: the run simply cannot finish without an answer
      } else {
        say("  outcome   ", outcome, "after " + ms + "ms");
        say("  CAMKIT_STATE", JSON.stringify(st1.K));
      }
      if (outcome !== "live") { if (outcome !== "STILL WAITING") { failed++; say("  FILTER_STATE", JSON.stringify(st1.F)); } }
      else {
        await sleep(3000);
        const st2 = await c.page.evaluate(() => {
          const F = window.__lc.FILTER_STATE, lv = window.__lc.DAILY.participants().local.tracks.video;
          const tr = lv && lv.track, set = tr && tr.getSettings ? tr.getSettings() : {};
          const el = document.getElementById("vfilter");
          return { F, publishedId: tr ? tr.id : null, state: lv ? lv.state : null, settings: { width: set.width, height: set.height, frameRate: set.frameRate }, readout: el ? el.textContent : null };
        });
        const climbed = st2.F.framesDrawn - st1.F.framesDrawn;
        const isOutput = !!st2.publishedId && st2.publishedId === st2.F.canvasTrackId;
        say("  frames    ", st1.F.framesDrawn + " → " + st2.F.framesDrawn + " in 3s (" + (climbed > 0 ? "climbing ✓" : "NOT CLIMBING ✕") + ")");
        say("  published ", "track " + st2.publishedId + (isOutput ? " IS the session output's captured track ✓" : " is NOT the session output (canvasTrackId " + st2.F.canvasTrackId + ") ✕"),
            " state=" + st2.state, " " + JSON.stringify(st2.settings));
        say("  readout   ", JSON.stringify(st2.readout));
        if (!(climbed > 0) || !isOutput) failed++;
        /* one published frame, as the room would receive it */
        const png = await c.page.evaluate(async () => {
          const tr = window.__lc.DAILY.participants().local.tracks.video.track;
          const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([tr]);
          await v.play().catch(() => {});
          for (let i = 0; i < 40 && !(v.readyState >= 2 && v.videoWidth); i++) await new Promise((r) => setTimeout(r, 100));
          if (!v.videoWidth) return null;
          const cv = document.createElement("canvas"); cv.width = v.videoWidth; cv.height = v.videoHeight;
          cv.getContext("2d").drawImage(v, 0, 0);
          v.pause(); v.srcObject = null;
          return { w: cv.width, h: cv.height, data: cv.toDataURL("image/png").split(",")[1] };
        });
        if (png) { const fp = path.join(OUT, look.slug + ".png"); fs.writeFileSync(fp, Buffer.from(png.data, "base64")); say("  frame     ", png.w + "x" + png.h + " → " + fp); }
        else say("  frame     ", "could not read a frame off the published track");
        const drop = await c.page.evaluate(() => window.__lc.filterDrop());
        let back = "camera back ✓";
        try {
          await waitFor(() => c.page.evaluate(() => { const lv = window.__lc.DAILY.participants().local.tracks.video; const cam = window.__dailyControl.cameraTrack();
            return window.__lc.FILTER_STATE.active === false && lv.state === "playable" && !!lv.track && !!cam && lv.track.id === cam.id; }), 15_000, "the camera to come back");
        } catch (e) { back = "CAMERA NOT BACK ✕"; failed++; }
        say("  filterDrop →", JSON.stringify(drop), "·", back);
      }
      const panel = await c.page.evaluate(() => { const p = document.getElementById("vdebug"); return p ? p.innerText : ""; });
      const lines = panel.split("\n").filter((l) => /camera kit|lens|filter/i.test(l)).slice(-12);
      if (lines.length) { say("  ?debug panel:"); for (const l of lines) say("    | " + l.slice(0, 220)); }
      /* the lens engine prints its own "WARNING: …" lines through console.error;
         they are listed, but they are the SDK talking, not a failure of the page */
      const bad = c.logs.filter((m) => m.type === "error" || m.type === "warning").filter((m) => !/favicon/.test(m.text));
      const sdkWarn = bad.filter((m) => /^WARNING: /.test(m.text)), real = bad.filter((m) => !/^WARNING: /.test(m.text));
      say("  console   ", real.length + " error/warning message(s)" + (sdkWarn.length ? " + " + sdkWarn.length + " \"WARNING:\" line(s) from the lens engine" : "") + (bad.length ? ":" : ""));
      for (const m of bad.slice(0, 15)) say("    | [" + m.type + "] " + m.text.slice(0, 300));
      if (real.length || c.errors.filter((e) => !/^WARNING: /.test(e) && !/favicon/.test(e)).length) failed++;
      say("-".repeat(72));
    }

    const hosts = {};
    for (const r of h.camkitRealRequests) { const u = new URL(r.url); hosts[u.host] = (hosts[u.host] || 0) + 1; }
    say("NETWORK — requests let through (" + h.camkitRealRequests.length + "):", Object.entries(hosts).map(([k, v]) => k + " ×" + v).join(" · ") || "(none)");
    say("NETWORK — to the shim (" + h.camkitRequests.length + "):", h.camkitRequests.map((r) => r.client).join(",") || "(none)");
    const leaks = h.unexpectedRequests.filter((u) => !/favicon/.test(u));
    const leakHosts = {}; for (const u of leaks) { try { const x = new URL(u); leakHosts[x.host] = (leakHosts[x.host] || 0) + 1; } catch (e) {} }
    say("NETWORK — ABORTED, a host nobody listed (" + leaks.length + "):", Object.entries(leakHosts).map(([k, v]) => k + " ×" + v).join(" · ") || "(none)");
    for (const u of leaks.slice(0, 8)) say("    | " + u.slice(0, 200));
  } finally { await h.close(); }
  say("=".repeat(72));
  say(failed ? "SMOKE: " + failed + " PROBLEM(S) — read the lines above" : "SMOKE: both looks went live, frames climbed, the published track was the session output, and the camera came back");
  process.exit(failed ? 1 : 0);
}
main().catch((e) => { console.error(scrub(e && e.stack || e)); process.exit(2); });
