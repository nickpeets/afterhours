/* GATE 74 — stale-host-resume-card → stale room ENDS (RULING 10/8).
 *
 * HISTORY.  Forged 2026-09-30 for RULING Q1 v2: a booting host whose live
 * room had a STALE beat (> HOST_STALE_MS) was not walked in but ASKED —
 * the lobby showed a Resume / End it card.  RULING 10/8 supersedes it: a
 * live room whose host beat is older than HOST_STALE_MS is ENDED on the
 * SERVER (end_stale_rooms: pg_cron every minute, and on touch at the top of
 * heartbeat and list_live_rooms), not hidden by the client.  The card, the
 * lobby ghost filter and openRoom's client janitor are deleted.  This gate
 * keeps its number and its file (the history above is the point) and now
 * holds the other side of the same line:
 *
 *   1. beat 121s old → by the time she boots, the row is `ended` (the boot
 *      read goes through list_live_rooms, which sweeps first); she lands in
 *      the LOBBY, no card exists in the DOM, no room opened, and SHE wrote
 *      nothing — no end_show, no rooms update: the server did it;
 *   2. the ending is the ONE ending: a finale event with by='stale_host',
 *      user_id = the host (it is her show), winner_id null;
 *   3. control: beat 30s old → straight into the room (Q1 v1 preserved);
 *   4. HOST_STALE_MS is the ONE number and the server owns it: the client
 *      reads lc_config at boot and its value equals the double's constant;
 *      the client source has no ghost filter, no janitor, no card.
 *
 * WHAT THE HARNESS FAKED (CONTRIBUTING): pg_cron.  The double runs the sweep
 * on touch exactly where the DDL does (heartbeat, list_live_rooms); the
 * cron tick is D.sweepStaleRooms(), which gate 82 drives directly.
 */
"use strict";
const { Harness } = require("../lib/harness");
const { HOST_STALE_MS } = require("../lib/backend-double");
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
          cardInDom: !!document.getElementById("staleresume"), lobby: vis("lobby"),
          room: document.getElementById("room").classList.contains("show"),
          current: window.__lc.CURRENT_ROOM ? window.__lc.CURRENT_ROOM.id : null,
          amhost: window.__lc.AMHOST,
          ms: window.__lc.HOST_STALE_MS, cfg: window.__lc.LC_CONFIG,
          roomcards: document.querySelectorAll("#roomlist .roomcard").length,
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
      const finales = (room) => D.events.filter((e) => e.room_id === room && e.type === "finale");

      /* ---- scene 1: a stale beat → the server has ended it before she lands ---- */
      const rA = liveRoom("r_stale_A", 121_000);
      const o0 = D.opLog.length;
      const sweeps0 = D.sweepLog.length;
      await boot();
      await host.page.waitForTimeout(1500);   // anything that was going to open the room has had its chance
      let s = await ui();
      t.ok(D.rooms.get(rA).status === "ended", "beat 121s old: the row is `ended` — the server ended it on the boot read");
      t.ok(D.sweepLog.length > sweeps0, `…by end_stale_rooms (sweeps ran: ${D.sweepLog.length - sweeps0})`);
      t.ok(s.lobby && !s.room && s.current === null, "she lands in the LOBBY and was NOT walked into the room");
      t.ok(!s.cardInDom, "there is no resume card in the DOM at all — the 9/30 card is deleted");
      t.ok(endShows(rA) === 0 && hostRoomOps(o0).length === 0,
        "SHE wrote nothing: no end_show, no rooms update from the client — the ending is the server's");
      t.ok(s.roomcards === 0, "the lobby lists no ghost: list_live_rooms never returns a stale room");

      /* ---- scene 2: the ONE ending ---- */
      const f = finales(rA);
      t.ok(f.length === 1 && f[0].payload.by === "stale_host" && f[0].user_id === hostU && f[0].payload.winner_id === null,
        `one finale event, by='stale_host', user_id = the host, winner null (got ${JSON.stringify(f.map((e) => e.payload))})`);
      t.ok(D.rooms.get(rA).winner_id === null, "winner_id is null — a stale ending crowns nobody");

      /* ---- scene 3: control — a fresh beat is a reload, and Q1 v1 holds ---- */
      const rD = liveRoom("r_fresh_D", 30_000);
      await boot();
      await waitFor(async () => (await ui()).room, 15000, "the booting host to land back inside her fresh room");
      s = await ui();
      t.ok(s.room && s.current === rD && s.amhost === true, "beat 30s old: STRAIGHT into the room, no lobby detour (Q1 v1 preserved)");
      t.ok(endShows(rD) === 0 && D.rooms.get(rD).status === "live" && finales(rD).length === 0, "the comeback ended nothing");
      await host.page.evaluate(() => window.__lc.leaveRoom());
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });

      /* ---- scene 4: ONE number, owned by the server ---- */
      s = await ui();
      t.ok(s.ms === HOST_STALE_MS && s.ms === 120000, `HOST_STALE_MS on the client is the server's (${s.ms})`);
      t.ok(s.cfg && s.cfg.host_stale_ms === HOST_STALE_MS, "…and it came from lc_config at boot, not from the literal");
      t.ok(D.rpcLog.some((r) => r.clientId === "host" && r.name === "lc_config"), "lc_config was called");
      t.ok((ctx.html.match(/HOST_STALE_MS\s*=\s*120000/g) || []).length === 1, "the client fallback is declared exactly once");
      const src = await host.page.evaluate(() => ({
        openRoom: String(window.__lc.openRoom), enterApp: String(window.__lc.enterApp), loadRooms: String(window.__lc.loadRooms),
      }));
      t.ok(!/HOST_STALE_MS|host_seen_at|120000/.test(src.loadRooms), "loadRooms has no ghost filter — it trusts list_live_rooms");
      t.ok(!/from\("rooms"\)\.update|host_seen_at|HOST_STALE_MS/.test(src.openRoom), "openRoom has no client janitor and never writes rooms");
      t.ok(/list_live_rooms/.test(src.enterApp) && /list_live_rooms/.test(src.loadRooms), "the boot read and the lobby read both go through list_live_rooms");
      t.ok(!/staleresume|hostBeatStale|STALE_RESUME/.test(ctx.html), "no resume-card machinery survives in index.html");
      t.ok(!("hostBeatStale" in (await host.page.evaluate(() => Object.keys(window.__lc)).then((k) => Object.fromEntries(k.map((x) => [x, 1]))))),
        "hostBeatStale is not exported any more");

      t.ok(!host.errors.length, `no console errors across the run (${host.errors.slice(0, 3).join(" | ")})`);
    } finally { await h.close(); }
  },
};
