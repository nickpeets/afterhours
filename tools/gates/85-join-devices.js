/* GATE 85 — join-devices: the crowd never opens a camera or a microphone.
 * Ships with fix/spectators-join-devices-off.
 *
 * THE BUG.  daily-js turns the camera and the mic ON at join() unless it is
 * told otherwise, and the room's join told it nothing.  So every crowd
 * member's phone opened its camera and microphone on entering a room, and
 * the app's preflight switched the video back off a moment later.  Found
 * while chasing the black bench headshot (live run at b1010.1315): a second
 * camera user on the page, on an iPhone, at the worst possible moment.
 *
 * WHAT THE HARNESS FAKED.  lib/shims/daily-shim.js modelled join-time device
 * use for the lobby's preview instances only; the ROOM's call object never
 * opened a device at join here, whatever it was asked.  The shim now applies
 * daily-js's rule to every instance (see its header), which is what makes
 * scene A fail against the old page.
 *
 * SCENES, all through the real page and window.__lc:
 *   A  crowd: joins with startVideoOff + startAudioOff, and getUserMedia is
 *      never called — not by the call, not by the page
 *   B  host: still joins with both ON and publishes (camera playable)
 *   C  a man already in a chair (reload): still joins with both ON, publishes
 *   D  crowd -> bench -> chair: the only camera open before the seat is the
 *      headshot's own (video only, never audio); once seated his camera
 *      publishes and his mic is switched on
 *   E  sound without a microphone: Safari starts call audio by itself only
 *      while the page is capturing.  A blocked audio play() is told once
 *      ("Tap anywhere…"), replayed inside the next gesture, and plays.
 *      Unblocked audio says nothing.
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 100));
  }
};

/* every getUserMedia call the page makes, with what it asked for — armed
   before the page's first script */
const GUM_SPY = `(() => {
  window.__gum = [];
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = (c) => { window.__gum.push({ video: !!(c && c.video), audio: !!(c && c.audio), facing: !!(c && c.video && c.video.facingMode) }); return orig(c); };
})();`;

/* Safari's rule for call audio on a page that is not capturing, modelled:
   an <audio> play() outside a trusted gesture is refused.  (The harness
   launches Chromium with autoplay forced on, so nothing here refuses by
   itself.)  The gesture window is opened by a capturing listener registered
   before any of the page's own. */
const AUDIO_BLOCK = `(() => {
  window.__audioGate = { inGesture: false, refused: 0, played: 0 };
  const open = (e) => { if (!e.isTrusted) return; window.__audioGate.inGesture = true; setTimeout(() => { window.__audioGate.inGesture = false; }, 0); };
  ["click", "touchend", "keydown"].forEach((n) => document.addEventListener(n, open, true));
  // the autoplay ATTRIBUTE is refused by the same rule as play()
  Object.defineProperty(HTMLAudioElement.prototype, "autoplay", { configurable: true, get() { return false; }, set(_v) {} });
  const orig = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    if (this.tagName === "AUDIO") {
      if (!window.__audioGate.inGesture) { window.__audioGate.refused++; return Promise.reject(new DOMException("play() needs a gesture", "NotAllowedError")); }
      window.__audioGate.played++;
    }
    return orig.apply(this, arguments);
  };
})();`;

const callOf = (c) => c.page.evaluate(() => {
  const k = window.__dailyControl;
  if (!k) return null;
  let video = "none";
  try { video = window.__lc.DAILY.participants().local.tracks.video.state; } catch (e) {}
  return { joined: k.joined(), gum: k.gum(), joinOpts: k.joinOpts(), audioLog: k.audioLog(), video, pageGum: window.__gum || [] };
});
const toastOf = (c) => c.page.evaluate(() => { const el = document.getElementById("toast"); return el && el.classList.contains("show") ? el.textContent : ""; });
/* a real audio MediaStreamTrack, made in the page, handed to the app's own playAudio */
const feedAudio = (c, sid) => c.page.evaluate((sid) => {
  const ac = new AudioContext();
  const dest = ac.createMediaStreamDestination();
  const osc = ac.createOscillator(); const gain = ac.createGain(); gain.gain.value = 0.0001;
  osc.connect(gain); gain.connect(dest); osc.start();
  window.__lc.playAudio(sid, dest.stream.getAudioTracks()[0]);
}, sid);
const audioEl = (c, sid) => c.page.evaluate((sid) => {
  const a = window.__lc.AUDIO_ELS[sid];
  return a ? { paused: a.paused, hasTrack: !!(a.srcObject && a.srcObject.getAudioTracks().length) } : null;
}, sid);

module.exports = {
  name: "join-devices",
  async run(t) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_chair", "u_crowd", "u_ear"].forEach((id) => D.addUser({ id, name: id }));

      const boot = async (name, uid, extra) => {
        const c = await h.newClient(name);
        await c.context.addInitScript(GUM_SPY);
        if (extra) await c.context.addInitScript(extra);
        c.login(uid);
        await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const enter = async (c, room) => {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        await waitFor(() => c.page.evaluate(() => !!window.__lc.DAILY_JOINED), 10000, c.name + " joined the call");
        await c.page.waitForTimeout(600);   // let the preflight's publish decision land
        return c;
      };

      // the host boots BEFORE the room exists (a booting host ends a live room it owns)
      const host = await boot("host", hostU);
      const room = D.addRoom({ id: "r_dev", host_id: hostU, name: "Devices Night", phase: "openfloor", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 600000);
      D.addMember(room, "u_chair", "chair", { seat_index: 0 });

      /* ---------- A: the crowd opens nothing ---------- */
      const crowd = await enter(await boot("crowd", "u_crowd"), room);
      const a = await callOf(crowd);
      t.ok(a.joined && a.joinOpts && a.joinOpts.startVideoOff === true && a.joinOpts.startAudioOff === true,
        `A: the crowd's join() says startVideoOff + startAudioOff (${JSON.stringify(a.joinOpts)})`);
      t.ok(a.gum.length === 0, `A: the call opened no device at join (${JSON.stringify(a.gum)})`);
      t.ok(a.pageGum.length === 0, `A: getUserMedia was never called on a crowd member's page (${JSON.stringify(a.pageGum)})`);
      t.ok(a.video !== "playable", `A: the crowd publishes no video (${a.video})`);
      t.ok(a.audioLog.every((x) => x === false), `A: the crowd's mic was never switched on (${JSON.stringify(a.audioLog)})`);

      /* ---------- B: the host starts with both on, and publishes ---------- */
      await enter(host, room);
      await waitFor(async () => (await callOf(host)).video === "playable", 6000, "host camera playable");
      const b = await callOf(host);
      t.ok(b.joinOpts.startVideoOff === false && b.joinOpts.startAudioOff === false,
        `B: the host's join() leaves camera and mic ON (${JSON.stringify(b.joinOpts)})`);
      t.ok(b.gum.length === 1 && b.gum[0].video === true && b.gum[0].audio === true, `B: the host's call opened camera + mic at join (${JSON.stringify(b.gum)})`);
      t.ok(b.video === "playable", "B: the host's camera is publishing");
      t.ok(b.audioLog.includes(true), `B: the host's mic is switched on (${JSON.stringify(b.audioLog)})`);
      t.ok(b.pageGum.filter((x) => x.video).length === 1, `B: one camera open for the host, not two (${JSON.stringify(b.pageGum)})`);

      /* ---------- C: a man already in a chair (reload) ---------- */
      const chair = await enter(await boot("chair", "u_chair"), room);
      await waitFor(async () => (await callOf(chair)).video === "playable", 6000, "chair camera playable");
      const c = await callOf(chair);
      t.ok(c.joinOpts.startVideoOff === false && c.joinOpts.startAudioOff === false,
        `C: a seated man's join() leaves camera and mic ON (${JSON.stringify(c.joinOpts)})`);
      t.ok(c.gum.length === 1 && c.gum[0].video && c.gum[0].audio, `C: his call opened camera + mic at join (${JSON.stringify(c.gum)})`);
      t.ok(c.video === "playable", "C: the seated man's camera is publishing");
      t.ok(c.audioLog.length > 0 && c.audioLog[c.audioLog.length - 1] === true, `C: his mic is on (${JSON.stringify(c.audioLog)})`);

      /* ---------- D: crowd -> bench -> chair ---------- */
      await crowd.page.click("#rt_joinline");
      await waitFor(() => (D.memberRow(room, "u_crowd") || {}).role === "line", 20000, "the crowd man benched");
      const d1 = await callOf(crowd);
      t.ok(d1.gum.length === 0, `D: on the bench his call has still opened no device (${JSON.stringify(d1.gum)})`);
      t.ok(d1.pageGum.length === 1 && d1.pageGum[0].video && d1.pageGum[0].facing && !d1.pageGum[0].audio,
        `D: the only camera open so far is the headshot's own — video, never audio (${JSON.stringify(d1.pageGum)})`);
      t.ok(d1.video !== "playable" && d1.audioLog.every((x) => x === false), "D: benched, he still publishes nothing");
      const seat = D.rpc("host", "seat_member", { room_id: room, user_id: "u_crowd", seat_index: 1 });
      t.ok(!(seat && seat.error), "D: fixture sanity — the host seats him (" + JSON.stringify(seat && seat.error || null) + ")");
      await waitFor(async () => (await callOf(crowd)).video === "playable", 6000, "the promoted man's camera playable");
      const d2 = await waitFor(async () => { const x = await callOf(crowd); return x.audioLog[x.audioLog.length - 1] === true ? x : null; }, 6000, "the promoted man's mic on");
      t.ok(d2.video === "playable", "D: seated, his camera publishes");
      t.ok(d2.audioLog[d2.audioLog.length - 1] === true, `D: seated, his mic is switched on (${JSON.stringify(d2.audioLog)})`);

      /* ---------- E: sound without a microphone ---------- */
      // unblocked: nothing is said
      await feedAudio(chair, "sid-quiet");
      await chair.page.waitForTimeout(500);
      const q = await audioEl(chair, "sid-quiet");
      t.ok(!!q && q.hasTrack && q.paused === false, `E: audio that may play just plays (${JSON.stringify(q)})`);
      t.ok(!/Tap anywhere/.test(await toastOf(chair)), "E: …and nobody is asked to tap");

      // blocked (Safari, page not capturing): told once, replayed inside the next gesture
      const ear = await enter(await boot("ear", "u_ear", AUDIO_BLOCK), room);
      await feedAudio(ear, "sid-show");
      const hint = await waitFor(() => toastOf(ear), 4000, "the tap-to-hear hint");
      t.ok(/Tap anywhere to hear the show/.test(hint), `E: a refused play() is TOLD — "${hint}"`);
      const e1 = await audioEl(ear, "sid-show");
      const g1 = await ear.page.evaluate(() => window.__audioGate);
      t.ok(!!e1 && e1.paused === true && g1.refused >= 1 && g1.played === 0, `E: fixture sanity — the audio really is waiting (${JSON.stringify({ e1, g1 })})`);
      t.ok(ear.logs.some((l) => /audio is waiting for a tap/.test(l.text)), "E: the wait is a [video] diagnostic line, not only a console shrug");
      await feedAudio(ear, "sid-show-2");          // a second blocked element: no second listener, no second toast
      await ear.page.waitForTimeout(300);
      await ear.page.keyboard.press("Shift");      // a trusted gesture, anywhere
      await waitFor(async () => { const x = await audioEl(ear, "sid-show"); return x && x.paused === false; }, 4000, "audio playing after the gesture");
      const e2 = await audioEl(ear, "sid-show"), e3 = await audioEl(ear, "sid-show-2");
      const g2 = await ear.page.evaluate(() => window.__audioGate);
      t.ok(e2.paused === false && e3.paused === false && g2.played === 2, `E: ONE gesture starts every waiting element (${JSON.stringify({ e2, e3, g2 })})`);
      const earCall = await callOf(ear);
      t.ok(earCall.pageGum.length === 0, "E: …and he hears it without ever opening a device");

      const errs = [host, crowd, chair, ear].flatMap((cl) => cl.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across the four windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
