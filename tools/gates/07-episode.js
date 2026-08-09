/* GATE 7 — episode: full show, end to end, four real browser windows.
 * host GO LIVEs through the real UI → three suitors join through the real
 * lobby cards → each takes a bench seat through the real ♥ button (headshot
 * capture and all) → the host's poll seats the bench and the engine walks
 * showstart → spotlight → … → deciding → keep → LAST CALL → winner.
 * Phase transitions the SERVER owns in prod are driven by the double; every
 * client reaction is the shipped code.
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 250));
  }
};

module.exports = {
  name: "episode",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      const suitors = ["u_s1", "u_s2", "u_s3"].map((id, i) => D.addUser({ id, name: "Suitor" + (i + 1) }));

      /* --- host goes live through the real UI --- */
      const host = await h.newClient("host");
      host.login(hostU);
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      await host.page.click("#golive");
      await host.page.fill("#gl_name", "Episode Night");
      await host.page.click("#gl_go");
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      t.ok(true, "host GO LIVE lands in her room");
      const roomId = await host.page.evaluate(() => window.__lc.CURRENT_ROOM.id);
      t.ok(D.rooms.get(roomId)?.phase === "preshow", "new room is born in preshow");

      /* --- three suitors walk in from the lobby and take the bench --- */
      const sPages = [];
      for (let i = 0; i < 3; i++) {
        const c = await h.newClient("s" + (i + 1));
        c.login(suitors[i]);
        await c.goto();
        await c.page.waitForSelector(".roomcard", { timeout: 15000 });
        await c.page.click(".roomcard");
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        sPages.push(c);
      }
      t.ok(true, "three suitors enter through the real lobby cards");
      // all three hit ♥ TAKE A BENCH SEAT concurrently — real headshot flow
      await Promise.all(sPages.map((c) => c.page.click("#rt_joinline")));
      await waitFor(() => D.members.filter((m) => m.room_id === roomId && m.role === "line").length === 3
        || D.members.filter((m) => m.room_id === roomId && ["chair", "kept"].includes(m.role)).length === 3,
        20000, "three bench seats taken");
      t.ok(true, "bench fills through the ♥ button (headshot capture path)");
      const faces = suitors.filter((u) => D.profiles.get(u)?.face_json?.photo);
      t.ok(faces.length === 3, "every bench path captured a headshot (face_json present for " + faces.length + "/3)");

      /* --- host poll seats the bench; engine auto-starts the show --- */
      await waitFor(() => D.members.filter((m) => m.room_id === roomId && m.role === "chair").length === 3,
        20000, "host cold-start seats all three");
      t.ok(true, "curtain-up: host poll seats the full bench");
      await waitFor(() => ["showstart", "spotlight"].includes(D.rooms.get(roomId).phase), 15000, "start_show fires");
      t.ok(true, "engine auto-starts the show when chairs fill (phase=" + D.rooms.get(roomId).phase + ")");
      await waitFor(() => D.rooms.get(roomId).phase === "spotlight", 15000, "splash advances to spotlight");
      t.ok(true, "showstart splash advances itself to spotlight");

      /* --- host video publishes; remote feeds attach into the chairs --- */
      await host.page.evaluate((uids) => { uids.forEach((u) => window.__dailyControl.addRemote(u)); }, suitors);
      // NOTE: #rt_hero lives INSIDE #rt_chairs — count seat videos by seat id
      await waitFor(async () => host.page.evaluate(() => document.querySelectorAll("[id^=rt_seat] video").length >= 3), 10000, "chair videos attach");
      const vids = await host.page.evaluate(() => ({
        chairs: document.querySelectorAll("[id^=rt_seat] video").length,
        hero: document.querySelectorAll("#rt_hero video").length,
      }));
      t.ok(vids.chairs === 3, "three chair tiles carry live video (" + vids.chairs + ")");
      t.ok(vids.hero === 1, "host's own feed sits in the hero (" + vids.hero + ")");

      /* --- the middle segments run server-side; then the host's real SKIP —
             POLICY (SPEC wave 5): "she's heard enough" = STRAIGHT to her
             call, one press, one fire (the old one-step walk is retired) --- */
      D.rpc("host", "skip_phase", { room_id: roomId });   // answer → open floor (server pacing)
      await waitFor(() => D.rooms.get(roomId).phase === "openfloor", 10000, "phase openfloor");
      t.ok(true, "phase advances to openfloor (server pacing)");
      await waitFor(() => host.page.evaluate(() => {
        const el = document.getElementById("eg_skip");
        return el && getComputedStyle(el).display !== "none";
      }), 10000, "the skip control shows on the open floor");
      await host.page.click("#eg_skip");
      await waitFor(() => D.rooms.get(roomId).phase === "deciding", 10000, "her call");
      t.ok(true, "SHE'S HEARD ENOUGH lands straight in her call (wave-5 spec)");

      /* --- decision: keep one, pass one — real host actions --- */
      await host.page.evaluate((uid) => window.__lc.hostKeep(uid), suitors[0]);
      await waitFor(() => D.memberRow(roomId, suitors[0])?.role === "kept", 8000, "keep lands");
      t.ok(true, "hostKeep marks the finalist kept");
      await host.page.evaluate((uid) => window.__lc.hostPass(uid), suitors[1]);
      await waitFor(() => D.memberRow(roomId, suitors[1])?.role === "spectator", 8000, "pass lands");
      t.ok(true, "hostPass returns the passed man to the crowd");
      const s2btn = await waitFor(() => sPages[1].page.evaluate(() => {
        const b = document.getElementById("rt_joinline");
        return b && getComputedStyle(b).display === "none" ? "hidden" : null;
      }), 10000, "passed suitor loses the bench button").catch(() => null);
      t.ok(s2btn === "hidden", "pass is final: the passed suitor's join button is gone");

      /* --- LAST CALL through the real finale board --- */
      await host.page.evaluate(() => window.__lc.showLastCall());
      await host.page.waitForSelector("#finale.show .finalist", { timeout: 8000 });
      t.ok(true, "LAST CALL board lists the kept finalist");
      await host.page.click("#finale .finalist");
      await host.page.waitForSelector("#fin_confirm", { timeout: 8000 });
      await host.page.click("#fin_confirm");
      await waitFor(() => D.rooms.get(roomId).status === "ended", 10000, "show ends");
      t.ok(D.rooms.get(roomId).winner_id === suitors[0], "the show ends with the kept man as winner");

      /* --- everyone lands on an end screen, not a dead room --- */
      const winnerEnd = await waitFor(() => sPages[0].page.evaluate(() =>
        document.querySelector("#finale.show") ? "finale" : (document.querySelector("#snap.show") ? "snap" : null)),
        15000, "winner end screen").catch(() => null);
      t.ok(!!winnerEnd, "winner sees the ceremony (" + winnerEnd + ")");
      const loserEnd = await waitFor(() => sPages[2].page.evaluate(() =>
        (document.querySelector("#finale.show") || document.querySelector("#snap.show") ||
         getComputedStyle(document.getElementById("lobby")).display !== "none") ? true : null),
        15000, "loser end screen").catch(() => null);
      t.ok(!!loserEnd, "remaining suitor is walked out of the dead room");

      for (const c of [host, ...sPages]) {
        const errs = c.errors.filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, c.name + ": zero console errors — " + errs.slice(0, 2).join(" | "));
      }
    } finally { await h.close(); }
  },
};
