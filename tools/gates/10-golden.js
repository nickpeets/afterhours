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

module.exports = {
  name: "golden",
  async run(t, ctx) {
    const metaPath = path.join(GOLDEN, "META.json");
    const meta = fs.existsSync(metaPath) ? JSON.parse(fs.readFileSync(metaPath, "utf8")) : null;
    t.note("golden: regression baseline only — captured from build " +
      (ctx.updateGolden ? ctx.stamp : (meta ? meta.capturedFrom : "(none yet)")) +
      ", not mock-conformant.  It catches changes; it does not prove correctness; that build's bugs are baked in.");

    const h = await Harness.launch();
    try {
      const fx = fixtures.standardRoster(h.double);
      const frames = [
        { name: "auth", make: () => frameAuth(h) },
        { name: "lobby", make: () => frameLobby(h, fx) },
        { name: "room", make: () => frameRoom(h, fx) },
      ];
      for (const f of frames) {
        const c = await f.make();
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
              t.fail(f.name + `: ${n} px differ (${(ratio * 100).toFixed(3)}% > ${MAX_DIFF_RATIO * 100}%) — see tools/golden/.diffs/${f.name}.diff.png`);
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
          note: "REGRESSION baseline only — captured from the live build, NOT mock-conformant; that build's bugs are baked in.",
        }, null, 2) + "\n");
        t.ok(true, "golden META updated (capturedFrom " + ctx.stamp + ")");
      }
    } finally { await h.close(); }
  },
};
