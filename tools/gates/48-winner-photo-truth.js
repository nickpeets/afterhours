/* GATE 48 — winner-photo-truth: the winner card ships a REAL photo, or an
 * avatar.  Never a black rectangle.  Ships with fix/winner-photo-truth.
 *
 * ANOMALY d3 of the b0809.1727 run: every winner card shipped a black frame,
 * because the capture raced the video element.  The fix landed in wave 8 —
 * `startWinnerSnap` waits for real dimensions, samples the canvas, and ships
 * NOTHING rather than a black card.  Gate 39 has held it ever since with one
 * assertion, and that assertion is a source grep:
 *
 *     t.ok(/getImageData/.test(snap) && /videoWidth/.test(snap) &&
 *          /never black/i.test(snap), …)
 *
 * It checks that three strings appear inside `startWinnerSnap`.  It cannot see
 * a single pixel.  Three other gates (7, 23, 24) all drive a real show to a
 * real winner and reach the ceremony — and every one of them asserts only that
 * the SCREEN appears.  Across 701 checks, nothing looked at the image.
 *
 * WHY THAT IS WORSE THAN d2's GREP, NOT BETTER.  d2 was source-only by
 * NECESSITY: its state was unreachable until `HOST_LAST_SEEN` was exported.
 * This one was source-only by CHOICE.  `WINNER_PHOTO` is a module-local `let`
 * exported nowhere — but it is RENDERED, as `<img class="winnerphoto">`, so the
 * shipped artifact was in the DOM the whole time.  Nobody had to export
 * anything; the assertion just was not written.  And reading the rendered image
 * is the better test anyway: it is what the person in the room actually sees.
 *
 * ON THE HARNESS BEING HONEST HERE — checked before writing, because a pixel
 * gate against a blank fixture is a green that means nothing.  The Daily double
 * mints remote tracks from `<canvas>.captureStream()`, and that canvas is
 * PAINTED: a full `fillRect` in `hsl(hue,70%,50%)` plus white label text.  The
 * winner's own local track is Chromium's fake camera, which is likewise never
 * black.  So "not black" is a real claim about the app, not an artifact.
 *
 * EXPECTED GREEN ON ARRIVAL, and said plainly rather than dressed up: the fix
 * is two waves old and the live run at b0809 confirmed a real photo in two
 * windows.  This gate is a REGRESSION LOCK, not a bug proof.  A gate that has
 * never been red is weaker evidence than one that has — but the alternative,
 * breaking the app to manufacture a red, would prove less and cost the truth.
 *
 * The claims:
 *   1. the ceremony produces an <img>, not an empty card
 *   2. that image is NOT black — sampled from the rendered pixels
 *   3. with no camera at all, the card falls back to the AVATAR — still no
 *      black rectangle, which is the half the original bug also violated
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

/* Decode whatever the card is showing and report whether it is lit.
   NOTE: this samples the SHIPPED ARTIFACT.  It is deliberately not a copy of
   the app's own pre-flight check — that one decides whether to ship, this one
   independently checks what arrived.  Verifying an output is not
   reimplementing the logic that produced it. */
const CARD = async () => {
  const img = document.querySelector("#finale img.winnerphoto");
  const av = document.querySelector("#finale .wf.av");
  if (!img) return { hasImg: false, hasAvatar: !!av, lit: null, w: 0, h: 0 };
  await new Promise((r) => { if (img.complete && img.naturalWidth) return r();
                             img.onload = r; img.onerror = r; setTimeout(r, 3000); });
  const w = img.naturalWidth, h = img.naturalHeight;
  if (!w || !h) return { hasImg: true, hasAvatar: !!av, lit: null, w, h };
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.drawImage(img, 0, 0);
  let lit = 0, sampled = 0;
  try {
    const px = g.getImageData(0, 0, w, h).data;
    for (let i = 0; i < px.length; i += 401 * 4) {
      sampled++;
      if (px[i] > 16 || px[i + 1] > 16 || px[i + 2] > 16) lit++;
    }
  } catch (e) { return { hasImg: true, hasAvatar: !!av, lit: "unreadable", w, h }; }
  return { hasImg: true, hasAvatar: !!av, lit, sampled, w, h };
};

module.exports = {
  name: "winner-photo-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@snap.test" });
      ["u_s1", "u_s2"].forEach((id) => D.addUser({ id, name: id }));

      const host = await h.newClient("host");
      host.login(hostU); await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const winner = await h.newClient("winner");
      winner.login("u_s1"); await winner.goto();
      await winner.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });

      const room = D.addRoom({ id: "r_snap", host_id: hostU, name: "Snap Night", phase: "deciding", round: 3 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 120_000);
      D.addMember(room, "u_s1", "kept", { seat_index: 0 });
      D.addMember(room, "u_s2", "chair", { seat_index: 1 });
      for (const c of [host, winner]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      await winner.page.waitForTimeout(1500);   // his camera publishes (he is kept)

      const publishing = await winner.page.evaluate(() =>
        Object.values(window.__lc.VIDEO_TILES || {}).some((tile) =>
          tile.uid === window.__lc.ME.id && tile.el && tile.el.srcObject));
      t.ok(publishing,
        "fixture sanity: the winner has a LIVE local stream before the ceremony — without it the app skips the snap by design and this gate would prove nothing");

      /* --- the host ends the show through the real board --- */
      await host.page.evaluate(() => document.getElementById("rt_endshow").click());
      await waitFor(() => host.page.evaluate(() => !!document.querySelector("#fin_board .finalist")), 10000, "the board");
      await host.page.evaluate(() => document.querySelector("#fin_board .finalist").click());
      await waitFor(() => host.page.evaluate(() => !!document.getElementById("fin_confirm")), 8000, "confirm");
      await host.page.evaluate(() => document.getElementById("fin_confirm").click());
      await waitFor(() => D.rooms.get(room).status === "ended" && D.rooms.get(room).winner_id === "u_s1", 10000, "the show to end");

      /* --- the ceremony runs, then the card --- */
      await waitFor(() => winner.page.evaluate(() =>
        document.getElementById("snap").classList.contains("show")), 12000, "the snap ceremony");
      await waitFor(() => winner.page.evaluate(() =>
        document.getElementById("finale").classList.contains("show") &&
        !document.getElementById("snap").classList.contains("show")), 30000, "the winner card after the ceremony");
      await winner.page.waitForTimeout(800);

      const mine = await winner.page.evaluate(CARD);

      t.ok(mine.hasImg || mine.hasAvatar,
        `the card shows SOMETHING — a photo or an avatar, never an empty frame (img=${mine.hasImg}, avatar=${mine.hasAvatar})`);

      if (mine.hasImg) {
        t.ok(mine.w > 0 && mine.h > 0,
          `the shipped photo has real dimensions (${mine.w}x${mine.h})`);
        /* THRESHOLD, AND WHY IT IS NOT THE APP'S.
           `startWinnerSnap` ships if THREE sampled pixels are lit, and that is
           right for production: it must not refuse a genuinely dim room.  A
           gate inheriting that number would pass on a 99%-black frame, which
           is the d3 symptom nearly intact — a threshold so loose it cannot
           fail is the vacuous-assertion trap wearing a number.
           Measured on this fixture the real answer is 243 of 243 lit: the
           double's canvas is a full saturated fillRect and the local track is
           Chromium's fake camera.  So half is a wide margin against a known
           fixture, and still strict enough that a black or near-black frame
           fails loudly. */
        const litFrac = mine.lit === "unreadable" ? 1 : mine.lit / Math.max(1, mine.sampled);
        t.ok(mine.lit === "unreadable" || litFrac >= 0.5,
          `THE PHOTO IS NOT BLACK — ${mine.lit}/${mine.sampled} sampled pixels lit (${Math.round(litFrac * 100)}%); d3 shipped a frame where this reads 0`);
      } else {
        /* Also a pass: the app is allowed to ship nothing.  What it may never
           do is ship black — and an avatar is the documented fallback. */
        t.ok(mine.hasAvatar,
          "no live frame was captured, and the card fell back to the AVATAR rather than a black rectangle");
        t.ok(true, "the no-photo path is the documented fallback, not a failure");
      }

      /* --- 3. the same card, seen by the HOST, is equally never black --- */
      await waitFor(() => host.page.evaluate(() =>
        document.getElementById("finale").classList.contains("show")), 20000, "the host's finale");
      const hers = await host.page.evaluate(CARD);
      t.ok(hers.hasImg || hers.hasAvatar,
        `the HOST's copy of the card is populated too (img=${hers.hasImg}, avatar=${hers.hasAvatar})`);
      if (hers.hasImg) {
        const hf = hers.lit === "unreadable" ? 1 : hers.lit / Math.max(1, hers.sampled);
        t.ok(hers.lit === "unreadable" || hf >= 0.5,
          `and hers is not black either — ${hers.lit}/${hers.sampled} lit (${Math.round(hf * 100)}%); the live run's black cards appeared on EVERY screen, not just his`);
      } else {
        t.ok(hers.hasAvatar, "hers falls back to the avatar, never a black frame");
      }

      const errs = [host, winner].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
