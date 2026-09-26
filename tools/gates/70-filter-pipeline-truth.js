/* GATE 70 — filter-pipeline-truth: the canvas filter pipeline replaces the
 * camera track AT THE SOURCE, under the same cage as blur.  Ships with
 * feat/filter-pipeline (step 1 of 3 — no face tracking, no picker, no rules).
 *
 * WHAT THE HARNESS FAKED, AND NOW DOESN'T.  daily-shim's setInputDevicesAsync
 * was `async () => ({})`.  Under that fake, filterStart could "succeed" while
 * the call kept publishing the raw camera — a green gate over nothing.  The
 * shim now models daily-js's documented shape: `videoSource` as a
 * MediaStreamTrack is used directly as the video input, and the local
 * participant's tracks.video reflects it — state playable, SAME object.  So
 * every claim below is checked by track identity against what the call says
 * it publishes, not by reading the app's own bookkeeping back to itself.
 *
 * The claims, all driven through window.__lc against the real index.html:
 *   0. the gate's Chromium really has canvas.captureStream (else the pipeline
 *      cannot exist and this gate must say so, not pass)
 *   1. filterStart('grade') after a VERIFIED join: FILTER_STATE.active, the
 *      call's local video track IS the canvas track, and the raw camera
 *      track we hold for restore is still live
 *   2. the real browser reports the published track's width/height/frameRate
 *      (printed — the brief wants the numbers the browser saw)
 *   3. filterStop(): the local video track is the raw camera track again,
 *      the canvas track is ended, FILTER_STATE.active false
 *   4. a watchdog fire while a filter is live: filter torn down, raw track
 *      restored, FILTER_STATE.killed true — and filterStart is a no-op for
 *      the rest of the session
 *   5. videoLeave then rejoin: killed is false again (the latch dies with the
 *      instance, exactly like BLUR_KILLED)
 *   6. attach budget: the self tile is never re-parented, and its <video>
 *      creations / srcObject assignments never exceed 1 + the number of
 *      GENUINE stream changes (each filter on/off is one — a new track id)
 *   7. ?filter=grade is the opt-in door (applied after the verified publish,
 *      never in createCallObject); no ?filter → nothing happens
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 150));
  }
};

/* what the CALL says it publishes vs what the app says it did */
const TRUTH = () => {
  const lv = window.__lc.DAILY.participants().local.tracks.video;
  const custom = window.__dailyControl.customVideoTrack();
  const cam = window.__dailyControl.cameraTrack();
  const s = (lv.track && lv.track.getSettings) ? lv.track.getSettings() : {};
  return {
    state: lv.state,
    trackId: lv.track ? lv.track.id : null,
    trackReady: lv.track ? lv.track.readyState : null,
    customId: custom ? custom.id : null,
    camId: cam ? cam.id : null,
    camReady: cam ? cam.readyState : null,
    settings: { width: s.width, height: s.height, frameRate: s.frameRate },
    F: window.__lc.FILTER_STATE,
    cam: window.__lc.CAM_STATE,
    hiddenVideos: document.querySelectorAll("body > video").length,
  };
};

module.exports = {
  name: "filter-pipeline",
  async run(t, ctx) {
    /* ---------- STATIC: the cage is wired where blur's is ---------- */
    const create = ctx.html.slice(ctx.html.indexOf("DAILY=window.DailyIframe.createCallObject("), ctx.html.indexOf("DAILY=window.DailyIframe.createCallObject(") + 900);
    t.ok(!/filterStart|applyFilter|videoSource/.test(create),
      "no filter is applied inside createCallObject — the pipeline is post-verify only, like blur");
    const leaveBody = (ctx.html.match(/async function videoLeave\(\)\{[\s\S]*?\n\}/) || [""])[0];
    t.ok(/FILTER_KILLED=false/.test(leaveBody) && /filterStop\(\)/.test(leaveBody),
      "videoLeave resets FILTER_KILLED and stops the pipeline (the latch dies with the instance, like BLUR_KILLED)");

    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@filter.test" });
      D.addUser({ id: "u_a", name: "u_a" });
      let room = null;
      /* a host whose own room is live is taken straight in by the boot
         restore — so a boot lands on the lobby OR the room, and join() only
         opens the room when the app hasn't already */
      const boot = async (name, uid, q) => {
        const c = await h.newClient(name); c.login(uid); await c.goto(q || "");
        await c.page.waitForSelector("#lobby:not([style*='display: none']), #room.show", { state: "visible", timeout: 15000 });
        return c;
      };
      const join = async (c) => {
        if (!room) {
          room = D.addRoom({ id: "r_filter", host_id: hostU, name: "Filter Night", phase: "spotlight", round: 1 });
          D.rooms.get(room).phase_deadline = D.iso(D.now() + 300_000);
          D.addMember(room, "u_a", "chair", { seat_index: 0 });
        }
        if (!(await c.page.evaluate(() => !!window.__lc.CURRENT_ROOM)))
          await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() =>
          window.__lc.DAILY_JOINED === true &&
          window.__lc.DAILY.participants().local.tracks.video.state === "playable"), 10_000,
          "the host's publish to come up playable");
        await waitFor(() => c.page.evaluate(() =>
          Object.values(window.__lc.VIDEO_TILES).some((x) => x.uid === window.__lc.ME.id)), 10_000, "the self tile to mount");
      };

      /* ---------- 0. the browser can do this at all ---------- */
      const host = await boot("host", hostU);
      const cap = await host.page.evaluate(() => typeof document.createElement("canvas").captureStream === "function");
      t.ok(cap, "canvas.captureStream exists in the gate's Chromium (" + h.executablePath + ")");
      if (!cap) return;

      /* ---------- 1. filterStart after a verified join ---------- */
      await join(host);
      const t0 = await host.page.evaluate(TRUTH);
      t.ok(t0.F.active === false && t0.F.killed === false && t0.customId === null,
        "before: no filter, no custom source — the call publishes the camera (" + t0.trackId + ")");
      const rawId = t0.trackId;

      const started = await host.page.evaluate(() => window.__lc.filterStart("grade"));
      t.ok(started === true, "filterStart('grade') reports live");
      const t1 = await host.page.evaluate(TRUTH);
      t.ok(t1.F.active === true && t1.F.name === "grade", "FILTER_STATE.active true, name 'grade'");
      t.ok(t1.trackId === t1.F.canvasTrackId && t1.customId === t1.F.canvasTrackId,
        `the call's local video track IS the canvas track (call=${t1.trackId} canvas=${t1.F.canvasTrackId} custom=${t1.customId})`);
      t.ok(t1.trackId !== rawId, "…and it is a different track from the raw camera (" + rawId + ")");
      t.ok(t1.state === "playable" && t1.trackReady === "live", `the published track is playable and live (state=${t1.state}, readyState=${t1.trackReady})`);
      t.ok(t1.F.rawTrackAlive === true && t1.camReady === "live" && t1.F.rawTrackId === rawId,
        `the raw camera track is kept alive for restore (rawTrackAlive=${t1.F.rawTrackAlive}, cam=${t1.camReady})`);
      t.ok(t1.hiddenVideos === 1, `one hidden feeder <video> on body while the filter is live (${t1.hiddenVideos})`);

      /* ---------- 2. what the real browser says it publishes ---------- */
      /* captureStream settings can take a frame or two to populate */
      const settings = await waitFor(() => host.page.evaluate(() => {
        const tr = window.__lc.DAILY.participants().local.tracks.video.track;
        const s = tr.getSettings();
        return (s.width && s.height) ? s : null;
      }), 5000, "the canvas track to report its settings");
      t.ok(settings.width > 0 && settings.height > 0,
        `REAL-BROWSER local video track settings: width=${settings.width} height=${settings.height} frameRate=${settings.frameRate}`);
      // the one informational line this gate prints: the numbers the browser
      // itself reported for the published (canvas) track, pass or fail
      console.log(`    ↳ [filter-pipeline] real-browser local video track: ${settings.width}x${settings.height} @ ${settings.frameRate}fps (canvas track)`);
      const camS = await host.page.evaluate(() => { const c = window.__dailyControl.cameraTrack(); return c ? c.getSettings() : {}; });
      t.ok(settings.width === camS.width && settings.height === camS.height,
        `canvas matches the camera's geometry (camera ${camS.width}x${camS.height}@${camS.frameRate})`);
      /* the canvas is actually being drawn (frames flow) */
      const drawn = await host.page.evaluate(async () => {
        const tr = window.__lc.DAILY.participants().local.tracks.video.track;
        const v = document.createElement("video"); v.muted = true; v.playsInline = true; v.srcObject = new MediaStream([tr]);
        await v.play().catch(() => {});
        await new Promise((r) => setTimeout(r, 600));
        const c = document.createElement("canvas"); c.width = 8; c.height = 8;
        c.getContext("2d").drawImage(v, 0, 0, 8, 8);
        const px = c.getContext("2d").getImageData(0, 0, 8, 8).data;
        let sum = 0; for (let i = 0; i < px.length; i += 4) sum += px[i] + px[i + 1] + px[i + 2];
        v.pause(); v.remove();
        return { sum, t: v.currentTime };
      });
      t.ok(drawn.t > 0, `frames flow through the canvas track (currentTime=${drawn.t.toFixed(2)}s, pixel sum=${drawn.sum})`);

      /* the self tile followed the swap like an ordinary track change */
      await waitFor(() => host.page.evaluate((id) => {
        const me = Object.values(window.__lc.VIDEO_TILES).find((x) => x.uid === window.__lc.ME.id);
        const tr = me && me.el.srcObject && me.el.srcObject.getVideoTracks()[0];
        return tr && tr.id === id;
      }, t1.trackId), 5000, "the self tile to show the canvas track");
      t.ok(true, "the self tile shows the filtered track — the tile code was not touched, it saw an ordinary local track change");

      /* ---------- 3. filterStop ---------- */
      await host.page.evaluate(() => window.__lc.filterStop());
      const t2 = await host.page.evaluate(TRUTH);
      t.ok(t2.trackId === rawId && t2.customId === rawId,
        `filterStop: the call publishes the raw camera track again (${t2.trackId})`);
      t.ok(t2.state === "playable" && t2.trackReady === "live", "…playable and live");
      t.ok(t2.F.active === false && t2.F.name === null, "FILTER_STATE.active false");
      t.ok(t2.F.canvasTrackId === null, "the canvas track reference is released");
      const canvasEnded = await host.page.evaluate((id) => {
        // the canvas track we captured earlier — find it via the shim's input log identity is gone,
        // so ask the app: a re-start mints a NEW id, which proves the old one was not reused
        return window.__lc.filterStart("grade").then((ok) => ({ ok, F: window.__lc.FILTER_STATE }));
      }, t1.trackId);
      t.ok(canvasEnded.ok && canvasEnded.F.canvasTrackId !== t1.trackId,
        `a fresh filterStart mints a NEW canvas track (${canvasEnded.F.canvasTrackId} ≠ ${t1.trackId}) — the stopped one is not reused`);
      /* hold the second run's canvas track and stop again, checking readyState directly */
      const ended = await host.page.evaluate(async () => {
        const tr = window.__lc.DAILY.participants().local.tracks.video.track;
        await window.__lc.filterStop();
        return { ready: tr.readyState, hidden: document.querySelectorAll("body > video").length };
      });
      t.ok(ended.ready === "ended", `the canvas track is ENDED after filterStop (readyState=${ended.ready})`);
      t.ok(ended.hidden === 0, `the hidden feeder <video> is gone (${ended.hidden} left)`);

      /* ---------- 4. watchdog fire while active ---------- */
      t.ok(await host.page.evaluate(() => window.__lc.filterStart("grade")), "filter back on for the watchdog case");
      const beforeWd = await host.page.evaluate(TRUTH);
      /* force the REAL watchdog branch: it fires only when no self tile is
         mounted at the end of its 6s window, and reflow remounts any playable
         local track within that window — so the stall has to be REAL: arm the
         watchdog through the real path (syncLocalPublish), let the re-publish
         settle, then have the fake camera go silent (no event, no track —
         exactly what the watchdog exists for) and drop the self tile through
         the app's own onTrackStopped door. */
      /* videoWatchdog() is idempotent while a check is pending — let the
         join's own window expire first so the arm below is OURS */
      await waitFor(() => host.page.evaluate(() => window.__lc.CAM_STATE.pending === false), 10_000, "the join's watchdog window to expire");
      await host.page.evaluate(() => window.__lc.syncLocalPublish());
      await host.page.waitForTimeout(500);
      t.ok(await host.page.evaluate(() => window.__lc.CAM_STATE.pending === true), "the watchdog is armed (pending)");
      await host.page.evaluate(() => {
        const lp = window.__lc.DAILY.participants().local;
        window.__dailyControl.stallLocalVideo();
        window.__lc.onTrackStopped({ participant: lp, track: lp.tracks.video.track });
      });
      await waitFor(() => host.page.evaluate(() => window.__lc.CAM_STATE.watchdogFires >= 1), 12_000, "the watchdog to fire");
      await waitFor(() => host.page.evaluate(() => window.__lc.FILTER_STATE.active === false), 5000, "the filter to be torn down");
      const t4 = await host.page.evaluate(TRUTH);
      t.ok(t4.cam.watchdogFires >= 1 && t4.F.killed === true, `watchdog fired (${t4.cam.watchdogFires}) → FILTER_STATE.killed true`);
      t.ok(t4.F.active === false, "the filter is torn down");
      t.ok(t4.customId === rawId || t4.customId === null,
        `the call publishes the raw camera again after the fire (custom=${t4.customId}, raw=${rawId})`);
      t.ok(t4.trackId === rawId && t4.trackReady === "live", `…and the local track is the live raw camera (${t4.trackId})`);
      t.ok(t4.cam.blurKilled === true, "blur is killed by the same fire (the cage is shared)");
      const noop = await host.page.evaluate(() => window.__lc.filterStart("grade").then((ok) => ({ ok, F: window.__lc.FILTER_STATE })));
      t.ok(noop.ok === false && noop.F.active === false && noop.F.killed === true,
        "filterStart is a no-op for the rest of the session once killed");
      const noop2 = await host.page.evaluate(() => window.__lc.applyFilter().then(() => window.__lc.FILTER_STATE));
      t.ok(noop2.active === false, "…and so is the opt-in door (applyFilter)");
      t.ok(beforeWd.F.active === true, "(sanity) the filter WAS live when the watchdog fired");

      /* ---------- 5. leave, rejoin: the latch dies with the instance ---------- */
      await host.page.evaluate(() => window.__lc.videoLeave());
      const t5 = await host.page.evaluate(() => ({ F: window.__lc.FILTER_STATE, daily: !!window.__lc.DAILY }));
      t.ok(!t5.daily && t5.F.killed === false && t5.F.active === false, `after videoLeave: killed=${t5.F.killed} active=${t5.F.active}`);
      await host.page.evaluate(() => window.__lc.videoJoin());
      await join(host);
      const STATS = () => host.page.evaluate(() => {
        const s = window.__lc.VIDEO_STATS; const me = window.__lc.ME.id;
        return { assigns: s.assigns[me] || 0, creates: s.creates[me] || 0, reparents: s.reparents[me] || 0 };
      });
      const s0 = await STATS();
      const again = await host.page.evaluate(() => window.__lc.filterStart("grade").then((ok) => ({ ok, ...window.__lc.FILTER_STATE })));
      t.ok(again.ok === true && again.active === true, "a fresh call is a fresh chance: filterStart works again after rejoin");
      const t5b = await host.page.evaluate(TRUTH);
      t.ok(t5b.trackId === t5b.F.canvasTrackId, "…and the new call really publishes the new canvas track");
      await host.page.evaluate(() => window.__lc.filterStop());

      /* ---------- 6. attach budget ---------- */
      await host.page.waitForTimeout(1500);   // let the off-swap's track-started land
      const s1 = await STATS();
      const stats = await host.page.evaluate(() => {
        const me = window.__lc.ME.id;
        const tiles = Object.values(window.__lc.VIDEO_TILES).filter((x) => x.uid === me);
        return { tilesForMe: tiles.length, inDom: tiles.every((x) => document.contains(x.el)),
                 swaps: window.__dailyControl.inputLog().filter((e) => e.videoSource).length };
      });
      /* the on/off pair above is exactly 2 GENUINE stream changes (new track
         ids); the budget is 1 attach per genuine change and nothing else —
         no extra assignment, no extra element, no re-parent.  (VIDEO_STATS
         accumulates for the page's life, so the claim is the DELTA.) */
      const d = { assigns: s1.assigns - s0.assigns, creates: s1.creates - s0.creates, reparents: s1.reparents - s0.reparents };
      t.ok(d.reparents === 0, `self tile never re-parented across a filter on/off (${d.reparents})`);
      t.ok(d.assigns <= 2, `self srcObject assignments ≤ genuine stream changes for a filter on/off (assigns=+${d.assigns}, changes=2)`);
      t.ok(d.creates <= 2, `self <video> creations ≤ genuine stream changes for a filter on/off (creates=+${d.creates}) — the shim announces a source swap as track-stopped/track-started, like a device switch`);
      t.ok(stats.tilesForMe === 1 && stats.inDom, `exactly one self tile, in the DOM (${stats.tilesForMe})`);
      t.ok((await host.page.evaluate(() => document.querySelectorAll("#room video").length)) === 1,
        "exactly one <video> in the room for the lone host — no filter debris in the tile tree");

      /* ---------- 7. the opt-in door ---------- */
      const errsHost = host.errors.filter((e) => !/favicon/.test(e));
      t.ok(errsHost.length === 0, "zero console errors on the host — " + errsHost.slice(0, 2).join(" | "));
      await host.close();

      const optin = await boot("optin", hostU, "?filter=grade");
      await join(optin);
      await waitFor(() => optin.page.evaluate(() => window.__lc.FILTER_STATE.active === true), 8000, "?filter=grade to auto-apply after the verified publish");
      const o1 = await optin.page.evaluate(TRUTH);
      t.ok(o1.F.active && o1.F.name === "grade" && o1.trackId === o1.F.canvasTrackId,
        "?filter=grade applies the grade filter after the verified publish, and the call publishes the canvas track");
      await optin.page.waitForTimeout(7000);   // the would-be watchdog window: a filtered self tile must not read as a stall
      const o2 = await optin.page.evaluate(TRUTH);
      t.ok(o2.cam.watchdogFires === 0 && o2.F.killed === false,
        `the watchdog never fires on a clean filtered join (fires=${o2.cam.watchdogFires}, killed=${o2.F.killed})`);
      await optin.close();

      const plain = await boot("plain", hostU);
      await join(plain);
      await plain.page.waitForTimeout(1500);
      const p1 = await plain.page.evaluate(TRUTH);
      t.ok(p1.F.active === false && p1.customId === null, "no ?filter → nothing happens (camera published as-is)");
      const errs = plain.errors.concat(optin.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
