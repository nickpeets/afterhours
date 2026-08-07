/* GATE 3 — forbidden: the three bugs currently in flight, encoded as
 * patterns that must never (re)appear in the shipped artifact.
 *
 *   A. `.load()` on a video element / srcObject nulled-then-reassigned —
 *      both restart playback and cause the video blip.
 *   B. headcount derivation must exist in exactly ONE place.  Until the
 *      unified derivation (`roomCounts`) exists, every raw count expression
 *      is its own derivation — more than one is the lobby/room/line
 *      disagreement bug.  Once `roomCounts` exists, any raw count
 *      expression OUTSIDE it is a violation.
 *   C. the bench role may be written from exactly ONE call site (the
 *      capture-gated entry point).  A second `join_line` call site — or any
 *      direct role write — is the "bench seat with no headshot" bug.
 */
"use strict";

function jsOf(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join("\n/* --- */\n");
}
const lineOf = (src, idx) => src.slice(0, idx).split("\n").length;

module.exports = {
  name: "forbidden",
  async run(t, ctx) {
    const js = jsOf(ctx.html);

    /* ---- A. video restart patterns ---- */
    const loads = [...js.matchAll(/\.load\(\)/g)];
    t.ok(loads.length === 0,
      `.load() never called (found ${loads.length}: L` + loads.map((m) => lineOf(js, m.index)).join(",L") + ")");
    const nulls = [...js.matchAll(/srcObject\s*=\s*null/g)];
    t.ok(nulls.length === 0,
      `srcObject never nulled-then-reassigned (found ${nulls.length}: L` + nulls.map((m) => lineOf(js, m.index)).join(",L") + ")");

    /* ---- B. one headcount derivation ---- */
    const countSignatures = [
      { name: "lobby active_members filter-count", re: /filter\(\s*m\s*=>\s*m\.role\s*!==\s*"gone"\s*\)\.length/g },
      { name: "room header members.length", re: /rt_count"\)\.textContent\s*=[^;\n]*members\.length/g },
      { name: "line watchbar arithmetic", re: /line\.length\s*-\s*3/g },
      { name: "bench slice count", re: /Math\.max\(\s*0\s*,\s*3\s*-\s*benched\.length\s*\)/g },
    ];
    const hasUnified = /function\s+roomCounts\s*\(/.test(js);
    const found = [];
    for (const sig of countSignatures) {
      for (const m of js.matchAll(sig.re)) found.push({ name: sig.name, line: lineOf(js, m.index) });
    }
    if (hasUnified) {
      t.ok(found.length === 0,
        "roomCounts() exists and no raw headcount derivation survives outside it" +
        (found.length ? " — but found: " + found.map((f) => f.name + "@L" + f.line).join(", ") : ""));
    } else {
      t.ok(found.length <= 1,
        "headcounts derive in one place — found " + found.length + " independent derivations: " +
        found.map((f) => f.name + "@L" + f.line).join(", ") +
        " (no unified roomCounts() exists; each site is its own truth)");
    }

    /* ---- C. one bench-role entry point ---- */
    const joinLineSites = [...js.matchAll(/rpc\(\s*"join_line"/g)];
    t.ok(joinLineSites.length === 1,
      `bench role written from exactly one call site (found ${joinLineSites.length}: L` +
      joinLineSites.map((m) => lineOf(js, m.index)).join(",L") + ")");
    const directRoleWrites = [...js.matchAll(/room_members"\s*\)\s*\.\s*(update|upsert|insert)/g)];
    t.ok(directRoleWrites.length === 0,
      `no direct client-side room_members writes (found ${directRoleWrites.length})`);
    const roleLiteralWrites = [...js.matchAll(/\.role\s*=\s*["'](line|chair|kept)["']/g)];
    t.ok(roleLiteralWrites.length === 0,
      `no client-side role mutation (found ${roleLiteralWrites.length}: L` +
      roleLiteralWrites.map((m) => lineOf(js, m.index)).join(",L") + ")");
  },
};
