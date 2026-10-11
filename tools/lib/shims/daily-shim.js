/* daily-shim.js — served IN PLACE OF the daily-js CDN bundle.
 * Fake Daily call object with REAL MediaStreams:
 *   - local track: navigator.mediaDevices.getUserMedia against Chromium's
 *     fake capture device (launch flags provide it)
 *   - remote tracks: <canvas>.captureStream() — genuine MediaStreamTracks
 *     with unique ids, so srcObject/track-identity logic runs for real.
 * Per-page: each window has its own call; remote participants are injected
 * by gates via window.__dailyControl.  (Documented limitation in README —
 * streams are synthesized locally, not transported between windows.)
 *
 * 2026-10-10 (feat/lobby-live-feeds) — WHAT THE SHIM NOW MODELS, BECAUSE
 * THE LOBBY PREVIEWS LEAN ON IT:
 *   - MULTIPLE CALL INSTANCES, by daily-js 0.91.0's actual rule (read from
 *     the 0.91.0 bundle): a NEW call object created WITHOUT
 *     allowMultipleCallInstances throws "Duplicate DailyIframe instances are
 *     not allowed" while ANY other instance is alive; one created WITH the
 *     flag never throws.  Strict instances (the room, the winner's room)
 *     keep window.__dailyControl and the `created` count exactly as before;
 *     flagged instances (lobby previews) are reached through
 *     window.__dailyPreview(roomId) and counted separately.
 *   - TEARDOWN TAKES TIME.  Real leave()/destroy() are network round trips;
 *     the shim's were instant, so "create before the old instance is gone"
 *     could not happen here.  window.__dailyLatency = { leave, destroy } (ms,
 *     default 0) makes an instance stay ALIVE for that long after it is asked
 *     to go — which is what makes a missing await visible to a gate.
 *   - DEVICES AT JOIN, for flagged instances only.  Real daily-js acquires
 *     the camera and mic at join() unless told not to (videoSource:false /
 *     audioSource:false / startVideoOff / startAudioOff).  A preview that
 *     forgot those would prompt for the camera on a real phone, so a flagged
 *     instance that does not turn a device off REALLY calls getUserMedia for
 *     it here.  (Strict instances are left as they were: the app drives
 *     their publish explicitly and a dozen gates count those calls.)
 *   - A FEED THAT NEVER STARTS: addRemote(uid, { frozen:true }) hands out a
 *     live video track that never produces a frame.
 *   - A CALL THAT ENDS UNDER THE APP: control.drop() leaves the meeting
 *     without the app asking (what a network drop or an ejection looks like
 *     from the page: 'left-meeting' with nobody having called leave()).
 *
 * 2026-10-11 (fix/spectators-join-devices-off) — WHAT THE SHIM FAKED, AND
 * NOW DOESN'T.  "Strict instances are left as they were" (above) meant the
 * ROOM's call object never opened a device at join here, whatever it was
 * asked — so the app joining every crowd member with camera and mic ON
 * (live: a phone's camera opened on entering a room as a spectator) was
 * invisible to every gate.  A strict instance now follows the same rule as
 * a flagged one: join() really calls getUserMedia for whatever
 * startVideoOff / startAudioOff / videoSource:false / audioSource:false —
 * in the factory options or join()'s — did not turn off, records it in
 * control.gum(), and keeps what join() was handed in control.joinOpts().
 * Every setLocalAudio(on) is recorded in control.audioLog().  The publish
 * state is still the app's to drive: opening the device at join does not
 * by itself publish here (real daily-js does publish a started camera).
 * Still NOT modelled: media between windows, simulcast layers beyond the
 * recorded receive settings, hidden participants (permissions.hasPresence),
 * token expiry itself (only its effect, via drop()), and what a real
 * browser does with autoplay.
 */
(() => {
  "use strict";

  let SEQ = 1;
  const sid = () => "sid-" + (SEQ++);
  const LOG = [];            // creation / destruction order across every instance

  function canvasTrack(label, frozen) {
    const c = document.createElement("canvas");
    c.width = 160; c.height = 120;
    const g = c.getContext("2d");
    let hue = (label || "x").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
    const paint = () => { g.fillStyle = "hsl(" + hue + ",70%,50%)"; g.fillRect(0, 0, 160, 120); g.fillStyle = "#fff"; g.font = "14px monospace"; g.fillText(String(label).slice(0, 12), 8, 60); };
    // frozen: a live track that never delivers a frame (nothing is ever
    // painted, so captureStream has nothing to send)
    if (!frozen) paint();
    const iv = frozen ? null : setInterval(paint, 500);   // keep frames flowing
    const stream = c.captureStream(5);
    const track = stream.getVideoTracks()[0];
    track.addEventListener("ended", () => clearInterval(iv));
    return track;
  }

  class FakeCall {
    constructor(opts) {
      this._handlers = {};
      this._autoSub = !(opts && opts.subscribeToTracksAutomatically === false);
      this._subs = {};           // session_id -> {video,audio} (manual mode ledger)
      this._recv = {};           // session_id -> receive settings (layer requests)
      this._parts = {};          // session_id -> participant
      this._localSid = sid();
      this._joined = false;
      this._userName = null;
      this._localVideoOn = false;
      this._localStream = null;
      this._customVideo = null;  // a MediaStreamTrack handed in via setInputDevicesAsync({ videoSource })
      this._inputLog = [];       // every setInputDevicesAsync call, for gates
      this._destroyed = false;
      this._opts = opts || {};
      this._multi = !!(opts && opts.allowMultipleCallInstances);
      this._url = null;          // the room url handed to join()
      this._gum = [];            // devices this instance acquired at join
      this._joinOpts = null;     // what join() itself was handed (token removed)
      this._audioLog = [];       // every setLocalAudio(on) call, in order
      const control = {
        call: this,
        addRemote: (uid, opts) => this.addRemote(uid, opts),
        removeRemote: (uid) => this.removeRemote(uid),
        stopRemoteTrack: (uid) => this.stopRemoteTrack(uid),
        subs: () => JSON.parse(JSON.stringify(this._subs)),
        recv: () => JSON.parse(JSON.stringify(this._recv)),
        inputLog: () => this._inputLog.slice(),
        customVideoTrack: () => this._customVideo,
        cameraTrack: () => (this._localStream ? this._localStream.getVideoTracks()[0] : null),
        // a silent camera stall: the publish reads off/no track with NO
        // event, and setLocalVideo(true) cannot wake it (the shape the 6s
        // watchdog exists for).  Only a DEVICE SWITCH — recoverCamera's
        // setInputDevicesAsync({ videoDeviceId }) — clears it.
        stallLocalVideo: () => { this._stalled = true; this._localVideoOn = false; },
        opts: () => { const o = { ...this._opts }; delete o.dailyConfig; return o; },
        gum: () => this._gum.slice(),
        joinOpts: () => (this._joinOpts ? { ...this._joinOpts } : null),
        audioLog: () => this._audioLog.slice(),
        url: () => this._url,
        joined: () => this._joined,
        // the call ends UNDER the app (a network drop, an ejection): the
        // meeting is left without the app having asked for it
        drop: () => { this._joined = false; this._emit("left-meeting", {}); },
      };
      this._control = control;
      // the room's call object owns window.__dailyControl, as always; a
      // flagged (preview) instance must never take it over
      if (!this._multi) window.__dailyControl = control;
    }
    on(ev, cb) { (this._handlers[ev] = this._handlers[ev] || []).push(cb); return this; }
    off(ev, cb) { this._handlers[ev] = (this._handlers[ev] || []).filter((f) => f !== cb); return this; }
    _emit(ev, payload) { (this._handlers[ev] || []).forEach((cb) => { try { cb(payload); } catch (e) { console.error("[daily-shim] handler threw:", e); } }); }

    _local() {
      // the published video track: a custom videoSource (a MediaStreamTrack
      // handed to setInputDevicesAsync) takes precedence over the camera —
      // SAME object identity, so the app's filter pipeline can be checked
      // for "the canvas track really is what Daily publishes"
      const t = this._customVideo || (this._localStream ? this._localStream.getVideoTracks()[0] : null);
      return {
        local: true, user_name: this._userName, session_id: this._localSid,
        tracks: {
          // daily parity: a programmatic setLocalVideo(false) reads as
          // off.byUser — exactly the attribution audit F6 flagged, so the
          // app's truth-keeping (CAM_APP_OFF) can be gate-checked
          // an ENDED source is not playable, whatever handed it in
          video: { state: this._localVideoOn && t && t.readyState === "live" ? "playable" : "off", track: this._localVideoOn ? t : null, persistentTrack: this._localVideoOn ? t : null,
                   off: this._localVideoOn ? undefined : { byUser: true } },
          audio: { state: "off", track: null },
        },
      };
    }
    participants() {
      const out = { local: this._local() };
      for (const [k, p] of Object.entries(this._parts)) out[k] = p;
      return out;
    }

    async join(_opts) {
      this._url = (_opts && _opts.url) || null;
      this._leaving = false;
      // real daily-js acquires camera + mic at join unless told not to — in
      // the factory options OR in join()'s own (both are DailyCallOptions)
      this._joinOpts = { ...(_opts || {}) }; delete this._joinOpts.token;
      const o = { ...this._opts, ...(_opts || {}) };
      const wantV = !(o.videoSource === false || o.startVideoOff === true);
      const wantA = !(o.audioSource === false || o.startAudioOff === true);
      if (this._multi) {
        if (wantV || wantA) {
          this._gum.push({ video: wantV, audio: wantA });
          try { this._localStream = await navigator.mediaDevices.getUserMedia({ video: wantV, audio: wantA }); } catch (e) {}
        }
      } else if (wantV || wantA) {
        /* STRICT instances too, since fix/spectators-join-devices-off (see
           the header).  The device is really opened; the PUBLISH state is
           still the app's to drive (_localVideoOn is untouched), and the
           stream is the one setLocalVideo(true) goes on to use, so a host's
           join costs the same single camera open it always did here. */
        this._gum.push({ video: wantV, audio: wantA });
        try {
          const p = navigator.mediaDevices.getUserMedia({ video: wantV, audio: wantA });
          if (wantV) this._localStreamP = p;
          const st = await p;
          if (wantV) this._localStream = st; else this._micStream = st;
        } catch (e) { if (wantV) this._localStreamP = null; }
      }
      if (this._destroyed || this._leaving) return this.participants();   // left while joining
      this._joined = true;
      this._emit("joined-meeting", { participants: this.participants() });
      return this.participants();
    }
    async setUserName(n) { this._userName = n; }
    async setLocalVideo(on) {
      this._localVideoOn = !!on && !this._stalled;
      // one persistent local track, like real daily-js: cache the
      // getUserMedia PROMISE so concurrent setLocalVideo(true) calls can
      // never mint two different local streams (the fake used to, which
      // fabricated an attach-budget violation the real library can't cause)
      if (on && !this._localStreamP) {
        this._localStreamP = navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      if (on) this._localStream = await this._localStreamP;
      const lp = this._local();
      this._emit("participant-updated", { participant: lp });
      if (on && lp.tracks.video.track) this._emit("track-started", { participant: lp, track: lp.tracks.video.track });
      return on;
    }
    async setLocalAudio(_on) { this._audioLog.push(!!_on); return _on; }
    async leave() {
      this._leaving = true;
      const ms = (window.__dailyLatency && window.__dailyLatency.leave) || 0;
      if (ms) await new Promise((r) => setTimeout(r, ms));
      this._joined = false; this._emit("left-meeting", {});
    }
    async destroy() {
      // the instance is ALIVE until destroy() has finished — the registry
      // (and so the duplicate-instance rule) sees it for the whole latency
      const ms = (window.__dailyLatency && window.__dailyLatency.destroy) || 0;
      if (ms) await new Promise((r) => setTimeout(r, ms));
      this._destroyed = true;
      LOG.push((this._multi ? "multi" : "strict") + "-destroyed " + (this._url || ""));
      if (this._localStream) { this._localStream.getTracks().forEach((t) => t.stop()); this._localStream = null; }
      if (this._micStream) { this._micStream.getTracks().forEach((t) => t.stop()); this._micStream = null; }
      for (const uid of Object.keys(this._byUid())) this.removeRemote(uid);
    }
    /* setInputDevicesAsync — WAS a no-op returning {} (a fake that let a
     * filter pipeline "pass" without ever changing what the call publishes).
     * Now models daily-js's documented shape: `videoSource` as a
     * MediaStreamTrack is used DIRECTLY as the video input (bypassing device
     * selection); a device id clears any custom track.  The local
     * participant's tracks.video reflects the swap — state playable, same
     * track object — and the swap is announced the way a device switch is:
     * track-stopped for the outgoing track, participant-updated, then
     * track-started for the incoming one.  (That event sequence is the
     * shim's modelling of a local track replacement; docs confirm
     * track-started/track-stopped fire when tracks begin/end and that
     * setInputDevicesAsync emits input-settings-updated — verify the exact
     * local sequence on a live run before leaning on it further.) */
    /* 2026-09-29 (fix/filter-feed-black) — WHAT THE HARNESS FAKED, AND NOW
     * DOESN'T.  The shim used to keep the camera's device track ALIVE after a
     * custom videoSource replaced it, so a filter pipeline that drew from
     * Daily's own device track stayed green here and went BLACK on an iPhone
     * (live, 2026-09-29): real daily-js releases the device track it owns
     * when a custom track takes its place, the app's feeder <video> was
     * holding that released track, and the canvas drew black frames.  The
     * shim now STOPS the previously-acquired device track on a videoSource
     * swap (readyState 'ended', track-stopped emitted for it before
     * track-started for the new one), and a videoDeviceId switch RE-ACQUIRES
     * the camera (a fresh getUserMedia → a new live track, new id), which is
     * daily-js's device-switch path.  Handing an ended track back as
     * videoSource is modelled as what it is: an ended source, not playable. */
    async setInputDevicesAsync(o) {
      o = o || {};
      const before = this._localVideoOn ? this._local().tracks.video.track : null;
      if (o.videoSource !== undefined) {
        if (o.videoSource && typeof o.videoSource === "object" && typeof o.videoSource.getSettings === "function") {
          const dev = this._localStream ? this._localStream.getVideoTracks()[0] : null;
          if (dev && dev !== o.videoSource && dev.readyState === "live") {
            dev.stop();                          // daily-js releases the device track it owned
            this._emit("track-stopped", { participant: this._local(), track: dev });
          }
          this._customVideo = o.videoSource;
          this._inputLog.push({ videoSource: o.videoSource.id, videoSourceReady: o.videoSource.readyState });
        } else if (o.videoSource === false) {
          this._customVideo = null; this._localVideoOn = false;
          this._inputLog.push({ videoSource: false });
        } else {
          this._customVideo = null;              // a device id — back to the camera
          this._inputLog.push({ videoSource: String(o.videoSource) });
          await this._reacquire();
        }
      } else if (o.videoDeviceId !== undefined) {
        this._customVideo = null;
        this._stalled = false;                   // a device switch wakes a stalled camera
        this._inputLog.push({ videoDeviceId: String(o.videoDeviceId) });
        await this._reacquire(String(o.videoDeviceId));
      }
      const lp = this._local();
      const after = this._localVideoOn ? lp.tracks.video.track : null;
      if (before && after !== before) this._emit("track-stopped", { participant: lp, track: before });
      this._emit("participant-updated", { participant: lp });
      if (after && after !== before) this._emit("track-started", { participant: lp, track: after });
      this._emit("input-settings-updated", { inputSettings: {} });
      // daily parity: fields are {} when the device is unspecified or
      // replaced by a custom track
      return {};
    }
    /* a device switch: daily-js re-acquires the camera.  Only when the track
       it holds is gone (stopped by a custom-source swap) or a specific device
       is asked for — a live device track is kept as-is, like the real thing. */
    async _reacquire(deviceId) {
      const cur = this._localStream ? this._localStream.getVideoTracks()[0] : null;
      if (cur && cur.readyState === "live" && !deviceId) return;
      if (cur && cur.readyState === "live" && deviceId && cur.getSettings().deviceId === deviceId) return;
      const c = deviceId ? { video: { deviceId: { exact: deviceId } }, audio: false } : { video: true, audio: false };
      this._localStreamP = navigator.mediaDevices.getUserMedia(c);
      this._localStream = await this._localStreamP;
    }
    async updateInputSettings(_o) { return {}; }
    async getInputSettings() { return {}; }
    localVideo() { return this._localVideoOn; }
    localAudio() { return false; }

    /* ---- test control ---- */
    _byUid() {
      const m = {};
      for (const p of Object.values(this._parts)) m[p.user_name] = p;
      return m;
    }
    addRemote(uid, { video = true, frozen = false } = {}) {
      const existing = this._byUid()[uid];
      if (existing) return existing;
      const track = video ? canvasTrack(uid, frozen) : null;
      const subbed = this._autoSub;   // manual mode: no pixels until the app subscribes
      const p = {
        local: false, user_name: uid, session_id: sid(),
        _pendingTrack: track,
        tracks: { video: { state: (video && subbed) ? "playable" : "off",
                           track: subbed ? track : null, persistentTrack: subbed ? track : null },
                  audio: { state: "off", track: null } },
      };
      this._parts[p.session_id] = p;
      this._emit("participant-joined", { participant: p });
      if (track && subbed) this._emit("track-started", { participant: p, track });
      return p;
    }
    /* real daily-js manual-subscription surface: tracks flow only once the
       app subscribes; the ledger is exposed for gates via __dailyControl. */
    updateParticipant(sessionId, opts) {
      const p = this._parts[sessionId];
      const st = opts && opts.setSubscribedTracks;
      if (!st) return;
      this._subs[sessionId] = { video: !!st.video, audio: !!st.audio };
      if (st.screenVideo !== undefined) this._subs[sessionId].screenVideo = !!st.screenVideo;
      if (st.screenAudio !== undefined) this._subs[sessionId].screenAudio = !!st.screenAudio;
      if (!p) return;
      const track = p._pendingTrack;
      const had = !!p.tracks.video.track;
      if (st.video && track && !had) {
        p.tracks.video = { state: "playable", track, persistentTrack: track };
        this._emit("track-started", { participant: p, track });
      } else if (!st.video && had) {
        const tr = p.tracks.video.track;
        p.tracks.video = { state: "off", track: null, persistentTrack: null };
        this._emit("track-stopped", { participant: p, track: tr });
        this._emit("participant-updated", { participant: p });
      }
    }
    updateReceiveSettings(settings) {
      for (const [sid, v] of Object.entries(settings || {})) {
        this._recv[sid] = { ...(this._recv[sid] || {}), ...v };
      }
      return this._recv;
    }
    stopRemoteTrack(uid) {
      const p = this._byUid()[uid];
      if (!p || !p.tracks.video.track) return;
      const track = p.tracks.video.track;
      track.stop();
      p.tracks.video = { state: "off", track: null, persistentTrack: null };
      this._emit("track-stopped", { participant: p, track });
      this._emit("participant-updated", { participant: p });
    }
    removeRemote(uid) {
      const p = this._byUid()[uid];
      if (!p) return;
      if (p.tracks.video.track) p.tracks.video.track.stop();
      delete this._parts[p.session_id];
      this._emit("participant-left", { participant: p });
    }
  }

  /* THE DUPLICATE-INSTANCE RULE, as daily-js 0.91.0 implements it: a new
   * call object created WITHOUT allowMultipleCallInstances throws "Duplicate
   * DailyIframe instances are not allowed" while ANY other instance — strict
   * or flagged — is still alive; one created WITH the flag never throws.
   * (Finding 7 hit the throw in prod; a permissive fake would let the app
   * regress silently.)  `created` / `liveNow` keep meaning what they always
   * meant — the STRICT instance, i.e. the room's call object — so the
   * singleton gates read the same numbers; flagged instances (lobby
   * previews) are counted beside them.  LOG is the order things happened
   * in, for the gates that are about order. */
  let LIVE = null;
  let CREATED = 0;
  const MULTI = [];          // every flagged instance ever created
  let MULTI_CREATED = 0;
  const liveMulti = () => MULTI.filter((c) => !c._destroyed);
  window.__dailyLatency = window.__dailyLatency || { leave: 0, destroy: 0 };
  window.DailyIframe = {
    createCallObject: (opts) => {
      const flagged = !!(opts && opts.allowMultipleCallInstances);
      const others = (LIVE && !LIVE._destroyed ? 1 : 0) + liveMulti().length;
      if (!flagged && others) {
        LOG.push("strict-create REFUSED (" + liveMulti().length + " preview(s) alive)");
        throw new Error("Duplicate DailyIframe instances are not allowed");
      }
      const call = new FakeCall(opts);
      if (flagged) { MULTI_CREATED++; MULTI.push(call); LOG.push("multi-created"); }
      else { CREATED++; LIVE = call; LOG.push("strict-created (" + liveMulti().length + " preview(s) alive)"); }
      return call;
    },
    supportedBrowser: () => ({ supported: true }),
  };
  window.Daily = window.DailyIframe;
  window.__dailyInstances = () => ({ created: CREATED, liveNow: !!(LIVE && !LIVE._destroyed),
    multiCreated: MULTI_CREATED, multiLive: liveMulti().length, log: LOG.slice() });
  /* the control surface of the live preview that joined `roomId` (the
     harness serves https://daily.fake/<room_id> as the room url) */
  window.__dailyPreview = (roomId) => {
    const c = liveMulti().find((x) => x._url && x._url.split("/").pop() === String(roomId));
    return c ? c._control : null;
  };
  window.__dailyPreviews = () => liveMulti().map((x) => ({ url: x._url, joined: x._joined, opts: x._control.opts(), gum: x._gum.slice(),
    subs: JSON.parse(JSON.stringify(x._subs)), recv: JSON.parse(JSON.stringify(x._recv)),
    parts: Object.values(x._parts).map((p) => p.user_name) }));
})();
