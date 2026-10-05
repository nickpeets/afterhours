/* GATE 76 — camkit-lens: a Camera Kit lens is a SECOND SOURCE KIND in the
 * filter pipeline, and it goes through the same door as the 2D looks.
 * Ships with feat/camera-kit.  Gate 70's sibling: same claims, lens source.
 *
 * WHAT THE HARNESS MUST MODEL, OR THIS GATE PROVES NOTHING.  The Camera Kit
 * shim (tools/lib/shims/camera-kit-shim.js) is not a no-op:
 *   - its session renders the SOURCE's frames, with the lens drawn over them
 *     as a magenta band no camera frame contains — so "the published track is
 *     the session's output" is checked in the PIXELS of what the call
 *     publishes, not in the app's bookkeeping
 *   - only the target that is PLAYING is rendered (capture the other canvas
 *     and the publish is frameless)
 *   - THE SOURCE DIES when its track ends.  daily-shim releases the device
 *     track on a videoSource swap (the #85 finding), so a pipeline that fed
 *     the session Daily's own track goes frameless here.  Mutation-checked
 *     2026-10-05: feeding the session `raw` instead of the clone turns block
 *     2 red (frames stall, the source track reads 'ended').
 *   - bootstrap rejects without the harness token, loadLens rejects an
 *     unknown lens, a source cannot be attached twice
 * What it cannot prove is listed in the shim's header and the PR body: the
 * real SDK's WebGL canvas through captureStream on iOS Safari, face tracking,
 * and the real handshake with Snap.  That is the phone test.
 *
 * The claims, through window.__lc against the real index.html:
 *   0. configured but idle: nothing requested yet
 *   1. filterStart(lens) after a verified join: ONE SDK request (lazy, on
 *      first use), bootstrapped with the configured token, the lens fetched
 *      from the configured group; FILTER_STATE active, kind 'lens'
 *   2. the call's local video track IS the captured session output — by
 *      track identity AND by pixels (lens mark on top, camera below); the
 *      session was fed OUR CLONE, never the Daily-owned track; Daily's own
 *      track is ended and the frames keep coming
 *   3. the published target is `capture` (the SDK's output for other call
 *      members); the unpublished target is not rendered at all; the source
 *      is unmirrored, cameraType 'user'
 *   4. the ?debug readout means something in lens mode: framesDrawn climbs,
 *      measured on the published track
 *   5. filterStop: restore by videoDeviceId, session paused + destroyed,
 *      clone ended, output track ended, monitor gone
 *   6. a second start: no second SDK request, no second bootstrap, no second
 *      lens fetch — but a NEW session and a NEW source
 *   7. config knobs: mirror:true reaches the SDK as Transform2D.MirrorX;
 *      target:'live' publishes the live output instead
 *   8. videoLeave with a lens live: the session dies with the call
 *   9. zero console errors
 */
"use strict";
const { Harness, CAMKIT_TEST } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 150));
  }
};
const TRUTH = () => {
  const lv = window.__lc.DAILY.participants().local.tracks.video;
  const custom = window.__dailyControl.customVideoTrack();
  const cam = window.__dailyControl.cameraTrack();
  const K = window.__camkitControl;
  return {
    state: lv.state, trackId: lv.track ? lv.track.id : null, trackReady: lv.track ? lv.track.readyState : null,
    customId: custom ? custom.id : null, camId: cam ? cam.id : null, camReady: cam ? cam.readyState : null,
    F: window.__lc.FILTER_STATE, K: window.__lc.CAMKIT_STATE,
    hiddenVideos: document.querySelectorAll("body > video").length,
    shim: K ? { bootstraps: K.bootstraps(), lensLoads: K.lensLoads(), sessions: K.sessions(), sources: K.sources() } : null,
  };
};
/* what the CALL publishes, in pixels: one sample inside the lens band, one below it */
const PIXELS = async () => {
  const tr = window.__lc.DAILY.participants().local.tracks.video.track;
  const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([tr]);
  /* play() never settles on a track that delivers no frames — which is the
     very failure this helper exists to catch, so it must not wait on it */
  await Promise.race([v.play().catch(() => {}), new Promise((r) => setTimeout(r, 1500))]);
  await new Promise((r) => setTimeout(r, 600));
  const c = document.createElement("canvas"); c.width = v.videoWidth || 2; c.height = v.videoHeight || 2;
  const g = c.getContext("2d"); g.drawImage(v, 0, 0, c.width, c.height);
  const px = (x, y) => [...g.getImageData(Math.floor(x), Math.floor(y), 1, 1).data].slice(0, 3);
  const out = { w: c.width, h: c.height, t: v.currentTime, top: px(c.width / 2, c.height / 8), low: px(c.width / 2, c.height * 0.75) };
  v.pause();
  return out;
};
const isMark = (p) => p[0] > 200 && p[1] < 90 && p[2] > 200;

module.exports = {
  name: "camkit-lens",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@lens.test" });
      D.addUser({ id: "u_a", name: "u_a" });
      const room = D.addRoom({ id: "r_lens", host_id: hostU, name: "Lens Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 600_000);
      D.addMember(room, "u_a", "chair", { seat_index: 0 });
      const host = await h.newClient("host"); host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
      const join = async () => {
        if (!(await host.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await host.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => host.page.evaluate(() =>
          window.__lc.DAILY_JOINED === true && window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 10_000, "the publish to come up playable");
        await waitFor(() => host.page.evaluate(() =>
          Object.values(window.__lc.VIDEO_TILES).some((x) => x.uid === window.__lc.ME.id)), 10_000, "the self tile to mount");
      };
      await join();

      /* ---------- 0. configured, idle ---------- */
      await host.camkitConfigure();
      await host.page.waitForTimeout(500);
      const t0 = await host.page.evaluate(TRUTH);
      t.ok(t0.K.on === true && t0.K.sdkLoads === 0 && h.camkitRequests.length === 0 && t0.shim === null,
        "configured and joined, no look wanted: nothing requested, the SDK module was never evaluated");
      const rawId = t0.trackId;

      /* ---------- 1. first use ---------- */
      const started = await host.page.evaluate(() => window.__lc.filterStart("foxears"));
      t.ok(started === true, "filterStart('foxears') reports live");
      const t1 = await host.page.evaluate(TRUTH);
      t.ok(h.camkitRequests.length === 1 && h.camkitRequests[0].client === "host" && h.camkitRequests[0].url === CAMKIT_TEST.sdkUrl,
        `exactly ONE request for the SDK, made on first use, to the configured address (${h.camkitRequests.map((r) => r.url).join(", ")})`);
      t.ok(t1.K.sdkLoads === 1 && t1.K.booted === true && t1.K.dead === null && t1.K.ready.join() === "foxears",
        `the app's own counter agrees with the wire (sdkLoads=${t1.K.sdkLoads}, booted, ready=[${t1.K.ready}])`);
      t.ok(t1.shim.bootstraps.length === 1 && t1.shim.bootstraps[0].apiToken === CAMKIT_TEST.apiToken,
        "bootstrapCameraKit was called once, with the configured apiToken");
      t.ok(t1.shim.lensLoads.length === 1 && t1.shim.lensLoads[0].lensId === "lens-fox" && t1.shim.lensLoads[0].groupId === CAMKIT_TEST.lensGroupId,
        `the look's lens was fetched from the configured group (${JSON.stringify(t1.shim.lensLoads[0])})`);
      t.ok(t1.F.active === true && t1.F.name === "foxears" && t1.F.kind === "lens", `FILTER_STATE: active, name 'foxears', kind '${t1.F.kind}'`);

      /* ---------- 2. what the call publishes ---------- */
      t.ok(t1.trackId === t1.F.canvasTrackId && t1.customId === t1.F.canvasTrackId && t1.trackId !== rawId,
        `the call's local video track IS the pipeline's canvas track, not the raw camera (call=${t1.trackId} canvas=${t1.F.canvasTrackId} raw=${rawId})`);
      t.ok(t1.state === "playable" && t1.trackReady === "live", `…playable and live (state=${t1.state}, readyState=${t1.trackReady})`);
      const ses = t1.shim.sessions[0], src = t1.shim.sources[0];
      t.ok(t1.shim.sessions.length === 1 && ses.lens === "lens-fox" && ses.destroyed === false, "one session, the lens applied to it");
      t.ok(src.trackId === t1.F.cloneTrackId && src.trackId !== rawId && src.trackReady === "live",
        `the session was fed OUR CLONE, never the Daily-owned track (source=${src.trackId} clone=${t1.F.cloneTrackId} raw=${rawId})`);
      t.ok(t1.F.rawReadyState === "ended" && t1.camReady === "ended" && t1.F.cloneReadyState === "live",
        `Daily released its own device track on the swap (raw=${t1.F.rawReadyState}); the clone is live (${t1.F.cloneReadyState})`);
      const px = await host.page.evaluate(PIXELS);
      t.ok(px.t > 0 && px.w > 2, `frames flow through the published track (${px.w}x${px.h}, currentTime=${px.t.toFixed(2)}s)`);
      t.ok(isMark(px.top), `the lens is IN the published pixels — the shim's lens mark across the top (rgb ${px.top})`);
      t.ok(!isMark(px.low) && (px.low[0] + px.low[1] + px.low[2]) > 0, `…over the camera's own frame below it (rgb ${px.low}) — the session rendered the source, not a blank`);
      const f1 = await host.page.evaluate(async () => {
        const a = window.__camkitControl.sessions()[0].frames; await new Promise((r) => setTimeout(r, 700));
        const b = window.__camkitControl.sessions()[0].frames; return { a, b, src: window.__camkitControl.sources()[0].trackReady };
      });
      t.ok(f1.b.capture - f1.a.capture >= 5 && f1.src === "live",
        `the session keeps rendering AFTER Daily released its track (${f1.a.capture} → ${f1.b.capture} frames in 700ms, source ${f1.src}) — it would be dark if it had been fed the Daily track`);
      await waitFor(() => host.page.evaluate((id) => {
        const me = Object.values(window.__lc.VIDEO_TILES).find((x) => x.uid === window.__lc.ME.id);
        const tr = me && me.el.srcObject && me.el.srcObject.getVideoTracks()[0];
        return tr && tr.id === id;
      }, t1.trackId), 5000, "the self tile to show the lens track");
      t.ok(true, "the self tile shows the lens track — one published track, one face, the wearer's own tile included");

      /* ---------- 3. which output, which way round ---------- */
      t.ok(ses.played.join() === "capture" && t1.K.target === "capture", `the session plays its CAPTURE target — the SDK's output for other call members (played: ${ses.played})`);
      t.ok(f1.b.live === 0, `the live target is never rendered (${f1.b.live} frames) — nothing is drawn that is not published`);
      t.ok(src.cameraType === "user" && src.transform === "identity", `the source is cameraType '${src.cameraType}', transform '${src.transform}' — unmirrored, like the camera and the 2D looks`);

      /* ---------- 4. the readout ---------- */
      const fr = await host.page.evaluate(async () => {
        const a = window.__lc.FILTER_STATE; await new Promise((r) => setTimeout(r, 700)); const b = window.__lc.FILTER_STATE;
        const v = document.querySelector("body > video"); const tr = v && v.srcObject && v.srcObject.getVideoTracks()[0];
        return { a: a.framesDrawn, b: b.framesDrawn, ago: b.lastDrawAgoMs, playing: b.feederPlaying, monitor: tr ? tr.id : null };
      });
      t.ok(fr.b - fr.a >= 5 && fr.ago !== null && fr.ago < 1500, `framesDrawn climbs in lens mode (${fr.a} → ${fr.b} in 700ms, last ${fr.ago}ms ago)`);
      t.ok(t1.hiddenVideos === 1 && fr.monitor === t1.trackId, "…counted on the PUBLISHED track by one hidden monitor <video> — frames the room is really getting");

      /* ---------- 5. filterStop ---------- */
      const stopped = await host.page.evaluate(async () => {
        const out = window.__lc.DAILY.participants().local.tracks.video.track;
        const src = window.__camkitControl.sources()[0];
        const n = window.__dailyControl.inputLog().length;
        await window.__lc.filterStop();
        return { out: out.readyState, log: window.__dailyControl.inputLog().slice(n), srcBefore: src.trackReady };
      });
      const t5 = await host.page.evaluate(TRUTH);
      t.ok(stopped.log.length === 1 && stopped.log[0].videoDeviceId && stopped.log[0].videoDeviceId === t1.F.deviceId,
        `restore went through setInputDevicesAsync({ videoDeviceId }) (${JSON.stringify(stopped.log)})`);
      t.ok(t5.customId === null && t5.trackId === t5.camId && t5.state === "playable" && t5.trackReady === "live",
        `the call publishes a live camera track again (${t5.trackId})`);
      const ses5 = t5.shim.sessions[0];
      t.ok(ses5.destroyed === true && ses5.paused.includes("capture"), `the session was paused and DESTROYED with the look (paused: ${ses5.paused}, destroyed: ${ses5.destroyed})`);
      t.ok(t5.shim.sources[0].trackReady === "ended", `our clone is STOPPED — no leaked capture (${t5.shim.sources[0].trackReady})`);
      t.ok(stopped.out === "ended", `the published output track is ENDED (${stopped.out})`);
      t.ok(t5.hiddenVideos === 0 && t5.F.active === false && t5.F.kind === null && t5.F.canvasTrackId === null && t5.F.cloneTrackId === null,
        "the monitor <video> is gone and FILTER is idle");
      const px5 = await host.page.evaluate(PIXELS);
      t.ok(!isMark(px5.top), `the published pixels are the bare camera again (top rgb ${px5.top})`);

      /* ---------- 6. second start: everything cached but the session ---------- */
      t.ok(await host.page.evaluate(() => window.__lc.filterStart("foxears")), "a second filterStart('foxears') goes live");
      const t6 = await host.page.evaluate(TRUTH);
      t.ok(h.camkitRequests.length === 1 && t6.K.sdkLoads === 1 && t6.shim.bootstraps.length === 1 && t6.shim.lensLoads.length === 1,
        `no second SDK request, bootstrap or lens fetch (requests=${h.camkitRequests.length}, bootstraps=${t6.shim.bootstraps.length}, lensLoads=${t6.shim.lensLoads.length})`);
      t.ok(t6.shim.sessions.length === 2 && t6.shim.sources.length === 2 && t6.shim.sessions[1].sourceId === t6.shim.sources[1].id && t6.shim.sources[1].trackId !== t6.shim.sources[0].trackId,
        "…but a NEW session on a NEW source built from a fresh clone (a source can be attached only once)");
      t.ok(t6.trackId === t6.F.canvasTrackId && t6.trackId !== t1.trackId, `…and a new published track (${t6.trackId} ≠ ${t1.trackId})`);
      await host.page.evaluate(() => window.__lc.filterStop());

      /* ---------- 7. the knobs ---------- */
      await host.camkitConfigure({ mirror: true, target: "live" });
      t.ok(await host.page.evaluate(() => window.__lc.filterStart("foxears")), "with mirror:true and target:'live', filterStart goes live");
      const t7 = await host.page.evaluate(TRUTH);
      const s7 = t7.shim.sessions[2], r7 = t7.shim.sources[2];
      t.ok(r7.transform === "mirrorX", `mirror:true reaches the SDK as Transform2D.MirrorX on the source (${r7.transform})`);
      t.ok(s7.played.join() === "live", `target:'live' plays the live output (${s7.played})`);
      const px7 = await host.page.evaluate(PIXELS);
      t.ok(isMark(px7.top), `…and that is the canvas that is published (lens mark present, rgb ${px7.top})`);

      /* ---------- 8. the lens dies with the call ---------- */
      await host.page.evaluate(() => window.__lc.videoLeave());
      const t8 = await host.page.evaluate(() => ({ F: window.__lc.FILTER_STATE, s: window.__camkitControl.sessions().map((x) => x.destroyed),
        src: window.__camkitControl.sources().map((x) => x.trackReady), vids: document.querySelectorAll("body > video").length, daily: !!window.__lc.DAILY }));
      t.ok(!t8.daily && t8.F.active === false && t8.s.every(Boolean) && t8.src.every((x) => x === "ended") && t8.vids === 0,
        `videoLeave with a lens live: every session destroyed, every clone stopped, nothing left behind (sessions destroyed: ${t8.s}, clones: ${t8.src})`);

      /* ---------- 9. quiet ---------- */
      const errs = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
      const leaks = h.unexpectedRequests.filter((u) => !/favicon/.test(u));
      t.ok(leaks.length === 0, `zero leaked requests — ${leaks.slice(0, 3).join(" | ")}`);
    } finally { await h.close(); }
  },
};
