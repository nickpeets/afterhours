/* daily-shim.js — served IN PLACE OF the daily-js CDN bundle.
 * Fake Daily call object with REAL MediaStreams:
 *   - local track: navigator.mediaDevices.getUserMedia against Chromium's
 *     fake capture device (launch flags provide it)
 *   - remote tracks: <canvas>.captureStream() — genuine MediaStreamTracks
 *     with unique ids, so srcObject/track-identity logic runs for real.
 * Per-page: each window has its own call; remote participants are injected
 * by gates via window.__dailyControl.  (Documented limitation in README —
 * streams are synthesized locally, not transported between windows.)
 */
(() => {
  "use strict";

  let SEQ = 1;
  const sid = () => "sid-" + (SEQ++);

  function canvasTrack(label) {
    const c = document.createElement("canvas");
    c.width = 160; c.height = 120;
    const g = c.getContext("2d");
    let hue = (label || "x").split("").reduce((a, ch) => a + ch.charCodeAt(0), 0) % 360;
    const paint = () => { g.fillStyle = "hsl(" + hue + ",70%,50%)"; g.fillRect(0, 0, 160, 120); g.fillStyle = "#fff"; g.font = "14px monospace"; g.fillText(String(label).slice(0, 12), 8, 60); };
    paint();
    const iv = setInterval(paint, 500);   // keep frames flowing
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
      window.__dailyControl = {
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
      };
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
    async setLocalAudio(_on) { return _on; }
    async leave() { this._joined = false; this._emit("left-meeting", {}); }
    async destroy() {
      this._destroyed = true;
      if (this._localStream) { this._localStream.getTracks().forEach((t) => t.stop()); this._localStream = null; }
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
    addRemote(uid, { video = true } = {}) {
      const existing = this._byUid()[uid];
      if (existing) return existing;
      const track = video ? canvasTrack(uid) : null;
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

  /* Real daily-js allows ONE live call object per page: a second
   * createCallObject while another undestroyed instance exists throws
   * "Duplicate DailyIframe instances are not allowed".  The shim enforces
   * the same rule (finding 7 hit it in prod; a permissive fake would let
   * the app regress silently) and counts creations so gates can assert
   * singleton discipline. */
  let LIVE = null;
  let CREATED = 0;
  window.DailyIframe = {
    createCallObject: (opts) => {
      if (LIVE && !LIVE._destroyed) throw new Error("Duplicate DailyIframe instances are not allowed");
      CREATED++;
      LIVE = new FakeCall(opts);
      return LIVE;
    },
    supportedBrowser: () => ({ supported: true }),
  };
  window.Daily = window.DailyIframe;
  window.__dailyInstances = () => ({ created: CREATED, liveNow: !!(LIVE && !LIVE._destroyed) });
})();
