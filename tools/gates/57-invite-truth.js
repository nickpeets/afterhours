/* GATE 57 — invite-truth: "you're on the list now" must be TRUE when said.
 * RED ON PURPOSE against today's build.
 *
 * PROVENANCE, labelled.  Forged 2026-08-13 against the rpc census's
 * strand-risk (f): the invite-only refusal path captures the knock —
 *
 *     try{ await sb.rpc("request_invite",{email_in:email}); }catch(e){}
 *     err.textContent="This pilot is invite-only — you're on the list now. …"
 *
 * — with the result swallowed (the catch sees only network throws; a
 * resolved {error} is discarded) and the copy UNCONDITIONAL.  A stranger
 * knocks, the knock is silently lost, and the screen tells them they are on
 * a list they never reached.  They will wait for doors that were never
 * going to open for them.  This is the smallest site in the census and the
 * purest form of the defect: the message IS the product here, and it lies.
 *
 * What this gate holds:
 *   1. the knock is RETRIED (bounded) — one transient failure does not lose
 *      a stranger;
 *   2. the copy tells the truth in both worlds: knock landed → "on the
 *      list"; knock failed every retry → says it DIDN'T take and to try
 *      again — never a list-membership claim over a lost knock;
 *   3. the console names the failing call;
 *   4. with the server answering, the same submit lands the knock and says
 *      "on the list" honestly.
 */
"use strict";
const { Harness } = require("../lib/harness");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200)); } };

module.exports = {
  name: "invite-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const c = await h.newClient("c");          // never logs in: a stranger at the door
      await c.goto();
      await c.page.waitForSelector("#authwrap, #loginPanel, #signupPanel", { timeout: 15000 });

      const knocks = () => (D.rpcLog || []).filter((r) => r.clientId === "c" && r.name === "request_invite").length;
      const errText = () => c.page.evaluate(() => (document.getElementById("su_err").textContent || "").trim());
      const submit = () => c.page.evaluate(() => {
        const tab = document.getElementById("tab_signup"); if (tab) tab.click();
        document.getElementById("su_email").value = "stranger@knock.test";
        document.getElementById("su_pass").value = "letmein99";
        const agree = document.getElementById("su_agree"); if (agree) agree.checked = true;
        document.getElementById("su_go").click();
      });

      D.setFault("auth.signUp", "c", { error: "not invited to this pilot" });

      /* ---- scene 1: the knock itself fails, every time ---- */
      D.setFault("request_invite", "c", { error: "boom: request_invite unavailable" });
      const k0 = knocks();
      await submit();
      await waitFor(async () => Promise.resolve(knocks() - k0 >= 1), 10000, "the refusal to knock");
      await c.page.waitForTimeout(3000);

      t.ok(knocks() - k0 >= 2,
        `a lost knock is RETRIED, not dropped on the floor (request_invite attempts: ${knocks() - k0})`);
      const msg1 = await errText();
      t.ok(!/on the list/i.test(msg1) && msg1.length > 0,
        `THE COPY NEVER CLAIMS A LIST THE KNOCK NEVER REACHED: when every retry failed, the screen says it didn't take, not "you're on the list now" (msg=${JSON.stringify(msg1)})`);
      t.ok(c.logs.some((l) => /request_invite/.test(l.text)),
        "…and the console names the failing call");

      /* ---- scene 2: the server answers — the same submit lands and says so ---- */
      D.setFault("request_invite", "c", null);
      const k1 = knocks();
      await submit();
      await waitFor(async () => Promise.resolve(knocks() - k1 >= 1), 10000, "the second knock");
      await waitFor(async () => /on the list/i.test(await errText()), 6000,
        "the honest on-the-list copy");
      t.ok(/on the list/i.test(await errText()),
        "with the server answering, the knock lands and \"on the list\" is finally true when said");
      D.setFault("auth.signUp", "c", null);
    } finally { await h.close(); }
  },
};
