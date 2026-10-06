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
 * each chair loaded with ?camkit&debug.  Each chair picks one of the two
 * shipped looks through the app's own filterPick; the tool then reports what
 * the app's own state says — bootstrap, lens fetch, the frame counter over
 * three seconds, whether the published track is the session's output — plus
 * every host that was contacted, every console error, and a PNG of a
 * published frame per look.  Then the wearer drops the look and it reports
 * the camera coming back.
 *
 * SNAP'S LEGAL PROMPT.  The real SDK's first applyLens shows a modal terms
 * dialog ("Dismiss" / "I Agree") and waits for an answer; nobody is there to
 * give one in a headless browser, so by default this tool reports the dialog
 * and lets the app's own start ceiling (CAMKIT.startMs) do what it does.
 * --accept-legal makes the tool tap "I Agree" — that is accepting Snap's
 * terms in this throwaway browser profile, so it is a flag a person passes,
 * never a default.
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

    const wearers = [[A, cfg.looks[0]], [B, cfg.looks[1]]];
    for (const [c, look] of wearers) {
      if (!look) continue;
      say("LOOK " + look.slug + " (lens " + look.lensId + ") on client " + c.name);
      const t0 = Date.now();
      const pick = await c.page.evaluate((s) => window.__lc.filterPick(s), look.slug);
      say("  filterPick →", JSON.stringify(pick));
      if (!pick.ok) { failed++; continue; }
      let outcome, legal = null;
      try {
        outcome = await waitFor(async () => {
          const r = await c.page.evaluate((s) => {
            const K = window.__lc.CAMKIT_STATE, F = window.__lc.FILTER_STATE;
            const el = document.querySelector('[data-testid="tos-dialog"]'), dg = el && el.shadowRoot && el.shadowRoot.querySelector("dialog");
            const dialog = (dg && dg.open) ? { modal: dg.matches(":modal"), buttons: [...dg.querySelectorAll("button")].map((b) => b.textContent.trim()),
              text: dg.textContent.replace(/\s+/g, " ").trim().slice(0, 260) } : null;
            return { dialog, done: (F.active && F.kind === "lens" && F.name === s) ? "live" : K.dead ? "sdk-dead" : K.lensDead[s] ? "lens-dead" : null };
          }, look.slug);
          if (r.dialog && !legal) {
            legal = { ...r.dialog, atMs: Date.now() - t0, answered: null };
            if (ACCEPT_LEGAL) {
              legal.answered = await c.page.evaluate(() => { const el = document.querySelector('[data-testid="tos-dialog"]');
                const b = el && [...el.shadowRoot.querySelectorAll("button")].find((x) => /agree/i.test(x.textContent)); if (!b) return null; b.click(); return b.textContent.trim(); });
            }
          }
          return r.done;
        }, WAIT_MS, "the lens to go live or fail");
      } catch (e) { outcome = "TIMEOUT after " + WAIT_MS + "ms"; }
      if (legal) {
        say("  LEGAL PROMPT", "Snap's terms dialog appeared " + legal.atMs + "ms after the pick — modal=" + legal.modal + ", buttons: " + legal.buttons.join(" / "));
        say("              ", JSON.stringify(legal.text));
        say("              ", legal.answered ? "--accept-legal: tapped \"" + legal.answered + "\"" : "NOT ANSWERED (nobody here to; --accept-legal taps I Agree) — what follows is the app's start ceiling, " + cfg.startMs + "ms");
      }
      const ms = Date.now() - t0;
      const st1 = await c.page.evaluate(() => ({ K: window.__lc.CAMKIT_STATE, F: window.__lc.FILTER_STATE }));
      say("  outcome   ", outcome, "after " + ms + "ms");
      say("  CAMKIT_STATE", JSON.stringify(st1.K));
      if (outcome !== "live") { failed++; say("  FILTER_STATE", JSON.stringify(st1.F)); }
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
      const bad = c.logs.filter((m) => m.type === "error" || m.type === "warning").filter((m) => !/favicon/.test(m.text));
      say("  console   ", bad.length + " error/warning message(s)" + (bad.length ? ":" : ""));
      for (const m of bad.slice(0, 15)) say("    | [" + m.type + "] " + m.text.slice(0, 300));
      if (c.errors.length) failed++;
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
