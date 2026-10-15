/* GATE 91 — crew-selftest: `crew --scenario combos` (tools/crew/selftest.js)
 * runs its six PR C checks against the harness and passes all six, so the
 * test Nick runs live with the crew can't rot.
 *
 * The gate plays NICK: Dex and Marco are already in chairs, and when the
 * selftest asks in chat it does what her phone would — asks Dex and skips
 * (his reaction window opens), then makes her call passing Marco (the crown
 * goes to the hearts leader).  Five accounts, as live: two crowd bots plus
 * Leo staying in the crowd are the three throwers; Crowd C is absent.
 * The cooldowns are real time (about a minute).
 *
 *   1.  the selftest reports 6 of 6 passed
 *   2.  each of its six lines went to chat, from the crew's ear
 *   3.  Leo stayed in the crowd (he threw, he never benched)
 *   4.  after "crew: done" every bot left and the host's show is still live
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

module.exports = {
  name: "crew-selftest",
  async run(t) {
    const h = await Harness.launch();
    let crew = null;
    try {
      const D = h.double;
      const host = D.addUser({ id: "u_nick", name: "Nick", email: "nick@fix.test" });
      const room = D.addRoom({ id: "r_self", host_id: host, name: "Selftest", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_000_000);
      D.addUser({ id: "u_sam", name: "Sam" });
      const cast = CAST.filter((c) => c.name !== "Crowd C");
      const uid = {};
      for (const c of cast) uid[c.name] = D.addUser({ id: "u_crew_" + c.key.toLowerCase(), name: c.name, gender: c.man ? "man" : null });
      D.addMember(room, uid.Dex, "chair", { seat_index: 0 });
      D.addMember(room, uid.Marco, "chair", { seat_index: 1 });
      D.addMember(room, "u_sam", "chair", { seat_index: 2 });

      const hc = await h.newClient("host");
      hc.login(host); await hc.goto();
      await hc.page.waitForSelector("#room.show", { timeout: 20000 });
      const bots = [];
      for (const spec of cast) {
        const c = await h.newClient("crew-" + spec.key.toLowerCase());
        await c.context.addInitScript(cameraScript(spec));
        await c.context.addInitScript(PAGE);
        c.login(uid[spec.name]); await c.goto();
        await c.page.waitForFunction(() => window.__crew && window.__crew.booted(), null, { timeout: 20000 });
        bots.push({ spec, page: c.page, close: () => c.close() });
      }
      const log = [];
      crew = new Crew({ bots, roomId: room, scenario: "combos", log: (s) => log.push(s), tickMs: 500 });
      await crew.start();

      const ear = uid["Crowd A"];
      const said = (re) => D.events.find((e) => e.room_id === room && e.type === "chat" && e.user_id === ear && re.test((e.payload && e.payload.text) || ""));
      // NICK: ask Dex, then skip — his reaction window opens
      if (await until(() => said(/now ASK Dex/), 180000)) {
        const r = D.rooms.get(room); r.phase = "spotlight"; r.phase_deadline = null; r.spotlight_target = null; D.emit("rooms", "UPDATE", { ...r });
        D.rpc("host", "ask_question", { room_id: room, question_id: 1, target: uid.Dex });
        await sleep(1500);
        D.rpc("host", "skip_phase", { room_id: room });
      }
      // NICK: her call, passing Marco
      if (await until(() => said(/last one/), 60000)) {
        await sleep(1500);   // the crowd's hearts land
        D.setPhase(room, "deliberation", 60);
        D.rpc("host", "advance_phase", { room_id: room });
        D.rpc("host", "decide_pass", { room_id: room, target: uid.Marco });
        D.rpc("host", "advance_phase", { room_id: room });
      }
      const done = await until(() => said(/^selftest · done:/), 60000);
      /* the summary line lands in chat a beat BEFORE runCombos returns and
         the crew stores its result — wait for the result, not just the line
         (a race that went red in the full battery, fix/rehearsal-1009) */
      await until(() => crew.selftestResult, 10000);
      const res = crew.selftestResult || {};
      const lines = (res.results || []).map((r) => `${r.n}:${r.pass ? "ok" : "FAIL"}`).join(" ");

      /* 1 */
      t.ok(!!done && res.passed === 6 && (res.results || []).length === 6, "1: the selftest passed 6 of 6 — " + lines + ((res.results || []).filter((r) => !r.pass).map((r) => " | " + r.n + " " + r.note).join("")));
      /* 2 */
      const steps = D.events.filter((e) => e.room_id === room && e.type === "chat" && e.user_id === ear && /^selftest · (✅|❌) \d/.test(e.payload.text || ""));
      t.ok(steps.length === 6, "2: each step went to chat in one line from the crew (" + steps.length + ")");
      /* 3 */
      const leoThrew = D.throwLedger.some((x) => x.thrower_id === uid.Leo);
      const leoRow = D.memberRow(room, uid.Leo);
      t.ok(leoThrew && leoRow && leoRow.role === "spectator", "3: Leo stayed in the crowd and threw");
      /* 4 */
      await hc.page.evaluate(() => { document.getElementById("rt_chatinput").value = "crew: done"; return sendChat(); });
      const end = await Promise.race([crew.done, sleep(30000).then(() => null)]);
      t.ok(end && end.reason === "crew: done" && cast.every((c) => { const m = D.memberRow(room, uid[c.name]); return !m || m.role === "gone"; }) && D.rooms.get(room).status === "live",
        "4: crew: done — every bot left, her show is still live");
    } finally {
      if (crew && !crew.stopped) { try { await crew.finish("gate cleanup"); } catch (e) {} }
      await h.close();
    }
  },
};
