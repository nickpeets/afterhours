/* looks.js — `crew --scenario looks`: a looks rehearsal, with Nick hosting
 * from his phone (and, with --faces, moving faces in every tile).
 *
 * The bots do what the tray and the crowd do; Nick does what only the host
 * can (seat the men, ASK one).  Every beat is announced in room chat before
 * it happens and reported after (✅ / ❌ and why), with about five seconds
 * between beats — longer only where the server's own timing says so (a
 * throw is live for 10s and the chair cools down for 20s, so the tomatoes
 * are ~30s apart; the pauses are the server's, and the chat says so).
 *
 *   1  TRY ON: each man taps a look (lookTry — his own tile, nothing
 *      published), the crew reports whether a preview drew, then cancels
 *   2  WEAR: each man wears a DIFFERENT look than he tried (lookWear → the
 *      one door to set_filter): Dex Warm Grade, Marco Noir, Leo a Camera
 *      Kit lens when the page has one (?camkit), else Noir — and the server
 *      row confirms each
 *   3  TOMATOES: the crowd jeers Dex one tomato at a time, each from a
 *      different crowd bot, until his frame cracks 1 → 2 → 3 and shatters
 *      (a crowd phone's tile reports every crack and the shatter)
 *   4  THE ROSE: a rose mends one crack (3 → 2)
 *   5  THE ASK: Nick asks the bot wearing Noir; the crew times how long his
 *      look takes to drop off his row and reports it
 *   6  summary; the crew keeps taking orders until "crew: done"
 *
 * The checks read what the server answered (throwAt's reply, the member
 * rows) and what a CROWD phone shows (the tile's cracks / is-shattered).
 * How a look LOOKS on a moving face is Nick's to judge on his phone — and
 * the screen recording's.
 */
"use strict";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runLooks(crew, opts = {}) {
  const wait = opts.waitMs || 15 * 60 * 1000;   // how long a beat waits for Nick
  const beatMs = opts.beatMs == null ? 5000 : opts.beatMs;
  const say = (t) => crew.say(crew.ear, "looks · " + t);
  const beat = async (n, what) => { await say(`beat ${n} — ${what}`); crew.log(`  looks beat ${n}: ${what}`); };
  const results = [];
  const report = async (n, name, pass, note) => {
    results.push({ n, name, pass: !!pass, note });
    crew.log(`  looks ${n} ${name}: ${pass ? "PASS" : "FAIL"} — ${note}`);
    await say(`${pass ? "✅" : "❌"} ${n} ${name}: ${note}`);
  };
  const pause = () => sleep(beatMs);
  const role = (b) => (b && b.st && b.st.role) || null;
  const until = async (fn, ms, step = 500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms && !crew.stopped) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(step); }
    return null;
  };
  const men = ["Dex", "Marco", "Leo"].map((n) => crew.bot(n)).filter(Boolean);
  const dex = crew.bot("Dex");
  const crowd = crew.crowd;
  if (men.length < 2 || !dex || crowd.length < 1) {
    await say(`needs Dex, another man and a crowd bot; have ${crew.bots.map((b) => b.spec.name).join(", ") || "none"}`);
    return { results, aborted: "not enough bots" };
  }

  /* 0 — the men take bench seats on their own; the tray needs a bench or a chair */
  await say(`looks rehearsal. The men are heading to the bench. Seat Dex and Marco when you can — the tomatoes need Dex in a chair, and you'll ASK Marco later.`);
  if (!(await until(() => men.every((b) => ["line", "chair", "kept"].includes(role(b))), wait))) {
    await say("the men never reached the bench — stopping"); return { results, aborted: "men not benched" };
  }

  /* 1 — TRY ON */
  const racks = {};
  for (const b of men) racks[b.spec.name] = await crew.ev(b, "looks").catch(() => []);
  const lens = (racks.Leo || racks[men[men.length - 1].spec.name] || []).find((l) => l.kind === "lens") || null;
  const plan = {
    Dex:   { try: "noir",  wear: "grade" },
    Marco: { try: "grade", wear: "noir" },
    Leo:   { try: "grade", wear: lens ? lens.id : "noir" },
  };
  await beat(1, `TRY ON — ${men.map((b) => `${b.spec.name} tries ${nameOf(racks[b.spec.name], plan[b.spec.name].try)}`).join(", ")} (own screen only, nothing published)`);
  const tried = [];
  for (const b of men) {
    const id = plan[b.spec.name].try;
    const r = await crew.ev(b, "tryLook", id).catch((e) => ({ ok: false, error: String(e) }));
    await sleep(1200);
    const st = await crew.ev(b, "lookState").catch(() => ({}));
    tried.push({ b, r, st });
    await crew.say(b, r.ok ? (st.tryon && st.tryon.preview ? `trying ${nameOf(racks[b.spec.name], id)} — preview drawing (${st.tryon.frames | 0} frames)` : `trying ${nameOf(racks[b.spec.name], id)} — no preview here (${st.bar || "bench"})`) : `couldn't try ${id}: ${r.error}`);
  }
  await report(1, "try on", tried.every((x) => x.r.ok && x.st.row && !x.st.row.filter && !x.st.row.filter_pick),
    tried.map((x) => `${x.b.spec.name}: ${x.r.ok ? (x.st.tryon && x.st.tryon.preview ? "preview" : "armed, no preview") : "refused " + x.r.error}`).join("; ") + " — rows still bare");
  await pause();
  for (const b of men) await crew.ev(b, "cancelTry").catch(() => {});

  /* 2 — WEAR a different one */
  await beat(2, `WEAR IT — ${men.map((b) => `${b.spec.name} wears ${nameOf(racks[b.spec.name], plan[b.spec.name].wear)}`).join(", ")}` + (lens ? "" : " (no Camera Kit lens on this page — Leo wears Noir; pass --camkit for a lens)"));
  const worn = [];
  for (const b of men) {
    const id = plan[b.spec.name].wear;
    const r = await crew.ev(b, "wearLook", id).catch((e) => ({ ok: false, error: String(e) }));
    const row = await until(async () => { const s = await crew.ev(b, "lookState"); return s.row && s.row.filter === id ? s : null; }, 8000, 300);
    worn.push({ b, id, r, row });
    await crew.say(b, r.ok ? `wearing ${nameOf(racks[b.spec.name], id)}${row ? " — the server confirms" : " — but the row never showed it"}` : `couldn't wear ${id}: ${r.error}`);
    await sleep(1500);
  }
  // the pipeline: did each wearer's own filter come up?  (a lens needs the SDK and Snap's terms)
  await sleep(2500);
  for (const w of worn) w.pipe = await crew.ev(w.b, "lookState").catch(() => ({}));
  await report(2, "wear", worn.every((w) => w.r.ok && w.row),
    worn.map((w) => `${w.b.spec.name} ${w.id}: ${w.r.ok ? (w.row ? "on the row" : "NOT on the row") : "refused " + w.r.error}${w.pipe && w.pipe.F ? (w.pipe.F.active ? ", pipeline up" : ", pipeline idle" + (w.pipe.F.killed ? " (killed: " + JSON.stringify(w.pipe.F.killed) + ")" : "")) : ""}${w.pipe && w.pipe.terms ? ", Snap terms: " + w.pipe.terms : ""}`).join("; "));
  await pause();

  /* 3 — TOMATOES until he shatters */
  await beat(3, "TOMATOES at Dex, one at a time, until his frame cracks 1 → 2 → 3 and shatters" + (role(dex) !== "chair" ? " — seat Dex first" : ""));
  if (!(await until(() => role(dex) === "chair", wait))) { await report(3, "tomatoes", false, "Dex was never seated"); }
  else {
    const probe = () => crew.ev(crew.ear, "probe", dex.uid);
    const free = () => until(async () => { const p = await probe(); return p.throwSt && !p.throwSt.live && !p.throwSt.cooling; }, 90000, 1000);
    const cracksNow = async () => { const p = await probe(); return p.cracks | 0; };
    const steps = [];
    let shattered = false;
    for (let k = 1; k <= 3 && !crew.stopped; k++) {
      if (!(await free())) await say("Dex still has a throw on him; throwing anyway");
      const before = await cracksNow();
      const thrower = crowd[(k - 1) % crowd.length];
      const r = await crew.ev(thrower, "throwAt", dex.uid, "tomato").catch((e) => ({ ok: false, error: String(e) }));
      const after = r.ok ? (await until(async () => { const c = await cracksNow(); return c > before ? c : null; }, 6000, 250)) : null;
      const tile = await crew.ev(crew.ear, "tileOf", dex.uid).catch(() => ({}));
      shattered = !!(tile && tile.shattered);
      steps.push({ k, ok: r.ok, error: r.error, before, after, shattered });
      await crew.say(thrower, r.ok ? `🍅 tomato at Dex — crack ${after == null ? "?" : after}/3${shattered ? " — SHATTERED" : ""}` : `🍅 tomato at Dex — refused: ${r.error}`);
      if (!r.ok) break;
      if (k < 3) { await say(`crack ${after}/3 — the next tomato after his cooldown (the server's 10s live + 20s cooldown)`); await pause(); }
    }
    const last = steps[steps.length - 1] || {};
    await report(3, "tomatoes", steps.length === 3 && steps.every((s) => s.ok && s.after === s.k) && shattered,
      steps.map((s) => `#${s.k}: ${s.ok ? `cracks ${s.before} → ${s.after}` : "refused " + s.error}`).join("; ") + `; shattered on a crowd phone: ${shattered ? "yes" : "no"}`);
    await pause();

    /* 4 — the rose mends one */
    await beat(4, "A ROSE for Dex — one crack mends (3 → 2)");
    if (!(await free())) await say("Dex still has a throw on him; throwing anyway");
    const before = await cracksNow();
    const rb = crowd[0];
    const rr = await crew.ev(rb, "throwAt", dex.uid, "petals").catch((e) => ({ ok: false, error: String(e) }));
    const after = rr.ok ? (await until(async () => { const c = await cracksNow(); return c < before ? c : null; }, 6000, 250)) : null;
    await crew.say(rb, rr.ok ? `🌹 rose at Dex — cracks ${before} → ${after == null ? "?" : after}` : `🌹 rose at Dex — refused: ${rr.error}`);
    await report(4, "rose", rr.ok && after != null && after === before - 1, rr.ok ? `cracks ${before} → ${after}` : `refused: ${rr.error}`);
    await pause();
  }

  /* 5 — THE ASK: the look drops the instant he's asked */
  const asked = worn.find((w) => w.id === "noir" && w.row) || worn.find((w) => w.row) || null;
  if (!asked) { await report(5, "the ask", false, "nobody is wearing a look to drop"); }
  else {
    const b = asked.b;
    await beat(5, `THE ASK — ask ${b.spec.name} a question from your phone (he's wearing ${asked.id}); watch his look drop the moment you do`);
    const t0 = await until(async () => { const s = await crew.ev(b, "lookState"); return s.asked ? Date.now() : null; }, wait, 100);
    if (!t0) { await report(5, "the ask", false, `${b.spec.name} was never asked`); }
    else {
      const gone = await until(async () => { const s = await crew.ev(b, "lookState"); return s.row && !s.row.filter ? s : null; }, 15000, 100);
      const ms = gone ? Date.now() - t0 : null;
      // the pipeline follows the row: his own filter is off within a moment
      const idle = gone ? await until(async () => { const s = await crew.ev(b, "lookState"); return s.F && !s.F.active ? s : null; }, 10000, 100) : null;
      await crew.say(b, gone ? `asked — my look dropped (${ms}ms after the ask reached me${idle ? ", pipeline off" : ", pipeline still up"})` : "asked — but my look is STILL on my row");
      await report(5, "the ask", !!gone && !!idle, gone ? `${b.spec.name}'s look dropped ${ms}ms after the ask, pick stays spent (${gone.row.filter_pick}); pipeline ${idle ? "off" : "STILL UP"}` : `${b.spec.name}'s row still says ${asked.id}`);
    }
  }

  const passed = results.filter((r) => r.pass).length;
  await say(`done: ${passed} of ${results.length} passed${passed < results.length ? " — failed: " + results.filter((r) => !r.pass).map((r) => r.n).join(", ") : ""}. How each look sat on a moving face is yours to call. "crew: done" when you're finished`);
  crew.log(`  looks: ${passed}/${results.length}`);
  return { results, passed, lens: lens ? lens.id : null };
}

function nameOf(rack, id) { const l = (rack || []).find((x) => x.id === id); return l ? l.name : id; }

module.exports = { runLooks };
