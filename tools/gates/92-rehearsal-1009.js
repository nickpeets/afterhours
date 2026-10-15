/* GATE 92 — rehearsal-1009: the four anomalies of the 10/9 rehearsal, run
 * with the crew, the way the rehearsal ran them.  Ships with
 * fix/rehearsal-1009.
 *
 * The gate plays the HOST; the crew (tools/crew: six bots on their card
 * cameras) are the room, and one plain guest page — "probe" — is the phone
 * the measurements are taken on.  The crew's `--scenario hostgone` is the
 * same test run live, with Nick hosting from his phone.
 *
 * WHAT THE HARNESS FAKED, and why none of this was ever red here:
 *   - rooms had NO RLS in the double.  Production's select_live policy hides
 *     an ended room from everyone but its host, so a guest's poll of it gets
 *     PostgREST's 406 (PGRST116) and never sees status='ended'.  The double
 *     handed every guest the ended row, so every guest folded the ending and
 *     left — the 406 loop (3) and the guests stuck on a frozen host (1) could
 *     not happen.  Closed: the double now applies select_live to rooms reads
 *     and the harness applies it to realtime.
 *   - the double ran deliberation at 60s while production runs 90s (4), so
 *     no gate could see the 90.  The number is now one server value
 *     (lc_deliberation_secs, PENDING DDL tools/DDL-deliberation-60.sql),
 *     modelled in the double and handed to the client by lc_config.
 *
 *   1a. the host's beat stops → within ~15s every guest (crew + probe) sees
 *       "The host lost connection, hang tight"
 *   1b. she comes back → the notice clears for everyone
 *   1c. she's gone 2 minutes → the server ends the room → every guest gets
 *       "The host left. Show's over." with a way back to the lobby
 *   3.  after the ending, the guest makes ZERO requests about that room
 *       (no 406 loop), holds no subscription for it and has left the call
 *   2a. leave by the back arrow, walk into the NEXT room: no stale card
 *   2b. a winner ending's photo wait does not fire its card into the next room
 *   4.  deliberation is 60s: the server deadline, lc_config and the client's
 *       one value agree
 */
"use strict";
const { Harness } = require("../lib/harness");
const { Crew, PAGE } = require("../crew/crew.js");
const { CAST, cameraScript } = require("../crew/cast");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(step); }
  return null;
}
const NOTICE = /The host lost connection, hang tight/;
const LEFT = /The host left\. Show.s over\./;

/* what a guest's screen shows, read off the DOM */
const SCREEN = () => {
  const n = document.getElementById("rt_hostgone");
  const f = document.getElementById("finale");
  return {
    room: document.getElementById("room").classList.contains("show"),
    lobby: getComputedStyle(document.getElementById("lobby")).display !== "none",
    notice: !!(n && !n.hidden && n.offsetParent !== null) ? n.textContent : "",
    finale: f.classList.contains("show"),
    finaleText: (f.innerText || "").trim().replace(/\s+/g, " ").slice(0, 160),
    lobbyBtn: !!document.querySelector("#finale.show #fin_done"),
    channel: typeof ROOM_CHANNEL !== "undefined" && !!ROOM_CHANNEL,
    daily: !!(window.__lc && window.__lc.DAILY),
  };
};

module.exports = {
  name: "rehearsal-1009",
  async run(t) {
    const h = await Harness.launch();
    let crew = null;
    try {
      const D = h.double;
      const host = D.addUser({ id: "u_nick", name: "Nick", email: "nick@fix.test" });
      const room = D.addRoom({ id: "r_1009", host_id: host, name: "Rehearsal", phase: "openfloor", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_000_000);
      const probeU = D.addUser({ id: "u_probe", name: "Probe" });
      const uid = {};
      for (const c of CAST) uid[c.name] = D.addUser({ id: "u_crew_" + c.key.toLowerCase(), name: c.name, gender: c.man ? "man" : null });
      D.addMember(room, uid.Dex, "chair", { seat_index: 0 });
      D.addMember(room, uid.Marco, "chair", { seat_index: 1 });
      D.addMember(room, uid.Leo, "chair", { seat_index: 2 });
      D.addMember(room, probeU, "spectator");

      const hc = await h.newClient("host");
      hc.login(host); await hc.goto();
      await hc.page.waitForSelector("#room.show", { timeout: 20000 });

      const bots = [];
      for (const spec of CAST) {
        const c = await h.newClient("crew-" + spec.key.toLowerCase());
        await c.context.addInitScript(cameraScript(spec));
        await c.context.addInitScript(PAGE);
        c.login(uid[spec.name]); await c.goto();
        await c.page.waitForFunction(() => window.__crew && window.__crew.booted(), null, { timeout: 20000 });
        bots.push({ spec, page: c.page, close: () => c.close() });
      }
      const log = [];
      crew = new Crew({ bots, roomId: room, scenario: "hostgone", log: (s) => log.push(s), tickMs: 400, lingerMs: 0 });
      await crew.start();

      const probe = await h.newClient("probe");
      probe.login(probeU); await probe.goto();
      await probe.page.waitForSelector("#lobby", { state: "visible", timeout: 20000 });
      await probe.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await probe.page.waitForSelector("#room.show", { timeout: 15000 });
      await until(() => probe.page.evaluate(() => !!window.__lc.DAILY), 12000);
      await sleep(6000);   // a few beats land before anything goes wrong

      const guests = () => [probe.page, ...bots.map((b) => b.page)];
      const screens = () => Promise.all(guests().map((p) => p.evaluate(SCREEN).catch(() => null)));
      const pre = await screens();
      t.ok(pre.every((s) => s && s.room && !s.notice), "fixture: the host is live, every guest is in the room, no notice");

      /* ---- 1a. the host drops: her beats stop landing ---- */
      const drop = () => D.setFault("table:rooms.update", "host", { error: "Failed to fetch" });
      const back = () => D.setFault("table:rooms.update", "host", null);
      drop();
      const t0 = Date.now();
      const told = await until(async () => (await screens()).every((s) => s && NOTICE.test(s.notice)), 35000, 500);
      const tookS = ((Date.now() - t0) / 1000).toFixed(1);
      const s1 = await screens();
      t.ok(!!told, `1a: the host's beat stops → every guest (6 crew + probe) is told "The host lost connection, hang tight" (${told ? "after " + tookS + "s" : "nobody told: " + JSON.stringify(s1.map((s) => s && s.notice))})`);
      t.ok(!told || (Date.now() - t0) >= 10000, `1a: …and not before ~15s of silence (${tookS}s)`);
      t.ok(log.some((l) => /host lost connection/i.test(l)), "1a: the crew saw it too and logged it");

      /* ---- 1b. she comes back ---- */
      back();
      const cleared = await until(async () => (await screens()).every((s) => s && !s.notice && s.room), 20000, 500);
      t.ok(!!cleared, "1b: she comes back → the notice clears for every guest");

      /* ---- 1c. gone for good: 2 minutes, the server ends it ---- */
      drop();
      await until(async () => (await probe.page.evaluate(SCREEN)).notice, 35000, 500);
      D.rooms.get(room).host_seen_at = D.iso(D.now() - 125_000);
      D.sweepStaleRooms();   // pg_cron's tick
      t.ok(D.rooms.get(room).status === "ended" &&
           D.events.some((e) => e.room_id === room && e.type === "finale" && e.payload.by === "stale_host"),
        "1c: fixture — the server ended the room (finale by='stale_host')");
      const endedAt = Date.now();
      const carded = await until(async () => { const s = await probe.page.evaluate(SCREEN); return s.finale && LEFT.test(s.finaleText) ? s : null; }, 20000, 300);
      const ps = await probe.page.evaluate(SCREEN);
      t.ok(!!carded, `1c: the probe gets "The host left. Show's over." (${JSON.stringify(ps.finaleText)})`);
      t.ok(!!(carded && carded.lobbyBtn), "1c: …with a way back to the lobby");
      t.ok(!ps.notice, "1c: …and the connection notice is gone under the card");
      const crewEnd = await Promise.race([crew.done, sleep(20000).then(() => null)]);
      const seen = crew.endScreens || {};
      t.ok(!!crewEnd && CAST.every((c) => LEFT.test(seen[c.name] || "")),
        `1c: every crew bot saw the same card before it left (${JSON.stringify(seen)}${crewEnd ? "" : " — the crew never learned the room had ended"})`);

      /* ---- 3. after the ending: nothing polls it, nothing subscribes ---- */
      await sleep(1000);
      const mark = Date.now();
      await sleep(12000);
      const about = (e) => e.clientId === "probe" && e.at >= mark && (
        (e.args && e.args.room_id === room) ||
        (e.filters || []).some((f) => (f.col === "id" || f.col === "room_id") && f.val === room));
      const after = D.opLog.filter(about);
      const n406 = D.opLog.filter((e) => e.status === 406 && e.at >= endedAt).length;
      t.ok(after.length === 0, `3: in 12s after the card, the guest made 0 requests about the ended room (made ${after.length}: ${[...new Set(after.map((e) => e.name || (e.table + "." + e.action)))].join(", ")})`);
      t.ok(n406 === 0, `3: no 406 from any guest since the room ended (${n406})`);
      const ps3 = await probe.page.evaluate(SCREEN);
      t.ok(!ps3.channel, "3: the guest holds no realtime subscription for the ended room");
      t.ok(!ps3.daily, "3: …and has left the room's video call");
      if (!crew.stopped) { try { await crew.finish("gate cleanup"); } catch (e) {} }

      /* ---- 2a. back arrow out, into the NEXT room ---- */
      await probe.page.click("#roomback").catch(() => {});
      await until(() => probe.page.evaluate(() => getComputedStyle(document.getElementById("lobby")).display !== "none"), 10000);
      const roomB = D.addRoom({ id: "r_next", host_id: D.addUser({ id: "u_h2", name: "Jo" }), name: "Next Show" });
      D.addMember(roomB, probeU, "spectator");
      await probe.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomB) });
      await probe.page.waitForSelector("#room.show", { timeout: 15000 });
      await sleep(1500);
      const sB = await probe.page.evaluate(SCREEN);
      t.ok(sB.room && !sB.finale, `2a: the next room opens clean — no card from the last show over it (${JSON.stringify(sB.finale ? sB.finaleText : "clean")})`);

      /* ---- 2b. a winner ending's photo wait must not land in the next room ---- */
      D.addUser({ id: "u_win", name: "Win" });
      D.addMember(roomB, "u_win", "kept");
      D.endRoom(roomB, "u_win", "u_h2", "host");
      await until(() => probe.page.evaluate(() => typeof AWAITING_PHOTO !== "undefined" && AWAITING_PHOTO), 10000);
      await probe.page.click("#roomback").catch(() => {});
      await until(() => probe.page.evaluate(() => getComputedStyle(document.getElementById("lobby")).display !== "none"), 10000);
      const roomC = D.addRoom({ id: "r_third", host_id: D.addUser({ id: "u_h3", name: "Ana" }), name: "Third Show" });
      D.addMember(roomC, probeU, "spectator");
      await probe.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(roomC) });
      await probe.page.waitForSelector("#room.show", { timeout: 15000 });
      await sleep(16000);   // past the 14s photo wait
      const sC = await probe.page.evaluate(SCREEN);
      t.ok(sC.room && !sC.finale, `2b: the last show's winner card does not fire into the next room (${JSON.stringify(sC.finale ? sC.finaleText : "clean")})`);

      /* ---- 4. deliberation is 60s, one value ---- */
      const cfg = await probe.page.evaluate(async () => (await sb.rpc("lc_config")).data);
      const client = await probe.page.evaluate(() => window.__lc.LC_SECTION_SECS.deliberation);
      const roomD = D.addRoom({ id: "r_delib", host_id: host, name: "Deliberation", phase: "openfloor", round: 3 });
      D.rooms.get(roomD).phase_deadline = D.iso(D.now() - 1000);
      D.rpc("probe", "advance_phase", { room_id: roomD });
      const rD = D.rooms.get(roomD);
      const secs = Math.round((Date.parse(rD.phase_deadline) - D.now()) / 1000);
      t.ok(rD.phase === "deliberation" && secs === 60, `4: the server's deliberation deadline is 60s (phase ${rD.phase}, ${secs}s)`);
      t.ok(cfg && cfg.deliberation_secs === 60, `4: lc_config hands the client the one number (${JSON.stringify(cfg)})`);
      t.ok(client === (cfg && cfg.deliberation_secs), `4: the client's section clock reads it (${client})`);

      const errs = probe.errors.filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors on the probe — " + errs.slice(0, 2).join(" | "));
    } finally {
      if (crew && !crew.stopped) { try { await crew.finish("gate cleanup"); } catch (e) {} }
      await h.close();
    }
  },
};
