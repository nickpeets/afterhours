/* GATE 83 — lobby-live-feeds: a LIVE NOW card shows the host's live video.
 * Ships with feat/lobby-live-feeds (RULING 10/10: "The LIVE NOW room pills
 * need to show the host video in the lobby").
 *
 * Every claim is made by the REAL page: the card the real loadRooms built,
 * the preview the real lobbyPvSync started, observed through window.__lc
 * (LOBBY_PV, LOBBY_PV_STATS) and through what the page actually asked the
 * Daily shim and the token function for.
 *
 * Proven here:
 *   A  the card is a full-bleed feed and its POSTER shows first; the preview
 *      asks for a preview token under a name that is nobody's user id; the
 *      call is created receive-only (no devices, manual subscription).
 *   B  the <video> carries the HOST's video track and nothing else: one
 *      subscription (the host's video, lowest layer), no audio subscribed
 *      for anyone, nothing published, getUserMedia never called.
 *   C  a refresh never rebuilds a card: same element, same <video>, no new
 *      call — and user-typed text lands as text, not markup.
 *   D  the feed follows the host: his video stops → poster; he rejoins
 *      under a new session → the feed returns.
 *   E  a feed that never starts stays on the poster (a frameless track, and
 *      a refused token), and a refusal is not retried in a loop.
 *   F  my own room is the poster: no token asked, no second participant.
 *   G  only on-screen cards hold a preview, and never more than the cap.
 *   H  an ended room's preview leaves with its card.
 *   I  a hidden tab holds no previews; coming back restores them.
 *   J  sign-out tears every preview down, and none starts after it.
 *   K  a preview whose call ends under it (a drop, an ejection) leaves
 *      cleanly, backs off, and comes back by itself.
 *
 * NOT proven here (the shim's header says why): that a real browser plays
 * the muted element without a tap (iOS Safari), that a real daily-js join
 * with these options shows no camera prompt, and simulcast itself — those
 * are the phone test's.  The teardown-before-join rule is gate 84.
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

/* count getUserMedia calls from before the page's first script */
const GUM_SPY = `(() => {
  window.__gumCalls = 0;
  const md = navigator.mediaDevices;
  if (!md || !md.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = (...a) => { window.__gumCalls++; return orig(...a); };
})();`;

async function lobbyClient(h, name, uid, opts) {
  const c = await h.newClient(name, opts);
  await c.page.addInitScript(GUM_SPY);
  c.login(uid);
  await c.goto("?debug=1");
  await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
  return c;
}
const pv = (c) => c.lc("(lc) => lc.LOBBY_PV");
const stats = (c) => c.lc("(lc) => lc.LOBBY_PV_STATS");
const inst = (c) => c.page.evaluate(() => window.__dailyInstances());
const previews = (c) => c.page.evaluate(() => window.__dailyPreviews());
/* what the card for `room` looks like right now */
const card = (c, room) => c.page.evaluate((room) => {
  const el = document.querySelector('#roomlist .roomcard[data-room="' + room + '"]');
  if (!el) return null;
  const v = el.querySelector("video");
  const feed = el.querySelector(".roomcard__feed");
  return {
    live: el.classList.contains("is-live"),
    mine: el.classList.contains("roomcard--mine"),
    videos: el.querySelectorAll("video").length,
    videoOpacity: v ? getComputedStyle(v).opacity : null,
    feedH: feed ? Math.round(feed.getBoundingClientRect().height) : 0,
    poster: feed ? getComputedStyle(feed).backgroundImage.includes("gradient") : false,
    text: el.textContent.replace(/\s+/g, " ").trim(),
    title: (el.querySelector(".roomcard__title") || {}).textContent,
    host: (el.querySelector(".roomcard__host") || {}).textContent,
    eyes: (el.querySelector(".meta") || {}).textContent,
    spinner: !!el.querySelector(".spinner"),
    tracks: v && v.srcObject ? v.srcObject.getTracks().map((t) => ({ kind: t.kind, id: t.id, state: t.readyState })) : [],
    muted: v ? v.muted : null, playsinline: v ? v.hasAttribute("playsinline") : null, autoplay: v ? v.autoplay : null,
    audioEls: document.querySelectorAll("audio").length,
  };
}, room);
/* the preview's own call, as the shim saw it */
const pvCall = (c, room) => c.page.evaluate((room) => {
  const k = window.__dailyPreview(room);
  if (!k) return null;
  const parts = Object.values(k.call._parts).map((p) => ({ name: p.user_name, sid: p.session_id,
    trackId: p._pendingTrack ? p._pendingTrack.id : null }));
  return { joined: k.joined(), url: k.url(), opts: k.opts(), gum: k.gum(), subs: k.subs(), recv: k.recv(), parts,
           localVideo: k.call.localVideo(), inputLog: k.inputLog() };
}, room);

module.exports = {
  name: "lobby-live-feeds",
  async run(t, ctx) {
    /* ================= A–F, H–J: one viewer, a handful of rooms ================= */
    {
      const h = await Harness.launch();
      try {
        const D = h.double;
        const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
        const viewer = D.addUser({ id: "u_view", name: "Viewer" });
        const chairU = D.addUser({ id: "u_chair", name: "Chair One" });
        const room = D.addRoom({ id: "r_live", host_id: hostU, name: "Feed Night" });
        D.rooms.get(room).tagline = "<img src=x onerror=window.__xss=1>";
        D.profiles.get(hostU).display_name = "<b id=xss2>Hostess</b>";
        D.addMember(room, chairU, "chair", { seat_index: 0 });
        const membersBefore = D.members.filter((m) => m.room_id === room).length;

        // a tall window: this block is about ONE card's life, so every card
        // in it must be on screen throughout (block G owns the viewport rule)
        const c = await lobbyClient(h, "viewer", viewer, { viewport: { width: 390, height: 1500 } });
        await c.page.waitForSelector('.roomcard[data-room="r_live"]', { timeout: 15000 });

        /* --- A. the card, the poster, what the preview asked for --- */
        const c0 = await card(c, room);
        t.ok(c0.feedH === 210, `the card is a 210px full-bleed feed (feed height ${c0.feedH})`);
        t.ok(c0.poster && !c0.live && !c0.spinner, "the POSTER shows first: brand gradient, not live, no spinner");
        t.ok(/Feed Night/.test(c0.title) && /LIVE/.test(c0.text) && /WARMING UP/.test(c0.text) && /👁 \d+ in the room/.test(c0.eyes),
          "LIVE, phase, 👁 count and the room title ride on the card — " + JSON.stringify(c0.text.slice(0, 90)));
        const xss = await c.page.evaluate(() => ({ fired: !!window.__xss, el: !!document.getElementById("xss2"),
          img: document.querySelectorAll("#roomlist img").length }));
        t.ok(!xss.fired && !xss.el && xss.img === 0 && /<b id=xss2>Hostess<\/b>/.test(c0.host),
          "user-typed text (tagline, host name) lands as TEXT, never markup — host line " + JSON.stringify(c0.host));

        await waitFor(async () => { const k = await pvCall(c, room); return k && k.joined; }, 8000, "the preview to join its room");
        const req = h.dailyRoomRequests.filter((r) => r.client === "viewer" && r.body.room_id === room);
        const name = await c.lc("(lc) => lc.LOBBY_PV_NAME");
        t.ok(req.length === 1 && req[0].body.mode === "preview" && req[0].body.is_owner === false,
          "the preview asks the token function for mode:\"preview\", never as owner — " + JSON.stringify(req.map((r) => r.body)));
        t.ok(req.length === 1 && req[0].body.user_name === name && !D.users.has(name) && name !== viewer,
          `it joins under "${name}", which is nobody's user id (not the viewer's, not any user's)`);
        const k0 = await pvCall(c, room);
        t.ok(k0.opts.allowMultipleCallInstances === true && k0.opts.subscribeToTracksAutomatically === false,
          "the preview's call object: allowMultipleCallInstances, manual subscription — " + JSON.stringify(k0.opts));
        t.ok(k0.opts.videoSource === false && k0.opts.audioSource === false && k0.opts.startVideoOff === true && k0.opts.startAudioOff === true,
          "…and created with every device off (videoSource/audioSource false, startVideoOff/startAudioOff)");
        const c1 = await card(c, room);
        t.ok(c1.videos === 0 && !c1.live, "joined but no host in the call yet: still the poster, no <video>, no black box");

        /* --- B. the host's video track, and ONLY that --- */
        await c.page.evaluate((room) => {
          const k = window.__dailyPreview(room);
          k.addRemote("u_chair");            // a seated man, publishing video
          k.addRemote("u_host");             // the host
          k.addRemote("u_stranger");         // anyone else
        }, room);
        await waitFor(async () => (await card(c, room)).live, 8000, "the card to go live on the host's first frame");
        await waitFor(async () => (await card(c, room)).videoOpacity === "1", 3000, "the reveal to finish");
        const c2 = await card(c, room);
        const k2 = await pvCall(c, room);
        const hostPart = k2.parts.find((p) => p.name === "u_host");
        t.ok(c2.videos === 1 && c2.videoOpacity === "1", "the first frame swaps the poster for ONE <video> (opacity 1)");
        t.ok(c2.tracks.length === 1 && c2.tracks[0].kind === "video" && c2.tracks[0].id === hostPart.trackId,
          "the <video> carries exactly one track — the HOST's video track — " + JSON.stringify(c2.tracks));
        t.ok(c2.muted === true && c2.playsinline === true && c2.autoplay === true,
          "the element is muted, playsinline, autoplay (iOS Safari's terms for playing without a tap)");
        const subSids = Object.keys(k2.subs);
        t.ok(subSids.length === 1 && subSids[0] === hostPart.sid && k2.subs[hostPart.sid].video === true,
          "exactly ONE participant is subscribed — the host — out of " + k2.parts.length + " in the call: " + JSON.stringify(k2.subs));
        t.ok(k2.subs[hostPart.sid].audio === false && k2.subs[hostPart.sid].screenVideo === false && k2.subs[hostPart.sid].screenAudio === false,
          "no audio is SUBSCRIBED (not merely muted), and no screen share");
        t.ok(k2.recv[hostPart.sid] && k2.recv[hostPart.sid].video && k2.recv[hostPart.sid].video.layer === 0,
          "the host's video is asked for at the lowest simulcast layer (0) — " + JSON.stringify(k2.recv));
        t.ok(c2.audioEls === 0, "no <audio> element exists anywhere on the page");
        const gum = await c.page.evaluate(() => window.__gumCalls);
        t.ok(gum === 0 && k2.gum.length === 0, `getUserMedia was never called (page calls ${gum}, preview's own ${k2.gum.length})`);
        t.ok(k2.localVideo === false && k2.inputLog.length === 0, "nothing is published: local video off, no input device ever set");
        t.ok(!D.rpcLog.some((r) => r.clientId === "viewer" && r.name === "join_room") &&
             !D.members.some((m) => m.user_id === viewer) &&
             D.members.filter((m) => m.room_id === room).length === membersBefore,
          "the viewer never called join_room and has no room_members row (rows in the room: " + membersBefore + ", unchanged)");
        const s2 = await stats(c);
        t.ok(s2.starts === 1 && s2.firstFrames === 1 && s2.fails === 0, "one start, one first frame, no failure — " + JSON.stringify(s2));

        /* --- C. a refresh never rebuilds the card --- */
        await c.page.evaluate(() => {
          const el = document.querySelector('.roomcard[data-room="r_live"]');
          el.__mark = "same-card"; el.querySelector("video").__mark = "same-video";
        });
        D.addMember(room, D.addUser({ id: "u_crowd", name: "Crowd" }), "spectator");
        await c.lc("(lc) => lc.loadRooms()");
        D.emit("room_members", "INSERT", {});            // …and the realtime path
        await c.lc("(lc) => lc.loadRooms()");
        const same = await c.page.evaluate(() => {
          const el = document.querySelector('.roomcard[data-room="r_live"]');
          return { card: el && el.__mark, video: el && el.querySelector("video") && el.querySelector("video").__mark,
                   cards: document.querySelectorAll("#roomlist .roomcard").length };
        });
        const c3 = await card(c, room);
        const i3 = await inst(c);
        t.ok(same.card === "same-card" && same.video === "same-video" && same.cards === 1,
          "three refreshes later it is the SAME card and the SAME <video> element — " + JSON.stringify(same));
        t.ok(i3.multiCreated === 1 && c3.live, `…and still the one preview call (created ${i3.multiCreated}), still live`);
        const n0 = parseInt(c0.eyes.replace(/[^0-9]/g, ""), 10), n3 = parseInt(c3.eyes.replace(/[^0-9]/g, ""), 10);
        t.ok(n3 === n0 + 1, `the refresh filled the card in place: 👁 ${n0} → ${n3} after one more joined the room`);

        /* --- D. the feed follows the host --- */
        await c.page.evaluate((room) => window.__dailyPreview(room).stopRemoteTrack("u_host"), room);
        await waitFor(async () => !(await card(c, room)).live, 5000, "the poster to return when the host's video stops");
        const c4 = await card(c, room);
        t.ok(c4.videos === 0 && c4.poster, "host's video stops → back to the poster, the <video> is gone");
        await c.page.evaluate((room) => { const k = window.__dailyPreview(room); k.removeRemote("u_host"); k.addRemote("u_host"); }, room);
        await waitFor(async () => (await card(c, room)).live, 8000, "the feed to return when the host rejoins");
        const k5 = await pvCall(c, room);
        const host5 = k5.parts.find((p) => p.name === "u_host");
        t.ok(host5.sid !== hostPart.sid && k5.subs[host5.sid] && k5.subs[host5.sid].video === true && k5.subs[host5.sid].audio === false,
          "the host rejoined under a new session and was picked up again (video only)");
        t.ok(Object.keys(k5.subs).filter((s) => k5.subs[s].video).every((s) => s === host5.sid || s === hostPart.sid),
          "through all of it, nobody but the host was ever subscribed — " + JSON.stringify(k5.subs));

        /* --- E. a feed that never starts stays on the poster --- */
        const host2 = D.addUser({ id: "u_host2", name: "Quiet Host" });
        const room2 = D.addRoom({ id: "r_frozen", host_id: host2, name: "Frozen Night" });
        const host3 = D.addUser({ id: "u_host3", name: "Refused Host" });
        const room3 = D.addRoom({ id: "r_refused", host_id: host3, name: "Refused Night" });
        h.dailyRoomFault = (_client, body) => (body.room_id === room3 ? { status: 403, body: { error: "room is not live" } } : null);
        await c.lc("(lc) => lc.loadRooms()");
        await waitFor(async () => { const k = await pvCall(c, room2); return k && k.joined; }, 8000, "the second preview to join");
        await c.page.evaluate((room) => window.__dailyPreview(room).addRemote("u_host2", { frozen: true }), room2);
        await waitFor(async () => (await card(c, room2)).videos === 1, 5000, "the frameless track to be mounted");
        await sleep(1500);
        const cf = await card(c, room2);
        t.ok(!cf.live && cf.videoOpacity === "0" && cf.poster && !cf.spinner,
          "a track that never delivers a frame: the card STAYS on the poster (video opacity " + cf.videoOpacity + "), no spinner, no black box");
        const cr = await card(c, room3);
        const refusedReqs = h.dailyRoomRequests.filter((r) => r.body.room_id === room3).length;
        const pvr = (await pv(c)).find((p) => p.id === room3);
        t.ok(!cr.live && cr.videos === 0 && cr.poster && pvr && pvr.failed && !pvr.hasCall,
          "a refused token: poster, no call object, marked failed — " + JSON.stringify(pvr));
        t.ok(refusedReqs === 1, `…and the refusal was NOT retried in a loop (token requests for that room: ${refusedReqs})`);
        t.ok((await card(c, room)).live, "the working feed beside them is untouched");

        /* --- F. my own room is the poster --- */
        const mine = D.addRoom({ id: "r_mine", host_id: viewer, name: "My Own Night" });
        await c.lc("(lc) => lc.loadRooms()");
        await sleep(800);
        const cm = await card(c, mine);
        const mineReqs = h.dailyRoomRequests.filter((r) => r.body.room_id === mine).length;
        t.ok(cm && cm.mine && /YOUR ROOM/.test(cm.text) && !cm.live && cm.videos === 0 && cm.poster, "my own room's card is the poster, marked YOUR ROOM");
        t.ok(mineReqs === 0 && !(await pv(c)).some((p) => p.id === mine) && !(await pvCall(c, mine)),
          `no token asked and no call made for my own room (requests: ${mineReqs}) — never a second participant`);
        D.rooms.delete(mine);
        await c.lc("(lc) => lc.loadRooms()");

        /* --- I. a hidden tab holds no previews --- */
        const liveBefore = (await inst(c)).multiLive;
        await c.page.evaluate(() => {
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true });
          Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" });
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await waitFor(async () => (await inst(c)).multiLive === 0, 5000, "previews to be destroyed when the tab hides");
        const hid = { pv: (await pv(c)).length, videos: await c.page.evaluate(() => document.querySelectorAll("#roomlist video").length) };
        t.ok(liveBefore >= 2 && hid.pv === 0 && hid.videos === 0,
          `tab hidden: every preview call destroyed (${liveBefore} → 0), no <video> left on a card`);
        await c.lc("(lc) => lc.loadRooms()");
        await sleep(500);
        t.ok((await inst(c)).multiLive === 0, "a lobby refresh while hidden starts nothing");
        await c.page.evaluate(() => {
          delete document.hidden; delete document.visibilityState;
          document.dispatchEvent(new Event("visibilitychange"));
        });
        await waitFor(async () => (await inst(c)).multiLive >= 2, 8000, "previews to return when the tab is shown again");
        t.ok(true, "tab shown again: the previews come back");
        await waitFor(async () => { const k = await pvCall(c, room); return k && k.joined; }, 8000, "the first room's preview to rejoin");
        await c.page.evaluate((room) => window.__dailyPreview(room).addRemote("u_host"), room);
        await waitFor(async () => (await card(c, room)).live, 8000, "the feed to be live again");

        /* --- H. an ended room's preview leaves with its card --- */
        const beforeEnd = await inst(c);
        D.endRoom(room, null, hostU, "host");            // emits the rooms UPDATE the lobby listens to
        await waitFor(async () => !(await card(c, room)), 8000, "the ended room's card to leave the lobby");
        await waitFor(async () => (await inst(c)).multiLive === beforeEnd.multiLive - 1, 5000, "the ended room's preview to be destroyed");
        t.ok(!(await pv(c)).some((p) => p.id === room) && !(await pvCall(c, room)),
          "room ended → its card is gone and its preview has left (no call into that room remains)");

        /* --- K. a call that ends under us comes back, after a pause --- */
        const reqsK = () => h.dailyRoomRequests.filter((r) => r.body.room_id === room2).length;
        await waitFor(async () => { const k = await pvCall(c, room2); return k && k.joined; }, 8000, "the second room's preview to be joined");
        const n0k = reqsK(), made0 = (await inst(c)).multiCreated;
        await c.page.evaluate((room) => window.__dailyPreview(room).drop(), room2);
        await waitFor(async () => !(await pvCall(c, room2)), 3000, "the dropped preview's call to be destroyed");
        await sleep(500);
        t.ok(reqsK() === n0k && !(await pv(c)).some((p) => p.id === room2),
          "a preview whose call ended under it leaves cleanly and is NOT restarted at once (it backs off)");
        await waitFor(async () => { const k = await pvCall(c, room2); return k && k.joined; }, 6000, "the dropped preview to come back");
        const iK = await inst(c);
        t.ok(reqsK() === n0k + 1 && iK.multiCreated === made0 + 1, `…then comes back by itself: one new token, one new call (created ${made0} → ${iK.multiCreated})`);

        /* --- vdbg narration --- */
        const said = (re) => c.logs.some((l) => /\[lobby\]/.test(l.text) && re.test(l.text));
        t.ok(said(/preview start r_live/) && said(/preview first frame r_live/) && said(/preview leave r_live \(room ended\)/) && said(/preview failed r_refused/),
          "vdbg narrates start, first frame, leave (with its reason) and failure on the [lobby] channel");
        const onScreen = await c.page.evaluate(() => { const p = document.getElementById("vdebug"); return p ? p.textContent : ""; });
        t.ok(/preview start/.test(onScreen), "…and they reach the on-screen panel under ?debug only (this page was loaded with it)");

        /* --- J. sign-out tears every preview down --- */
        const beforeOut = (await pv(c)).length;
        const mark = c.logs.length;
        await c.page.click("#signout");
        await c.page.waitForSelector("#auth:not(.hide)", { timeout: 15000 });
        const after = c.logs.slice(mark).map((l) => l.text);
        const leaves = after.filter((x) => /preview leave .*\(sign-out\)/.test(x)).length;
        const firstLeave = after.findIndex((x) => /preview leave .*\(sign-out\)/.test(x));
        const startsAfter = after.slice(firstLeave).filter((x) => /preview start/.test(x)).length;
        t.ok(beforeOut >= 1 && leaves === beforeOut, `sign-out: every preview left first (${leaves} of ${beforeOut})`);
        t.ok(startsAfter === 0, `…and none started after it (starts after the first sign-out leave: ${startsAfter})`);

        // the browser itself logs the refused token fetch (block E) as a
        // failed resource; that 403 is this gate's own doing, nothing else is
        const errs = c.errors.filter((e) => !/favicon/.test(e) && !/Failed to load resource.*403/.test(e));
        t.ok(errs.length === 0, "zero console errors (bar the browser's own line for the refused token) — " + errs.slice(0, 3).join(" | "));
        t.ok(h.unexpectedRequests.length === 0, "no unexpected network egress — " + h.unexpectedRequests.slice(0, 3).join(", "));
      } finally { await h.close(); }
    }

    /* ================= G: on-screen only, and the cap ================= */
    {
      const h = await Harness.launch();
      try {
        const D = h.double;
        const viewer = D.addUser({ id: "u_view", name: "Viewer" });
        const rooms = [];
        for (let i = 1; i <= 7; i++) {
          const hu = D.addUser({ id: "u_h" + i, name: "Host " + i });
          const id = D.addRoom({ id: "r_" + i, host_id: hu, name: "Room " + i });
          D.rooms.get(id).created_at = D.iso(D.now() - i * 1000);   // list order: r_1 first
          rooms.push(id);
        }
        /* which cards are at least a quarter on screen, measured off the page */
        const onScreen = (c) => c.page.evaluate(() => [...document.querySelectorAll("#roomlist .roomcard")].filter((el) => {
          const r = el.getBoundingClientRect();
          const vis = Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
          return r.height > 0 && vis / r.height >= 0.25;
        }).map((el) => el.dataset.room));
        const held = async (c) => (await pv(c)).map((p) => p.id).sort();

        /* the phone: 390x844 — only what is on screen plays */
        const c = await lobbyClient(h, "phone", viewer);
        await c.page.waitForSelector('.roomcard[data-room="r_7"]', { timeout: 15000 });
        const cap = await c.lc("(lc) => lc.LOBBY_PREVIEW_MAX");
        t.ok(cap === 4, "the cap is one number, and it is 4 (LOBBY_PREVIEW_MAX=" + cap + ")");
        await waitFor(async () => (await held(c)).length > 0, 8000, "the on-screen cards to start previews");
        await sleep(600);
        const vis1 = (await onScreen(c)).sort(), held1 = await held(c);
        t.ok(vis1.length >= 2 && vis1.length < 7, `on a phone screen ${vis1.length} of 7 cards are on screen`);
        t.ok(JSON.stringify(held1) === JSON.stringify(vis1), `previews are held by exactly the on-screen cards — on screen ${vis1}, held ${held1}`);
        t.ok((await inst(c)).multiLive === held1.length, "…and no call object exists for an off-screen card");

        await c.page.evaluate(() => { const m = document.querySelector("main"); m.scrollTo(0, m.scrollHeight); });   // <main> is the lobby's scroller
        await waitFor(async () => { const v = (await onScreen(c)).sort(); return v.includes("r_7") && JSON.stringify(await held(c)) === JSON.stringify(v); },
          8000, "previews to follow the scroll");
        const vis2 = (await onScreen(c)).sort(), held2 = await held(c);
        const i2 = await inst(c);
        t.ok(!held2.includes("r_1") && held2.includes("r_7"), `scrolled down: the top card's preview left, the bottom card's started — held ${held2}`);
        await waitFor(async () => (await inst(c)).multiLive === held2.length, 5000, "scrolled-away previews to finish destroying");
        t.ok(vis2.length <= cap, `…and the calls alive match what is on screen (${held2.length}), with ${i2.multiCreated} created in all`);
        await c.close();

        /* a tall window: all seven on screen — the cap holds */
        const tall = await lobbyClient(h, "tall", viewer, { viewport: { width: 390, height: 2600 } });
        await tall.page.waitForSelector('.roomcard[data-room="r_7"]', { timeout: 15000 });
        await waitFor(async () => (await held(tall)).length >= cap, 8000, "the cap's worth of previews to start");
        await sleep(800);
        const visT = await onScreen(tall), heldT = await held(tall), iT = await inst(tall);
        t.ok(visT.length === 7, "in a tall window all 7 cards are on screen");
        t.ok(heldT.length === cap && iT.multiLive === cap && iT.multiCreated === cap,
          `…and exactly ${cap} previews are held (held ${heldT.length}, calls alive ${iT.multiLive}, ever created ${iT.multiCreated})`);
        t.ok(JSON.stringify(heldT) === JSON.stringify(["r_1", "r_2", "r_3", "r_4"]), "they are the FIRST four in list order — " + heldT);
        D.endRoom("r_2", null, "u_h2", "host");
        await waitFor(async () => JSON.stringify(await held(tall)) === JSON.stringify(["r_1", "r_3", "r_4", "r_5"]), 8000, "the freed slot to pass to the next card");
        await waitFor(async () => (await inst(tall)).multiLive === cap, 5000, "the ended room's call to finish destroying");
        t.ok(true, "a room ends → its slot passes to the next on-screen card, still exactly " + cap);
        const errs = tall.errors.concat(c.errors).filter((e) => !/favicon/.test(e));
        t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 3).join(" | "));
      } finally { await h.close(); }
    }
  },
};
