/* GATE 10 — golden: full-frame diff vs /tools/golden.
 *
 * ── REGRESSION BASELINE ONLY ─────────────────────────────────────────────
 * The DC mock reference files are gone; there is nothing left to conform
 * to.  These baselines were captured from the CURRENT live build — they
 * catch CHANGES, they do not prove correctness, and every bug live in that
 * build is baked into them.  The gate prints this label on every run.
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Frames: auth (guest, cold) · lobby (crowd view) · room (spectator view).
 * Masked: build stamp, session slot, whoami slot, host age line (ages derive
 * from today's date and would drift the frame annually).
 * Regenerate: tools/verify.sh --update-golden
 */
"use strict";
const fs = require("fs");
const path = require("path");
const { PNG } = require("pngjs");
const pixelmatch = require("pixelmatch").default || require("pixelmatch");
const { Harness } = require("../lib/harness");
const fixtures = require("../lib/fixtures");

const GOLDEN = path.resolve(__dirname, "..", "golden");
const DIFFS = path.join(GOLDEN, ".diffs");
const MASKS = ["#buildstamp", "#sessionslot", "#whoami_slot", "[id^=meta_]"];
const MAX_DIFF_RATIO = 0.002;   // same box, same fonts: allow only antialias dust

async function frameAuth(h) {
  const c = await h.newClient("g-auth");
  await c.goto();
  await c.page.waitForSelector("#auth", { timeout: 15000 });
  return c;
}
async function frameLobby(h, fx) {
  const c = await h.newClient("g-lobby");
  c.login(fx.crowd[0]);
  await c.goto();
  await c.page.waitForSelector(".roomcard", { timeout: 15000 });
  return c;
}
async function frameRoom(h, fx) {
  const c = await h.newClient("g-room");
  c.login(fx.crowd[1]);
  await c.goto();
  await c.page.waitForSelector(".roomcard", { timeout: 15000 });
  await c.page.click(".roomcard");
  await c.page.waitForSelector("#room.show", { timeout: 15000 });
  await c.page.waitForTimeout(1200);   // let the first render settle
  return c;
}

/* ── WHAT RENDERED THE FRAME IS PART OF THE FRAME ────────────────────────
 * A golden gate compares pixels without recording what drew them, so a
 * second environment reads as a regression.  That is not hypothetical
 * here: this baseline was regenerated in a Codespace (Chromium build
 * 1234) while a parallel container (build 1194) produced different bytes
 * for the same commit — identical fonts, different browser.  The frames
 * still matched within budget, but the next Chromium bump on either side
 * may not, and the failure would name the app rather than the machine.
 *
 * So the baseline now records the browser version and the font metrics
 * that rendered it, and a run under anything else SAYS SO — in a note,
 * and inside any frame failure.  It does not fail on a mismatch: a
 * divergent environment is a fact to state, not a verdict to render, and
 * failing would only teach people to ignore the gate. */
function fingerprint(h, page) {
  return page.evaluate(() => {
    const cx = document.createElement("canvas").getContext("2d");
    const w = (fam) => { cx.font = "16px " + fam; return Math.round(cx.measureText("LAST CALL — Hostess 0123456789 gjpqy").width * 100) / 100; };
    return { font: { sans: w("sans-serif"), serif: w("serif"), mono: w("monospace") } };
  }).then((r) => ({ chromium: h.browser.version(), font: r.font }));
}
const describe = (fp) => "Chromium " + (fp && fp.chromium || "?") +
  " / fonts " + (fp && fp.font ? [fp.font.sans, fp.font.serif, fp.font.mono].join("·") : "?");
const same = (a, b) => a && b && a.chromium === b.chromium && JSON.stringify(a.font) === JSON.stringify(b.font);

module.exports = {
  name: "golden",
  async run(t, ctx) {
    const metaPath = path.join(GOLDEN, "META.json");
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null;
    t.note("golden: regression baseline only — captured from build " +
      (ctx.updateGolden ? ctx.stamp : (meta ? meta.capturedFrom : "(none yet)")) +
      ", not mock-conformant.  It catches changes; it does not prove correctness; that build's bugs are baked in.");

    const h = await Harness.launch();
    let envNote = "";
    try {
      const fx = fixtures.standardRoster(h.double);
      const frames = [
        { name: "auth", make: () => frameAuth(h) },
        { name: "lobby", make: () => frameLobby(h, fx) },
        { name: "room", make: () => frameRoom(h, fx) },
      ];
      let current = null;
      for (const f of frames) {
        const c = await f.make();
        if (!current) {
          current = await fingerprint(h, c.page);
          const cap = meta && meta.capturedWith;
          if (!cap) {
            envNote = "environment: running under " + describe(current) +
              ".  This baseline predates environment fingerprinting — regenerate it in the environment that owns the battery to record one.";
          } else if (!same(cap, current)) {
            envNote = "ENVIRONMENT DIVERGES — captured under " + describe(cap) +
              ", running under " + describe(current) +
              ".  Pixel drift below may be the environment rather than the app.";
          }
          if (envNote) t.note("golden: " + envNote);
        }
        const mask = [];
        for (const sel of MASKS) mask.push(c.page.locator(sel));
        const shot = await c.page.screenshot({ animations: "disabled", caret: "hide", mask });
        const file = path.join(GOLDEN, f.name + ".png");
        if (ctx.updateGolden || !fs.existsSync(file)) {
          fs.mkdirSync(GOLDEN, { recursive: true });
          fs.writeFileSync(file, shot);
          t.ok(true, f.name + ": baseline " + (ctx.updateGolden ? "regenerated" : "captured (was missing)"));
        } else {
          const base = PNG.sync.read(fs.readFileSync(file));
          const cur = PNG.sync.read(shot);
          if (base.width !== cur.width || base.height !== cur.height) {
            t.fail(f.name + `: frame size changed (${base.width}x${base.height} → ${cur.width}x${cur.height})`);
          } else {
            const diff = new PNG({ width: base.width, height: base.height });
            const n = pixelmatch(base.data, cur.data, diff.data, base.width, base.height, { threshold: 0.1 });
            const ratio = n / (base.width * base.height);
            if (ratio > MAX_DIFF_RATIO) {
              fs.mkdirSync(DIFFS, { recursive: true });
              fs.writeFileSync(path.join(DIFFS, f.name + ".diff.png"), PNG.sync.write(diff));
              fs.writeFileSync(path.join(DIFFS, f.name + ".current.png"), shot);
              t.fail(f.name + `: ${n} px differ (${(ratio * 100).toFixed(3)}% > ${MAX_DIFF_RATIO * 100}%) — see tools/golden/.diffs/${f.name}.diff.png` +
                (envNote ? "  [" + envNote + "]" : ""));
            } else {
              t.ok(true, f.name + `: matches baseline (${n} px of drift)`);
            }
          }
        }
        await c.close();
      }
      if (ctx.updateGolden) {
        fs.writeFileSync(metaPath, JSON.stringify({
          capturedFrom: ctx.stamp,
          capturedWith: current,
          note: "REGRESSION baseline only — captured from the live build, NOT mock-conformant; that build's bugs are baked in.",
          envNote: "capturedWith records WHAT RENDERED these frames.  Screenshots are not portable by default: the same commit under a different Chromium build produces different bytes, and different font resolution produces different pixels.  Regenerate in the environment that routinely runs the battery, not in whichever one happens to be handy.",
        }, null, 2) + "\n");
        t.ok(true, "golden META updated (capturedFrom " + ctx.stamp + ", capturedWith " + describe(current) + ")");
      }
    } finally { await h.close(); }
  },
};
