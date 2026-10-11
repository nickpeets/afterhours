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
 *   - rejoin after reload: the capture RUNS AGAIN.  There is no on-file
 *     shortcut — takeBenchSeat() calls benchHeadshot() unconditionally, so
 *     every bench join re-takes the photo and rewrites face_json.  The
 *     on-file skip was removed by ruling 2026-08-23 (confirmed 2026-09-09);
 *     this gate asserted the old contract until then.
 *   - host tap seats an individual at bench count 1 and 2 (no waiting for
 *     three), and the three-at-once rule survives ONLY as the automatic
 *     curtain-up when 3 sit benched with no host tap.  Both coexist.
 *
 * THE PHOTO IS A REAL FRAME OR IT IS NOTHING (fix/bench-headshot-real-frame).
 * Live run at b1010.1315, an iPhone: capture screen, 3-2-1, save 204 — and
 * face_json.photo was 320x427 of pure black.  This gate asserted only
 * `!!face_json.photo`, which a black JPEG satisfies; and the harness camera
 * always has a frame within milliseconds, so the draw-before-first-frame
 * race could not be reached.  WHAT THE HARNESS FAKED: a camera that is
 * instantly live.  Closed with lib/harness.js CAMERA_FAULTS (noframe, black,
 * late) and the scenes below:
 *   - the normal capture's photo has LIT pixels (not merely exists)
 *   - the capture stage is styled again: framed self-view, big countdown,
 *     the heading not buried under the video
 *   - a late first frame (3.2s — the old fixed sleep drew at 2.7s) still
 *     yields a lit photo, and the 3-2-1 never shows before a frame exists
 *   - no frame at all / black frames: no photo is saved, the photo that WAS
 *     on file is cleared, the man is still benched, he is told by toast,
 *     his lane paints no face (the no-photo look), and [bench] names the reason
 *   - a refused save is read ({error} resolves, it does not throw) and told
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

      /* --- rejoin/session-restore: the capture RUNS AGAIN — no face-on-file shortcut --- */
      const PRESET = "data:image/jpeg;base64,PRESETFACE";
      D.profiles.get("u_c").face_json = { photo: PRESET };
      D.addMember(room, "u_c", "line");
      /* The write half is op==="table"; rpcLog only records op==="rpc"
         (backend-double.js), so the profiles update is invisible to it.
         Same own-property instrument gate 62 uses to see table writes. */
      const faceWrites = [];
      const origTable = D.table.bind(D);
      D.table = (clientId, spec) => {
        faceWrites.push({ table: spec.table, action: spec.action, values: spec.values });
        return origTable(clientId, spec);
      };
      /* The capture overlay lives ~3s inside room entry and is gone before
         open() resolves, so nothing armed after open() can see it.  (The old
         150ms page.evaluate poll never fired at all: it throws mid-reload and
         its .catch swallowed the throw, so !snapShown passed against every
         possible behaviour.)  The harness arms a MutationObserver latch on
         #snap at context creation — lib/harness.js SNAP_LATCH — before
         index.html runs, and exposes it as window.__lc.harness.snapSeen. */
      const c = await open("rejoinC", uC);
      await waitFor(() => D.rpcLog.some((r) => r.clientId === "rejoinC" && r.name === "join_line"), 10000,
        "rejoin path re-affirms through the one door");
      await c.page.waitForTimeout(1200);
      D.table = origTable;
      t.ok((D.memberRow(room, "u_c") || {}).role === "line", "reload lands him back on the bench");
      const snapSeen = await c.page.evaluate(() => !!(window.__lc && window.__lc.harness && window.__lc.harness.snapSeen));
      t.ok(snapSeen, "the capture screen appeared during rejoin — latch armed before entry, read through window.__lc.harness");
      const faceWrite = faceWrites.find((w) => w.table === "profiles" && (w.action === "update" || w.action === "upsert") && w.values && w.values.face_json);
      t.ok(!!faceWrite, "the rejoin wrote face_json through the profiles table — no on-file shortcut");
      const rejoinPhoto = faceWrite && faceWrite.values.face_json && faceWrite.values.face_json.photo;
      t.ok(!!rejoinPhoto && rejoinPhoto !== PRESET, "the re-taken photo differs from the seeded PRESET — a real re-capture, not a re-affirm");
      t.ok((D.profiles.get("u_c").face_json || {}).photo !== PRESET, "the profile on file no longer carries the PRESET photo");

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

      /* ---------- THE PHOTO IS A REAL FRAME OR IT IS NOTHING ---------- */
      // decoded in the page: a JPEG that exists is not a face
      const photoStats = (cl, p) => cl.page.evaluate(async (p) => {
        if (!p) return null;
        const img = new Image();
        await new Promise((r) => { img.onload = r; img.onerror = r; img.src = p; });
        if (!img.naturalWidth) return { w: 0, h: 0, max: 0 };
        const cv = document.createElement("canvas"); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
        const g = cv.getContext("2d"); g.drawImage(img, 0, 0);
        const d = g.getImageData(0, 0, cv.width, cv.height).data;
        let max = 0;
        for (let i = 0; i < d.length; i += 4) { const l = Math.max(d[i], d[i + 1], d[i + 2]); if (l > max) max = l; }
        return { w: img.naturalWidth, h: img.naturalHeight, max };
      }, p);
      const toastOf = (cl) => cl.page.evaluate(() => { const el = document.getElementById("toast"); return el && el.classList.contains("show") ? el.textContent : ""; });
      const laneOf = (cl, uid) => cl.page.evaluate((uid) => {
        const l = [...document.querySelectorAll(".lc-lane")].find((x) => x.dataset.benchuid === uid);
        if (!l) return null;
        const f = l.querySelector(".lc-lane__face"), sil = l.querySelector(".lc-lane__sil");
        return { hasSrc: !!f.dataset.src, bg: getComputedStyle(f).backgroundImage, sil: getComputedStyle(sil).display,
                 blind: document.getElementById("lineitems").classList.contains("is-blind") };
      }, uid);
      const benchLogs = (cl) => cl.logs.map((l) => l.text).filter((x) => x.startsWith("[bench]"));

      // the normal captures above: lit, not merely present
      const litA = await photoStats(a, D.profiles.get("u_a").face_json.photo);
      t.ok(!!litA && litA.w === 320 && litA.max > 16, `the ♥ path's photo is a LIT frame, not merely a string (${JSON.stringify(litA)})`);

      // a fresh room: the fixture above counts its bench
      const host3U = D.addUser({ id: "u_host3", name: "Hostess Three", email: "h3@fix.test" });
      const h3 = await boot("host3", host3U);
      const room3 = D.addRoom({ id: "r_cam", host_id: host3U, name: "Camera Night", phase: "spotlight", round: 1 });
      D.rooms.get(room3).phase_deadline = D.iso(D.now() + 600000);
      const PRESET3 = "data:image/jpeg;base64,OLDFACEONFILE";
      const PROBE = `window.__capProbe = { countNoFrame: 0, samples: 0, stage: null };
        setInterval(() => {
          const st = document.getElementById("snap_stage"), sn = document.getElementById("snap");
          if (!st || !sn || !sn.classList.contains("show")) return;
          const v = st.querySelector("video"), ct = (document.getElementById("snap_count") || {}).textContent || "";
          window.__capProbe.samples++;
          if (ct && (!v || !v.videoWidth)) window.__capProbe.countNoFrame++;
          if (ct && !window.__capProbe.stage) {
            const r = st.getBoundingClientRect(), h1 = sn.querySelector("h1"), hr = h1.getBoundingClientRect();
            const top = document.elementFromPoint(hr.left + hr.width / 2, hr.top + hr.height / 2);
            window.__capProbe.stage = { pos: getComputedStyle(st).position, w: Math.round(r.width), h: Math.round(r.height),
              countPx: parseFloat(getComputedStyle(document.getElementById("snap_count")).fontSize),
              headingOnTop: top === h1, videoW: v ? Math.round(v.getBoundingClientRect().width) : 0 };
          }
        }, 40);`;
      const camClient = async (name, uid, kind, ms) => {
        D.addUser({ id: uid, name });
        D.profiles.get(uid).face_json = { photo: PRESET3 };
        const cl = await h.newClient(name);
        if (kind) await cl.cameraFault(kind, ms);
        await cl.context.addInitScript(PROBE);
        cl.login(uid);
        await cl.goto();
        await cl.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        await enter(cl, room3);
        return cl;
      };
      const takeSeat = async (cl, uid, what) => {
        await cl.page.click("#rt_joinline");
        await waitFor(() => cl.page.evaluate(() => document.getElementById("snap").classList.contains("show")), 6000, "capture screen (" + what + ")");
        await waitFor(() => (D.memberRow(room3, uid) || {}).role === "line", 25000, what + " benched");
      };

      /* --- late first frame: 3.2s, past where the old fixed sleep drew (2.7s) --- */
      const late = await camClient("lateCam", "u_late", "late", 3200);
      await takeSeat(late, "u_late", "late-frame camera");
      const latePhoto = (D.profiles.get("u_late").face_json || {}).photo;
      const litLate = await photoStats(late, latePhoto);
      t.ok(!!latePhoto && latePhoto !== PRESET3 && !!litLate && litLate.max > 16,
        `a first frame 3.2s late still yields a LIT photo — the capture waits for the frame (${JSON.stringify(litLate)})`);
      const lateProbe = await late.page.evaluate(() => window.__capProbe);
      t.ok(lateProbe.samples > 10 && lateProbe.countNoFrame === 0,
        `the 3-2-1 never shows before the camera has a frame (${lateProbe.countNoFrame} of ${lateProbe.samples} samples)`);
      const st = lateProbe.stage || {};
      t.ok(st.pos === "relative" && st.w >= 200 && st.h > st.w && st.videoW <= st.w,
        `the capture stage is a framed portrait again, the self-view inside it (${JSON.stringify(st)})`);
      t.ok(st.countPx >= 60, `the countdown is display-size, not body text (${st.countPx}px)`);
      t.ok(st.headingOnTop === true, "FACE THE ROOM is not buried under the self-view");
      const lateToast = await waitFor(() => toastOf(late), 5000, "bench toast (late camera)");
      t.ok(/on the bench/.test(lateToast) && !/didn't take/.test(lateToast), "a good photo gets the ordinary bench toast — " + lateToast);
      await waitFor(async () => { const l = await laneOf(late, "u_late"); return l && l.hasSrc; }, 8000, "his lane shows the photo");
      t.ok(true, "his own lane (crowd view) carries the photo");

      /* --- no frame at all, and black frames: nothing saved, old photo cleared, he is told --- */
      for (const [kind, uid, reason] of [["noframe", "u_nof", /no frame from the camera/], ["black", "u_blk", /frames are black/]]) {
        const cl = await camClient(kind + "Cam", uid, kind);
        await takeSeat(cl, uid, kind + " camera");
        t.ok(true, `${kind} camera: he is still benched (graceful degrade)`);
        const fj = D.profiles.get(uid).face_json || {};
        t.ok(!fj.photo, `${kind} camera: NO photo is saved, and the photo that was on file is cleared (face_json=${JSON.stringify(fj).slice(0, 60)})`);
        const tt = await waitFor(() => toastOf(cl), 5000, "toast (" + kind + ")");
        t.ok(/photo didn't take/.test(tt), `${kind} camera: he is told — "${tt}"`);
        const logs = benchLogs(cl);
        t.ok(logs.some((x) => reason.test(x)) && logs.some((x) => /retrying once/.test(x)) && logs.some((x) => /headshot FAILED/.test(x)),
          `${kind} camera: [bench] names the reason, the one retry, and the failure — ${logs.slice(0, 2).join(" | ").slice(0, 200)}`);
        t.ok(logs.some((x) => /videoWidth=\d+ readyState=\d/.test(x)), `${kind} camera: the diagnostic carries the element's state (videoWidth, readyState, track)`);
        const lane = await waitFor(() => laneOf(cl, uid), 8000, "his lane (" + kind + ")");
        t.ok(!lane.blind && !lane.hasSrc && lane.bg === "none",
          `${kind} camera: his lane paints NO face — not the black frame, not the stale one (${JSON.stringify(lane)})`);
        const pr = await cl.page.evaluate(() => window.__capProbe);
        t.ok(kind !== "noframe" || pr.countNoFrame === 0, `${kind} camera: no countdown ran over an empty stage (${pr.countNoFrame})`);
        if (kind === "black") late.errors.push(...cl.errors); else h3.errors.push(...cl.errors);
      }

      /* --- a refused save is READ: {error} resolves, it does not throw --- */
      const sv = await camClient("saveFail", "u_sav", null);
      D.setFault("table:profiles.update", "saveFail", { error: "permission denied for table profiles" });
      await takeSeat(sv, "u_sav", "refused save");
      const svToast = await waitFor(() => toastOf(sv), 5000, "toast (refused save)");
      D.setFault("table:profiles.update", "saveFail", null);
      t.ok(/photo didn't take/.test(svToast), `a refused save is told, not swallowed — "${svToast}"`);
      t.ok(benchLogs(sv).some((x) => /save failed: permission denied/.test(x)), "[bench] carries the save's error message");
      t.ok((D.profiles.get("u_sav").face_json || {}).photo === PRESET3, "fixture sanity: the refused writes really did not land");
      const svCache = await sv.page.evaluate(() => { const p = window.__PROFS_EVER && window.__PROFS_EVER["u_sav"]; return p && p.face_json ? p.face_json.photo || "" : ""; });
      t.ok(!/^data:image\/jpeg;base64,\/9j/.test(svCache), "the local cache did not run ahead of the table with the unsaved photo");

      const errs = [a, b, c, host, h2, h3, late, sv].flatMap((cl) => cl.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across every window — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
