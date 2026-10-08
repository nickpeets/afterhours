/* GATE 81 — custom-domain: the site moves from nickpeets.github.io/afterhours/
 * to https://lastcall.love (apex) + www (chore/custom-domain, 2026-10-08).
 * GitHub Pages reads the custom domain from a CNAME file at the repo root
 * (Pages deploys from the main branch, so the Settings box would commit
 * straight to main — the file is the PR-reviewable route).
 *
 * STATIC claims, source-text only (METHOD: a source claim is a regex on the
 * file, not runtime introspection):
 *   1. CNAME exists, holds exactly `lastcall.love` and nothing else — a
 *      stray `www.`, scheme, path or second line would point Pages wrong
 *   2. the service worker registers on the new host (the hostname allow-list
 *      in index.html names lastcall.love) — otherwise the apex would run
 *      without the network-first worker that makes deploys instant
 *   3. nothing in the shipped files hard-codes the old /afterhours/ path or
 *      origin (manifest start_url/scope and every asset path stay relative)
 */
"use strict";
const fs = require("fs");
const path = require("path");

module.exports = {
  name: "custom-domain",
  async run(t, ctx) {
    const cnamePath = path.join(ctx.repo, "CNAME");
    t.ok(fs.existsSync(cnamePath), "CNAME exists at the repo root");
    const cname = fs.existsSync(cnamePath) ? fs.readFileSync(cnamePath, "utf8") : "";
    t.ok(cname === "lastcall.love\n", `CNAME is exactly "lastcall.love" + newline (got ${JSON.stringify(cname)})`);
    t.ok(/if\(\/nickpeets\\\.github\\\.io\|lastcall\\\.love\|localhost\/\.test\(location\.hostname\)\)/.test(ctx.html),
      "the service-worker registration allow-list names lastcall.love");
    const manifest = JSON.parse(fs.readFileSync(path.join(ctx.repo, "manifest.webmanifest"), "utf8"));
    t.ok(manifest.start_url === "./" && manifest.scope === "./", `manifest start_url/scope are relative (${manifest.start_url}, ${manifest.scope})`);
    for (const f of ["index.html", "sw.js", "manifest.webmanifest", "privacy.html", "terms.html"]) {
      const src = fs.readFileSync(path.join(ctx.repo, f), "utf8");
      const hits = (src.match(/nickpeets\.github\.io\/afterhours|["'(]\/afterhours\//g) || []).length;
      t.ok(hits === 0, `${f}: no hard-coded /afterhours/ path or old origin (${hits} found)`);
    }
  },
};
