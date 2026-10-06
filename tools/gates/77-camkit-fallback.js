/* GATE 77 — camkit-fallback: every way a Camera Kit lens can fail lands on
 * the BARE CAMERA, still publishing, with a diagnostic line — and the failure
 * is latched, not retried on every roster commit.  Ships with feat/camera-kit.
 *
 * THE SHAPE UNDER TEST.  Everything slow or fallible about a lens happens
 * BEFORE the swap onto the call (SDK load, bootstrap, lens fetch, session
 * start), so a failure there never touches the camera: the same device track
 * keeps publishing and setInputDevicesAsync({ videoSource }) is never called.
 * A lens that dies AFTER it went live is taken down by the reconciler, the
 * only thing that stops a look.  Each case below is one real chair in one
 * real room: the server accepts his pick (the double's allow-list widened for
 * the harness's shim-only slug — no production DDL names it), his row says
 * 'foxears', and
 * his own client's reconciler has to cope.
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.  The failures
 * are produced where they really come from: the module failing to load is
 * injected at the NETWORK route (Harness.camkitLoadFault), a bad token /
 * unknown lens is rejected by the shim's own bootstrap / loadLens, and the
 * rest are the shim's fault hook (window.__camkitFaults).  "No storm" is read
 * off the wire and the shim's call log, not the app's counter.
 *
 * The cases:
 *   a. SDK module fails to load (connection refused)
 *   b. the address serves a module that is not the SDK
 *   c. bootstrap rejects — wrong API token (BootstrapError)
 *   d. bootstrap rejects — missing-in-effect token (ConfigurationError path
 *      is unreachable from the app: a null token is INERT, gate 75; so this
 *      case is the SDK calling the platform unsupported)
 *   e. the browser has no canvas.captureStream — never even requests the SDK
 *   f. the SDK hangs — the load ceiling fires, and the reconciler was never
 *      parked behind the download
 *   g. lens fetch fails — unknown lens id (the SDK itself is fine)
 *   h. session start fails — lens content rejects in applyLens
 *   i. the look is dropped WHILE the lens is still starting — it is never
 *      published, not even for a frame
 *   j. the lens dies mid-show (LensExecutionError) — reconciler restores the
 *      camera by device switch
 *   k. a fresh call is a fresh chance: after videoLeave + rejoin (and the
 *      token fixed) the same look goes live
 *   L. SNAP'S TERMS AT A LENS START (feat/camera-kit-staging — the real SDK's
 *      first applyLens shows a modal terms dialog and waits; found by the
 *      first real-SDK run, modelled by the shim's legal:"prompt").  Nick's
 *      ruling: the wait never counts against the start ceiling; Dismiss
 *      fails cleanly.
 *      L1. answered "I Agree" — the lens goes live; while the dialog is up
 *          the camera publishes untouched
 *      L2. left unanswered for nearly three times the start ceiling —
 *          NOTHING is latched and nothing is torn down; then "I Agree", and
 *          the lens goes live
 *      L3. answered "Dismiss" — the dialog closes, LegalError, bare camera,
 *          latched, and the log line says why
 *      L4. the ceiling is still a ceiling: with the terms accepted, an
 *          applyLens that hangs is given up on at startMs
 *      L5. ASKED while he is reading the terms: the ask clears his field;
 *          when he then agrees the lens is NOT published, not for a frame
 *   E. SNAP'S TERMS, ASKED EARLY (ruling 2): the first time the real shelf
 *      button opens the shelf on a ?camkit page, the first ✦ lens is applied
 *      on a HIDDEN session — public API only; no source, never played,
 *      nothing to do with the call — which is what raises the dialog; the
 *      session is destroyed as soon as he has answered
 *      E1. agreed at the shelf — then the ✦ tile: the lens starts with NO
 *          second dialog, no second SDK request, no second lens fetch; the
 *          hidden session was never given a source and never played
 *      E2. dismissed at the shelf — nothing latched, the dialog closes, the
 *          hidden session is destroyed, and re-opening the shelf does not
 *          ask again; the first lens start asks once more; dismissed again
 *          → bare camera, latched
 *      E3. the lens start arrives while he is still reading at the shelf —
 *          it waits for his answer AND for the hidden session to be gone:
 *          never a second dialog, never two sessions alive at once
 *      E4. the hidden session cannot be opened — nothing is asked, nothing
 *          is latched, nothing breaks; the dialog appears at the lens start
 *          instead, off the clock
 *      E5. a lens is already live when the shelf is first opened — no hidden
 *          session is opened beside it; the live lens is undisturbed
 * For a–h: same camera track before and after, playable; zero videoSource
 * swaps; the pipeline idle; the reason latched; the diagnostic line logged;
 * three more roster commits cause NO further SDK request / bootstrap / lens
 * fetch; no session, clone or hidden <video> left behind.
 */
"use strict";
const { Harness, CAMKIT_TEST } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 120));
  }
};
const SNAP = () => {
  const lv = window.__lc.DAILY && window.__lc.DAILY.participants().local.tracks.video;
  const cam = window.__dailyControl && window.__dailyControl.cameraTrack();
  const K = window.__camkitControl;
  return {
    F: window.__lc.FILTER_STATE, K: window.__lc.CAMKIT_STATE, room: window.__lc.FILTER_ROOM,
    state: lv ? lv.state : null, trackId: lv && lv.track ? lv.track.id : null, trackReady: lv && lv.track ? lv.track.readyState : null,
    camId: cam ? cam.id : null,
    log: window.__dailyControl ? window.__dailyControl.inputLog() : [],
    swaps: window.__dailyControl ? window.__dailyControl.inputLog().filter((e) => e.videoSource).length : 0,
    hiddenVideos: document.querySelectorAll("body > video").length,
    shim: K ? { bootstraps: K.bootstraps().length, lensLoads: K.lensLoads().length, sessions: K.sessions(), sources: K.sources() } : null,
  };
};

/* Snap's legal dialog, found the way the real one would be: by its test id,
   through its shadow root */
const LEGAL = () => {
  const el = document.querySelector('[data-testid="tos-dialog"]');
  const dg = el && el.shadowRoot && el.shadowRoot.querySelector("dialog");
  return { open: !!(dg && dg.open), modal: !!(dg && dg.matches(":modal")), inBody: !!(el && el.parentElement === document.body),
           buttons: dg ? [...dg.querySelectorAll("button")].map((b) => b.textContent.trim()) : [],
           shim: window.__camkitControl ? window.__camkitControl.legal() : null };
};
const LEGAL_TAP = (text) => {
  const el = document.querySelector('[data-testid="tos-dialog"]');
  const b = el && [...el.shadowRoot.querySelectorAll("button")].find((x) => x.textContent.trim() === text);
  if (!b) return false;
  b.click(); return true;
};

module.exports = {
  name: "camkit-fallback",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fallback.test" });
      D.loginClient("host", hostU);       // the host acts through the double only (her RPCs); no host page is needed here
      D.allowFilterLook("foxears");       // the shim-only slug: no production DDL names it — see the header
      let n = 0;
      /* one chair, one room, one fresh page per case */
      const seat = async (label, cfg) => {
        const uid = "u_" + label, rid = "r_" + label + "_" + (++n);
        D.addUser({ id: uid, name: uid });
        const room = D.addRoom({ id: rid, host_id: hostU, name: "Fallback " + label, phase: "spotlight", round: 1 });
        D.rooms.get(room).phase_deadline = D.iso(D.now() + 600_000);
        D.addMember(room, uid, "chair", { seat_index: 0 });
        const c = await h.newClient(label); c.login(uid); await c.goto("?camkit");   // feat/camera-kit-staging: lens looks exist only on a page loaded with ?camkit
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() =>
          window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 12_000, label + " publishing");
        await c.camkitConfigure(cfg || {});
        return { c, uid, room };
      };
      const sdkRequests = (c) => h.camkitRequests.filter((r) => r.client === c.name).length;
      const said = (c, re) => c.logs.some((l) => re.test(l.text));

      /* the common ending for a failure BEFORE the swap */
      const assertBare = async (label, S, before, expect) => {
        const { c, uid, room } = S;
        await waitFor(() => c.page.evaluate(expect.settled), 10_000, label + ": the failure to latch");
        await c.page.waitForTimeout(500);
        const a = await c.page.evaluate(SNAP);
        t.ok(D.memberRow(room, uid).filter === "foxears" && (a.room[uid] || {}).name === "foxears",
          `${label}: the server accepted the pick and his row says 'foxears' — the failure is the client's to survive`);
        t.ok(a.trackId === before.trackId && a.trackId === a.camId && a.state === "playable" && a.trackReady === "live",
          `${label}: the SAME camera track is still publishing, playable and live (${a.trackId})`);
        t.ok(a.swaps === 0 && a.log.length === before.log.length,
          `${label}: setInputDevicesAsync was never called — the camera was never touched (inputLog +${a.log.length - before.log.length})`);
        t.ok(a.F.active === false && a.F.canvasTrackId === null && a.F.cloneTrackId === null, `${label}: the pipeline is idle`);
        const latch = expect.lens ? a.K.lensDead.foxears : a.K.dead;
        t.ok(typeof latch === "string" && expect.reason.test(latch) && (expect.lens ? a.K.dead === null : true),
          `${label}: the reason is latched ${expect.lens ? "on the LENS (the SDK itself is fine)" : "on the SDK"} — "${latch}"`);
        t.ok(said(c, expect.line), `${label}: the diagnostic line was logged (${expect.line})`);
        t.ok(a.hiddenVideos === 0 && (!a.shim || (a.shim.sessions.every((s) => s.destroyed) && a.shim.sources.every((s) => s.trackReady === "ended"))),
          `${label}: nothing left behind — no hidden <video>, no live session, no leaked clone`);
        /* NO STORM: three more roster commits + an explicit reconcile */
        const w0 = sdkRequests(c), b0 = a.shim ? a.shim.bootstraps : 0, l0 = a.shim ? a.shim.lensLoads : 0, s0 = a.shim ? a.shim.sessions.length : 0;
        for (let i = 0; i < 3; i++) { await c.page.evaluate(() => window.__lc.loadRoomState()); await c.page.waitForTimeout(150); }
        await c.page.evaluate(() => window.__lc.filterReconcile());
        await c.page.waitForTimeout(300);
        const z = await c.page.evaluate(SNAP);
        t.ok(sdkRequests(c) === w0 && (z.shim ? z.shim.bootstraps : 0) === b0 && (z.shim ? z.shim.lensLoads : 0) === l0 && (z.shim ? z.shim.sessions.length : 0) === s0 && z.swaps === 0,
          `${label}: latched, not retried — three more roster commits cause no further SDK request, bootstrap, lens fetch or session (requests=${w0}, bootstraps=${b0}, lensLoads=${l0}, sessions=${s0})`);
        const errs = c.errors.filter((e) => !/favicon/.test(e) && !/camkit\.test|ERR_FAILED|Failed to load resource/.test(e));
        t.ok(errs.length === 0, `${label}: zero console errors beyond the injected network failure — ${errs.slice(0, 2).join(" | ")}`);
        return a;
      };
      const pick = async (S) => {
        const before = await S.c.page.evaluate(SNAP);
        const r = await S.c.page.evaluate(() => window.__lc.filterPick("foxears"));
        if (!r.ok) throw new Error(S.c.name + ": set_filter rejected the pick: " + r.error);
        return before;
      };

      /* ---------- a. the module does not load ---------- */
      {
        h.camkitLoadFault = "abort";
        const S = await seat("a");
        const before = await pick(S);
        await assertBare("a · SDK load refused", S, before, { settled: () => !!window.__lc.CAMKIT_STATE.dead, reason: /import|fetch|module/i, line: /camera kit unavailable/ });
        t.ok(sdkRequests(S.c) === 1, `a · SDK load refused: exactly one attempt was made (${sdkRequests(S.c)})`);
        h.camkitLoadFault = null; await S.c.close();
      }
      /* ---------- b. a module that is not the SDK ---------- */
      {
        h.camkitLoadFault = "empty";
        const S = await seat("b");
        const before = await pick(S);
        await assertBare("b · not the SDK", S, before, { settled: () => !!window.__lc.CAMKIT_STATE.dead, reason: /does not export bootstrapCameraKit/, line: /camera kit unavailable/ });
        h.camkitLoadFault = null; await S.c.close();
      }
      /* ---------- c. wrong token ---------- */
      let Sc;
      {
        const S = Sc = await seat("c", { apiToken: "not-the-token" });
        const before = await pick(S);
        const a = await assertBare("c · bootstrap rejects (wrong token)", S, before, { settled: () => !!window.__lc.CAMKIT_STATE.dead, reason: /BootstrapError/, line: /camera kit unavailable/ });
        t.ok(a.shim.bootstraps === 1 && a.K.booted === false, "c · bootstrap rejects: bootstrapCameraKit was called once with the bad token, and nothing booted");
      }
      /* ---------- d. the SDK says: platform not supported ---------- */
      {
        const S = await seat("d");
        await S.c.camkitFault("bootstrap", "unsupported");
        const before = await pick(S);
        await assertBare("d · platform not supported", S, before, { settled: () => !!window.__lc.CAMKIT_STATE.dead, reason: /PlatformNotSupportedError/, line: /camera kit unavailable/ });
        await S.c.close();
      }
      /* ---------- e. no canvas.captureStream ---------- */
      {
        const S = await seat("e");
        await S.c.page.evaluate(() => { delete HTMLCanvasElement.prototype.captureStream; });
        t.ok(await S.c.page.evaluate(() => typeof document.createElement("canvas").captureStream !== "function"), "e · (setup) this page's canvases have no captureStream");
        const before = await pick(S);
        await assertBare("e · no captureStream", S, before, { settled: () => !!window.__lc.CAMKIT_STATE.dead, reason: /PlatformNotSupportedError.*captureStream/, line: /camera kit unavailable/ });
        t.ok(sdkRequests(S.c) === 0, "e · no captureStream: the SDK was never even requested — no point downloading what cannot be published");
        await S.c.close();
      }
      /* ---------- f. the SDK hangs ---------- */
      {
        const S = await seat("f", { loadMs: 1200 });
        await S.c.camkitFault("bootstrap", "hang");
        const before = await pick(S);
        await waitFor(() => S.c.page.evaluate(() => window.__lc.CAMKIT_STATE.warming.length === 1), 5000, "f: the warm-up to be in flight");
        const parked = await S.c.page.evaluate(() => Promise.race([
          window.__lc.filterReconcile().then(() => "ran"), new Promise((r) => setTimeout(() => r("PARKED"), 400))]));
        t.ok(parked === "ran", `f · SDK hangs: the reconciler is NOT parked behind the download — a reconcile during the hang returns at once (${parked})`);
        await assertBare("f · SDK hangs", S, before, { settled: () => !!window.__lc.CAMKIT_STATE.dead, reason: /bootstrap timed out after 1200ms/, line: /camera kit unavailable/ });
        await S.c.close();
      }
      /* ---------- g. unknown lens ---------- */
      {
        const S = await seat("g", { looks: { foxears: "lens-that-does-not-exist" } });
        const before = await pick(S);
        const a = await assertBare("g · lens fetch fails", S, before, { lens: true, settled: () => !!window.__lc.CAMKIT_STATE.lensDead.foxears, reason: /not found/, line: /lens 'foxears' could not be fetched/ });
        t.ok(a.K.booted === true && a.shim.lensLoads === 1 && a.shim.sessions.length === 0, "g · lens fetch fails: the SDK booted, the lens was asked for once, no session was ever created");
        await S.c.close();
      }
      /* ---------- h. session start fails ---------- */
      {
        const S = await seat("h");
        await S.c.camkitFault("applyLens", "reject");
        const before = await pick(S);
        const a = await assertBare("h · session start fails", S, before, { lens: true, settled: () => !!window.__lc.CAMKIT_STATE.lensDead.foxears, reason: /LensError/, line: /lens 'foxears' could not start/ });
        t.ok(a.shim.sessions.length === 1 && a.shim.sessions[0].destroyed === true && a.shim.sources.length === 1 && a.shim.sources[0].trackReady === "ended",
          "h · session start fails: the one session it opened was destroyed and the clone it was fed was stopped");
        await S.c.close();
      }
      const LENS_LIVE = () => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.kind === "lens";
      const dialogUp = (S, label) => waitFor(() => S.c.page.evaluate(LEGAL).then((d) => d.open), 8000, label + ": Snap's terms dialog to be on screen");
      const quiet = (S, label) => { const errs = S.c.errors.filter((e) => !/favicon/.test(e)); t.ok(errs.length === 0, `${label}: zero console errors — ${errs.slice(0, 2).join(" | ")}`); };
      /* the real controls: the shelf button, and a tile on the shelf */
      const openShelf = (S) => S.c.page.evaluate(() => { const sh = document.getElementById("rt_shelf");
        if (!sh.classList.contains("is-open")) document.getElementById("rt_filterbtn").click(); return sh.classList.contains("is-open"); });
      const closeShelf = (S) => S.c.page.evaluate(() => { const sh = document.getElementById("rt_shelf");
        if (sh.classList.contains("is-open")) document.getElementById("rt_filterbtn").click(); return !sh.classList.contains("is-open"); });
      const tapTile = (S, look) => S.c.page.evaluate((look) => { const b = document.querySelector('#rt_shelfrack .lc-shelf__tile[data-look="' + look + '"]'); if (!b) return false; b.click(); return true; }, look);

      /* ---------- L1. terms at the lens start, accepted ---------- */
      {
        const S = await seat("l1");
        await S.c.camkitFault("legal", "prompt");
        const before = await pick(S);          // filterPick, not the shelf: nothing has asked for the terms yet
        await dialogUp(S, "L1");
        const d = await S.c.page.evaluate(LEGAL);
        t.ok(d.open && d.modal && d.inBody && d.buttons.join("|") === "Dismiss|I Agree" && d.shim.shown === 1,
          `L1 · terms at the lens start: the first applyLens put Snap's terms dialog on screen — in <body>, modal, two answers (${d.buttons.join(" / ")})`);
        await S.c.page.waitForTimeout(700);
        const mid = await S.c.page.evaluate(SNAP);
        t.ok(mid.F.active === false && mid.trackId === before.trackId && mid.trackId === mid.camId && mid.state === "playable" && mid.swaps === 0 && !mid.K.lensDead.foxears && mid.K.dead === null,
          "L1 · terms at the lens start: while it waits, the camera publishes untouched and nothing is latched");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "I Agree"), "L1 · terms at the lens start: he taps I Agree");
        await waitFor(() => S.c.page.evaluate(LENS_LIVE), 10_000, "L1: the lens to go live after the answer");
        const a = await S.c.page.evaluate(SNAP);
        const d2 = await S.c.page.evaluate(LEGAL);
        t.ok(a.trackId === a.F.canvasTrackId && a.swaps === 1 && a.shim.sessions.length === 1 && a.shim.sessions[0].lens === "lens-fox" && d2.open === false && d2.shim.state === "accepted",
          `L1 · terms at the lens start: accepted — the lens goes live and is what the call publishes; the dialog is gone (swaps=${a.swaps})`);
        quiet(S, "L1 · terms at the lens start");
        await S.c.close();
      }
      /* ---------- L2. the wait never counts against the start ceiling ---------- */
      {
        const S = await seat("l2", { startMs: 1500 });
        await S.c.camkitFault("legal", "prompt");
        const before = await pick(S);
        await dialogUp(S, "L2");
        await S.c.page.waitForTimeout(4200);   // nearly three start ceilings, reading
        const mid = await S.c.page.evaluate(SNAP);
        const d = await S.c.page.evaluate(LEGAL);
        t.ok(d.open && d.modal && !mid.K.lensDead.foxears && mid.K.dead === null,
          `L2 · the wait is off the clock: 4.2s into a 1.5s start ceiling with the terms on screen, NOTHING is latched (lensDead=${JSON.stringify(mid.K.lensDead)})`);
        t.ok(mid.F.active === false && mid.trackId === before.trackId && mid.trackId === mid.camId && mid.state === "playable" && mid.swaps === 0 && mid.shim.sessions.length === 1 && mid.shim.sessions[0].destroyed === false,
          "L2 · the wait is off the clock: the camera publishes untouched and the session is still open, waiting for his answer");
        t.ok(!said(S.c, /timed out/), "L2 · the wait is off the clock: no timeout was logged");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "I Agree"), "L2 · the wait is off the clock: he taps I Agree, in his own time");
        await waitFor(() => S.c.page.evaluate(LENS_LIVE), 10_000, "L2: the lens to go live after the late answer");
        const a = await S.c.page.evaluate(SNAP);
        t.ok(a.trackId === a.F.canvasTrackId && a.swaps === 1 && a.shim.sessions.length === 1 && (await S.c.page.evaluate(LEGAL)).open === false,
          "L2 · the wait is off the clock: the SAME session carried on — the lens is live and published, one swap, the dialog gone");
        quiet(S, "L2 · the wait is off the clock");
        await S.c.close();
      }
      /* ---------- L3. dismissed at the lens start ---------- */
      {
        const S = await seat("l3");
        await S.c.camkitFault("legal", "prompt");
        const before = await pick(S);
        await dialogUp(S, "L3");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "Dismiss"), "L3 · terms dismissed: he taps Dismiss");
        await assertBare("L3 · terms dismissed", S, before, { lens: true, settled: () => !!window.__lc.CAMKIT_STATE.lensDead.foxears, reason: /LegalError.*terms were not accepted/, line: /lens 'foxears' not started — Snap's terms were dismissed/ });
        const d = await S.c.page.evaluate(LEGAL);
        t.ok(d.open === false && d.shim.open === 0 && d.shim.shown === 1, "L3 · terms dismissed: the dialog is closed, and it was shown exactly once");
        await S.c.close();
      }
      /* ---------- L4. the ceiling is still a ceiling ---------- */
      {
        const S = await seat("l4", { startMs: 1500 });
        await S.c.camkitFault("applyLens", "hang");   // terms already accepted (the shim's default): nothing on screen to wait for
        const before = await pick(S);
        const t0 = Date.now();
        await assertBare("L4 · applyLens hangs", S, before, { lens: true, settled: () => !!window.__lc.CAMKIT_STATE.lensDead.foxears, reason: /applyLens timed out after 1500ms/, line: /lens 'foxears' could not start/ });
        t.ok((await S.c.page.evaluate(LEGAL)).shim.shown === 0, `L4 · applyLens hangs: no dialog was ever up, so the clock ran — given up on at the start ceiling (settled within ${Date.now() - t0}ms of the pick, checks included)`);
        await S.c.close();
      }
      /* ---------- L5. asked while he reads the terms ---------- */
      {
        const S = await seat("l5");
        await S.c.camkitFault("legal", "prompt");
        const before = await pick(S);
        await dialogUp(S, "L5");
        const ask = D.rpc("host", "ask_question", { room_id: S.room, target: S.uid });
        t.ok(D.rooms.get(S.room).spotlight_target === S.uid && D.memberRow(S.room, S.uid).filter === null,
          `L5 · asked while reading: the host's ask landed and cleared his field inside itself (${JSON.stringify(ask).slice(0, 40)})`);
        await waitFor(() => S.c.page.evaluate((u) => !(window.__lc.FILTER_ROOM[u] || {}).name, S.uid), 8000, "L5: his client to observe the cleared field");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "I Agree"), "L5 · asked while reading: he taps I Agree, now on the spot");
        await waitFor(() => S.c.page.evaluate(() => window.__camkitControl.sessions().length === 1 && window.__camkitControl.sessions()[0].destroyed === true), 8000, "L5: the session that is no longer wanted to be torn down");
        await S.c.page.waitForTimeout(700);
        const a = await S.c.page.evaluate(SNAP);
        t.ok(a.swaps === 0 && a.log.length === before.log.length && a.trackId === before.trackId && a.trackId === a.camId && a.state === "playable" && a.F.active === false,
          `L5 · asked while reading: the lens was NEVER published — not for a frame (videoSource swaps=${a.swaps}); an asked face stays bare`);
        t.ok(!a.K.lensDead.foxears && a.K.dead === null && a.hiddenVideos === 0 && a.shim.sources[0].trackReady === "ended" && said(S.c, /no longer wanted/),
          "L5 · asked while reading: nothing latched, nothing left behind, and the log says the look was no longer wanted");
        quiet(S, "L5 · asked while reading");
        await S.c.close();
      }
      const OVERLAPS = () => window.__camkitControl.overlaps();
      /* ---------- E1. asked early at the shelf, agreed ---------- */
      {
        const S = await seat("e1");
        await S.c.camkitFault("legal", "prompt");
        const before = await S.c.page.evaluate(SNAP);
        t.ok(sdkRequests(S.c) === 0 && before.K.termsAsked === false, "E1 · asked early: (before) nothing has requested the SDK, nothing has asked for the terms");
        t.ok(await openShelf(S), "E1 · asked early: he opens the shelf with the real 🎭 button");
        await dialogUp(S, "E1");
        const d = await S.c.page.evaluate(LEGAL);
        const mid = await S.c.page.evaluate(SNAP);
        t.ok(d.open && d.modal && d.shim.shown === 1 && sdkRequests(S.c) === 1 && mid.shim.bootstraps === 1 && mid.K.terms === "asking",
          `E1 · asked early: first sight of the shelf loaded the SDK once and put Snap's terms on screen — before any look was picked (terms: "${mid.K.terms}")`);
        t.ok(mid.shim.sessions.length === 1 && mid.shim.sessions[0].sourceId === null && mid.shim.sessions[0].played.length === 0 && mid.shim.sources.length === 0 && mid.shim.lensLoads === 1,
          "E1 · asked early: it is the HIDDEN session doing the asking — one session, given no source, never played; one lens fetched (the first ✦) to ask with");
        t.ok(mid.swaps === 0 && mid.log.length === before.log.length && mid.trackId === before.trackId && mid.F.active === false && D.memberRow(S.room, S.uid).filter == null && !mid.K.lensDead.foxears && mid.K.dead === null && mid.hiddenVideos === 0,
          "E1 · asked early: and it has nothing to do with the call — no pick on his row, the camera untouched, the pipeline idle, nothing latched");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "I Agree"), "E1 · asked early: he taps I Agree");
        await waitFor(() => S.c.page.evaluate(() => window.__lc.CAMKIT_STATE.terms === "agreed" && window.__camkitControl.sessions()[0].destroyed === true), 8000, "E1: the hidden session to be destroyed");
        const aft = await S.c.page.evaluate(SNAP);
        t.ok(aft.shim.sessions.length === 1 && aft.shim.sessions[0].destroyed === true && aft.shim.sessions[0].played.length === 0 && (await S.c.page.evaluate(LEGAL)).open === false && aft.swaps === 0,
          "E1 · asked early: answered — the dialog is gone and the hidden session is destroyed, still never played, never published");
        t.ok(await tapTile(S, "foxears"), "E1 · asked early: then he taps the ✦ tile");
        await waitFor(() => S.c.page.evaluate(LENS_LIVE), 10_000, "E1: the lens to go live");
        const a = await S.c.page.evaluate(SNAP);
        const d2 = await S.c.page.evaluate(LEGAL);
        t.ok(a.trackId === a.F.canvasTrackId && a.swaps === 1 && a.shim.sessions.length === 2 && a.shim.sessions[1].lens === "lens-fox" && a.shim.sessions[1].played.join(",") === "capture" && a.shim.sources.length === 1 && a.shim.sources[0].trackId === a.F.cloneTrackId,
          `E1 · asked early: the lens went live on a SECOND session — fed his clone, playing capture, published (swaps=${a.swaps})`);
        t.ok(d2.shim.shown === 1 && d2.open === false && sdkRequests(S.c) === 1 && a.shim.bootstraps === 1 && a.shim.lensLoads === 1 && (await S.c.page.evaluate(OVERLAPS)) === 0,
          `E1 · asked early: with NO second dialog, no second SDK request, no second lens fetch, and never two sessions alive at once (dialogs shown=${d2.shim.shown}, SDK requests=${sdkRequests(S.c)})`);
        quiet(S, "E1 · asked early");
        await S.c.close();
      }
      /* ---------- E2. asked early at the shelf, dismissed ---------- */
      {
        const S = await seat("e2");
        await S.c.camkitFault("legal", "prompt");
        await openShelf(S);
        await dialogUp(S, "E2");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "Dismiss"), "E2 · early, dismissed: he taps Dismiss at the shelf");
        await waitFor(() => S.c.page.evaluate(() => window.__lc.CAMKIT_STATE.terms === "dismissed" && window.__camkitControl.sessions()[0].destroyed === true), 8000, "E2: the hidden session to be destroyed");
        const a = await S.c.page.evaluate(SNAP);
        const d = await S.c.page.evaluate(LEGAL);
        t.ok(d.open === false && d.shim.state === "rejected" && !a.K.lensDead.foxears && a.K.dead === null && a.swaps === 0 && a.F.active === false && a.shim.sessions.length === 1 && a.shim.sessions[0].destroyed,
          "E2 · early, dismissed: the dialog closed, the hidden session is destroyed, and NOTHING is latched — no look was asked for, so no look failed");
        t.ok(said(S.c, /dismissed at the shelf/), "E2 · early, dismissed: one diagnostic line says the terms will be asked again at the first lens start");
        t.ok(await closeShelf(S) && await openShelf(S), "E2 · early, dismissed: he closes the shelf and opens it again");
        await S.c.page.waitForTimeout(600);
        const d1 = await S.c.page.evaluate(LEGAL);
        t.ok(d1.open === false && d1.shim.shown === 1 && (await S.c.page.evaluate(SNAP)).shim.sessions.length === 1, `E2 · early, dismissed: re-opening the shelf does not ask again — once per page (dialogs shown=${d1.shim.shown})`);
        const before = await S.c.page.evaluate(SNAP);
        t.ok(await tapTile(S, "foxears"), "E2 · early, dismissed: he taps the ✦ tile anyway");
        await dialogUp(S, "E2 (lens start)");
        t.ok((await S.c.page.evaluate(LEGAL)).shim.shown === 2, "E2 · early, dismissed: the first lens start asks once more (the SDK's own rule after a Dismiss)");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "Dismiss"), "E2 · early, dismissed: he dismisses again");
        await assertBare("E2 · early, dismissed, then dismissed at the lens start", S, before, { lens: true, settled: () => !!window.__lc.CAMKIT_STATE.lensDead.foxears, reason: /LegalError.*terms were not accepted/, line: /Snap's terms were dismissed; camera unaffected/ });
        t.ok((await S.c.page.evaluate(LEGAL)).open === false && (await S.c.page.evaluate(OVERLAPS)) === 0, "E2 · early, dismissed: the dialog is closed; never two sessions alive at once");
        await S.c.close();
      }
      /* ---------- E3. the lens start arrives while he is still reading at the shelf ---------- */
      {
        const S = await seat("e3", { startMs: 1500 });
        await S.c.camkitFault("legal", "prompt");
        await openShelf(S);
        await dialogUp(S, "E3");
        const before = await pick(S);          // the pick lands while he is still reading (a modal stops taps, not the server's row)
        await S.c.page.waitForTimeout(3200);   // more than twice the start ceiling
        const mid = await S.c.page.evaluate(SNAP);
        const d = await S.c.page.evaluate(LEGAL);
        t.ok(d.shim.shown === 1 && d.shim.open === 1 && d.open && mid.shim.sessions.length === 1 && mid.shim.sessions[0].destroyed === false && (await S.c.page.evaluate(OVERLAPS)) === 0,
          `E3 · lens start while he reads at the shelf: it WAITS — no second dialog stacked on the first, no second session opened beside the hidden one (shown=${d.shim.shown}, sessions=${mid.shim.sessions.length})`);
        t.ok(!mid.K.lensDead.foxears && mid.K.dead === null && mid.F.active === false && mid.swaps === 0 && mid.trackId === before.trackId && !said(S.c, /timed out/),
          "E3 · lens start while he reads at the shelf: nothing latched past the start ceiling, no timeout logged, the camera untouched");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "I Agree"), "E3 · lens start while he reads at the shelf: he taps I Agree");
        await waitFor(() => S.c.page.evaluate(LENS_LIVE), 10_000, "E3: the lens to go live");
        const a = await S.c.page.evaluate(SNAP);
        const d2 = await S.c.page.evaluate(LEGAL);
        t.ok(a.trackId === a.F.canvasTrackId && a.swaps === 1 && d2.shim.shown === 1 && a.shim.sessions.length === 2 && a.shim.sessions[0].destroyed === true && a.shim.sessions[1].destroyed === false && (await S.c.page.evaluate(OVERLAPS)) === 0,
          "E3 · lens start while he reads at the shelf: then the hidden session went, the real one came, and the lens is live — one dialog start to finish, one session at a time");
        quiet(S, "E3 · lens start while he reads at the shelf");
        await S.c.close();
      }
      /* ---------- E4. the hidden session cannot be opened ---------- */
      {
        const S = await seat("e4", { startMs: 1500 });
        await S.c.camkitFault("legal", "prompt");
        await S.c.camkitFault("createSession", "reject");
        await openShelf(S);
        await waitFor(() => S.c.page.evaluate(() => /^not asked/.test(window.__lc.CAMKIT_STATE.terms || "")), 8000, "E4: the early ask to fail");
        const a0 = await S.c.page.evaluate(SNAP);
        const d0 = await S.c.page.evaluate(LEGAL);
        t.ok(d0.open === false && d0.shim.shown === 0 && a0.K.booted === true && a0.K.dead === null && !a0.K.lensDead.foxears && a0.shim.sessions.length === 0 && a0.swaps === 0 && sdkRequests(S.c) === 1,
          `E4 · hidden session fails: opening the shelf asked nothing, latched nothing and broke nothing (terms: "${a0.K.terms}")`);
        t.ok(said(S.c, /could not be asked at the shelf/), "E4 · hidden session fails: one diagnostic line says the terms will be asked at the first lens start");
        await S.c.camkitFault("createSession", null);
        t.ok(await tapTile(S, "foxears"), "E4 · hidden session fails: he taps the ✦ tile");
        await dialogUp(S, "E4 (lens start)");
        await S.c.page.waitForTimeout(2600);   // past the start ceiling, off the clock
        t.ok(!(await S.c.page.evaluate(SNAP)).K.lensDead.foxears, "E4 · hidden session fails: the dialog appears at the lens start instead, and the wait is still off the clock");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "I Agree"), "E4 · hidden session fails: he taps I Agree");
        await waitFor(() => S.c.page.evaluate(LENS_LIVE), 10_000, "E4: the lens to go live");
        t.ok((await S.c.page.evaluate(SNAP)).swaps === 1 && (await S.c.page.evaluate(LEGAL)).shim.shown === 1, "E4 · hidden session fails: the lens goes live — the fallback is the lens start asking for itself");
        quiet(S, "E4 · hidden session fails");
        await S.c.close();
      }
      /* ---------- E5. a lens is already live when the shelf is first opened ---------- */
      {
        const S = await seat("e5");
        await S.c.camkitFault("legal", "prompt");
        await pick(S);                         // no shelf: the lens start asks for itself
        await dialogUp(S, "E5 (lens start)");
        t.ok(await S.c.page.evaluate(LEGAL_TAP, "I Agree"), "E5 · shelf opened under a live lens: (setup) he agreed at the lens start");
        await waitFor(() => S.c.page.evaluate(LENS_LIVE), 10_000, "E5: the lens to go live");
        const live = await S.c.page.evaluate(SNAP);
        t.ok(await openShelf(S), "E5 · shelf opened under a live lens: now he opens the shelf for the first time");
        await S.c.page.waitForTimeout(900);
        const a = await S.c.page.evaluate(SNAP);
        const d = await S.c.page.evaluate(LEGAL);
        t.ok(a.shim.sessions.length === 1 && a.shim.sessions[0].destroyed === false && (await S.c.page.evaluate(OVERLAPS)) === 0 && d.shim.shown === 1 && d.open === false && a.K.terms === "a lens start is asking",
          `E5 · shelf opened under a live lens: NO hidden session was opened beside the live one and nothing was asked again (sessions=${a.shim.sessions.length}, dialogs shown=${d.shim.shown}, terms: "${a.K.terms}")`);
        t.ok(a.F.active && a.trackId === live.trackId && a.trackId === a.F.canvasTrackId && a.swaps === 1, "E5 · shelf opened under a live lens: the live lens is undisturbed — same published track, no second swap");
        quiet(S, "E5 · shelf opened under a live lens");
        await S.c.close();
      }
      /* ---------- i. dropped while the lens is still starting ---------- */
      {
        const S = await seat("i");
        await S.c.camkitFault("applyLens", "slow");
        const before = await pick(S);
        await waitFor(() => S.c.page.evaluate(() => window.__camkitControl && window.__camkitControl.sessions().length === 1), 8000, "i: the session to open");
        D.rpc("host", "host_clear_filter", { room_id: S.room, user_id: S.uid });   // she forces it off mid-start
        t.ok(D.memberRow(S.room, S.uid).filter === null, "i · (setup) the host forced the look off while the lens was still starting");
        await waitFor(() => S.c.page.evaluate(() => window.__camkitControl.sessions()[0].destroyed === true), 8000, "i: the half-started session to be torn down");
        await S.c.page.waitForTimeout(700);
        const a = await S.c.page.evaluate(SNAP);
        t.ok(a.swaps === 0 && a.log.length === before.log.length && a.trackId === before.trackId && a.state === "playable",
          `i · dropped mid-start: the lens was NEVER published — not for a frame (videoSource swaps=${a.swaps}, same camera track)`);
        t.ok(a.F.active === false && a.hiddenVideos === 0 && a.shim.sources[0].trackReady === "ended" && a.shim.sessions[0].destroyed,
          "i · dropped mid-start: pipeline idle, session destroyed, clone stopped, monitor gone");
        t.ok(!a.K.lensDead.foxears && a.K.dead === null, "i · dropped mid-start: nothing is latched — the lens did not fail, the look was withdrawn");
        t.ok(said(S.c, /no longer wanted/), "i · dropped mid-start: the diagnostic line says so");
        await S.c.close();
      }
      /* ---------- j. the lens dies mid-show ---------- */
      {
        const S = await seat("j");
        await pick(S);
        await waitFor(() => S.c.page.evaluate(() => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.kind === "lens"), 10_000, "j: the lens to go live");
        const live = await S.c.page.evaluate(SNAP);
        t.ok(live.swaps === 1 && live.trackId === live.F.canvasTrackId, "j · (setup) the lens is live and published");
        await S.c.page.evaluate(() => window.__camkitControl.lensCrash("lens script threw"));
        await waitFor(() => S.c.page.evaluate(() => { const lv = window.__lc.DAILY.participants().local.tracks.video; const cam = window.__dailyControl.cameraTrack();
          return window.__lc.FILTER_STATE.active === false && lv.state === "playable" && lv.track && cam && lv.track.id === cam.id; }), 10_000, "j: the camera to come back");
        const a = await S.c.page.evaluate(SNAP);
        const last = a.log[a.log.length - 1];
        t.ok(a.trackId === a.camId && a.state === "playable" && last && last.videoDeviceId === live.F.deviceId,
          `j · lens dies mid-show: the reconciler took it down and the camera is back by device switch (${JSON.stringify(last)})`);
        t.ok(/LensExecutionError/.test(a.K.lensDead.foxears || "") && a.shim.sessions[0].destroyed && a.shim.sources[0].trackReady === "ended" && a.hiddenVideos === 0,
          `j · lens dies mid-show: latched on the lens ("${a.K.lensDead.foxears}"), session destroyed, clone stopped`);
        t.ok(said(S.c, /failed while rendering/), "j · lens dies mid-show: the diagnostic line was logged");
        await S.c.page.evaluate(() => window.__lc.loadRoomState()); await S.c.page.waitForTimeout(500);
        const z = await S.c.page.evaluate(SNAP);
        t.ok(z.F.active === false && z.shim.sessions.length === 1, "j · lens dies mid-show: it is not put back on by the next roster commit");
        await S.c.close();
      }
      /* ---------- k. a fresh call is a fresh chance ---------- */
      {
        const S = Sc;   // the wrong-token chair from (c): row still says 'foxears', SDK latched dead
        await S.c.camkitConfigure();   // the token fixed
        const still = await S.c.page.evaluate(async () => { await window.__lc.filterReconcile(); return window.__lc.CAMKIT_STATE; });
        t.ok(!!still.dead, "k · fixing the token alone does not un-latch a live call (no surprise mid-show)");
        await S.c.page.evaluate(() => window.__lc.videoLeave());
        const cleared = await S.c.page.evaluate(() => window.__lc.CAMKIT_STATE);
        t.ok(cleared.dead === null && Object.keys(cleared.lensDead).length === 0, "k · videoLeave clears the latches — they die with the call, like FILTER_KILLED");
        await S.c.page.evaluate(() => window.__lc.videoJoin());
        await waitFor(() => S.c.page.evaluate(() => window.__lc.FILTER_STATE.active === true && window.__lc.FILTER_STATE.kind === "lens"), 15_000, "k: the lens to go live on the fresh call");
        const a = await S.c.page.evaluate(SNAP);
        t.ok(a.trackId === a.F.canvasTrackId && a.K.booted === true && a.shim.bootstraps === 2,
          `k · rejoined with a good token: the same row's look goes live (bootstraps=${a.shim.bootstraps}: one rejected, one good)`);
        await S.c.close();
      }
      const leaks = h.unexpectedRequests.filter((u) => !/favicon/.test(u));
      t.ok(leaks.length === 0, `zero leaked requests — ${leaks.slice(0, 3).join(" | ")}`);
    } finally { await h.close(); }
  },
};
