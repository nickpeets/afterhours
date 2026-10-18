/* GATE 93 — crew-looks: `crew --scenario looks` (tools/crew/looks.js) and
 * `crew --faces` (tools/crew/cast.js) run headless against the harness, so
 * the looks rehearsal Nick runs live with the crew can't rot.
 *
 * WHAT IS REAL: index.html in six bot pages with the crew's camera and its
 * in-page surface; the Crew class and the looks scenario driving them
 * through the app's own doors (lookTry / lookWear / throwAt); a host page.
 * WHAT IS FAKED: the accounts (the double's loginClient, never a password),
 * the server (the double), the Camera Kit SDK (the shim, on Leo's ?camkit
 * page — the shim slug is allowed on THIS double only, standing in for DDL
 * that has not been written, exactly as gate 79 says), and the FACE: the
 * real clips are stock footage that never enters the repo, so the gate
 * records a short WebM of its own (a canvas, through MediaRecorder in the
 * host page) and hands it to Dex the way --faces hands him his clip.
 *
 * The gate plays NICK: it seats Dex and Marco when the crew asks, and asks
 * Marco a question when the crew says so.  The cooldowns are real time
 * (three tomatoes ~30s apart, so about two minutes).
 *
 *   F1. --faces: Dex's camera is the clip — his face state is "playing" and
 *       his bench headshot's corner is the clip's colour, not his card's;
 *       the other bots, with no clip, wear the card and the crew said so
 *   F2. the clips are out of git: nothing under tools/crew/faces but
 *       fetch.sh, LICENSES.md and .gitignore, and the rehearsal-only notice
 *       is in LICENSES.md, the README and the camera's code
 *   1.  the scenario reports 5 of 5 passed, each beat announced in chat
 *       before it ran, with a pause between beats
 *   2.  the rows agree: Dex wears grade, Leo wears the lens, Marco's look
 *       is gone after the ask and his pick is still spent
 *   3.  Dex's frame reached three cracks (a crowd phone showed the shatter)
 *       and the rose took one back
 *   4.  after "crew: done" every bot left and the host's show is still live
 */
"use strict";
const fs = require("fs"), os = require("os"), path = require("path");
const { Harness } = require("../lib/harness");
const { Crew, PAGE, serveFace } = require("../crew/crew.js");
const { CAST, cameraScript, facePath } = require("../crew/cast");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms, step = 250) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(step); }
  return null;
}
/* a 1.5s WebM of a solid teal frame with a moving bar — recorded by the
   browser itself, so the test clip is a real VP9/WebM file like fetch.sh's */
const RECORD = () => new Promise((res, rej) => {
  const cv = document.createElement("canvas"); cv.width = 320; cv.height = 240;
  const g = cv.getContext("2d"); let t = 0;
  const paint = () => { t++; g.fillStyle = "rgb(10,200,240)"; g.fillRect(0, 0, 320, 240); g.fillStyle = "#000"; g.fillRect((t * 7) % 300, 100, 20, 40); };
  paint(); const iv = setInterval(paint, 50);
  const stream = cv.captureStream(20);
  const rec = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9" });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  rec.onerror = (e) => rej(new Error("recorder: " + (e.error && e.error.message)));
  rec.onstop = async () => { clearInterval(iv); const b = new Blob(chunks, { type: "video/webm" }); const buf = await b.arrayBuffer();
    let s = ""; const u8 = new Uint8Array(buf); for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); res(btoa(s)); };
  rec.start(100); setTimeout(() => rec.stop(), 1500);
});

module.exports = {
  name: "crew-looks",
  async run(t, ctx) {
    /* F2 — the clips are out of git, the notice is everywhere it must be */
    const facesDir = path.join(__dirname, "..", "crew", "faces");
    const files = fs.readdirSync(facesDir).sort();
    t.ok(files.every((f) => [".gitignore", "LICENSES.md", "fetch.sh"].includes(f)), "F2: tools/crew/faces holds only fetch.sh, LICENSES.md and .gitignore — no clip is in the repo (" + files.join(", ") + ")");
    const lic = fs.readFileSync(path.join(facesDir, "LICENSES.md"), "utf8"), readme = fs.readFileSync(path.join(__dirname, "..", "crew", "README.md"), "utf8"), cast = fs.readFileSync(path.join(__dirname, "..", "crew", "cast.js"), "utf8");
    const notice = (s) => /INTERNAL REHEARSAL ONLY/i.test(s) && /never/i.test(s) && /Snap demo/i.test(s);
    t.ok(notice(lic) && notice(readme) && notice(cast), "F2: the rehearsal-only notice (never in the Snap demo videos or anything public) is in LICENSES.md, the README and cast.js");
    t.ok(/\.webm|\.mp4|\*\s*$/.test(fs.readFileSync(path.join(facesDir, ".gitignore"), "utf8")), "F2: tools/crew/faces/.gitignore keeps a stray clip out of a commit");
    t.ok(CAST.every((c) => new RegExp(String(c.pexels)).test(fs.readFileSync(path.join(facesDir, "fetch.sh"), "utf8")) && new RegExp(String(c.pexels)).test(lic)),
      "F2: every bot's Pexels id is in fetch.sh and credited in LICENSES.md");

    const h = await Harness.launch();
    let crew = null;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "lc-crew-faces-"));
    try {
      const D = h.double;
      const host = D.addUser({ id: "u_nick", name: "Nick", email: "nick@fix.test" });
      const room = D.addRoom({ id: "r_looks", host_id: host, name: "Looks", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 3_000_000);
      /* a third chair is filled from the start (as gate 91 does): the host's
         engine resets an EMPTY stage to warm-up, and warm-up auto-starts the
         show once three chairs fill — this gate rehearses looks, not the
         episode, so the stage is never empty and never full-from-preshow */
      D.addUser({ id: "u_sam", name: "Sam" });
      D.addMember(room, "u_sam", "chair", { seat_index: 2 });
      const uid = {};
      for (const c of CAST) uid[c.name] = D.addUser({ id: "u_crew_" + c.key.toLowerCase(), name: c.name, gender: c.man ? "man" : null });

      const hc = await h.newClient("host");
      hc.login(host); await hc.goto();
      await hc.page.waitForSelector("#room.show", { timeout: 20000 });

      /* the test clip, recorded by the host page, written where --faces would read it */
      const b64 = await hc.page.evaluate(RECORD);
      const clip = path.join(tmp, "dex.webm");
      fs.writeFileSync(clip, Buffer.from(b64, "base64"));
      t.ok(fs.statSync(clip).size > 1000, "F1: the gate recorded a real WebM test clip for Dex (" + fs.statSync(clip).size + " bytes)");

      /* Leo's page carries ?camkit and talks to the shim; the shim's slug is
         allowed on this double only (gate 79's standing note) */
      const LENS = "foxears";
      D.allowFilterLook(LENS);
      const log = [];
      const dbg = !!process.env.CREW_DEBUG;
      const bots = [];
      for (const spec of CAST) {
        const c = await h.newClient("crew-" + spec.key.toLowerCase());
        const face = spec.name === "Dex" ? clip : null;
        if (face) await serveFace(c.context, spec, face);
        await c.context.addInitScript(cameraScript(spec, face ? facePath(spec) : null));
        await c.context.addInitScript(PAGE);
        c.login(uid[spec.name]); await c.goto(spec.name === "Leo" ? "?camkit" : "");
        await c.page.waitForFunction(() => window.__crew && window.__crew.booted(), null, { timeout: 20000 });
        if (spec.name === "Leo") await c.camkitConfigure({ looks: { [LENS]: { lensId: "lens-fox", name: "Fox Ears", icon: "\u{1F98A}" } } });
        bots.push({ spec, page: c.page, close: () => c.close(), client: c });
      }

      /* F1 — Dex wears the clip, the others the card */
      const faceState = await until(() => bots[0].page.evaluate(() => window.__crewCard.faceState === "playing" ? "playing" : null), 10000) || await bots[0].page.evaluate(() => window.__crewCard.faceState);
      t.ok(faceState === "playing", "F1: Dex's camera is the clip — faceState " + JSON.stringify(faceState));
      t.ok(await bots[1].page.evaluate(() => window.__crewCard.faceState) === "card", "F1: Marco, with no clip, wears the card");

      crew = new Crew({ bots, roomId: room, scenario: "looks", log: (s) => { log.push(s); if (dbg) console.log("      " + s); }, tickMs: 500, beatMs: 1500 });
      await crew.start();
      /* THE HOST'S FEED: the Daily double is per window, so no bot ever sees
         the host in its call — and a guest whose call has had no host for
         80s leaves ("The host left — that's the show", the real rule).  Gates
         90 and 91 finish inside that window; this scenario runs minutes, so
         the host is injected into every bot's call the way the backstage
         gates do (gate 32).  Nothing about the crew is faked by it. */
      for (const b of bots) await until(() => b.page.evaluate((h) => window.__lc.DAILY_JOINED === true && !!window.__dailyControl.addRemote(h), host), 20000);

      const ear = uid["Crowd A"];
      const chat = (re, u = ear) => D.events.find((e) => e.room_id === room && e.type === "chat" && e.user_id === u && re.test((e.payload && e.payload.text) || ""));
      // NICK: seat Dex and Marco once they're on the bench
      const benched = await until(() => ["Dex", "Marco"].every((n) => { const m = D.memberRow(room, uid[n]); return m && m.role === "line"; }), 60000);
      t.ok(!!benched, "1: Dex and Marco took bench seats on their own");
      // F1 (continued): Dex's headshot came from the clip, not the card
      const face = (D.profiles.get(uid.Dex) || {}).face_json;
      const px = face && face.photo ? await hc.page.evaluate((src) => new Promise((res) => {
        const im = new Image(); im.onload = () => { const cv = document.createElement("canvas"); cv.width = im.width; cv.height = im.height;
          const g = cv.getContext("2d"); g.drawImage(im, 0, 0); res(Array.from(g.getImageData(3, 3, 1, 1).data)); };
        im.onerror = () => res(null); im.src = src; }), face.photo) : null;
      const teal = px && Math.abs(px[0] - 10) < 50 && Math.abs(px[1] - 200) < 50 && Math.abs(px[2] - 240) < 50;
      t.ok(!!teal, "F1: Dex's bench headshot came from the clip (teal), not his red card — corner pixel " + JSON.stringify(px));
      D.rpc("host", "seat_member", { room_id: room, user_id: uid.Dex, seat_index: 0 });
      D.rpc("host", "seat_member", { room_id: room, user_id: uid.Marco, seat_index: 1 });

      // NICK: ask Marco when the crew says so
      const askLine = await until(() => chat(/beat 5 — THE ASK — ask (\w[\w ]*?) a question/), 6 * 60 * 1000, 500);
      t.ok(!!askLine, "1: the crew reached the ask and said whom to ask — " + JSON.stringify(askLine && askLine.payload.text));
      const who = askLine ? /ask (\w[\w ]*?) a question/.exec(askLine.payload.text)[1] : "Marco";
      await sleep(1000);
      D.rpc("host", "ask_question", { room_id: room, question_id: 1, target: uid[who] });

      const done = await until(() => chat(/^looks · done:/), 60000);
      const res = crew.looksResult || {};
      const lines = (res.results || []).map((r) => `${r.n}:${r.pass ? "ok" : "FAIL"}`).join(" ");
      /* 1 */
      t.ok(!!done && res.passed === 5 && (res.results || []).length === 5, "1: the looks scenario passed 5 of 5 — " + lines + ((res.results || []).filter((r) => !r.pass).map((r) => " | " + r.n + " " + r.note).join("")));
      const beats = D.events.filter((e) => e.room_id === room && e.type === "chat" && e.user_id === ear && /^looks · beat \d/.test(e.payload.text || ""));
      const reports = D.events.filter((e) => e.room_id === room && e.type === "chat" && e.user_id === ear && /^looks · (✅|❌) \d/.test(e.payload.text || ""));
      t.ok(beats.length === 5 && reports.length === 5 && beats.every((b, i) => b.created_at < reports[i].created_at), "1: five beats, each announced in chat before its report (" + beats.length + " beats, " + reports.length + " reports)");
      const gaps = beats.slice(1).map((b, i) => new Date(b.created_at) - new Date(reports[i].created_at));
      t.ok(gaps.every((g) => g >= 1200), "1: a pause between a beat's report and the next beat (" + gaps.map((g) => Math.round(g / 100) / 10 + "s").join(", ") + ")");
      /* 2 */
      const rows = Object.fromEntries(["Dex", "Marco", "Leo"].map((n) => [n, D.memberRow(room, uid[n]) || {}]));
      t.ok(rows.Dex.filter === "grade" && rows.Dex.filter_pick === "grade", "2: Dex wears Warm Grade (row: " + rows.Dex.filter + "/" + rows.Dex.filter_pick + ")");
      t.ok(rows.Leo.filter === LENS && rows.Leo.filter_pick === LENS && res.lens === LENS, "2: Leo wears the lens look from his ?camkit page (row: " + rows.Leo.filter + ", scenario saw " + res.lens + ")");
      t.ok(rows.Marco.filter == null && rows.Marco.filter_pick === "noir" && who === "Marco", "2: Marco's Noir is gone after the ask and his pick is still spent (row: " + rows.Marco.filter + "/" + rows.Marco.filter_pick + ")");
      t.ok(D.rpcLog.filter((r) => r.name === "set_filter").length === 3, "2: set_filter was called exactly three times — one WEAR IT per man, no try-on reached the server (" + D.rpcLog.filter((r) => r.name === "set_filter").length + ")");
      /* 3 */
      const jeers = D.throwLedger.filter((x) => x.target_id === uid.Dex && x.cls === "jeer");
      const r3 = (res.results || []).find((r) => r.n === 3) || {}, r4 = (res.results || []).find((r) => r.n === 4) || {};
      t.ok(jeers.length === 3 && new Set(jeers.map((x) => x.thrower_id)).size === 3 && /cracks 2 → 3/.test(r3.note || "") && /shattered on a crowd phone: yes/.test(r3.note || ""),
        "3: three tomatoes from three crowd bots cracked Dex 1 → 2 → 3 and a crowd phone showed the shatter — " + (r3.note || "no beat 3"));
      t.ok(rows.Dex.cracks === 2 && /cracks 3 → 2/.test(r4.note || ""), "3: the rose mended one (row cracks " + rows.Dex.cracks + ") — " + (r4.note || "no beat 4"));
      /* 4 */
      await hc.page.evaluate(() => { document.getElementById("rt_chatinput").value = "crew: done"; return sendChat(); });
      const end = await Promise.race([crew.done, sleep(30000).then(() => null)]);
      t.ok(end && end.reason === "crew: done" && CAST.every((c) => { const m = D.memberRow(room, uid[c.name]); return !m || m.role === "gone"; }) && D.rooms.get(room).status === "live",
        "4: crew: done — every bot left, the host's show is still live");
    } finally {
      if (crew && !crew.stopped) { try { await crew.finish("gate cleanup"); } catch (e) {} }
      await h.close();
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
  },
};
