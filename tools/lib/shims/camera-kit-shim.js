/* camera-kit-shim.js — served IN PLACE OF the Camera Kit Web SDK module
 * (whatever address index.html's CAMKIT.sdkUrl names; harness.js routes it).
 * An ES module, like the real thing: the app reaches it with import().
 *
 * WHAT THIS MODELS, read off @snap/camera-kit 1.22.0's own .d.ts and README
 * (2026-10-05) — a no-op shim would let a lens "go live" over nothing, which
 * is the false green gate 70 already paid for once:
 *
 *   bootstrapCameraKit({ apiToken })  REJECTS without the harness's token
 *       (ConfigurationError when the token is missing, BootstrapError when it
 *       is wrong), else resolves a kit
 *   kit.lensRepository.loadLens(lensId, groupId)  REJECTS for a lens or a
 *       group the harness does not know
 *   kit.createSession()  → a session with TWO output canvases (live, capture)
 *   createMediaStreamSource(stream, { cameraType, transform })  → a source;
 *       a source can be attached to a session ONCE (the real constraint —
 *       re-attaching throws CameraKitSourceError)
 *   session.setSource / applyLens / play(target) / pause(target) / destroy()
 *       - nothing renders until a source is set AND a target is playing, and
 *         only the target that is PLAYING is drawn (capture the other canvas
 *         and you publish nothing)
 *       - every rendered frame is the SOURCE's current frame with the lens
 *         drawn over it: a magenta band across the top (LENS_MARK) that no
 *         camera frame contains, so a gate can find the lens in the pixels
 *         of what the call publishes
 *       - THE SOURCE CAN DIE: when the source's video track ends, rendering
 *         stops — no new frames reach the canvas.  A pipeline that fed the
 *         session a track somebody else stops goes dark here, as it would
 *         on a phone.
 *       - applyLens rejects for a lens that did not come from loadLens
 *       - after destroy() every call rejects
 *   session.events "error" with a LensExecutionError: the lens is removed
 *       and the bare source keeps rendering (__camkitControl.lensCrash())
 *   THE LEGAL PROMPT (found by the first real-SDK run, 2026-10-06 —
 *       tools/camkit-smoke.js; read in 1.22.0's dist/session/lensState.js and
 *       dist/legal/*.js).  The real applyLens does nothing until Snap's terms
 *       are accepted: unless Snap's config disables it for the app, the FIRST
 *       applyLens puts a dialog on screen — a <div data-testid="tos-dialog">
 *       appended to document.body, a shadow root, a <dialog> opened with
 *       showModal() (top layer, modal: the page under it takes no input),
 *       two buttons, "Dismiss" and "I Agree" — and WAITS, with no timeout of
 *       its own.  "I Agree": applyLens carries on, and the answer is
 *       remembered (in the SDK: for the bootstrap, and in IndexedDB for 12
 *       hours).  "Dismiss": applyLens rejects with a LegalError, and the
 *       next applyLens asks again.  The staging token gets this prompt.
 *       The shim had modelled applyLens as immediate, which is the
 *       ALREADY-ACCEPTED case and stays the default; the fault
 *       legal:"prompt" models a first-time viewer.
 *
 * FAULTS — the shim's setFault, same idea as backend-double's.  Read LIVE
 * from window.__camkitFaults on every call, so a gate can arm one before the
 * module has even been requested:
 *     bootstrap:      "reject" | "unsupported" | "hang"
 *     loadLens:       "reject" | "hang"
 *     createSession:  "reject"
 *     applyLens:      "reject" | "interrupted" | "hang" | "slow" (900ms, then applies)
 *     legal:          "prompt" (the first applyLens shows Snap's terms dialog and waits)
 * (The module failing to LOAD at all is a network fact, not an SDK one — that
 * fault lives in harness.js: Harness.camkitLoadFault.)
 *
 * WHAT IT CANNOT PROVE (this goes to the phone test, and the PR body says so):
 *   - that the real SDK's WebGL output canvas yields frames through
 *     captureStream() on iOS Safari — these canvases are 2D
 *   - face tracking, lens content, WASM download time, thermal/battery cost
 *   - the real token / lens-group / lens-ID handshake with Snap's servers
 *   - whether Snap's config shows the legal prompt for a given token, its
 *     real wording, and its 12-hour memory (the shim remembers per page)
 *   - the real error names for an unknown lens (modelled as a rejection)
 *   - that the real session's `capture` target renders what a given lens
 *     author intended for other viewers
 */
const TOKEN = "lc-test-token";
const GROUP = "lc-test-group";
const LENSES = { "lens-fox": "Fox Ears (shim)", "lens-halo": "Halo (shim)" };
const LENS_MARK = [255, 0, 255];   // the lens, in pixels: a magenta band no camera frame contains

const named = (name, message) => Object.assign(new Error(message), { name });
const faults = () => (window.__camkitFaults = window.__camkitFaults || {});
const never = () => new Promise(() => {});

const LOG = { bootstraps: [], lensLoads: [], sessions: [], sources: [] };
let SEQ = 1;

/* THE LEGAL PROMPT — see the header.  Same DOM shape as the SDK's (the app
   and the gates can only find it the way they would find the real one), same
   two answers, no timeout.  Off unless the fault asks for it. */
const LEGAL = { state: "unknown", shown: 0 };
function legalPrompt() {
  if (faults().legal !== "prompt" || LEGAL.state === "accepted") return Promise.resolve(true);
  LEGAL.shown++;
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.setAttribute("data-testid", "tos-dialog");
    const dialog = document.createElement("dialog");
    const p = document.createElement("p");
    p.textContent = "(shim) By using Lenses, you acknowledge reading Snap's Privacy Policy and agree to Snap's Terms of Service.";
    dialog.appendChild(p);
    const answer = (text, accepted) => {
      const b = document.createElement("button");
      b.textContent = text;
      b.onclick = () => { dialog.close(); host.remove(); LEGAL.state = accepted ? "accepted" : "rejected"; resolve(accepted); };
      dialog.appendChild(b);
    };
    answer("Dismiss", false);
    answer("I Agree", true);
    host.attachShadow({ mode: "open" }).appendChild(dialog);
    document.body.appendChild(host);
    dialog.showModal();
  });
}

export class Transform2D {
  constructor(matrix, label) { this.matrix = matrix; this.label = label || "custom"; }
}
Transform2D.MirrorX = new Transform2D([-1, 0, 0, 0, 1, 0, 0, 0, 1], "mirrorX");
Transform2D.MirrorY = new Transform2D([1, 0, 0, 0, -1, 0, 0, 0, 1], "mirrorY");
Transform2D.Identity = new Transform2D([1, 0, 0, 0, 1, 0, 0, 0, 1], "identity");

class FakeSource {
  constructor(stream, options) {
    this.stream = stream;
    this.options = Object.assign({ cameraType: "user", transform: Transform2D.Identity }, options || {});
    this.attached = false;
    const tr = stream.getVideoTracks()[0] || null;
    this.record = { id: "src-" + (SEQ++), trackId: tr ? tr.id : null, cameraType: this.options.cameraType,
                    transform: this.options.transform && this.options.transform.label, track: tr };
    LOG.sources.push(this.record);
  }
}
export function createMediaStreamSource(stream, options) {
  if (!(stream instanceof MediaStream)) throw named("ArgumentValidationError", "createMediaStreamSource needs a MediaStream");
  return new FakeSource(stream, options);
}

class FakeSession {
  constructor() {
    this.id = "ses-" + (SEQ++);
    this.output = { live: document.createElement("canvas"), capture: document.createElement("canvas") };
    for (const c of Object.values(this.output)) { c.width = 2; c.height = 2; }
    this.playing = { live: false, capture: false };
    this.events = new EventTarget();
    this._source = null; this._video = null; this._lens = null; this._destroyed = false; this._raf = 0;
    this.record = { id: this.id, sourceId: null, sourceTrackId: null, lens: null, played: [], paused: [], destroyed: false,
                    frames: { live: 0, capture: 0 }, session: this };
    LOG.sessions.push(this.record);
  }
  _alive() { if (this._destroyed) throw named("Error", "session is destroyed"); }
  async setSource(source) {
    this._alive();
    if (!(source instanceof FakeSource)) throw named("CameraKitSourceError", "setSource needs a CameraKitSource (use createMediaStreamSource)");
    if (source.attached) throw named("CameraKitSourceError", "a source that was attached to a session cannot be attached again");
    source.attached = true;
    this._source = source;
    this.record.sourceId = source.record.id; this.record.sourceTrackId = source.record.trackId;
    const v = document.createElement("video");   // internal, never in the DOM — like the SDK's own
    v.muted = true; v.playsInline = true; v.srcObject = source.stream;
    this._video = v;
    /* NOT awaited: play() on a stream whose track has already ended never
       settles, and the real setSource resolves once the source is attached —
       a dead source shows up as NO FRAMES, not as a hung promise */
    try { const pp = v.play(); if (pp && pp.catch) pp.catch(() => {}); } catch (e) {}
    this._loop();
    return source;
  }
  async applyLens(lens) {
    this._alive();
    /* terms first, as the SDK does: nothing about the lens happens until the
       viewer has answered, however long that takes */
    if (!(await legalPrompt())) throw named("LegalError", "Failed to apply lens " + (lens && lens.id) + ". Required legal terms were not accepted.");
    this._alive();
    const f = faults().applyLens;
    if (f === "hang") return never();
    if (f === "reject") throw named("LensError", "lens content download failed (fault)");
    if (f === "interrupted") return false;
    if (f === "slow") { await new Promise((r) => setTimeout(r, 900)); this._alive(); }   // a lens whose content takes a beat to download
    if (!lens || lens.__shim !== true) throw named("LensError", "lens was not loaded through the LensRepository");
    this._lens = lens; this.record.lens = lens.id;
    return true;
  }
  async removeLens() { this._alive(); this._lens = null; this.record.lens = null; return true; }
  async play(target) {
    this._alive();
    target = target || "live";
    this.playing[target] = true; this.record.played.push(target);
    this._loop();
  }
  async pause(target) {
    this._alive();
    target = target || "live";
    this.playing[target] = false; this.record.paused.push(target);
  }
  async destroy() {
    this._destroyed = true; this.record.destroyed = true;
    this.playing = { live: false, capture: false };
    if (this._raf) cancelAnimationFrame(this._raf);
    this._raf = 0;
    if (this._video) { try { this._video.pause(); } catch (e) {} this._video = null; }
  }
  _loop() {
    if (this._raf || this._destroyed) return;
    const step = () => {
      this._raf = 0;
      if (this._destroyed) return;
      this._render();
      this._raf = requestAnimationFrame(step);
    };
    this._raf = requestAnimationFrame(step);
  }
  _render() {
    const v = this._video, src = this._source;
    if (!v || !src) return;
    const tr = src.stream.getVideoTracks()[0];
    if (!tr || tr.readyState !== "live") return;        // THE SOURCE DIED: no new frames, on any target
    if (v.readyState < 2 || !v.videoWidth) return;
    for (const target of ["live", "capture"]) {
      if (!this.playing[target]) continue;              // only a PLAYING target is rendered
      const c = this.output[target];
      if (c.width !== v.videoWidth || c.height !== v.videoHeight) { c.width = v.videoWidth; c.height = v.videoHeight; }
      const g = c.getContext("2d");
      g.save();
      if (src.options.transform === Transform2D.MirrorX) { g.translate(c.width, 0); g.scale(-1, 1); }
      g.drawImage(v, 0, 0, c.width, c.height);
      g.restore();
      if (this._lens) { g.fillStyle = "rgb(" + LENS_MARK.join(",") + ")"; g.fillRect(0, 0, c.width, Math.ceil(c.height / 4)); }
      this.record.frames[target]++;
    }
  }
}

class FakeKit {
  constructor() {
    this.lensRepository = {
      loadLens: async (lensId, groupId) => {
        LOG.lensLoads.push({ lensId, groupId });
        const f = faults().loadLens;
        if (f === "hang") return never();
        if (f === "reject") throw named("Error", "lens fetch failed (fault)");
        if (groupId !== GROUP) throw named("Error", "unknown lens group '" + groupId + "'");
        if (!Object.prototype.hasOwnProperty.call(LENSES, lensId)) throw named("Error", "lens '" + lensId + "' not found in group '" + groupId + "'");
        return { __shim: true, id: lensId, name: LENSES[lensId], groupId };
      },
    };
  }
  async createSession() {
    if (faults().createSession === "reject") throw named("Error", "render engine failed to start (fault)");
    return new FakeSession();
  }
  async destroy() { for (const r of LOG.sessions) if (!r.destroyed) await r.session.destroy(); }
}

export async function bootstrapCameraKit(configuration) {
  const token = configuration && configuration.apiToken;
  LOG.bootstraps.push({ apiToken: token === undefined ? null : token });
  const f = faults().bootstrap;
  if (f === "hang") return never();
  if (f === "unsupported") throw named("PlatformNotSupportedError", "this platform is not supported by Camera Kit (fault)");
  if (f === "reject") throw named("BootstrapError", "Error occurred during Camera Kit bootstrapping. (fault)");
  if (!token || typeof token !== "string") throw named("ConfigurationError", "apiToken is required");
  if (token !== TOKEN) throw named("BootstrapError", "Error occurred during Camera Kit bootstrapping.");
  return new FakeKit();
}

/* ---- test control: observation + the fault hook.  No app logic. ---- */
const plain = (r) => { const o = Object.assign({}, r); delete o.session; delete o.track; return JSON.parse(JSON.stringify(o)); };   // a SNAPSHOT, never a live reference
window.__camkitControl = {
  TOKEN, GROUP, LENSES: Object.assign({}, LENSES), LENS_MARK: LENS_MARK.slice(),
  setFault: (name, mode) => { if (mode) faults()[name] = mode; else delete faults()[name]; },
  bootstraps: () => LOG.bootstraps.slice(),
  lensLoads: () => LOG.lensLoads.slice(),
  sessions: () => LOG.sessions.map(plain),
  sources: () => LOG.sources.map((r) => Object.assign(plain(r), { trackReady: r.track ? r.track.readyState : null })),
  liveSession: () => { const r = LOG.sessions.filter((x) => !x.destroyed).pop(); return r ? r.session : null; },
  /* the legal prompt: how many times it was shown, and what was last answered */
  legal: () => ({ state: LEGAL.state, shown: LEGAL.shown }),
  /* a lens dying mid-render: the SDK removes it, keeps rendering the bare
     source, and says so on session.events */
  lensCrash: (message) => {
    const r = LOG.sessions.filter((x) => !x.destroyed).pop();
    if (!r) return false;
    const lens = r.session._lens;
    r.session._lens = null; r.lens = null;
    r.session.events.dispatchEvent(new CustomEvent("error", { detail: { error: named("LensExecutionError", message || "lens crashed (fault)"), lens } }));
    return true;
  },
};
