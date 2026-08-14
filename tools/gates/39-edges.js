/* GATE 39 — edges: the conductor run's quick kills, one minimal scene
 * each.  Ships with fix/edges.
 *
 *   d1 the empty-chair card said "TAKE THE CHAIR" and benched you — a
 *      mislabeled action.  It now says what it does.
 *   d2 a spectator at show end was ejected to a bare lobby — the
 *      host-left watchdog never asked the rooms row whether the show had
 *      ENDED before calling it vanished.
 *   d3 every winner card shipped a BLACK photo — the snap raced the
 *      video element.  A capture now needs a live, non-black frame or it
 *      ships nothing (the card falls back to the avatar).
 *   d4 hearts self-materialized 0 → 35 with nobody hearting.  ANSWERED
 *      2026-08-12 against the production database: there is no server-side
 *      seeder — no trigger, no default, no autonomous writer.  The client
 *      has FOUR heart writers and sendHeart() inserts room_events directly
 *      rather than through an RPC, and the 0 → 35 jump is the ENTRY SEED
 *      repainting a backlog.  The old pin here claimed the opposite and
 *      could not fail; see the block below and METHOD rule 9.
 *   d5 backstage clocks skewed ~16s (each side ran a private 3:00) — the
 *      host now writes ONE backstage_clock deadline; both render it.
 *   d6 the watcher count flapped 6 vs 1 across tabs — one derivation +
 *      the ledger overlay (branch A) hold it equal even for a poll-only
 *      client.
 *   d7 a mid-phase rejoin lost ALL video — videoJoin's fast-path guard
 *      read the dying call's state while the leave was in flight, no-op'd,
 *      and nothing retried.  The leave settles first; the truth cadence
 *      re-joins a callless room as a belt.
 *   d8 the offerer waited out the full swap window against a counterpart
 *      who had already LEFT — absence isn't a secret: leaving the
 *      backstage flow closes the other side's window with the goodnight
 *      beat (the decline itself stays secret).
 *
 * HARNESS FIDELITY: d5/d8 needed nothing faked removed — they needed the
 * double's room_events to carry two new SMALL types (backstage_clock,
 * backstage_left), which prod's ledger already accepts (plain inserts).
 * d6 uses muteRealtime (wave-8 harness) for the poll-only client; d7's
 * race is driven with the app's own leave/open calls, no shim surgery.
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
  name: "edges",
  async run(t, ctx) {
    /* ---------- d1 + d2 + d3 static pins ---------- */
    const html = ctx.html;
    t.ok(!/TAKE THE CHAIR/.test(html),
      "d1: the empty-chair card no longer promises TAKE THE CHAIR (mislabeled action gone)");
    t.ok(/OPEN CHAIR/.test(html) && /join the bench — she fills it from there/.test(html),
      "d1: the card says what the tap does (bench, her pick)");
    /* d2 DELETED (conductor's ruling, 2026-08-13): the source-grep that stood
       here was the assertion gate 47's header proved covers nothing — "ONE
       assertion and it is a source grep."  d2's real, behavioural coverage
       lives in gate 47 (watchdog-truth).  Per METHOD: a gate whose name
       implies more than its scope covers nothing. */
    const snap = html.slice(html.indexOf("async function startWinnerSnap"), html.indexOf("async function startWinnerSnap") + 3200);
    t.ok(/getImageData/.test(snap) && /videoWidth/.test(snap) && /never black/i.test(snap),
      "d3: the snap waits for a live frame, samples for black, and ships NOTHING rather than a black card");

    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@fix.test" });
      ["u_s1", "u_w"].forEach((id) => D.addUser({ id, name: id, face: { photo: "data:image/gif;base64,R0lGODlhAQABAAAAACw=" } }));
      const boot = async (n, u) => {
        const c = await h.newClient(n); c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const w = await boot("w", "u_w");

      /* ---------- d1 runtime: the tap DOES what the card says ---------- */
      const r1 = D.addRoom({ id: "r_e1", host_id: hostU, name: "E1", phase: "preshow", round: 0 });
      for (const c of [host, w]) { await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r1) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 }); }
      await w.page.evaluate(() => document.querySelector("#rt_seat0 .chair__empty").click());
      await waitFor(() => (D.memberRow(r1, "u_w") || {}).role === "line", 8000, "the chair-card tap benches");
      t.ok(await w.page.evaluate(() => /LEAVE THE BENCH/i.test(document.getElementById("rt_joinline").textContent)),
        "d1: the tap joins the BENCH and the verb says so — action matches label now that the label names the bench");

      /* ---------- d6: watcher count equal for a poll-only client ---------- */
      h.muteRealtime("w");
      D.addMember(r1, "u_s1", "spectator");
      await waitFor(async () => {
        const a = await host.page.evaluate(() => document.getElementById("rt_count").textContent);
        const b = await w.page.evaluate(() => document.getElementById("rt_count").textContent);
        return a === b && /3/.test(a);
      }, 12_000, "counts agree (host realtime vs player poll)");
      t.ok(true, "d6: one presence derivation — realtime client and poll-only client show the SAME watcher count");
      h.muteRealtime("w", false);

      /* ---------- d4: the client DOES write hearts — one per tap, never on its own ----
         SUPERSEDED PIN, kept here as the record of how it failed.  This block used
         to be:

             t.ok(!D.events.some((e) => e.type === "heart"),
               "d4: a full seating flow wrote ZERO heart events — the client
                contains no heart writer …");

         run over exactly the scene above — a seating flow that never taps a tile
         and never opens the draft — and it concluded the live 0→35 "must be
         prod-side".  Both halves were wrong:

           · the client contains FOUR heart writers (every suitor chair, the
             hostctl fallback, every bench lane, and the host's own tile), and
             sendHeart() writes room_events DIRECTLY rather than through an RPC —
             which is why a production search of database FUNCTIONS came back
             clean.  There was no function to find.
           · and the assertion could not fail, because the scene never entered the
             path it claimed to clear.  A runtime assertion over a scene that never
             enters the path is a grep with better manners.  METHOD rule 9.

         What replaces it asserts what a person would complain about: a tap writes
         ONE heart, no tap writes NONE, and the 0→35 jump is the ENTRY SEED
         repainting a backlog rather than anything writing. */
      D.addUser({ id: "u_s2", name: "Seated" });
      D.addMember(r1, "u_s2", "chair", { seat_index: 0 });
      const hearts = () => D.events.filter((e) => e.type === "heart");

      t.ok(hearts().length === 0,
        "d4 baseline: the seating flow so far has written zero hearts — nobody has tapped anything (a BASELINE, not a proof of absence)");

      await waitFor(() => w.page.evaluate(() => !!document.querySelector('#rt_chairs [data-heartuid="u_s2"]')),
        10000, "the seated man's tile to render on the crowd's side");
      await w.page.evaluate(() => document.querySelector('#rt_chairs [data-heartuid="u_s2"]').click());
      await waitFor(() => hearts().length >= 1, 8000, "the tap to reach the table");
      await w.page.waitForTimeout(400);   // a second write, if there were one, would have landed
      t.ok(hearts().length === 1,
        `d4: ONE tap writes exactly ONE heart row — not two, not a burst (rows=${hearts().length})`);
      t.ok(hearts()[0].user_id === "u_w" && (hearts()[0].payload || {}).target === "u_s2",
        "d4: the row carries the tapper as actor and the tapped man as target — the crowd's signal, attributed");

      await w.page.evaluate(() => document.querySelector('#rt_chairs [data-heartuid="u_s2"]').click());
      await waitFor(() => hearts().length >= 2, 8000, "the second tap");
      await w.page.waitForTimeout(400);
      t.ok(hearts().length === 2,
        `d4: taps do not accumulate handlers — the second tap writes the second row and no more (rows=${hearts().length})`);

      const beforeSelf = hearts().length;
      await w.page.evaluate(() => {
        const mine = document.querySelector('#lineitems .lc-lane[data-benchuid="u_w"]');
        if (mine) mine.click();
      });
      await w.page.waitForTimeout(600);
      t.ok(hearts().length === beforeSelf,
        `d4: a man cannot heart himself — his own bench lane writes nothing (rows still ${hearts().length})`);

      /* THE ACTUAL d4 SYMPTOM.  "0 → 35 with nobody tapping" is the ENTRY SEED:
         loadRoomState reads every prior room_events row and repaints the tallies
         in one lump, so a client arriving mid-show sees the whole backlog appear
         at once having tapped nothing.  That is a render, not a writer — and it is
         what the live report actually saw. */
      const late = await boot("late", "u_s1");
      await late.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r1) });
      await late.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => late.page.evaluate(() => (window.__lc.HEARTS || {})["u_s2"] === 2), 12000,
        "the late arrival to paint the BACKLOG he never tapped");
      t.ok(hearts().length === 2,
        `d4: and he wrote nothing doing it — arriving paints the tally, it never adds to it (rows=${hearts().length})`);

      /* ---------- d7: the leave/rejoin race keeps its video ---------- */
      await waitFor(() => w.page.evaluate(() => window.__lc.DAILY_JOINED === true), 12_000, "w's first call joins");
      await w.page.evaluate(() => { const p = window.__lc.leaveRoom(); return null; });   // leave in flight…
      await w.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r1) });      // …rejoin immediately (the race)
      await w.page.waitForSelector("#room.show", { timeout: 10000 });
      await waitFor(() => w.page.evaluate(() =>
        window.__lc.DAILY_JOINED === true && window.__dailyInstances().liveNow === true), 15_000,
        "the rejoined room has a LIVE call");
      t.ok(true, "d7: a rejoin that races the previous leave still ends with a live, joined call (four dark tiles dead)");
      // the shim's calls are per-page: inject the host as a remote and the
      // rebuilt subscription chain must land her pixels in a tile
      await w.page.evaluate(() => window.__dailyControl.addRemote("u_host"));
      await waitFor(() => w.page.evaluate(() => !!document.querySelector("#rt_hero video, .chair__feed video, #room video")), 12_000,
        "video re-attaches after the racing rejoin");
      t.ok(true, "d7: …and pixels actually re-attach (subscription chain re-ran)");
      for (const c of [w, host]) { await c.page.evaluate(() => window.__lc.leaveRoom()); await c.page.waitForSelector("#lobby", { state: "visible", timeout: 10000 }); }

      /* ---------- d5 + d8: shared backstage deadline; absence closes the window ---------- */
      const r2 = D.addRoom({ id: "r_e2", host_id: hostU, name: "E2", phase: "deciding", round: 3 });
      D.rooms.get(r2).winner_id = "u_w";
      D.addMember(r2, "u_w", "kept", { seat_index: 0 });
      for (const c of [host, w]) { await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(r2) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 }); }
      await host.page.evaluate(() => window.__lc.enterBackstage("u_w", "u_w"));
      await w.page.evaluate(() => window.__lc.enterBackstage("u_w", "u_w"));
      await waitFor(() => host.page.evaluate(() => document.getElementById("backstage").classList.contains("show")), 8000, "host backstage");
      await waitFor(() => w.page.evaluate(() => document.getElementById("backstage").classList.contains("show")), 8000, "winner backstage");
      // both-in on each page (per-page daily shim): inject the counterpart
      await host.page.evaluate(() => window.__dailyControl.addRemote("u_w"));
      await w.page.evaluate(() => window.__dailyControl.addRemote("u_host"));
      await waitFor(() => host.page.evaluate(() => window.__lc.BS_STATE.clockOn), 6000, "host clock");
      await waitFor(() => w.page.evaluate(() => window.__lc.BS_STATE.clockOn), 6000, "winner clock");
      await waitFor(() => D.events.some((e) => e.type === "backstage_clock"), 6000, "the shared deadline event");
      await waitFor(async () => {
        const a = await host.page.evaluate(() => window.__lc.BS_STATE.deadline);
        const b = await w.page.evaluate(() => window.__lc.BS_STATE.deadline);
        return a && b && Math.abs(a - b) < 1500;
      }, 8000, "deadlines converge");
      const skew = Math.abs(await host.page.evaluate(() => window.__lc.BS_STATE.deadline) -
                            await w.page.evaluate(() => window.__lc.BS_STATE.deadline));
      t.ok(skew < 1500, `d5: ONE shared deadline — skew ${skew}ms (the live run ran 16,000ms apart)`);

      // the decision layer opens for both; the host OFFERS; the winner leaves
      await host.page.evaluate(() => window.__lc.bsEnterDecision("cut"));
      await w.page.evaluate(() => window.__lc.bsEnterDecision("cut"));
      await waitFor(() => host.page.evaluate(() => window.__lc.BS_STATE.phase === "deciding"), 6000, "host deciding");
      await host.page.evaluate(() => {
        document.querySelector('#bsd_chips .ctypechip[data-t="Instagram"]').click();
        document.getElementById("bsd_val").value = "@hostess";
        document.getElementById("bsd_offer").click();
      });
      await w.page.evaluate(() => document.getElementById("bsd_skip").click());   // decline → goodnight → exit (absence)
      await waitFor(() => host.page.evaluate(() =>
        getComputedStyle(document.getElementById("lobby")).display !== "none"), 8000,
        "the OFFERER's window closes on the counterpart's absence");
      t.ok(true, "d8: when the other party leaves the backstage flow, the offer window ends with the goodnight — no 60s vigil for nobody");
      t.ok(D.events.some((e) => e.type === "backstage_left"), "d8: absence rode the ledger (backstage_left)");

      const errs = [host, w].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
