/* cast.js — who the rehearsal crew is, and the camera each of them wears.
 *
 * Six bots.  The three men take bench seats on their own and sit in the
 * chairs when the show seats them; the three crowd bots watch and do what
 * the host tells them in chat.  Each wears a fake camera: a colored card
 * with his name on it, painted on a canvas and handed to the app through
 * getUserMedia — the same seam the battery's camera faults use — so the
 * bench headshot, the chair tile and the lobby preview all show WHO it is.
 *
 * `crew --faces` (feat/crew-faces): the card gives way to a FACE — a short
 * looping clip of a real person, a different one per bot, front-facing and
 * talking, so a look can be rehearsed on a moving head.  The clips are
 * Pexels-licensed stock (tools/crew/faces/LICENSES.md), downloaded and
 * encoded by tools/crew/faces/fetch.sh into /workspaces/rehearsal/faces
 * (CREW_FACES moves it) and NEVER committed.
 *
 *   INTERNAL REHEARSAL ONLY.  The faces exist so Nick can see a look on a
 *   moving face before a show.  They are never to appear in the Snap demo
 *   videos, the Camera Kit review submission, screenshots, the lobby of a
 *   public show, or anywhere else public — anything public uses the crew's
 *   name cards, or Nick himself.
 *
 * Accounts are NOT here and never will be.  Each bot signs in the way the
 * 10/9 rehearsal did: a Chromium profile that already holds a signed-in
 * session, outside the repo (/workspaces/rehearsal/profile-<profile>, made
 * by signing in by hand once).  A bot with no profile can use an email and
 * password from Codespace secrets instead (README.md); `key` is that env
 * stem: CREW_EMAIL_DEX, CREW_EMAIL_CROWD_A.
 */
"use strict";

const CAST = [
  { key: "DEX",     name: "Dex",     man: true,  color: "#e0245e", profile: "a",       pexels: 7261920 },
  { key: "MARCO",   name: "Marco",   man: true,  color: "#1f7ae0", profile: "b",       pexels: 8724452 },
  { key: "LEO",     name: "Leo",     man: true,  color: "#14a37f", profile: "c",       pexels: 7231255 },
  { key: "CROWD_A", name: "Crowd A", man: false, color: "#8a4fff", profile: "crowd",   pexels: 6965116 },
  { key: "CROWD_B", name: "Crowd B", man: false, color: "#e08a14", profile: "host",    pexels: 8724213 },
  { key: "CROWD_C", name: "Crowd C", man: false, color: "#5a6478", profile: "crowd-c", pexels: 6962123 },
];

/* the slug a bot's email pattern fills in: "Crowd A" -> "crowd-a" */
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* --faces: where a bot's clip lives (made by faces/fetch.sh, outside the
   repo), and the same-origin URL the bot's page loads it from.  The URL is
   never fetched from the site: the crew answers it itself from the file
   (crew.js serveFace), so the clip never leaves the machine. */
const FACES_DIR = process.env.CREW_FACES || "/workspaces/rehearsal/faces";
const faceFile = (spec) => require("path").join(FACES_DIR, slug(spec.name) + ".webm");
const facePath = (spec) => "/__crew/face-" + slug(spec.name) + ".webm";

/* The fake camera, as an init script: it runs before index.html in the
   bot's own browser context.  A real frame every 100ms (a ticking bar keeps
   the frames changing, so no "frozen" or "black" check can mistake it for a
   dead camera); audio is a silent track, so a mic request never fails.

   With a face (cfg.face, a same-origin URL): a hidden looping <video> plays
   the clip and every frame is painted onto the same 480×640 canvas, cover-
   fitted, with a small name tag in the corner so you still know who is who.
   Until the clip has its first frame the card is painted, so there is never
   a black frame; if the clip fails to load the card stays, and
   window.__crewCard.faceState says so.  INTERNAL REHEARSAL ONLY — see the
   header. */
function cameraScript(bot, face = null) {
  const cfg = JSON.stringify({ name: bot.name, color: bot.color, face: face || null });
  return `(() => {
  const cfg = ${cfg};
  const md = navigator.mediaDevices; if (!md) return;
  let card = null, vid = null, faceState = cfg.face ? "loading" : "card";
  function faceVideo() {
    if (vid || !cfg.face) return vid;
    vid = document.createElement("video");
    vid.muted = true; vid.loop = true; vid.playsInline = true; vid.autoplay = true; vid.preload = "auto";
    vid.setAttribute("aria-hidden", "true");
    vid.style.cssText = "position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;left:-9999px;top:0";
    vid.addEventListener("error", () => { faceState = "failed"; });
    vid.addEventListener("playing", () => { faceState = "playing"; });
    vid.src = cfg.face;
    (document.body || document.documentElement).appendChild(vid);
    vid.play().catch(() => {});
    return vid;
  }
  function cardStream() {
    if (card) return card;
    const cv = document.createElement("canvas"); cv.width = 480; cv.height = 640;
    const g = cv.getContext("2d"); let t = 0;
    const paintCard = () => {
      g.fillStyle = cfg.color; g.fillRect(0, 0, 480, 640);
      g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.arc(240, 250, 150, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "bold 92px sans-serif"; g.fillText(cfg.name, 240, 250);
      g.font = "bold 26px sans-serif"; g.fillText("LAST CALL CREW", 240, 470);
      g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(40, 560, (t % 50) * 8, 14);
    };
    const paintFace = (v) => {
      // cover-fit the clip into the portrait frame, cropped about its centre
      const vw = v.videoWidth, vh = v.videoHeight, s = Math.max(480 / vw, 640 / vh);
      const dw = vw * s, dh = vh * s;
      g.drawImage(v, (480 - dw) / 2, (640 - dh) / 2, dw, dh);
      g.fillStyle = "rgba(0,0,0,.45)"; g.fillRect(0, 600, 480, 40);
      g.fillStyle = "#fff"; g.textAlign = "left"; g.textBaseline = "middle";
      g.font = "bold 22px sans-serif"; g.fillText(cfg.name + " · crew", 14, 620);
      g.fillStyle = cfg.color; g.fillRect(440, 612, (t % 10) * 3, 16);   // a ticking mark: frames keep changing
    };
    const paint = () => {
      t++;
      const v = faceVideo();
      if (v && v.readyState >= 2 && v.videoWidth) { try { paintFace(v); return; } catch (e) {} }
      paintCard();
    };
    paint(); setInterval(paint, cfg.face ? 66 : 100);
    card = cv.captureStream(cfg.face ? 15 : 10);
    return card;
  }
  function silentTrack() {
    try {
      const ac = new AudioContext(); const o = ac.createOscillator(); const gn = ac.createGain();
      gn.gain.value = 0; const d = ac.createMediaStreamDestination();
      o.connect(gn); gn.connect(d); o.start();
      return d.stream.getAudioTracks()[0];
    } catch (e) { return null; }
  }
  // the clip starts loading with the page, not with the first camera request,
  // so a bot (and the crew's log) knows whether its face plays before it needs it
  if (cfg.face) document.addEventListener("DOMContentLoaded", () => { try { faceVideo(); } catch (e) {} });
  md.getUserMedia = async (c = {}) => {
    const out = new MediaStream();
    if (c.video) out.addTrack(cardStream().getVideoTracks()[0].clone());
    if (c.audio) { const a = silentTrack(); if (a) out.addTrack(a); }
    return out;
  };
  Object.defineProperty(cfg, "faceState", { get: () => faceState, enumerable: true });
  window.__crewCard = cfg;
})();`;
}

module.exports = { CAST, slug, cameraScript, FACES_DIR, faceFile, facePath };
