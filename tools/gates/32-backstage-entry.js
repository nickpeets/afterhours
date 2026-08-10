/* GATE 32 — backstage-entry: the winner's room opens for BOTH parties on
 * mobile, its tiles mean JOINED participants, and the private-time clock
 * waits for both.  Ships with fix/backstage-entry.
 *
 * Live findings (b0809.1348, screenshots): after her call the winner's
 * desktop entered backstage and saw a TILE for "Jack's Room" — black, no
 * video — implying the host was present.  The host's iPad was in fact
 * still parked on the ENTER THE WINNER'S ROOM CTA and never transitioned.
 * Two diseases:
 *   1. PHANTOM PRESENCE — the tile list was roster-derived (static DOM
 *      labeled from the room row); a black frame implied a joined
 *      counterpart who wasn't there.
 *   2. HOST ENTRY ON MOBILE — the host's post-KEEP path stacked TWO
 *      surfaces (the held kept-beat CTA under the closing card), the
 *      double-tap zoom-block swallowed the second of two quick touch taps
 *      (chairs and CTAs are divs — no click was ever synthesized), and a
 *      failed backstage join was a toast + eject to the lobby with no
 *      retry.  Gate 24 covered the winner's mobile journey; never the
 *      host's.
 *
 * Now (SPEC: BACKSTAGE PRESENCE, 8/10): tiles derive from CALL
 * participants; an absent side is a labeled waiting state ("waiting for
 * Jack's Room…"), never a black frame; the clock starts only when BOTH
 * are in the call; entry is identical desktop/mobile for host and winner;
 * a stuck door is said in show language with a visible, working retry.
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

/* touch-tap the center of a selector — never a mouse click */
async function tap(c, sel) {
  const b = await c.page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }, sel);
  if (!b) throw new Error("tap target missing: " + sel);
  await c.page.touchscreen.tap(b.x, b.y);
}

/* the host's real engine KEEP flow, by touch, with the two taps QUICK —
   the live iPad cadence the old zoom-block turned into swallowed clicks */
async function keepByTouch(host, targetUid) {
  await waitFor(() => host.page.evaluate(() => document.getElementById("eg_decide").style.display !== "none"), 10000, "decide card");
  await tap(host, "#eg_dkeep");
  await host.page.waitForTimeout(180);   // deliberately inside the 300ms window
  await tap(host, `#rt_chairs [data-heartuid="${targetUid}"]`);
  await waitFor(() => host.page.evaluate(() => !!document.querySelector("#room .lc-beat--kept")), 8000, "the kept beat");
}

module.exports = {
  name: "backstage-entry",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Jackie", email: "host@fix.test" });
      ["u_s1", "u_s2"].forEach((id) => D.addUser({ id, name: id }));
      const boot = async (n, u) => {
        const c = await h.newClient(n, { isMobile: true, hasTouch: true });   // EVERYONE mobile
        c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };

      /* ================= ROOM 1 — both entries complete; presence + clock ================= */
      const host = await boot("host", hostU);
      const winner = await boot("winner", "u_s1");
      const r1 = D.addRoom({ id: "r_e1", host_id: hostU, name: "Jack's Room", phase: "deciding", round: 3 });
      D.rooms.get(r1).phase_deadline = D.iso(D.now() + 120000);
      D.addMember(r1, "u_s1", "chair", { seat_index: 0 });
      D.addMember(r1, "u_s2", "chair", { seat_index: 1 });
      for (const c of [host, winner]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r1) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }

      await keepByTouch(host, "u_s1");
      t.ok(true, "two QUICK touch taps drive the decide flow — the zoom-block no longer eats the second tap (HOST role, mobile)");
      await waitFor(() => D.rooms.get(r1).status === "ended" && D.rooms.get(r1).winner_id === "u_s1", 8000, "show ended");

      // the HOST taps the beat CTA — the surface the live iPad was parked on
      const ctaBox = await host.page.evaluate(() => {
        const cta = document.querySelector("#room .lc-beat__cta");
        if (!cta) return null;
        const r = cta.getBoundingClientRect();
        return { inView: r.top >= 0 && r.bottom <= window.innerHeight && r.width >= 44 && r.height >= 40 };
      });
      t.ok(ctaBox && ctaBox.inView, "the ENTER THE WINNER'S ROOM CTA sits inside the mobile viewport");
      await tap(host, "#room .lc-beat__cta");
      await waitFor(() => host.page.evaluate(() => document.getElementById("backstage").classList.contains("show")), 10000, "host backstage");
      t.ok(true, "the HOST's touch tap on the beat CTA carries her backstage (the live-run break)");

      /* --- host alone: waiting state, NO tile, clock not running --- */
      await host.page.waitForTimeout(1600);   // her own camera publishes; the wait must survive it
      const alone = await host.page.evaluate(() => ({
        st: window.__lc.BS_STATE,
        waitText: document.getElementById("bs_wait_winner").textContent,
        waitShown: getComputedStyle(document.getElementById("bs_wait_winner")).display !== "none",
        counterpartVideos: document.getElementById("bs_tile_winner").querySelectorAll("video").length,
        ownVideos: document.getElementById("bs_tile_host").querySelectorAll("video").length,
        ownWaitShown: getComputedStyle(document.getElementById("bs_wait_host")).display !== "none",
        clockText: document.getElementById("bs_clock").textContent,
      }));
      t.ok(alone.st.winnerWaiting && alone.waitShown && alone.counterpartVideos === 0,
        "counterpart not in the call → labeled waiting state, NO tile implying presence (no video, waiting frame)");
      t.ok(/waiting for u_s1/.test(alone.waitText), `the waiting state names them ("${alone.waitText}")`);
      t.ok(!alone.st.clockOn && alone.clockText === "3:00",
        `the private-time clock is NOT running while she waits alone (${alone.clockText})`);
      t.ok(alone.ownVideos === 1 && !alone.ownWaitShown,
        "her OWN side is a joined tile (local video up, no misplaced 'waiting for them' over her self-view)");

      /* --- the delayed side arrives → tile + clock start --- */
      await host.page.evaluate(() => window.__dailyControl.addRemote("u_s1"));
      await waitFor(() => host.page.evaluate(() => window.__lc.BS_STATE.clockOn), 5000, "clock starts on arrival");
      const both = await host.page.evaluate(() => ({
        st: window.__lc.BS_STATE,
        counterpartVideos: document.getElementById("bs_tile_winner").querySelectorAll("video").length,
      }));
      t.ok(!both.st.winnerWaiting && both.counterpartVideos === 1, "arrival → a REAL tile (joined participant, video attached)");
      t.ok(both.st.clockOn, "…and the private-time clock starts only now — with BOTH in the call");

      /* --- the WINNER's entry (mobile), and the live phantom-presence frame --- */
      await waitFor(() => winner.page.evaluate(() => !!document.getElementById("fin_backstage")), 25000, "the winner's card");
      await tap(winner, "#fin_backstage");
      await waitFor(() => winner.page.evaluate(() => document.getElementById("backstage").classList.contains("show")), 10000, "winner backstage");
      t.ok(true, "the WINNER's touch tap enters too — both parties complete entry at mobile emulation");
      await winner.page.waitForTimeout(1600);
      const wAlone = await winner.page.evaluate(() => ({
        st: window.__lc.BS_STATE,
        hostWait: document.getElementById("bs_wait_host").textContent,
        hostVideos: document.getElementById("bs_tile_host").querySelectorAll("video").length,
      }));
      t.ok(wAlone.st.hostWaiting && wAlone.hostVideos === 0 && /waiting for Jack's Room/.test(wAlone.hostWait),
        `the EXACT live frame is dead: no black "Jack's Room" tile — a labeled waiting state ("${wAlone.hostWait}")`);
      t.ok(!wAlone.st.clockOn, "her clock isn't running either — nobody burns private time waiting alone");
      await winner.page.evaluate(() => window.__dailyControl.addRemote("u_host"));
      await waitFor(() => winner.page.evaluate(() => window.__lc.BS_STATE.clockOn), 5000, "winner-side clock on host arrival");
      t.ok(await winner.page.evaluate(() => !window.__lc.BS_STATE.hostWaiting &&
        document.getElementById("bs_tile_host").querySelectorAll("video").length === 1),
        "the host's arrival gives the winner a real tile + running clock");

      /* ================= ROOM 2 — the second door, and the stuck door ================= */
      const host2 = await boot("host2", hostU === "u_host" ? "u_host" : hostU);
      const winner2 = await boot("winner2", "u_s1");
      const r2 = D.addRoom({ id: "r_e2", host_id: "u_host", name: "Jack's Room", phase: "deciding", round: 3 });
      D.rooms.get(r2).phase_deadline = D.iso(D.now() + 120000);
      D.addMember(r2, "u_s1", "chair", { seat_index: 0 });
      D.addMember(r2, "u_s2", "chair", { seat_index: 1 });
      for (const c of [host2, winner2]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r2) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      await keepByTouch(host2, "u_s1");

      /* --- host DELAYS past the closing card: ONE surface, one working door --- */
      await waitFor(() => host2.page.evaluate(() => document.getElementById("finale").classList.contains("show")), 15000, "host2 card");
      const oneDoor = await host2.page.evaluate(() => ({
        beatGone: !document.querySelector("#room .lc-beat"),
        holdGone: !document.getElementById("room").classList.contains("beat-hold"),
        cta: (() => {
          const b = document.getElementById("fin_backstage");
          if (!b) return null;
          const r = b.getBoundingClientRect();
          return r.top >= 0 && r.bottom <= window.innerHeight && r.width >= 44 && r.height >= 40;
        })(),
      }));
      t.ok(oneDoor.beatGone && oneDoor.holdGone,
        "when the closing card paints, the held beat LEAVES the stage — no dead CTA buried under another surface");
      t.ok(oneDoor.cta === true, "the card's Go Backstage is in the viewport with a real tap target");
      await tap(host2, "#fin_backstage");
      await waitFor(() => host2.page.evaluate(() => document.getElementById("backstage").classList.contains("show")), 10000, "host2 backstage");
      t.ok(true, "the delayed host's touch tap on the card enters too — both doors work, identically, on mobile");

      /* --- a FORCED join failure: said, on-surface, retryable — no silent black frame --- */
      await waitFor(() => winner2.page.evaluate(() => !!document.getElementById("fin_backstage")), 25000, "winner2 card");
      await winner2.page.evaluate(() => {
        const of = window.fetch; window.__origFetch = of;
        window.fetch = (u, o) => String(u).includes("daily-room")
          ? Promise.resolve(new Response(JSON.stringify({ error: "backend down" }), { status: 500, headers: { "Content-Type": "application/json" } }))
          : of(u, o);
      });
      await tap(winner2, "#fin_backstage");
      await waitFor(() => winner2.page.evaluate(() => window.__lc.BS_STATE.errorShown), 8000, "the stuck-door surface");
      const stuck = await winner2.page.evaluate(() => ({
        st: window.__lc.BS_STATE,
        onBackstage: document.getElementById("backstage").classList.contains("show"),
        lobbyVisible: getComputedStyle(document.getElementById("lobby")).display !== "none",
        msg: document.getElementById("bs_error_msg").textContent,
        rawLeak: /HTTP 500|backend down/i.test(document.getElementById("backstage").textContent),
        retry: (() => {
          const b = document.getElementById("bs_retry");
          const r = b.getBoundingClientRect();
          return getComputedStyle(b).display !== "none" && r.width >= 44 && r.height >= 40 &&
                 r.top >= 0 && r.bottom <= window.innerHeight;
        })(),
        hostVideos: document.getElementById("bs_tile_host").querySelectorAll("video").length,
      }));
      t.ok(stuck.onBackstage && !stuck.lobbyVisible,
        "a failed join stays ON the backstage surface — no toast-and-eject to the lobby");
      t.ok(stuck.retry, "the retry affordance is VISIBLE with a real tap target");
      t.ok(stuck.msg.length > 0 && !stuck.rawLeak,
        `the failure is said in show language ("${stuck.msg}") — no raw diagnostics in the DOM`);
      t.ok(stuck.st.hostWaiting && stuck.hostVideos === 0,
        "behind the error there is still NO phantom tile — the counterpart reads as waiting, not silently black");

      /* --- the door unsticks: retry (by touch) runs the SAME join path --- */
      await winner2.page.evaluate(() => { window.fetch = window.__origFetch; });
      await tap(winner2, "#bs_retry");
      await waitFor(() => winner2.page.evaluate(() =>
        !window.__lc.BS_STATE.errorShown && !window.__lc.BS_STATE.winnerWaiting), 10000, "retry completes the join");
      t.ok(await winner2.page.evaluate(() =>
        document.getElementById("bs_tile_winner").querySelectorAll("video").length === 1),
        "retry joins for real — her own tile carries live video");
      t.ok(await winner2.page.evaluate(() => !window.__lc.BS_STATE.clockOn),
        "…and the clock STILL waits for the other side after a retry");

      const errs = [host, winner, host2, winner2].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
