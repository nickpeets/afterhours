/* GATE 49 — stranger-copy: the first sixty seconds never hands a stranger the
 * operator's name or the database's vocabulary.  Ships with chore/stranger-copy.
 *
 * THE SYMPTOM, from the trial-night readiness assessment (rank 1.1).  A person
 * who has never seen this app arrives at a URL, is asked for a name and a zip,
 * and if that save fails the screen said:
 *
 *     "Save didn't stick (permissions?) — tell Nick."
 *
 * Fine among friends.  In front of five strangers it reads as *this is
 * somebody's half-built project and I am inside it*, which is the exact
 * impression a trial night cannot afford.  Two things are wrong with it and
 * they are separable: it names the operator, and it hands over the database's
 * own guess at the cause instead of the one thing the person can act on.
 *
 * WHAT THIS GATE HOLDS
 *   1. A UNIVERSAL NEGATIVE, and this is the one shape where a source
 *      assertion is the right tool rather than a compromise: the operator's
 *      name appears NOWHERE in a string a user can reach.  Runtime cannot
 *      prove an absence across every path; a source scan can, and it is the
 *      correct instrument for "this pattern appears nowhere" (METHOD rule 5).
 *      Deliberately scanned over the WHOLE file rather than a curated list of
 *      sites, so a new screen cannot quietly reintroduce it.
 *   2. RUNTIME, both failure branches of the first-run save, driven for real:
 *      a write that fails loudly, and a write that is accepted and never lands.
 *      Both must say what to DO, name nobody, and keep the raw reason in the
 *      console where the person debugging can still read it.
 *
 * Note on 2: this needed a fidelity fix rather than a gate trick.  The double's
 * fault injection covered RPCs only, so a gate wanting to see this message had
 * to grep for the string and hope.  `table()` now honours the same two modes —
 * { error } and { drop } — which is what makes this half a proof instead of a
 * second grep.  METHOD rule 9 is one branch away from here: an assertion over a
 * scene that never enters the path proves nothing, and "the string exists in
 * the source" is not the same claim as "the person sees it".
 */
"use strict";
const { Harness } = require("../lib/harness");

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 150));
  }
};

module.exports = {
  name: "stranger-copy",
  async run(t, ctx) {
    const html = ctx.html;

    /* ---------- 1. the universal negative ---------- */
    t.ok(!/tell Nick/i.test(html),
      "no screen tells a stranger to go and tell the operator by name — the phrase is gone from the FILE, not just from the one site that had it");

    /* Comments may name the owner — "Owner decision (Nick, 8/5)" is exactly the
       kind of provenance this repo wants kept.  What must never happen is the
       name reaching a user, so the scan is of the places text becomes visible:
       an assignment to textContent/innerHTML, or an argument to toast(). */
    const js = html.replace(/\/\*[\s\S]*?\*\//g, "").replace(/<!--[\s\S]*?-->/g, "");
    const visible = [];
    const sinks = /(?:\.textContent\s*=|\.innerHTML\s*=|toast\()\s*([^;]{0,400})/g;
    let m;
    while ((m = sinks.exec(js))) visible.push(m[1]);
    const named = visible.filter((v) => /\bNick\b/.test(v));
    t.ok(named.length === 0,
      `the operator's name reaches NO user-facing sink — ${visible.length} textContent/innerHTML/toast sites scanned, ${named.length} name him${named.length ? " → " + JSON.stringify(named[0].slice(0, 120)) : ""}`);

    t.ok(!/permissions\?/i.test(js),
      "no screen offers the database's guess at the cause — \"(permissions?)\" is not a thing a stranger can act on");

    const h = await Harness.launch();
    try {
      const D = h.double;
      /* A user with an account and NO zip is exactly the stranger in the first
         sixty seconds: signed in, and standing in front of the setup card. */
      const uid = D.addUser({ id: "u_new", name: "", email: "new@stranger.test" });
      if (D.profiles.get(uid)) D.profiles.set(uid, { id: uid });

      const boot = async (n) => {
        const c = await h.newClient(n); c.login(uid); await c.goto();
        await c.page.waitForSelector("#setup", { state: "visible", timeout: 15000 });
        return c;
      };
      const fill = async (c) => c.page.evaluate(() => {
        document.getElementById("set_name").value = "Sam";
        document.getElementById("set_zip").value = "10001";
        document.getElementById("set_err").textContent = "";
      });
      const readErr = async (c) => c.page.evaluate(() => document.getElementById("set_err").textContent || "");

      /* ---------- 2a. the write fails loudly ---------- */
      const loud = await boot("loud");
      await fill(loud);
      D.setFault("table:profiles.upsert", "loud", { error: "permission denied for table profiles" });
      await loud.page.evaluate(() => document.getElementById("set_go").click());
      const eLoud = await waitFor(async () => (await readErr(loud)) || null, 8000, "the failure message to appear");
      t.ok(!/nick/i.test(eLoud),
        `loud failure: the message names nobody — ${JSON.stringify(eLoud)}`);
      t.ok(!/permission|denied|table|rls|policy|jwt/i.test(eLoud),
        `loud failure: the database's own words never reach the screen — ${JSON.stringify(eLoud)}`);
      t.ok(/again/i.test(eLoud),
        `loud failure: the screen says what to DO, not what went wrong — ${JSON.stringify(eLoud)}`);
      t.ok(await loud.page.evaluate(() => getComputedStyle(document.getElementById("setup")).display !== "none"),
        "loud failure: he is still on the setup card with his answers in front of him, not thrown anywhere");
      /* Gate 21's rule, applied here: the raw reason is kept (it goes to the
         console for whoever is debugging) and it is nowhere a person can read.
         Asserted against the whole DOM rather than the one error element,
         because "it isn't in the field I looked at" is not the claim. */
      const domText = await loud.page.evaluate(() => document.body.innerText || "");
      t.ok(!/permission denied|for table profiles/i.test(domText),
        "loud failure: the raw database reason appears NOWHERE in the DOM, not just outside the error line");

      /* ---------- 2b. accepted, and it never landed ---------- */
      const quiet = await boot("quiet");
      await fill(quiet);
      D.setFault("table:profiles.upsert", "quiet", { drop: true });
      await quiet.page.evaluate(() => document.getElementById("set_go").click());
      const eQuiet = await waitFor(async () => (await readErr(quiet)) || null, 8000, "the didn't-stick message");
      t.ok(!/nick/i.test(eQuiet),
        `silent drop: the message names nobody — ${JSON.stringify(eQuiet)}`);
      t.ok(/again|once more/i.test(eQuiet),
        `silent drop: the screen gives him a next move — ${JSON.stringify(eQuiet)}`);
      t.ok(eQuiet !== eLoud,
        "the two failures say DIFFERENT things — a write that failed and a write that vanished are different diseases, and a stranger who taps Save twice should not read the same sentence twice");

      D.setFault("table:profiles.upsert", "quiet", null);
      D.setFault("table:profiles.upsert", "loud", null);

      const errs = [loud, quiet].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console ERRORS in both windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
