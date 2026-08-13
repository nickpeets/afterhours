/* GATE 55 — rescind-truth: a retraction that fails must not pretend it took.
 * RED ON PURPOSE against today's build.
 *
 * PROVENANCE, labelled.  Forged 2026-08-13 against the rpc census's
 * strand-risk (e), ranked second by the conductor despite rarity, verbatim:
 * "A stranded row is a bug.  A rescind that silently fails is a RETRACTION
 * THAT DIDN'T TAKE — contact info a user explicitly withdrew can still be
 * revealed to the other side later.  That is a promise broken to someone who
 * took an action specifically to prevent it, and they have no way to know it
 * failed."
 *
 * The site: $("bsd_skip").onclick — "Leave it here" after an offer:
 *
 *     if(BSD_OFFERED){ try{ await sb.rpc("rescind_swap",…); }catch(e){} }
 *     bsGoodnight(null);
 *
 * The catch can only see network THROWS; a server refusal arrives as a
 * resolved {error} and is DISCARDED, and bsGoodnight exits regardless.  The
 * user walks out believing their number is withdrawn while the offer stays
 * live server-side — if the other side offers inside their own window, the
 * "withdrawn" contact reveals anyway.
 *
 * What this gate holds:
 *   1. the rescind is RETRIED (bounded) — one transient failure does not
 *      break a retraction;
 *   2. a terminal failure is LOUD and the exit DOES NOT PROCEED in silence:
 *      either the offer is truly gone from the store, or the user is still
 *      in the decision layer with a message telling them the withdrawal did
 *      not take.  Leaving-with-a-live-offer-in-silence is the one end state
 *      made unreachable;
 *   3. the console names the failing call;
 *   4. when the server answers, the same tap rescinds and says goodnight —
 *      the fix must not make a working retraction stickier.
 *
 * PRODUCT NOTE, handed up rather than decided here (conductor to rule): the
 * OFFER-CLOCK TIMEOUT path (bsGoodnight on left<=0) exits with a live offer
 * and NO rescind at all, by construction.  Whether timeout-with-
 * unreciprocated-offer should rescind is a product decision about what the
 * offer means after the window closes; this gate deliberately does not
 * assert it either way.
 */
"use strict";
const { Harness } = require("../lib/harness");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200)); } };

module.exports = {
  name: "rescind-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@res.test" });
      D.addUser({ id: "u_win", name: "Winner" });
      const w = await h.newClient("winner"); w.login("u_win"); await w.goto();
      await w.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
      const room = D.addRoom({ id: "r_res", host_id: hostU, name: "Res", phase: "deciding", round: 3 });
      D.rooms.get(room).winner_id = "u_win";
      D.addMember(room, "u_win", "kept");
      D.memberRow(room, "u_win").seat_index = 0;
      await w.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
      await w.page.waitForSelector("#room.show", { timeout: 10000 });
      await w.page.evaluate(() => window.__lc.enterBackstage("u_win", "Winner"));
      await w.page.waitForTimeout(600);
      await w.page.evaluate(() => window.__lc.bsEnterDecision("callclock"));
      await waitFor(() => w.page.evaluate(() => window.__lc.BS_STATE.phase === "deciding"), 8000,
        "the decision layer");

      /* he offers his number */
      await w.page.evaluate(() => {
        document.querySelector('#bsd_chips .ctypechip[data-t="Phone"]').click();
        document.getElementById("bsd_val").value = "503-555-0142";
        document.getElementById("bsd_offer").click();
      });
      await waitFor(() => Promise.resolve((D.swaps[room] || {})["u_win"] != null), 5000,
        "the offer to land in the store");

      /* ---- scene 1: he takes it back, and the server refuses every time ---- */
      D.setFault("rescind_swap", "winner", { error: "boom: rescind unavailable" });
      const rescinds = () => (D.rpcLog || []).filter((r) => r.clientId === "winner" && r.name === "rescind_swap").length;
      const r0 = rescinds();
      await w.page.evaluate(() => document.getElementById("bsd_skip").click());
      await waitFor(() => w.page.evaluate(() => !document.getElementById("bsd_skip").disabled), 10000,
        "the retry loop to finish and re-arm the button");
      await w.page.waitForTimeout(300);

      t.ok(rescinds() - r0 >= 2,
        `a failed retraction is RETRIED, not attempted once and forgotten (rescind_swap attempts: ${rescinds() - r0})`);

      const after = await w.page.evaluate(() => ({
        deciding: document.getElementById("bsdecide").classList.contains("show"),
        backstage: document.getElementById("backstage").classList.contains("show"),
        status: (document.getElementById("bsd_status").textContent || "").trim(),
        toast: (document.getElementById("toast").textContent || "").trim(),
      }));
      const stillStored = (D.swaps[room] || {})["u_win"] != null;
      t.ok(!stillStored || ((after.status.length > 0 || after.toast.length > 0) && after.deciding),
        `A RETRACTION NEVER FAILS IN SILENCE: either the offer is truly gone from the store, or he is still standing in the decision layer being TOLD it didn't take (stored=${stillStored}, deciding=${after.deciding}, status=${JSON.stringify(after.status)}, toast=${JSON.stringify(after.toast)})`);
      t.ok(w.logs.some((l) => /rescind/.test(l.text)),
        "…and the console names the failing call for whoever debugs it");

      /* ---- scene 2: the server answers, the same tap works ---- */
      D.setFault("rescind_swap", "winner", null);
      await w.page.evaluate(() => document.getElementById("bsd_skip").click());
      await waitFor(() => Promise.resolve((D.swaps[room] || {})["u_win"] == null), 8000,
        "the retraction to actually take");
      t.ok((D.swaps[room] || {})["u_win"] == null,
        "with the server answering, the offer is genuinely withdrawn");
      await waitFor(() => w.page.evaluate(() =>
        !document.getElementById("backstage").classList.contains("show")), 8000,
        "goodnight to proceed once the retraction took");
      t.ok(true, "…and goodnight proceeds — a working retraction is no stickier than before");
    } finally { await h.close(); }
  },
};
