/* GATE 40 — session-restore: the boot path names what happened to you.
 *
 * The bug (wave 9 item 2).  Boot was:
 *
 *     const {data:{session}}=await sb.auth.getSession();
 *     if(session){ enterApp(); }
 *
 * No else.  `error` never destructured.  A transport failure rejecting
 * into an async IIFE nobody awaited.  So a visitor who is genuinely
 * signed out, a refresh token the server refused, and a network that
 * never answered all landed on the SAME silent sign-in screen, with
 * nothing written to the console to tell them apart afterwards.  And
 * this is the same path a host's reload runs mid-show — which is why
 * "my phone threw me out of my own show" was pixel-identical to "you
 * are signed out".
 *
 * One layer down, enterApp() had the same hole: `if(!user){return;}`
 * returned into nothing when getUser could not confirm the session.
 *
 * Proven here:
 *   - STATIC: the else-less pattern is gone; restoreSession catches a
 *     rejection and keeps `error`; enterApp no longer bare-returns.
 *   - signed out            → verdict "signed-out", sign-in screen, NO notice
 *                             (the sign-in screen is the correct answer and
 *                             must not be dressed up as a failure).
 *   - server refuses        → verdict "expired", show-language notice, no
 *                             retry affordance (the form below IS the way
 *                             back), raw reason in the console and NOWHERE
 *                             in the DOM (gate 21's rule).
 *   - nothing answers       → verdict "unreachable", notice says you may
 *                             still be signed in, retry affordance present,
 *                             and EXACTLY ONE automatic retry happened.
 *   - Try again, fault gone → the app opens.  A hiccup costs a tap, not a
 *                             password.  (The host-reload recovery, in
 *                             miniature.)
 *   - getUser refuses after a good getSession → still classified, still
 *                             said out loud; never a blank screen.
 *   - the three worlds render three DIFFERENT screens.  That is the whole
 *     point of the fix, so it is asserted directly.
 */
"use strict";
const { Harness } = require("../lib/harness");

const sig = (s) => [s.verdict, s.notice ? "notice" : "-", s.retry ? "retry" : "-"].join("/");

module.exports = {
  name: "session-restore",
  async run(t, ctx) {
    /* ---------- STATIC: the shape of the boot path ----------
       Comments are stripped first, deliberately: the fix QUOTES the old
       pattern in the comment that explains why it died, and a static check
       that cannot tell code from commentary would either fail on a correct
       file or force the explanation out of the source. */
    const js = ctx.html.replace(/\/\*[\s\S]*?\*\//g, "");
    t.ok(/\(async\(\)=>\{\s*await restoreSession\(\);\s*\}\)\(\);/.test(js),
      "boot goes through restoreSession() — one door, and it is awaited");
    t.ok(!/if\(session\)\{\s*enterApp\(\);\s*\}/.test(js),
      "the else-less `if(session){ enterApp(); }` boot pattern is gone from the CODE");
    const rs = js.match(/async function restoreSession\([\s\S]*?\n\}/);
    t.ok(!!rs && /catch\(e\)\{/.test(rs[0]),
      "restoreSession catches a REJECTED getSession — a transport failure is not an unhandled rejection");
    t.ok(!!rs && /r\.error/.test(rs[0]),
      "restoreSession keeps `error` instead of destructuring past it");
    const ea = js.match(/async function enterApp\(\)\{[\s\S]*?\n  ME=user;/);
    t.ok(!!ea && !/if\(!user\)\{return;\}/.test(ea[0]),
      "enterApp no longer bare-returns when getUser cannot confirm the session");

    const h = await Harness.launch();
    try {
      const D = h.double;
      const uid = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });

      const read = (c) => c.page.evaluate(() => ({
        verdict: window.__lc.LAST_RESTORE,
        notice: (document.getElementById("authnotice") || {}).textContent || "",
        retry: !!document.getElementById("authretry"),
        authUp: !document.getElementById("auth").classList.contains("hide"),
        raw: document.body.innerText || "",
      }));

      /* ---------- 1. genuinely signed out ---------- */
      const out = await h.newClient("out");
      await out.goto();
      await out.page.waitForSelector("#auth", { timeout: 15000 });
      await out.page.waitForFunction(() => window.__lc.LAST_RESTORE !== null, null, { timeout: 15000 });
      const sOut = await read(out);
      t.ok(sOut.verdict === "signed-out", `signed out: verdict is "signed-out" (got ${sOut.verdict})`);
      t.ok(sOut.authUp, "signed out: the sign-in screen is up");
      t.ok(!sOut.notice, "signed out: NO notice — being signed out is not a failure to apologise for");

      /* ---------- 2. the server answered and refused ---------- */
      const exp = await h.newClient("exp"); exp.login(uid);
      D.setFault("auth.getSession", "exp", { error: "refresh_token_not_found" });
      await exp.goto();
      await exp.page.waitForSelector("#authnotice", { timeout: 15000 });
      const sExp = await read(exp);
      t.ok(sExp.verdict === "expired", `refused: verdict is "expired" (got ${sExp.verdict})`);
      t.ok(sExp.authUp, "refused: the sign-in screen is up");
      t.ok(/[Ss]ign in/.test(sExp.notice), "refused: the notice names signing in as the way back — " + JSON.stringify(sExp.notice));
      t.ok(!sExp.retry, "refused: no Try-again affordance — retrying a dead refresh token only stalls");
      t.ok(!/refresh_token_not_found/.test(sExp.raw), "refused: the raw reason is NOWHERE in the DOM (gate 21's rule)");
      t.ok(exp.logs.some((l) => /refresh_token_not_found/.test(l.text)),
        "refused: the raw reason IS in the console — the silence is what made this undiagnosable");

      /* ---------- 3. nothing answered at all ---------- */
      const net = await h.newClient("net"); net.login(uid);
      D.setFault("auth.getSession", "net", { throw: "net::ERR_CONN_RESET" });
      const before = D.authLog.filter((a) => a.clientId === "net" && a.op === "auth.getSession").length;
      await net.goto();
      await net.page.waitForSelector("#authretry", { timeout: 15000 });
      const sNet = await read(net);
      const tries = D.authLog.filter((a) => a.clientId === "net" && a.op === "auth.getSession").length - before;
      t.ok(sNet.verdict === "unreachable", `unreachable: verdict is "unreachable" (got ${sNet.verdict})`);
      t.ok(/still be signed in/.test(sNet.notice),
        "unreachable: the notice says the session may still be good — it does NOT claim you are signed out — " + JSON.stringify(sNet.notice));
      t.ok(sNet.retry, "unreachable: a Try-again affordance is offered");
      t.ok(tries === 2, `unreachable: exactly one automatic retry (${tries} getSession calls, expected 2)`);
      t.ok(!/ERR_CONN_RESET/.test(sNet.raw), "unreachable: the raw reason is NOWHERE in the DOM");
      t.ok(net.errors.length === 0,
        "unreachable: no unhandled rejection — the old IIFE swallowed the throw into a page error (" + net.errors.slice(0, 1).join("|") + ")");

      /* ---------- 4. Try again, once the network is back ---------- */
      D.setFault("auth.getSession", "net", null);
      await net.page.click("#authretry");
      await net.page.waitForFunction(() => document.getElementById("auth").classList.contains("hide"), null, { timeout: 15000 });
      const sBack = await read(net);
      t.ok(!sBack.authUp && sBack.verdict === "session",
        "recovered: Try again opens the app — a hiccup costs a tap, not a password");
      t.ok(!sBack.notice, "recovered: the notice is cleared on the way in");

      /* ---------- 5. the same hole one layer down: getUser ---------- */
      const gu = await h.newClient("gu"); gu.login(uid);
      D.setFault("auth.getUser", "gu", { error: "JWT expired" });
      await gu.goto();
      await gu.page.waitForSelector("#authnotice", { timeout: 15000 });
      const sGu = await read(gu);
      t.ok(sGu.verdict === "expired" && sGu.authUp,
        `getUser refused: classified rather than blank (verdict ${sGu.verdict})`);
      t.ok(!!sGu.notice && !/JWT expired/.test(sGu.raw),
        "getUser refused: said in show language, raw reason kept out of the DOM");
      t.ok(gu.logs.some((l) => /JWT expired/.test(l.text)), "getUser refused: raw reason in the console");
      D.setFault("auth.getUser", "gu", null);

      /* ---------- 6. three worlds, three screens ---------- */
      const sigs = [sig(sOut), sig(sExp), sig(sNet)];
      t.ok(new Set(sigs).size === 3,
        "the three outcomes render three DIFFERENT screens — " + sigs.join("  vs  "));

      const errs = [out, exp, net, gu].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across every restore path — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
