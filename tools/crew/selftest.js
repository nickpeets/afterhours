/* selftest.js — `crew --scenario combos`: PR C's phone test, run by the crew
 * against production with Nick hosting from his phone.
 *
 * The bots do the throwing and the checking; Nick does what only the host
 * can (seat the men, ask, skip, make her call).  Every step reports one
 * line in chat (✅ / ❌ and why) and the terminal, and a summary at the end.
 * The crew then keeps taking orders until "crew: done".
 *
 * The checks read what the server answered (throwAt's reply, the ration
 * counts) and what a CROWD phone shows (window.__lc.COMBO_ROOM /
 * PRESSURE_ROOM / THROW_ROOM, the BOOED OFF tile, the ovation card).  What
 * only Nick's phone can show — the "room is booing" nudge, and how it all
 * looks — he is asked to look at.
 *
 *   1  the join: a second crowd member's cheer while one is live joins it
 *      (×2), and the art does not restart
 *   2  the ovation: a third makes a STANDING OVATION, every crowd phone
 *      shows it, and +1 heart lands with no sender
 *   3  the refusals: the same thrower again, and the other polarity, are
 *      refused and cost nothing
 *   4  booed off: three jeers put BOOED OFF over his tile on a crowd phone,
 *      no crowd phone gets the host's nudge, his frame is at 3 cracks
 *   5  the reaction window: after his answer ends, a rose counts double
 *   6  the crown: after her call he wears it, and a jeer is refused (uncharged)
 */
"use strict";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function runCombos(crew, opts = {}) {
  const wait = opts.waitMs || 15 * 60 * 1000;   // how long a step waits for Nick
  const say = (t) => crew.say(crew.ear, "selftest · " + t);
  const dex = crew.bot("Dex"), marco = crew.bot("Marco"), leo = crew.bot("Leo");
  const throwers = [...crew.crowd, ...(leo && leo.parked ? [leo] : [])].slice(0, 3);
  const results = [];
  const report = async (n, name, pass, note) => {
    results.push({ n, name, pass: !!pass, note });
    crew.log(`  selftest ${n} ${name}: ${pass ? "PASS" : "FAIL"} — ${note}`);
    await say(`${pass ? "✅" : "❌"} ${n} ${name}: ${note}`);
  };
  if (!dex || throwers.length < 3) {
    await say(`needs Dex and three throwers; have ${throwers.map((b) => b.spec.name).join(", ") || "none"}`);
    return { results, aborted: "not enough bots" };
  }
  const [T1, T2, T3] = throwers;
  const role = (b) => (b && b.st && b.st.role) || null;
  const until = async (fn, ms, step = 500) => {
    const t0 = Date.now();
    while (Date.now() - t0 < ms && !crew.stopped) { try { const v = await fn(); if (v) return v; } catch (e) {} await sleep(step); }
    return null;
  };
  const probe = () => crew.ev(crew.ear, "probe", dex.uid);
  const hit = (b, kind) => crew.ev(b, "throwAt", dex.uid, kind).catch((e) => ({ ok: false, error: String(e) }));
  const counts = (b) => crew.ev(b, "countsNow");
  const free = () => until(async () => { const p = await probe(); return p.throwSt && !p.throwSt.live && !p.throwSt.cooling; }, 90000, 1000);
  const same = (a, b) => !!a && !!b && a.cheers_left === b.cheers_left && a.jeers_left === b.jeers_left;

  await say(`combos test. Seat Dex and Marco (you'll pass Marco at your call). Throwers: ${throwers.map((b) => b.spec.name).join(", ")}`);
  if (!(await until(() => role(dex) === "chair", wait))) { await say("Dex was never seated — stopping the test"); return { results, aborted: "Dex not seated" }; }
  await say("Dex is seated — starting");
  if (!(await free())) await say("Dex still has a throw on him; going anyway");

  /* 1 the join */
  const since = await crew.ev(crew.ear, "serverIso");
  const r1 = await hit(T1, "confetti");
  const p0 = await until(async () => { const p = await probe(); return p.throwSt && p.throwSt.live ? p : null; }, 5000, 250);
  const r2 = await hit(T2, "sparkle");
  const p1 = await until(async () => { const p = await probe(); return p.throwSt && p.throwSt.n >= 2 ? p : null; }, 4000, 250);
  await report(1, "join", r1.ok && r2.ok && r2.joined && r2.n === 2 && p0 && p1 && p1.throwSt.at === p0.throwSt.at && p1.throwSt.kind === "confetti",
    !r1.ok ? `first throw refused: ${r1.error}` : !r2.ok ? `second throw refused: ${r2.error}`
      : `${T2.spec.name} joined ${T1.spec.name}'s confetti → ×${r2.n}` + (p1 && p0 && p1.throwSt.at === p0.throwSt.at ? ", art didn't restart" : ", BUT the art restarted or the count didn't reach the crowd"));
  const c1 = await counts(T1), c2 = await counts(T2);

  /* 2 the ovation */
  const r3 = await hit(T3, "hearts");
  const ovOn = await until(async () => (await probe()).ovationOn, 5000, 250);
  const nobody = await until(async () => (await crew.ev(crew.ear, "ovationHearts", dex.uid, since)) >= 1, 6000, 500);
  await report(2, "ovation", r3.ok && r3.combo && ovOn && nobody,
    !r3.ok ? `third cheer refused: ${r3.error}`
      : `combo ${r3.combo ? "fired" : "did NOT fire"}; card ${ovOn ? "showed" : "did NOT show"} on ${crew.ear.spec.name}'s phone; ${nobody ? "+1 heart with no sender" : "no sender-less heart found"}`);

  /* 3 the refusals */
  const r4 = await hit(T1, "petals");     // same thrower again
  const r5 = await hit(T2, "tomato");     // the other polarity while a cheer is live
  const c1b = await counts(T1), c2b = await counts(T2);
  await report(3, "refusals", !r4.ok && !r5.ok && same(c1, c1b) && same(c2, c2b),
    `same thrower: ${r4.ok ? "ACCEPTED" : "refused (" + r4.error + ")"}; jeer during a cheer: ${r5.ok ? "ACCEPTED" : "refused (" + r5.error + ")"}; rations ${same(c1, c1b) && same(c2, c2b) ? "untouched" : "CHARGED"}`);

  /* 4 booed off */
  await say("waiting for Dex's cooldown (~30s)…");
  await free();
  const pre = await probe();
  if (pre.crown === dex.uid) await say("note: Dex wears the crown, so these jeers will be refused");
  const r6 = await hit(T1, "tomato"); await sleep(400);
  const r7 = await hit(T2, "pie"); await sleep(400);
  const r8 = await hit(T3, "boo");
  const booed = await until(async () => (await probe()).booedTile, 5000, 250);
  const pb = await probe();
  const crowdNudged = (await Promise.all(throwers.map((b) => crew.ev(b, "probe", dex.uid)))).some((p) => p.nudges > 0);
  await report(4, "booed off", r6.ok && r7.ok && r8.ok && r8.combo && booed && !crowdNudged && pb.cracks === 3,
    [r6, r7, r8].some((r) => !r.ok) ? `a jeer was refused: ${[r6, r7, r8].filter((r) => !r.ok).map((r) => r.error).join(" / ")}`
      : `banner ${booed ? "showed" : "did NOT show"} on a crowd phone; crowd nudged: ${crowdNudged ? "YES (wrong)" : "no"}; cracks ${pb.cracks}/3. Your phone should have said "The room is booing Dex"`);

  /* 5 the reaction window */
  await say("now ASK Dex a question, then skip (or let his clock run out)");
  const win = await until(async () => { const p = await probe(); return p.react && p.react.uid === dex.uid ? p : null; }, wait, 300);
  if (!win) { await report(5, "reaction window", false, "his window never opened"); }
  else {
    const r9 = await hit(T1, "petals");
    const after = await until(async () => { const p = await probe(); return p.cracks !== win.cracks ? p : null; }, 4000, 250) || await probe();
    await report(5, "reaction window", r9.ok && r9.counted === 2 && after.cracks === Math.max(0, win.cracks - 2),
      !r9.ok ? `rose refused: ${r9.error}` : `rose counted ×${r9.counted}; cracks ${win.cracks} → ${after.cracks}`);
  }

  /* 6 the crown */
  for (const b of throwers) { await crew.ev(b, "heart", dex.uid); await sleep(250); }
  await say("last one: get to your call and PASS Marco, not Dex. Dex leads on hearts, so he takes the crown");
  const crowned = await until(async () => (await probe()).crown === dex.uid, wait, 1000);
  if (!crowned) { await report(6, "crown", false, "Dex never got the crown"); }
  else {
    const jeerer = [T2, T3, T1][0];
    const cb = await counts(jeerer);
    const r10 = await hit(jeerer, "tomato");
    const ca = await counts(jeerer);
    await report(6, "crown", !r10.ok && /crown/.test(r10.error || "") && same(cb, ca),
      r10.ok ? "a jeer LANDED on the crowned man" : `jeer refused (${r10.error}); ration ${same(cb, ca) ? "untouched" : "CHARGED"}`);
  }

  const passed = results.filter((r) => r.pass).length;
  await say(`done: ${passed} of ${results.length} passed${passed < results.length ? " — failed: " + results.filter((r) => !r.pass).map((r) => r.n).join(", ") : ""}. "crew: done" when you're finished`);
  crew.log(`  selftest: ${passed}/${results.length}`);
  return { results, passed };
}

module.exports = { runCombos };
