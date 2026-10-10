/* GATE 84 — lobby-teardown-before-join: every lobby preview is DESTROYED
 * before the room's call object is created, and a lobby viewer is nowhere
 * in the room.  Ships with feat/lobby-live-feeds.
 *
 * WHY THIS IS ITS OWN GATE.  The room's Daily call object is a strict
 * singleton: daily-js 0.91.0 throws "Duplicate DailyIframe instances are not
 * allowed" when it is created while ANY other instance is alive.  Previews
 * are other instances.  So a preview that is still alive when the room joins
 * is not a cosmetic overlap — it is the room's video failing to start: the
 * exception, and four dark tiles.
 *
 * WHAT THE HARNESS FAKED, AND NOW DOESN'T.  The shim's leave()/destroy()
 * were instant, so "created before the old instance was gone" could not
 * happen in the battery at all.  This gate sets window.__dailyLatency (the
 * shim keeps an instance ALIVE for that long after it is asked to go, as a
 * real network teardown does), which is what makes a missing await show up
 * here exactly as it would on a phone.
 *
 * Proven through the real page (real clicks on real cards, the real
 * openRoom / videoJoin / leaveRoom):
 *   A  tap a card with three previews live → at the instant the room's call
 *      object is created, ZERO previews are alive; no duplicate-instance
 *      exception; the hero's video mounts (no dark tile).
 *   B  a fast double-tap on the card: one room call object, same guarantees.
 *   C  a tap that lands while the previews are still JOINING (their token
 *      requests in flight): no preview is ever created after room entry.
 *   D  lobby → room → back → another room: the previews come back in the
 *      lobby, and the second entry is as clean as the first.
 *   F  the ledger asked to re-derive in the same beat as the tap (a
 *      realtime refresh, a scroll) starts nothing: a room is being entered.
 *   E  a lobby viewer is not in the room: no room_members row, the room's
 *      👁 and roster unchanged, and the viewer's Daily presence — injected
 *      into the host's call under the very name the preview asked for —
 *      gets no tile, no subscription and no seat, even if it published.
 *
 * MUTATION-TESTED (by hand, on this branch; the PR body has the output):
 *   - drop the `await lobbyPreviewsStop("room join")` in _videoJoinOnce → A fails
 *     with the duplicate-instance exception and a dark hero.
 *   - subscribe audio / subscribe every participant in lobbyPvPick → gate 83
 *     block B fails.
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
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const inst = (c) => c.page.evaluate(() => window.__dailyInstances());
const pv = (c) => c.lc("(lc) => lc.LOBBY_PV");
const dupes = (c) => c.logs.filter((l) => /Duplicate DailyIframe/i.test(l.text)).length;
const SLOW = { leave: 250, destroy: 250 };   // a teardown that takes half a second, like a real one

function world(D, n) {
  const viewer = D.addUser({ id: "u_view", name: "Viewer" });
  const rooms = [];
  for (let i = 1; i <= n; i++) {
    const hu = D.addUser({ id: "u_h" + i, name: "Host " + i });
    const id = D.addRoom({ id: "r_" + i, host_id: hu, name: "Room " + i });
    D.rooms.get(id).created_at = D.iso(D.now() - i * 1000);   // list order: r_1 first
    rooms.push({ id, host: hu });
  }
  return { viewer, rooms };
}
async function lobby(h, name, uid) {
  const c = await h.newClient(name);
  c.login(uid);
  await c.goto();
  await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
  await c.page.evaluate((slow) => { window.__dailyLatency = slow; }, SLOW);
  return c;
}
/* every on-screen room previewing its host, live */
async function previewsLive(c, rooms) {
  await waitFor(async () => (await c.page.evaluate(() => window.__dailyPreviews())).filter((p) => p.joined).length >= rooms.length,
    10000, rooms.length + " previews to join");
  await c.page.evaluate((rooms) => rooms.forEach((r) => window.__dailyPreview(r.id).addRemote(r.host)), rooms);
  await waitFor(() => c.page.evaluate((n) => document.querySelectorAll("#roomlist .roomcard.is-live").length >= n, rooms.length),
    10000, "the cards to go live");
}
/* the room is entered and its video is up: joined, host injected, hero mounted */
async function roomVideoUp(c, hostUid) {
  await c.page.waitForSelector("#room.show", { timeout: 10000 });
  await waitFor(() => c.lc("(lc) => lc.DAILY_JOINED === true"), 10000, "the room's Daily join to complete");
  await c.page.evaluate((u) => window.__dailyControl.addRemote(u), hostUid);
  await waitFor(() => c.page.evaluate(() => !!document.querySelector("#rt_hero video")), 8000, "the hero's video to mount");
}
const strictCreates = (log) => log.filter((l) => /^strict-create/.test(l));

module.exports = {
  name: "lobby-teardown",
  async run(t, ctx) {
    /* ============ A. tap a card with three live previews ============ */
    {
      const h = await Harness.launch();
      try {
        const { viewer, rooms } = world(h.double, 3);
        const c = await lobby(h, "viewer", viewer);
        await previewsLive(c, rooms);
        const before = await inst(c);
        t.ok(before.multiLive === 3 && before.created === 0, `three previews alive in the lobby, no room call yet (previews ${before.multiLive}, room calls ${before.created})`);

        await c.page.click('.roomcard[data-room="r_2"]');
        // previews die ON THE TAP, not after the room's own loading
        const onTap = await pv(c);
        t.ok(onTap.length === 0, "on the tap, every preview is already released by the ledger (LOBBY_PV empty: " + onTap.length + ")");
        await roomVideoUp(c, rooms[1].host);
        const after = await inst(c);
        const sc = strictCreates(after.log);
        t.ok(sc.length === 1 && sc[0] === "strict-created (0 preview(s) alive)",
          "at the instant the room's call object was created, ZERO previews were alive — " + JSON.stringify(sc));
        const order = after.log.filter((l) => /^multi-destroyed|^strict-created/.test(l));
        t.ok(order.length === 4 && /^strict-created/.test(order[3]),
          "the order is destroy, destroy, destroy, THEN create — " + JSON.stringify(order.map((l) => l.split(" ")[0])));
        t.ok(after.multiLive === 0 && after.created === 1 && after.liveNow, `one room call object, no preview left (previews alive ${after.multiLive})`);
        t.ok(dupes(c) === 0, `no "Duplicate DailyIframe" exception anywhere in the console (found ${dupes(c)})`);
        const hero = await c.page.evaluate(() => { const v = document.querySelector("#rt_hero video");
          return { has: !!v, tracks: v && v.srcObject ? v.srcObject.getVideoTracks().filter((x) => x.readyState === "live").length : 0,
                   lobbyVideos: document.querySelectorAll("#roomlist video").length }; });
        t.ok(hero.has && hero.tracks === 1, "the hero tile has a live video — no dark tile");
        t.ok(hero.lobbyVideos === 0, "no preview <video> is left on any lobby card");
        await sleep(1200);
        const later = await inst(c);
        t.ok(later.multiCreated === before.multiCreated && later.multiLive === 0,
          "and while in the room NO preview starts (lobby refreshes still arrive over realtime) — created stays " + later.multiCreated);
        const errs = c.errors.filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
      } finally { await h.close(); }
    }

    /* ============ B. the fast double-tap ============ */
    {
      const h = await Harness.launch();
      try {
        const { viewer, rooms } = world(h.double, 3);
        const c = await lobby(h, "viewer", viewer);
        await previewsLive(c, rooms);
        await c.page.evaluate(() => { const el = document.querySelector('.roomcard[data-room="r_1"]'); el.click(); el.click(); });
        await roomVideoUp(c, rooms[0].host);
        const after = await inst(c);
        const sc = strictCreates(after.log);
        t.ok(sc.length === 1 && sc[0] === "strict-created (0 preview(s) alive)" && after.created === 1,
          "double-tap: ONE room call object, created with zero previews alive — " + JSON.stringify(sc));
        t.ok(dupes(c) === 0 && after.multiLive === 0, `double-tap: no duplicate-instance exception, no preview left (dupes ${dupes(c)}, alive ${after.multiLive})`);
        const errs = c.errors.filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, "double-tap: zero console errors — " + errs.slice(0, 2).join(" | "));
      } finally { await h.close(); }
    }

    /* ============ C. a tap while the previews are still joining ============ */
    {
      const h = await Harness.launch();
      try {
        const { viewer, rooms } = world(h.double, 3);
        const c = await h.newClient("viewer");
        c.login(viewer);
        // hold every preview's token request in flight until the room is entered
        let release; const held = new Promise((r) => { release = r; });
        await c.context.route("**/functions/v1/daily-room", async (route) => {
          const body = route.request().postDataJSON() || {};
          if (body.mode === "preview") await held;
          return route.fallback();
        });
        await c.goto();
        await c.page.waitForSelector('.roomcard[data-room="r_3"]', { timeout: 15000 });
        await c.page.evaluate((slow) => { window.__dailyLatency = slow; }, SLOW);
        await waitFor(async () => (await pv(c)).length === 3, 8000, "three previews to be starting");
        const mid = await inst(c);
        t.ok(mid.multiCreated === 0, "three previews are starting, their token requests still in flight (no call object yet)");
        await c.page.click('.roomcard[data-room="r_3"]');
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        release();                                   // the preview tokens arrive AFTER the room was entered
        await roomVideoUp(c, rooms[2].host);
        await sleep(800);
        const after = await inst(c);
        t.ok(after.multiCreated === 0 && after.multiLive === 0,
          `a preview whose token arrives after room entry never creates a call object (created ${after.multiCreated})`);
        t.ok(strictCreates(after.log).join() === "strict-created (0 preview(s) alive)" && dupes(c) === 0,
          "…and the room's call object is created clean — " + JSON.stringify(strictCreates(after.log)));
      } finally { await h.close(); }
    }

    /* ============ D. lobby → room → back → another room ============ */
    {
      const h = await Harness.launch();
      try {
        const { viewer, rooms } = world(h.double, 3);
        const c = await lobby(h, "viewer", viewer);
        await previewsLive(c, rooms);
        await c.page.click('.roomcard[data-room="r_1"]');
        await roomVideoUp(c, rooms[0].host);
        await c.page.click("#roomback");             // a watcher: no confirm, straight back
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 });
        await previewsLive(c, rooms);
        const back = await inst(c);
        t.ok(back.multiLive === 3 && !back.liveNow, `back in the lobby the previews are playing again (alive ${back.multiLive}), and the room's call is gone`);
        const same = await c.page.evaluate(() => document.querySelectorAll("#roomlist .roomcard.is-live video").length);
        t.ok(same === 3, "all three cards show video again");

        // …and straight into ANOTHER room, while those previews are live
        await c.page.click('.roomcard[data-room="r_3"]');
        await roomVideoUp(c, rooms[2].host);
        const after = await inst(c);
        const sc = strictCreates(after.log);
        t.ok(sc.length === 2 && sc.every((l) => l === "strict-created (0 preview(s) alive)"),
          "both room entries created their call object with zero previews alive — " + JSON.stringify(sc));
        t.ok(after.created === 2 && after.multiLive === 0 && dupes(c) === 0,
          `two room calls in all, no preview left, no duplicate-instance exception (dupes ${dupes(c)})`);
        const room = await c.lc("(lc) => lc.CURRENT_ROOM && lc.CURRENT_ROOM.id");
        t.ok(room === "r_3", "…and the second room is the one that was tapped (" + room + ")");
        const errs = c.errors.filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, "zero console errors through the whole trip — " + errs.slice(0, 2).join(" | "));
      } finally { await h.close(); }
    }

    /* ============ F. the ledger re-derives in the same beat as the tap ============ */
    {
      const h = await Harness.launch();
      try {
        const { viewer, rooms } = world(h.double, 3);
        const c = await lobby(h, "viewer", viewer);
        await previewsLive(c, rooms);
        const made = (await inst(c)).multiCreated;
        // openRoom has only just begun (the lobby is still on screen, its
        // cards still intersecting) when the ledger is asked to re-derive —
        // what a realtime lobby refresh or a scroll does in that same beat
        const held = await c.page.evaluate((r) => {
          window.__enter = window.__lc.openRoom(r);
          window.__lc.lobbyPvSync();
          return { allowed: window.__lc.lobbyPvAllowed(), held: window.__lc.LOBBY_PV.length,
                   lobbyShown: getComputedStyle(document.getElementById("lobby")).display !== "none" };
        }, { ...h.double.rooms.get("r_2") });
        t.ok(held.lobbyShown && held.allowed === false && held.held === 0,
          "a room is being entered: with the lobby still on screen, the ledger starts NOTHING — " + JSON.stringify(held));
        await roomVideoUp(c, rooms[1].host);
        const after = await inst(c);
        t.ok(after.multiCreated === made && strictCreates(after.log).join() === "strict-created (0 preview(s) alive)" && dupes(c) === 0,
          `…no preview was created after the tap (created ${made} → ${after.multiCreated}), and the room's call is clean`);
      } finally { await h.close(); }
    }

    /* ============ E. a lobby viewer is nowhere in the room ============ */
    {
      const h = await Harness.launch();
      try {
        const D = h.double;
        const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
        const viewer = D.addUser({ id: "u_view", name: "Viewer" });
        const chair = D.addUser({ id: "u_chair", name: "Chair One" });
        const room = D.addRoom({ id: "r_show", host_id: hostU, name: "Show Night" });
        D.addMember(room, chair, "chair", { seat_index: 0 });

        // the host is in her room (a booting host walks straight back into it)
        const host = await h.newClient("host");
        host.login(hostU);
        await host.goto();
        await host.page.waitForSelector("#room.show", { timeout: 15000 });
        await waitFor(() => host.lc("(lc) => lc.DAILY_JOINED === true"), 10000, "the host's join");
        await host.page.evaluate(() => window.__dailyControl.addRemote("u_chair"));
        await waitFor(() => host.page.evaluate(() => document.querySelectorAll("#room video").length === 2), 8000, "hero + chair mounted");
        const snap = () => host.page.evaluate(() => ({
          count: document.getElementById("rt_count").textContent.replace(/[^0-9]/g, ""),
          videos: document.querySelectorAll("#room video").length,
          tiles: Object.values(window.__lc.VIDEO_TILES).map((x) => x.uid).sort(),
          roster: window.__lc.ROOM_STATE.members.map((m) => m.user_id + ":" + m.role).sort(),
          audio: Object.keys(window.__lc.AUDIO_ELS).length,
        }));
        const before = await snap();
        const rowsBefore = D.members.filter((m) => m.room_id === room).map((m) => m.user_id).sort();
        const active = (await D.dispatch("host", "rpc", { name: "active_members", args: { room_id: room } })).data || [];

        // the viewer opens the lobby and previews that very room
        const v = await lobby(h, "viewer", viewer);
        await previewsLive(v, [{ id: room, host: hostU }]);
        const asked = h.dailyRoomRequests.filter((r) => r.client === "viewer");
        t.ok(asked.length === 1 && asked[0].body.mode === "preview" && asked[0].body.is_owner === false,
          "the viewer's only token request is a preview, never an owner — " + JSON.stringify(asked.map((r) => r.body)));
        const name = asked[0].body.user_name;
        t.ok(!D.users.has(name), `the preview's Daily name ("${name}") is not a user id`);

        // server truth: no row, no join
        const rowsAfter = D.members.filter((m) => m.room_id === room).map((m) => m.user_id).sort();
        t.ok(JSON.stringify(rowsAfter) === JSON.stringify(rowsBefore) && !rowsAfter.includes(viewer),
          "room_members is unchanged — the viewer has no row (" + rowsAfter.join(",") + ")");
        t.ok(!D.rpcLog.some((r) => r.clientId === "viewer" && /^(join_room|join_line|seat_pick|heartbeat)$/.test(r.name)),
          "the viewer called no room-entering RPC (join_room / join_line / seat_pick / heartbeat)");
        const active2 = (await D.dispatch("host", "rpc", { name: "active_members", args: { room_id: room } })).data || [];
        t.ok(active2.length === active.length, `active_members — where every 👁 comes from — is unchanged (${active.length} → ${active2.length})`);

        // call truth: the viewer's Daily presence arrives in the host's call,
        // under the exact name the preview asked for.  (The Daily double is
        // per-window, so the gate carries it across.)
        const sid = await host.page.evaluate((n) => window.__dailyControl.addRemote(n, { video: false }).session_id, name);
        await host.lc("(lc) => lc.loadRoomState()");
        await sleep(600);
        const withViewer = await snap();
        t.ok(JSON.stringify(withViewer) === JSON.stringify(before),
          "in the host's room NOTHING changed: 👁 " + withViewer.count + ", " + withViewer.videos + " videos, tiles [" + withViewer.tiles + "], same roster");
        const mapped = await host.page.evaluate((n) => ({ tile: !!window.__lc.tileFor(n), want: n in window.__lc.desiredSubscriptions() }), name);
        t.ok(!mapped.tile && !mapped.want, "the preview's name maps to no tile and is in no subscription plan");

        // even a preview that PUBLISHED (a tampered client) gets no tile
        await host.page.evaluate((n) => { window.__dailyControl.removeRemote(n); window.__dailyControl.addRemote(n, { video: true }); }, name);
        await host.lc("(lc) => lc.reflowVideo()");
        await sleep(600);
        const tampered = await snap();
        const subs = await host.page.evaluate((n) => { const k = window.__dailyControl; const p = Object.values(k.call._parts).find((x) => x.user_name === n);
          return k.subs()[p.session_id] || null; }, name);
        t.ok(JSON.stringify(tampered) === JSON.stringify(before), "…and a preview that published video anyway still gets no tile, no 👁, no seat");
        t.ok(subs && subs.video === false, "the room never subscribes to its video — " + JSON.stringify(subs));
        t.ok(sid && dupes(host) === 0 && dupes(v) === 0, "no duplicate-instance exception in either window");
        const errs = host.errors.concat(v.errors).filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
      } finally { await h.close(); }
    }
  },
};
