/* GATE 90 — crew-smoke: the rehearsal crew (tools/crew) runs a light pass
 * against the harness, so the tool Nick rehearses with can't rot silently.
 *
 * WHAT IS REAL: index.html in six bot pages, each with the crew's own fake
 * camera (cast.js) and its in-page surface (crew.js PAGE); the Crew class
 * that drives them; the host's page sending chat through the app's sendChat.
 * WHAT IS FAKED: the accounts — bots are signed in with the double's
 * loginClient, never a password (production reads them from Codespace
 * secrets; this gate never touches them) — and the server is the double.
 *
 * The claims:
 *   P.  orders parse: only "crew:" lines, names with spaces, counts, "from"
 *   1.  all six bots join the room
 *   2.  the men take bench seats on their own, with a headshot from the card
 *   3.  "crew: status" from the host: every bot answers in one chat line
 *   4.  a "crew:" line from someone who is NOT the host is ignored
 *   5.  "crew: hearts Dex 3": three hearts reach Dex from the crowd bots
 *   6.  a server refusal is echoed into chat in the server's words
 *   7.  "crew: leave Marco": he leaves the bench and stays off it
 *   8.  "crew: done": every bot leaves, the crew stops, the host's show is
 *       still live and no crew-hosted room is live
 */
"use strict";
const { Harness } = require("../lib/harness");
const { Crew, PAGE } = require("../crew/crew.js");
const { CAST, cameraScript } = require("../crew/cast");
const { parseOrder } = require("../crew/orders");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 15000, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(step); }
  return null;
}

module.exports = {
  name: "crew-smoke",
  async run(t) {
    /* P — the order grammar */
    const p1 = parseOrder("crew: hearts Dex 3"), p2 = parseOrder("Crew : jeer Crowd A pie from b"), p3 = parseOrder("crew: ovation dex");
    t.ok(p1 && p1.verb === "hearts" && p1.target === "Dex" && p1.n === 3, "P: crew: hearts Dex 3 parses to 3 hearts for Dex");
    t.ok(p2 && p2.verb === "jeer" && p2.target === "Crowd A" && p2.kind === "pie" && p2.from === "Crowd B", "P: names with spaces, a kind and a thrower parse");
    t.ok(parseOrder("hearts Dex 3") === null && parseOrder("lol crew: done") === null, "P: a line that doesn't start with crew: is not an order");
    t.ok(p3 && p3.verb === "ovation" && p3.target === "dex", "P: verbs are case-insensitive");

    const h = await Harness.launch();
    let crew = null;
    try {
      const D = h.double;
      const host = D.addUser({ id: "u_nick", name: "Nick", email: "nick@fix.test" });
      const room = D.addRoom({ id: "r_crew", host_id: host, name: "Rehearsal" });
      const lurker = D.addUser({ id: "u_lurk", name: "Lurker" });
      D.addMember(room, lurker, "spectator");
      const uid = {};
      for (const c of CAST) uid[c.name] = D.addUser({ id: "u_crew_" + c.key.toLowerCase(), name: c.name, gender: c.man ? "man" : null });

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
      const log = []; crew = new Crew({ bots, roomId: room, log: (s) => log.push(s), tickMs: 400 });
      await crew.start();

      /* 1 */
      const inRoom = CAST.every((c) => { const m = D.memberRow(room, uid[c.name]); return m && m.role !== "gone"; });
      t.ok(inRoom, "1: all six bots joined the room");

      /* 2 */
      const men = ["Dex", "Marco", "Leo"];
      const benched = await until(() => men.every((n) => { const m = D.memberRow(room, uid[n]); return m && ["line", "chair"].includes(m.role); }), 45000);
      t.ok(benched, "2: Dex, Marco and Leo took bench seats on their own — " + men.map((n) => n + ":" + ((D.memberRow(room, uid[n]) || {}).role)).join(" "));
      const face = (D.profiles.get(uid.Dex) || {}).face_json;
      // the photo's corner is Dex's card colour (#e0245e), not Chromium's stock test pattern
      const px = face && face.photo ? await hc.page.evaluate((src) => new Promise((res) => {
        const im = new Image(); im.onload = () => { const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height;
          const g = cv.getContext("2d"); g.drawImage(im, 0, 0); res(Array.from(g.getImageData(3, 3, 1, 1).data)); };
        im.onerror = () => res(null); im.src = src; }), face.photo) : null;
      const near = px && Math.abs(px[0] - 0xe0) < 40 && Math.abs(px[1] - 0x24) < 40 && Math.abs(px[2] - 0x5e) < 40;
      t.ok(!!near, "2: Dex's headshot came from his card camera — corner pixel " + JSON.stringify(px));

      const say = (text) => hc.page.evaluate((x) => { document.getElementById("rt_chatinput").value = x; return sendChat(); }, text);
      const chatsFrom = (u, after) => D.events.filter((e) => e.room_id === room && e.type === "chat" && e.user_id === u && e.created_at > after);
      const mark = () => D.events.length ? D.events[D.events.length - 1].created_at : "";

      /* 3 */
      let m0 = mark(); await say("crew: status");
      const allAnswered = await until(() => CAST.every((c) => chatsFrom(uid[c.name], m0).length >= 1), 15000);
      t.ok(allAnswered, "3: every bot answered crew: status in chat");
      t.ok(CAST.every((c) => chatsFrom(uid[c.name], m0).length === 1), "3: …each in exactly one line");

      /* 4 */
      D.pushEvent(room, lurker, "chat", { text: "crew: done" });
      await sleep(2000);
      t.ok(!crew.stopped, "4: a crew: line from someone who isn't the host is ignored");

      /* 5 */
      m0 = mark(); await say("crew: hearts Dex 3");
      const hearts = await until(() => { const hs = D.events.filter((e) => e.room_id === room && e.type === "heart" && e.payload && e.payload.target === uid.Dex && e.created_at > m0); return hs.length >= 3 ? hs : null; }, 15000);
      t.ok(hearts && hearts.length === 3, "5: three hearts reached Dex");
      const crowdIds = new Set(["Crowd A", "Crowd B", "Crowd C"].map((n) => uid[n]));
      t.ok(hearts && hearts.every((e) => crowdIds.has(e.user_id)), "5: …all from the crowd bots");

      /* 6 */
      m0 = mark(); await say("crew: jeer Lurker from A");
      const echo = await until(() => chatsFrom(uid["Crowd A"], m0).find((e) => /refused:/.test(e.payload.text)), 15000);
      t.ok(!!echo, "6: a server refusal is echoed in chat — " + JSON.stringify(echo && echo.payload.text));

      /* 6b — an ovation at a seated man: three crowd bots throw within 2s, each says how it went */
      D.rpc("host", "seat_member", { room_id: room, user_id: uid.Dex, seat_index: 0 });
      await until(() => (D.memberRow(room, uid.Dex) || {}).role === "chair", 5000);
      m0 = mark(); await say("crew: ovation Dex");
      const ov = await until(() => { const ls = ["Crowd A", "Crowd B", "Crowd C"].map((n) => chatsFrom(uid[n], m0)[0]); return ls.every(Boolean) ? ls : null; }, 15000);
      const ovThrows = D.throwLedger.filter((x) => x.target_id === uid.Dex && x.at > m0);
      t.ok(!!ov && /landed|combo|joined/.test(ov[0].payload.text), "6b: crew: ovation — three crowd bots answer, the first throw landed — " + JSON.stringify(ov && ov.map((e) => e.payload.text)));
      t.ok(ovThrows.length >= 1 && new Set(ovThrows.map((x) => x.thrower_id)).size === ovThrows.length, "6b: …each throw from a different crowd bot (" + ovThrows.length + " on the ledger)");

      /* 7 */
      m0 = mark(); await say("crew: leave Marco");
      const left = await until(() => { const m = D.memberRow(room, uid.Marco); return m && !["line", "chair"].includes(m.role); }, 15000);
      t.ok(!!left, "7: Marco left the bench");
      t.ok(chatsFrom(uid.Marco, m0).length === 1, "7: …and said so in one line");
      await sleep(2500);
      const stillOff = D.memberRow(room, uid.Marco);
      t.ok(stillOff && !["line", "chair"].includes(stillOff.role), "7: …and stays off it");

      /* 8 */
      await say("crew: done");
      const end = await Promise.race([crew.done, sleep(30000).then(() => null)]);
      t.ok(end && end.reason === "crew: done", "8: crew: done stops the crew");
      t.ok(CAST.every((c) => { const m = D.memberRow(room, uid[c.name]); return !m || m.role === "gone"; }), "8: every bot left the room");
      t.ok(D.rooms.get(room).status === "live", "8: the host's show is still live");
      t.ok(end && end.liveHosted === 0, "8: no crew-hosted room is live");
    } finally {
      if (crew && !crew.stopped) { try { await crew.finish("gate cleanup"); } catch (e) {} }
      await h.close();
    }
  },
};
