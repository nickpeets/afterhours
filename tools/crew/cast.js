/* cast.js — who the rehearsal crew is, and the camera each of them wears.
 *
 * Six bots.  The three men take bench seats on their own and sit in the
 * chairs when the show seats them; the three crowd bots watch and do what
 * the host tells them in chat.  Each wears a fake camera: a colored card
 * with his name on it, painted on a canvas and handed to the app through
 * getUserMedia — the same seam the battery's camera faults use — so the
 * bench headshot, the chair tile and the lobby preview all show WHO it is.
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
  { key: "DEX",     name: "Dex",     man: true,  color: "#e0245e", profile: "a" },
  { key: "MARCO",   name: "Marco",   man: true,  color: "#1f7ae0", profile: "b" },
  { key: "LEO",     name: "Leo",     man: true,  color: "#14a37f", profile: "c" },
  { key: "CROWD_A", name: "Crowd A", man: false, color: "#8a4fff", profile: "crowd" },
  { key: "CROWD_B", name: "Crowd B", man: false, color: "#e08a14", profile: "host" },
  { key: "CROWD_C", name: "Crowd C", man: false, color: "#5a6478", profile: "crowd-c" },
];

/* the slug a bot's email pattern fills in: "Crowd A" -> "crowd-a" */
const slug = (name) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/* The fake camera, as an init script: it runs before index.html in the
   bot's own browser context.  A real frame every 100ms (a ticking bar keeps
   the frames changing, so no "frozen" or "black" check can mistake it for a
   dead camera); audio is a silent track, so a mic request never fails. */
function cameraScript(bot) {
  const cfg = JSON.stringify({ name: bot.name, color: bot.color });
  return `(() => {
  const cfg = ${cfg};
  const md = navigator.mediaDevices; if (!md) return;
  let card = null;
  function cardStream() {
    if (card) return card;
    const cv = document.createElement("canvas"); cv.width = 480; cv.height = 640;
    const g = cv.getContext("2d"); let t = 0;
    const paint = () => {
      t++;
      g.fillStyle = cfg.color; g.fillRect(0, 0, 480, 640);
      g.fillStyle = "rgba(255,255,255,.18)"; g.beginPath(); g.arc(240, 250, 150, 0, Math.PI * 2); g.fill();
      g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle";
      g.font = "bold 92px sans-serif"; g.fillText(cfg.name, 240, 250);
      g.font = "bold 26px sans-serif"; g.fillText("LAST CALL CREW", 240, 470);
      g.fillStyle = "rgba(255,255,255,.85)"; g.fillRect(40, 560, (t % 50) * 8, 14);
    };
    paint(); setInterval(paint, 100);
    card = cv.captureStream(10);
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
  md.getUserMedia = async (c = {}) => {
    const out = new MediaStream();
    if (c.video) out.addTrack(cardStream().getVideoTracks()[0].clone());
    if (c.audio) { const a = silentTrack(); if (a) out.addTrack(a); }
    return out;
  };
  window.__crewCard = cfg;
})();`;
}

module.exports = { CAST, slug, cameraScript };
