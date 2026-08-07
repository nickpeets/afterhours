/* GATE 12 — bench-entry: one door onto the bench, and the host's hand is
 * never stayed.  Ships with fix/bench-entry-and-host-seat.
 *
 * STATIC: exactly one bench-role write site (the join_line RPC), and it
 * lives INSIDE takeBenchSeat() — proven by AST ranges (acorn), not by eye.
 *
 * RUNTIME, all through the real UI / real __lc references:
 *   - ♥ TAKE A BENCH SEAT: capture gate (#snap) appears BEFORE the role
 *     write; the man lands on the bench with a face on file.
 *   - empty-chair tap: same door, same capture, same result.
 *   - rejoin after reload with face already on file: bench restored
 *     SILENTLY — the capture screen never shows, the photo is unchanged.
 *   - host tap seats an individual at bench count 1 and 2 (no waiting for
 *     three), and the three-at-once rule survives ONLY as the automatic
 *     curtain-up when 3 sit benched with no host tap.  Both coexist.
 */
"use strict";
const acorn = require("acorn");
const walk = require("acorn-walk");
const { Harness } = require("../lib/harness");

function jsOf(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join("\n/* --- */\n");
}

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 250));
  }
};

module.exports = {
  name: "bench-entry",
  async run(t, ctx) {
    /* ---------- STATIC: one write site, inside the one door ---------- */
    const js = jsOf(ctx.html);
    const sites = [...js.matchAll(/rpc\(\s*"join_line"/g)].map((m) => m.index);
    t.ok(sites.length === 1, `exactly one bench-role write site (found ${sites.length})`);
    let doorRange = null;
    const ast = acorn.parse(js, { ecmaVersion: "latest" });
    walk.simple(ast, {
      FunctionDeclaration(n) { if (n.id && n.id.name === "takeBenchSeat") doorRange = [n.start, n.end]; },
    });
    t.ok(!!doorRange, "takeBenchSeat() exists as a real function declaration");
    t.ok(!!doorRange && sites.length === 1 && sites[0] > doorRange[0] && sites[0] < doorRange[1],
      "the single join_line write site sits INSIDE takeBenchSeat (AST range check)");

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      const uA = D.addUser({ id: "u_a", name: "Suitor A" });
      const uB = D.addUser({ id: "u_b", name: "Suitor B" });
      const uC = D.addUser({ id: "u_c", name: "Rejoiner C" });

      const boot = async (name, uid) => {
        const c = await h.newClient(name);
        c.login(uid);
        await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const enter = async (c, roomId) => {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomId) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        return c;
      };

      // the host client boots BEFORE the room exists: a booting host ends any
      // live room it already owns (crash recovery), which would kill the fixture
      const host = await boot("host", hostU);
      const room = D.addRoom({ id: "r_bench", host_id: hostU, name: "Bench Night", phase: "preshow", round: 0 });
      const open = async (name, uid) => enter(await boot(name, uid), room);

      /* --- path 1: the ♥ button, capture gate ahead of the role write --- */
      const a = await open("suitorA", uA);
      await a.page.click("#rt_joinline");
      await waitFor(() => a.page.evaluate(() => document.getElementById("snap").classList.contains("show")), 6000,
        "capture screen for the ♥ button path");
      const roleDuringCapture = (D.memberRow(room, "u_a") || {}).role || "(none)";
      t.ok(roleDuringCapture !== "line",
        `capture gate opens BEFORE the role write on the ♥ path (role during capture: ${roleDuringCapture})`);
      await waitFor(() => (D.memberRow(room, "u_a") || {}).role === "line", 15000, "suitor A benched");
      t.ok(true, "♥ TAKE A BENCH SEAT lands on the bench through the capture gate");
      t.ok(!!D.profiles.get("u_a")?.face_json?.photo, "the ♥ path captured a headshot (face_json on file)");

      /* --- path 2: the empty-chair tap funnels into the same door --- */
      const b = await open("suitorB", uB);
      await b.page.click("[data-takechair]");
      await waitFor(() => b.page.evaluate(() => document.getElementById("snap").classList.contains("show")), 6000,
        "capture screen for the empty-chair tap path");
      t.ok(true, "empty-chair tap raises the same capture gate");
      await waitFor(() => (D.memberRow(room, "u_b") || {}).role === "line", 15000, "suitor B benched");
      t.ok(!!D.profiles.get("u_b")?.face_json?.photo, "the empty-chair path captured a headshot too");

      /* --- rejoin/session-restore: face on file → silent, no re-prompt --- */
      const PRESET = "data:image/jpeg;base64,PRESETFACE";
      D.profiles.get("u_c").face_json = { photo: PRESET };
      D.addMember(room, "u_c", "line");
      const c = await open("rejoinC", uC);
      let snapShown = false;
      const probe = setInterval(() => {
        c.page.evaluate(() => document.getElementById("snap").classList.contains("show"))
          .then((v) => { if (v) snapShown = true; }).catch(() => {});
      }, 150);
      await waitFor(() => D.rpcLog.some((r) => r.clientId === "rejoinC" && r.name === "join_line"), 10000,
        "rejoin path re-affirms through the one door");
      await c.page.waitForTimeout(1200);
      clearInterval(probe);
      t.ok((D.memberRow(room, "u_c") || {}).role === "line", "reload lands him back on the bench");
      t.ok(!snapShown, "restore is SILENT — the capture screen never appears on rejoin");
      t.ok(D.profiles.get("u_c").face_json.photo === PRESET, "no re-capture: face_json is byte-identical");

      /* --- host taps seat individuals at bench 1, 2, 3 — no count guard ---
             The room is moved to a live phase first: in preshow the automatic
             curtain-up (tested separately below) would race the taps. */
      D.rooms.get(room).phase = "spotlight";
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 120000);
      await enter(host, room);
      const benchN = () => D.members.filter((m) => m.room_id === room && m.role === "line").length;
      t.ok(benchN() === 3, "fixture sanity: three men on the bench (A, B, C)");
      // NOTE: bench order is stable (sorted by membership row id) — tap lane 0 twice
      await waitFor(() => host.page.evaluate(() => !!document.getElementById("rt_bench0").dataset.benchuid), 8000, "bench lanes render for the host");
      const seated = () => D.members.filter((m) => m.room_id === room && (m.role === "chair" || m.role === "kept")).length;
      await host.page.click("#rt_bench0");
      await waitFor(() => seated() === 1, 8000, "host tap at bench=3 seats ONE man immediately");
      t.ok(true, "host tap seats an individual immediately (no waiting for the curtain)");
      await waitFor(() => host.page.evaluate(() => !!document.getElementById("rt_bench0").dataset.benchuid), 8000, "lanes re-render");
      await host.page.click("#rt_bench0");
      await waitFor(() => seated() === 2, 8000, "host tap at bench=2 seats");
      t.ok(benchN() === 1, "bench=1 remains");
      await waitFor(() => host.page.evaluate(() => !!document.getElementById("rt_bench0").dataset.benchuid), 8000, "lane re-renders");
      await host.page.click("#rt_bench0");
      await waitFor(() => seated() === 3, 8000, "host tap at bench=1 seats");
      t.ok(true, "host tap seats at bench count 1, 2 — and 3 (previous tap) — no disabled state, no count guard");

      /* --- the three-at-once rule survives as AUTO curtain-up (no tap) --- */
      const host2U = D.addUser({ id: "u_host2", name: "Hostess Two", email: "h2@fix.test" });
      const h2 = await boot("host2", host2U);   // boot first: crash recovery would end a pre-owned live room
      const room2 = D.addRoom({ id: "r_auto", host_id: host2U, name: "Auto Night", phase: "preshow", round: 0 });
      ["u_l1", "u_l2", "u_l3"].forEach((id) => { D.addUser({ id, name: id }); D.addMember(room2, id, "line"); });
      await enter(h2, room2);
      await waitFor(() => D.members.filter((m) => m.room_id === room2 && m.role === "chair").length === 3, 20000,
        "auto curtain-up seats all three");
      t.ok(true, "3 simultaneously benched with NO host tap → automatic curtain-up still fires (both mechanics coexist)");

      const errs = [a, b, c, host, h2].flatMap((cl) => cl.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across all five windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
