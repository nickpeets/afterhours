/* GATE 42 — session-life: a session that dies mid-app says so.
 *
 * Reproduced on prod under observation (wave 9 item 5), 2026-08-10:
 *   17:04  host signs in.  Access token good for 3600s, expiry ~17:56.
 *   17:14  tab hidden.  Stays hidden.
 *   ~17:56 the refresh is due.  A backgrounded tab throttles the timer
 *          that would run it.
 *   18:23  the supabase-js storage key is GONE — surgically, only that
 *          key; ten unrelated slot keys beside it untouched — and the app
 *          is signed out.  Nothing was ever logged, because the auth
 *          listener handled exactly one event and it was PASSWORD_RECOVERY.
 * A host would have discovered this when a write started 401ing, live.
 *
 * Proven here:
 *   - STATIC: the listener handles TOKEN_REFRESHED and SIGNED_OUT, and
 *     checkSessionAlive never calls enterApp (a liveness probe must not
 *     re-render a show in progress).
 *   - TOKEN_REFRESHED records the new expiry and says how long is left.
 *   - SIGNED_OUT we did NOT ask for, with the session genuinely gone →
 *     verdict "dropped", the sign-in screen comes back up, and the notice
 *     says she was signed out while away.  This is the prod failure.
 *   - SIGNED_OUT we DID ask for → quiet.  No notice, no alarm.
 *   - a spurious SIGNED_OUT while the session is in fact fine → the app
 *     stays up.  One event must not evict a working host.
 *   - returning to the front with an expired token re-checks it; with a
 *     healthy token it does not (no probe storm on every tab switch).
 */
"use strict";
const { Harness } = require("../lib/harness");

const show = (c) => c.page.evaluate(() => ({
  verdict: window.__lc.LAST_RESTORE,
  authUp: !document.getElementById("auth").classList.contains("hide"),
  notice: (document.getElementById("authnotice") || {}).textContent || "",
  expires: window.__lc.SESSION_EXPIRES_AT,
}));

module.exports = {
  name: "session-life",
  async run(t, ctx) {
    /* ---------- STATIC ---------- */
    const js = ctx.html.replace(/\/\*[\s\S]*?\*\//g, "");
    t.ok(/event==="TOKEN_REFRESHED"/.test(js), "the auth listener handles TOKEN_REFRESHED");
    t.ok(/event==="SIGNED_OUT"/.test(js), "the auth listener handles SIGNED_OUT");
    t.ok(/addEventListener\("visibilitychange"/.test(js), "coming back to the front is a checkpoint");
    const csa = js.match(/async function checkSessionAlive\(\)\{[\s\S]*?\n\}/);
    t.ok(!!csa && !/enterApp\(/.test(csa[0]),
      "checkSessionAlive never re-enters the app — a liveness probe must not re-render a live show");

    const h = await Harness.launch();
    try {
      const D = h.double;
      const uid = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      const boot = async (name) => {
        const c = await h.newClient(name); c.login(uid);
        await c.goto();
        await c.page.waitForFunction(() => document.getElementById("auth").classList.contains("hide"), null, { timeout: 15000 });
        return c;
      };

      /* ---------- the expiry is tracked at all ---------- */
      const live = await boot("live");
      const booted = await show(live);
      t.ok(booted.verdict === "session" && !booted.authUp, "signed in and inside the app");

      /* ---------- TOKEN_REFRESHED ---------- */
      await live.page.evaluate(() => window.__authEmit("TOKEN_REFRESHED",
        { access_token: "tok2", expires_at: Math.floor(Date.now() / 1000) + 3600 }));
      const refreshed = await show(live);
      t.ok(refreshed.expires && refreshed.expires > Math.floor(Date.now() / 1000) + 3000,
        "TOKEN_REFRESHED records the new expiry");
      t.ok(live.logs.some((l) => /^\[auth\] token refreshed/.test(l.text)),
        "TOKEN_REFRESHED is said out loud — the successful case was silent too");
      t.ok(!refreshed.authUp, "a refresh does not disturb the app");

      /* ---------- a spurious SIGNED_OUT must not evict a working host ---------- */
      await live.page.evaluate(() => window.__authEmit("SIGNED_OUT", null));
      await live.page.waitForTimeout(300);
      const spurious = await show(live);
      t.ok(!spurious.authUp && spurious.verdict === "session",
        "SIGNED_OUT with the session actually fine → the app stays up (one event does not evict a host)");

      /* ---------- THE PROD FAILURE: signed out, nobody asked ---------- */
      const drop = await boot("drop");
      D.sessions.delete("drop");                       // supabase-js cleared its key
      await drop.page.evaluate(() => window.__authEmit("SIGNED_OUT", null));
      await drop.page.waitForFunction(() => window.__lc.LAST_RESTORE === "dropped", null, { timeout: 15000 });
      const dropped = await show(drop);
      t.ok(dropped.verdict === "dropped", `involuntary sign-out gets its own verdict (got ${dropped.verdict})`);
      t.ok(dropped.authUp, "the sign-in screen comes back — the app stops running on credentials it no longer holds");
      t.ok(/while you were away/.test(dropped.notice),
        "the notice says what happened rather than pretending she chose it — " + JSON.stringify(dropped.notice));
      t.ok(dropped.expires === null, "the stale expiry is cleared");
      t.ok(drop.logs.some((l) => /^\[auth\] SIGNED_OUT and nobody asked/.test(l.text)),
        "the failure is logged AT THE MOMENT IT HAPPENS — the whole defect was that it wasn't");

      /* ---------- a sign-out we asked for is quiet ---------- */
      const bye = await boot("bye");
      await bye.page.evaluate(() => { window.__lc.authBeginSignOut(); window.__authEmit("SIGNED_OUT", null); });
      await bye.page.waitForTimeout(300);
      const said = await show(bye);
      t.ok(said.verdict === "session" && !said.notice,
        "a deliberate sign-out raises no alarm — it is not a failure");
      t.ok(bye.logs.some((l) => /^\[auth\] signed out, as asked/.test(l.text)), "and it is still logged, plainly");

      /* ---------- coming back to the front ---------- */
      const front = await boot("front");
      const probesBefore = () => D.authLog.filter((a) => a.clientId === "front" && a.op === "auth.getSession").length;
      const n0 = probesBefore();
      await front.page.evaluate(() => {
        window.__lc.noteSession({ expires_at: Math.floor(Date.now() / 1000) + 3600 });   // healthy
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await front.page.waitForTimeout(300);
      t.ok(probesBefore() === n0, "a healthy token is not re-probed on every tab switch");
      await front.page.evaluate(() => {
        window.__lc.noteSession({ expires_at: Math.floor(Date.now() / 1000) - 5 });      // expired while hidden
        document.dispatchEvent(new Event("visibilitychange"));
      });
      await front.page.waitForFunction(() => true, null, { timeout: 5000 });
      await front.page.waitForTimeout(400);
      t.ok(probesBefore() > n0,
        "an expired token IS re-checked the moment she is back in front — before her next write, not after it 401s");
      t.ok(front.logs.some((l) => /^\[auth\] back in front/.test(l.text)), "and the check says why it ran");

      const errs = [live, drop, bye, front].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors across every session-life path — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
