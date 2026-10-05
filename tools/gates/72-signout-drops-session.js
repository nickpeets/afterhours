/* GATE 72 — signout-drops-session: a sign-out that FAILS is never silent,
 * and a sign-out that REJECTS can no longer leave her signed in.
 *
 * PROVENANCE, labelled.  Forged 2026-09-30 against Nick's report: he signed
 * out as host, and the next visit signed him in without asking.  The line
 * this gate is aimed at was
 *     await sb.auth.signOut(); location.reload();
 * — a result nobody read, and a reload that only ran if the call resolved.
 *
 * THE BRIEF'S PREMISE WAS HALF WRONG, AND THE GATE SAYS SO.  The brief held
 * that supabase-js KEEPS the local session when the revoke fails with
 * anything but 401/403/404.  SOURCE (@supabase/auth-js 2.112.4, the pinned
 * version, GoTrueClient._signOut, read 2026-09-30): it does not — the local
 * session is removed before the error is returned.  So in scene 1 the
 * session is gone with or without the fix; what the fix adds there is that
 * the failure is NAMED and the local-scope call follows.  The case that
 * really kept her signed in is scene 2: the call REJECTS, the old handler
 * threw past its own reload, and she stayed exactly where she was.
 *
 * WHAT THE HARNESS FAKED (CONTRIBUTING): the double's signOut could not
 * fail, and the shim threw the scope away.  Both closed in this branch —
 * see the SIGN-OUT FIDELITY note in backend-double.js.
 *
 * What this gate holds:
 *   1. revoke REFUSED ({error}) — the failure is named in the console, the
 *      local-scope call follows the global one (authLog order), the session
 *      is gone, and she lands on the sign-in screen;
 *   2. global call REJECTS ({throw}) — the handler survives it, the
 *      local-scope call drops the session, the reload still runs;
 *   3. BOTH scopes reject — the reload STILL runs and both failures are
 *      named.  The session survives this one: that is a KNOWN RESIDUAL,
 *      noted, not asserted as acceptable (nothing short of purging storage
 *      by hand closes it, and that is not in this branch's scope);
 *   4. the delete-account path goes through the same function.
 */
"use strict";
const { Harness } = require("../lib/harness");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200)); } };

module.exports = {
  name: "signout-drops-session",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@so.test" });
      const host = await h.newClient("host");
      const signIn = async () => {
        host.login(hostU); await host.goto();
        await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        await host.page.evaluate(() => { window.__g72_marker = true; });   // dies with the document: proof of a reload
      };
      const signOuts = (from) => D.authLog.slice(from).filter((a) => a.clientId === "host" && a.op === "auth.signOut");
      const onAuthScreen = () => host.page.evaluate(() => {
        const a = document.getElementById("auth"), l = document.getElementById("lobby");
        return !!a && !a.classList.contains("hide") && getComputedStyle(a).display !== "none" &&
               (!l || getComputedStyle(l).display === "none");
      }).catch(() => false);
      const reloaded = () => host.page.evaluate(() => window.__g72_marker !== true && !!window.__lc).catch(() => false);

      /* ---- scene 1: the revoke is REFUSED ---- */
      await signIn();
      D.setFault("auth.signOut", "host", { error: "boom" });
      let a0 = D.authLog.length, l0 = host.logs.length;
      await host.page.evaluate(() => document.getElementById("signout").click());
      await waitFor(reloaded, 10000, "scene 1: the reload after a refused sign-out");
      const s1 = signOuts(a0);
      t.ok(s1.length === 2 && s1[0].scope === "global" && s1[1].scope === "local",
        `a refused sign-out is followed by the local-scope fallback (sign-out calls: ${JSON.stringify(s1.map((x) => x.scope))})`);
      t.ok(host.logs.slice(l0).some((l) => /signout: signOut failed:.*boom/.test(l.text)),
        "…and the failure is NAMED in the console — the result is read, not discarded");
      t.ok(!D.sessions.has("host"), "the session is gone");
      await waitFor(onAuthScreen, 10000, "scene 1: the sign-in screen");
      t.ok(await onAuthScreen(), "she lands on the sign-in screen, not back in the lobby");
      D.setFault("auth.signOut", "host", null);

      /* ---- scene 2: the global call REJECTS — the old handler died here ---- */
      await signIn();
      D.setFault("auth.signOut", "host", { throw: "net::ERR_CONN_RESET", scope: "global" });
      a0 = D.authLog.length; l0 = host.logs.length;
      await host.page.evaluate(() => document.getElementById("signout").click());
      await waitFor(reloaded, 10000, "scene 2: the reload after a REJECTED sign-out (the old handler threw past it)");
      t.ok(true, "a rejected sign-out no longer skips the reload");
      const s2 = signOuts(a0);
      t.ok(s2.length === 2 && s2[0].scope === "global" && s2[1].scope === "local",
        `the rejected global attempt is followed by the local one (sign-out calls: ${JSON.stringify(s2.map((x) => x.scope))})`);
      t.ok(host.logs.slice(l0).some((l) => /signout: signOut failed:.*ERR_CONN_RESET/.test(l.text)),
        "the rejection is named in the console");
      t.ok(!D.sessions.has("host"),
        "THE SESSION IS GONE — the local-scope fallback dropped what the rejected call left behind");
      await waitFor(onAuthScreen, 10000, "scene 2: the sign-in screen");
      t.ok(await onAuthScreen(), "she lands on the sign-in screen — no silent sign-back-in on the next visit");
      t.ok(!host.errors.some((e) => /ERR_CONN_RESET/.test(e)),
        "…and the rejection did not escape as an uncaught page error");
      D.setFault("auth.signOut", "host", null);

      /* ---- scene 3: BOTH scopes reject — the reload still runs ---- */
      await signIn();
      D.setFault("auth.signOut", "host", { throw: "net::ERR_CONN_RESET" });
      a0 = D.authLog.length; l0 = host.logs.length;
      await host.page.evaluate(() => document.getElementById("signout").click());
      await waitFor(reloaded, 10000, "scene 3: the reload when both sign-out scopes reject");
      const l3 = host.logs.slice(l0);
      t.ok(signOuts(a0).length === 2 &&
           l3.some((l) => /signout: signOut failed:/.test(l.text)) &&
           l3.some((l) => /signout: local-scope signOut threw:/.test(l.text)),
        "both scopes rejecting: two attempts, both named, and the handler still reaches its reload");
      t.note("KNOWN RESIDUAL (scene 3): when BOTH sign-out scopes reject, the session survives (double session present: " +
        D.sessions.has("host") + ").  Closing it means purging the storage key by hand — not in this branch.");
      D.setFault("auth.signOut", "host", null);

      /* ---- scene 4: the delete-account path is the same function ---- */
      t.ok(/sb\.rpc\("delete_my_account"\)[\s\S]{0,400}authBeginSignOut\(\);\s*await signOutForSure\(\);/.test(ctx.html),
        "source pin: the delete-account path signs out through signOutForSure(), not a bare swallowed signOut");
      t.ok((ctx.html.match(/sb\.auth\.signOut\(/g) || []).length === 2,
        "…and signOutForSure is the ONLY place sb.auth.signOut is called (global + local-scope fallback: 2 call sites)");
      if (!D.sessions.has("host")) { host.login(hostU); }
      await host.goto();
      await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      D.setFault("auth.signOut", "host", { throw: "net::ERR_CONN_RESET", scope: "global" });
      a0 = D.authLog.length;
      const ret = await host.page.evaluate(() => window.__lc.signOutForSure());
      const s4 = signOuts(a0);
      t.ok(ret === false && s4.length === 2 && s4[1].scope === "local" && !D.sessions.has("host"),
        `signOutForSure() itself: never throws, reports the failure (returned ${ret}), falls back to local, session gone`);
      D.setFault("auth.signOut", "host", null);
    } finally { await h.close(); }
  },
};
