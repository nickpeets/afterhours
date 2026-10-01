/* GATE 74 — stale-host-resume-card: RULING Q1 v2 (9/30).  A booting host is
 * walked straight back into her live room ONLY when her heartbeat says she
 * just left it.  A stale beat is not a reload — it is a show she left
 * running — and the lobby ASKS: Resume / End it.
 *
 * PROVENANCE, labelled.  Forged 2026-09-30 against Nick's ghost room.  Q1
 * (8/8) said a reload never ends the show, and enterApp implemented it with
 * no age check at all; openRoom's 120s zombie rule is guarded by
 * `r.host_id!==ME.id`, so it never applies to the host.  Chain those: a live
 * room that survives a sign-out stays live forever and swallows its host on
 * her next boot, hours or days later.  Gate 17 (host-comeback) holds Q1 for
 * a real reload; nothing held the other side.
 *
 * WHAT THE HARNESS FAKED (CONTRIBUTING): a host who never boots into a
 * stale room.  addRoom stamps host_seen_at = now and no gate ever aged it
 * for the HOST's own boot (gate 17 ages a STRANGER's room).  This gate ages
 * it; nothing in the double had to change for that.
 *
 * What this gate holds:
 *   1. beat 121s old → lobby + card, NOT the room; openRoom never ran;
 *   2. Resume → the room, as host; the card is gone;
 *   3. End it → the row is `ended` through end_show, lobby, card gone;
 *   4. End it with end_show refused → the status='ended' fallback lands;
 *      with BOTH refused → the card stays and the toast says so;
 *   5. control: beat 30s old → straight into the room (Q1 v1 preserved);
 *   6. HOST_STALE_MS is the ONE number behind all three sites.
 */
"use strict";
const { Harness } = require("../lib/harness");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200)); } };

module.exports = {
  name: "stale-host-resume-card",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@stale.test" });
      const host = await h.newClient("host"); host.login(hostU);

      const liveRoom = (id, ageMs) => {
        const room = D.addRoom({ id, host_id: hostU, name: "Night " + id, phase: "openfloor", round: 1 });
        D.rooms.get(room).created_at = D.iso(D.now() - 3_600_000);          // an hour-old show…
        D.rooms.get(room).host_seen_at = D.iso(D.now() - ageMs);            // …whose host last beat `ageMs` ago
        return room;
      };
      const ui = () => host.page.evaluate(() => {
        const vis = (id) => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== "none"; };
        return {
          card: vis("staleresume"), lobby: vis("lobby"),
          room: document.getElementById("room").classList.contains("show"),
          cardText: (document.getElementById("staleresume").textContent || "").replace(/\s+/g, " ").trim(),
          current: window.__lc.CURRENT_ROOM ? window.__lc.CURRENT_ROOM.id : null,
          stale: window.__lc.STALE_RESUME ? window.__lc.STALE_RESUME.id : null,
          amhost: window.__lc.AMHOST,
          toast: (document.getElementById("toast").textContent || "").trim(),
        };
      });
      const boot = async () => {
        await host.goto();
        await waitFor(() => host.page.evaluate(() => !!window.__lc && (
          getComputedStyle(document.getElementById("lobby")).display !== "none" ||
          document.getElementById("room").classList.contains("show"))).catch(() => false), 15000,
          "the boot to reach the lobby or the room");
      };
      const endShows = (room) => D.rpcLog.filter((r) => r.clientId === "host" && r.name === "end_show" && r.args.room_id === room).length;
      const hostRoomOps = (from) => D.opLog.slice(from).filter((e) => e.clientId === "host" &&
        ((e.op === "table" && e.table === "rooms" && e.action === "update") || (e.op === "rpc" && e.name === "end_show")));

      /* ---- scene 1: a stale beat → the card, not the room ---- */
      const rA = liveRoom("r_stale_A", 121_000);
      const beatA = D.rooms.get(rA).host_seen_at;
      let o0 = D.opLog.length;
      await boot();
      await host.page.waitForSelector("#staleresume", { state: "visible", timeout: 10000 });
      await host.page.waitForTimeout(1500);   // anything that was going to open the room has had its chance
      let s = await ui();
      t.ok(s.card && s.lobby, "beat 121s old: she lands in the LOBBY and the resume card is showing");
      t.ok(!s.room && s.current === null,
        `…and she was NOT walked into the room (room shown=${s.room}, CURRENT_ROOM=${s.current})`);
      t.ok(D.rooms.get(rA).host_seen_at === beatA && hostRoomOps(o0).length === 0,
        "openRoom never ran: no host heartbeat was written and nothing touched the rooms row");
      t.ok(/You have a show still running/.test(s.cardText) && /Resume/.test(s.cardText) && /End it/.test(s.cardText) &&
           s.cardText.includes("Night r_stale_A"),
        `the card says what the ruling says, and names the show (${JSON.stringify(s.cardText)})`);
      t.ok(s.stale === rA && D.rooms.get(rA).status === "live", "STALE_RESUME holds the room; the boot ended nothing");

      /* ---- scene 2: Resume ---- */
      await host.page.click("#staleresume_go");
      await host.page.waitForSelector("#room.show", { timeout: 10000 });
      s = await ui();
      t.ok(s.room && s.current === rA && s.amhost === true, "Resume → the room, as host");
      t.ok(!s.card && s.stale === null, "…and the card is gone");
      await waitFor(() => Promise.resolve(D.rooms.get(rA).host_seen_at !== beatA), 5000, "the resumed host's heartbeat");
      t.ok(true, "her heartbeat is fresh again — the room is a live show, not a ghost");
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });
      t.ok(D.rooms.get(rA).status === "ended", "(reset) leaving as host ended room A");

      /* ---- scene 3: End it ---- */
      const rB = liveRoom("r_stale_B", 121_000);
      await boot();
      await host.page.waitForSelector("#staleresume", { state: "visible", timeout: 10000 });
      const e0 = endShows(rB);
      await host.page.click("#staleresume_end");
      await waitFor(() => Promise.resolve(D.rooms.get(rB).status === "ended"), 8000, "End it to end the room");
      await waitFor(async () => !(await ui()).card, 5000, "the card to clear after End it");
      s = await ui();
      t.ok(D.rooms.get(rB).status === "ended" && endShows(rB) - e0 === 1 && D.rooms.get(rB).winner_id === null,
        "End it → the row is `ended` through end_show(room_id, winner_id:null)");
      t.ok(s.lobby && !s.room && !s.card && s.current === null && s.stale === null,
        "…she stays in the lobby, the card is gone, no room was opened");
      await waitFor(() => host.page.evaluate(() => !document.querySelector("#roomlist .roomcard")), 8000,
        "the lobby list to drop the ended room");
      t.ok(true, "…and loadRooms() ran: the ended show is off the lobby list");

      /* ---- scene 4: End it when the server pushes back ---- */
      const rC = liveRoom("r_stale_C", 500_000);
      await boot();
      await host.page.waitForSelector("#staleresume", { state: "visible", timeout: 10000 });
      D.setFault("end_show", "host", { error: "boom: end_show unavailable" });
      D.setFault("table:rooms.update", "host", { error: "permission denied for table rooms" });
      await host.page.click("#staleresume_end");
      await waitFor(async () => /Couldn't end that show/.test((await ui()).toast), 8000, "the failure toast");
      s = await ui();
      t.ok(D.rooms.get(rC).status === "live" && s.card && s.stale === rC,
        "both endings refused: the room is still live and THE CARD STAYS — she can try again");
      t.ok(/still LIVE/.test(s.toast), `…and she is told (toast=${JSON.stringify(s.toast)})`);
      t.ok(await host.page.evaluate(() => !document.getElementById("staleresume_end").disabled),
        "the buttons are live again after the failure");
      D.setFault("table:rooms.update", "host", null);   // end_show still refused → the fallback write is the ending
      o0 = D.opLog.length;
      await host.page.click("#staleresume_end");
      await waitFor(() => Promise.resolve(D.rooms.get(rC).status === "ended"), 8000, "the fallback write to end the room");
      await waitFor(async () => !(await ui()).card, 5000, "the card to clear after the fallback ending");
      const ops = hostRoomOps(o0);
      t.ok(ops.length === 2 && ops[0].op === "rpc" && ops[0].ok === false && ops[1].op === "table" && ops[1].ok === true &&
           ops[1].values.status === "ended",
        "end_show refused → the SAME status='ended' fallback leaveRoom uses ends it (one implementation: hostEndRoom)");
      D.setFault("end_show", "host", null);

      /* ---- scene 5: control — a fresh beat is a reload, and Q1 v1 holds ---- */
      const rD = liveRoom("r_fresh_D", 30_000);
      await boot();
      await waitFor(async () => (await ui()).room, 15000, "the booting host to land back inside her fresh room");
      s = await ui();
      t.ok(s.room && s.current === rD && s.amhost === true, "beat 30s old: STRAIGHT into the room, no lobby detour (Q1 v1 preserved)");
      t.ok(!s.card && s.stale === null, "…and no card");
      t.ok(endShows(rD) === 0 && D.rooms.get(rD).status === "live", "the comeback ended nothing");

      /* ---- scene 6: ONE number ---- */
      const src = await host.page.evaluate(() => ({
        ms: window.__lc.HOST_STALE_MS,
        openRoom: String(window.__lc.openRoom), enterApp: String(window.__lc.enterApp),
        loadRooms: String(window.__lc.loadRooms), hostBeatStale: String(window.__lc.hostBeatStale),
      }));
      t.ok(src.ms === 120000, `HOST_STALE_MS is 120000 (got ${src.ms})`);
      t.ok((ctx.html.match(/HOST_STALE_MS\s*=\s*120000/g) || []).length === 1,
        "…declared exactly once");
      t.ok(!/120000/.test(src.openRoom) && !/120000/.test(src.enterApp) && !/120000/.test(src.loadRooms) && !/120000/.test(src.hostBeatStale),
        "no bare 120000 left in openRoom, enterApp, loadRooms or hostBeatStale");
      t.ok(/HOST_STALE_MS/.test(src.openRoom) && /HOST_STALE_MS/.test(src.loadRooms) && /HOST_STALE_MS/.test(src.hostBeatStale) &&
           /hostBeatStale\(RESUME_ROOM\)/.test(src.enterApp),
        "the zombie janitor, the lobby ghost filter and the boot-time resume decision all read the ONE constant");
      t.ok((ctx.html.match(/120000/g) || []).length === 2,
        "grep count: 120000 appears twice in index.html — the constant, and the unrelated roster-patch TTL");
      t.ok(await host.page.evaluate(() => {
        const now = Date.now(), f = window.__lc.hostBeatStale, iso = (ms) => new Date(now - ms).toISOString();
        return f({ host_seen_at: iso(121000) }) === true && f({ host_seen_at: iso(30000) }) === false &&
               f({ host_seen_at: null, created_at: iso(500000) }) === true && f({ host_seen_at: null, created_at: iso(5000) }) === false;
      }), "hostBeatStale: host_seen_at decides, created_at stands in when there is no beat");

      t.ok(!host.errors.length, `no console errors across the run (${host.errors.slice(0, 3).join(" | ")})`);
    } finally { await h.close(); }
  },
};
