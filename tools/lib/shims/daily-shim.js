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
    constructor() {
      this._handlers = {};
      this._parts = {};          // session_id -> participant
      this._localSid = sid();
      this._joined = false;
      this._userName = null;
      this._localVideoOn = false;
      this._localStream = null;
      this._destroyed = false;
      window.__dailyControl = {
        call: this,
        addRemote: (uid, opts) => this.addRemote(uid, opts),
        removeRemote: (uid) => this.removeRemote(uid),
        stopRemoteTrack: (uid) => this.stopRemoteTrack(uid),
      };
    }
    on(ev, cb) { (this._handlers[ev] = this._handlers[ev] || []).push(cb); return this; }
    off(ev, cb) { this._handlers[ev] = (this._handlers[ev] || []).filter((f) => f !== cb); return this; }
    _emit(ev, payload) { (this._handlers[ev] || []).forEach((cb) => { try { cb(payload); } catch (e) { console.error("[daily-shim] handler threw:", e); } }); }

    _local() {
      const t = this._localStream ? this._localStream.getVideoTracks()[0] : null;
      return {
        local: true, user_name: this._userName, session_id: this._localSid,
        tracks: {
          video: { state: this._localVideoOn && t ? "playable" : "off", track: this._localVideoOn ? t : null, persistentTrack: this._localVideoOn ? t : null },
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
      this._localVideoOn = !!on;
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
    async setInputDevicesAsync(_o) { return {}; }
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
      const p = {
        local: false, user_name: uid, session_id: sid(),
        tracks: { video: { state: video ? "playable" : "off", track, persistentTrack: track }, audio: { state: "off", track: null } },
      };
      this._parts[p.session_id] = p;
      this._emit("participant-joined", { participant: p });
      if (track) this._emit("track-started", { participant: p, track });
      return p;
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
    createCallObject: (_opts) => {
      if (LIVE && !LIVE._destroyed) throw new Error("Duplicate DailyIframe instances are not allowed");
      CREATED++;
      LIVE = new FakeCall();
      return LIVE;
    },
    supportedBrowser: () => ({ supported: true }),
  };
  window.Daily = window.DailyIframe;
  window.__dailyInstances = () => ({ created: CREATED, liveNow: !!(LIVE && !LIVE._destroyed) });
})();
