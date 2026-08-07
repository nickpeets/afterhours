/* run.js — the battery runner.  Executes every gate in tools/gates in
 * filename order, tallies checks, prints stamp + gate count + check count,
 * exits nonzero on any failure.  Invoked by tools/verify.sh.
 */
"use strict";

const fs = require("fs");
const path = require("path");

const TOOLS = path.resolve(__dirname, "..");
const REPO = path.resolve(TOOLS, "..");
const GATES_DIR = path.join(TOOLS, "gates");

class Tally {
  constructor(gateName) { this.gate = gateName; this.count = 0; this.failures = []; this.notes = []; }
  ok(cond, msg) {
    this.count++;
    if (!cond) this.failures.push(msg);
    return !!cond;
  }
  fail(msg) { this.count++; this.failures.push(msg); }
  note(msg) { this.notes.push(msg); }
}

async function main() {
  const args = process.argv.slice(2);
  const updateGolden = args.includes("--update-golden");
  const only = (args.find((a) => a.startsWith("--only=")) || "").replace("--only=", "");

  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const stampMatch = html.match(/id="buildstamp">([^<]*)</);
  const stamp = stampMatch ? stampMatch[1] : "(no stamp)";

  const files = fs.readdirSync(GATES_DIR).filter((f) => f.endsWith(".js")).sort();
  const ctx = { repo: REPO, tools: TOOLS, html, stamp, updateGolden };

  console.log("LAST CALL battery v2 — build stamp " + stamp);
  console.log("=".repeat(64));

  let totalChecks = 0, failedGates = 0, ranGates = 0;
  for (const f of files) {
    const gate = require(path.join(GATES_DIR, f));
    if (only && gate.name !== only) continue;
    ranGates++;
    const t = new Tally(gate.name);
    const t0 = Date.now();
    try {
      await gate.run(t, ctx);
    } catch (e) {
      t.fail("gate crashed: " + (e && e.stack || e));
    }
    totalChecks += t.count;
    const dur = ((Date.now() - t0) / 1000).toFixed(1) + "s";
    for (const n of t.notes) console.log("  · " + n);
    if (t.failures.length) {
      failedGates++;
      console.log(`✗ GATE ${gate.name.padEnd(14)} FAIL  (${t.count} checks, ${t.failures.length} failed, ${dur})`);
      for (const msg of t.failures) console.log("    ↳ " + msg);
    } else {
      console.log(`✓ GATE ${gate.name.padEnd(14)} PASS  (${t.count} checks, ${dur})`);
    }
  }

  console.log("=".repeat(64));
  console.log(`stamp ${stamp} · ${ranGates} gates · ${totalChecks} checks · ${failedGates ? failedGates + " GATE(S) FAILED" : "all clean"}`);
  process.exit(failedGates ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
