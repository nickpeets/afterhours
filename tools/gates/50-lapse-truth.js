/* GATE 50 — lapse-truth: what a locked phone costs.  RED ON PURPOSE.
 *
 * ===================================================================
 * THIS GATE LANDED RED FOR PARTLY THE WRONG REASON.  Read this first.
 * ===================================================================
 * It was written and merged (PR #57) against a double whose sweep fired at 45s
 * and whose freshness filter is 60s — the two thresholds in the WRONG ORDER.
 * The scene below ages `last_seen` by FIFTY SECONDS, a number chosen to cross
 * that 45s sweep.  Under the numbers the server actually has — hide at 60s,
 * bury at 180s — fifty seconds crosses NOTHING.
 *
 * So the run reproduced a path production cannot take.  THE SYMPTOM IS REAL:
 * the owner watched a guest's phone lock and the guest come back out of the
 * room.  THE SCENE WAS NOT.  Those are different claims and this header
 * previously ran them together.
 *
 * Measured after the double was corrected, three ages, one run each:
 *   50s   role=chair, in active_members, her tile PRESENT — nothing happens,
 *         which is correct: inside the freshness window there is no lapse.
 *   90s   role=chair, NOT in active_members, her tile GONE, three OPEN CHAIR
 *         cards — DEFECT 2, isolated for the first time.
 *   200s  role=gone — the sweep.  The bench man goes spectator, position null.
 *
 * And the bench half below is under retraction pending the conductor's call:
 * with `join_line` corrected to preserve the place (as the server does), the
 * 90s window costs him NOTHING — the recovery beats first, the beat refreshes
 * a row that is still alive, and he is back inside the window before the
 * roster is read.  The client design works.  He only loses the bench past
 * 180s, where the row is genuinely swept.
 *
 * Do not read the assertions below as settled until this block is removed.
 *
 * OBSERVED LIVE, 2026-08-12, by the owner: a guest whose phone locked did not
 * merely go stale — he came back OUT of the room.  This gate is written to make
 * that concrete, and it is expected to FAIL on today's build.  It is not a
 * regression lock and it is not a proof of a fix; it is the symptom, pinned, so
 * that "a lapse costs your place" stops being a reading of two functions and
 * becomes a run.
 *
 * THE PATH.  Read from the SERVER on 2026-08-12, not inferred: `active_members`
 * filters on `last_seen > now() - interval '60 seconds'`, and
 * `sweep_stale_members` marks a row 'gone' at `now() - interval '3 minutes'`.
 * TWO clocks, 60s and 180s, and the gap between them is where this lives.
 * On visibilitychange back to visible the client beats first —
 * correct, and its own comment says why: "re-joining would reset bench ->
 * spectator".  But when the beat returns and he is no longer in members, which
 * is exactly what a swept row does, it runs:
 *
 *     await sb.rpc("leave_room", …);   // clear the swept row
 *     await sb.rpc("join_room",  …);   // …and re-enter
 *     toast("Welcome back — you're in the room 🍸");
 *
 * leave_room DELETES the row and join_room creates a new one as a SPECTATOR.
 * The recovery does precisely what the comment twenty lines above it warns
 * against, because by the time it runs the cheap option has already failed.
 *
 * THE RULING IT IS WRITTEN AGAINST (owner, tonight) is NOT "preserve everything".
 * It splits, and the split is about television rather than fairness:
 *
 *   CHAIR — an absent man is visible dead air.  She SHOULD be able to pass him
 *     out; the seat must not hold indefinitely.  What is wrong today is that he
 *     vanishes SILENTLY: activeRows filters him out and the tile simply stops
 *     existing, so the chair empties itself and the decision was never hers.
 *     The assertion is therefore LEGIBILITY, not preservation.
 *   BENCH — nobody is watching an empty bench slot, and the format is built on
 *     waiting your turn, so a glance must not cost him his place.  The
 *     assertion is that he comes back ON the bench, in the same position,
 *     still ahead of the man who was behind him.
 *
 * TWO DEFECTS, ONE SYMPTOM, and they must not be conflated — the first draft of
 * this header conflated them and was wrong twice over.
 *
 *   DEFECT 1 (the bench).  The client destroys a LIVE row.  `join_line` on the
 *     server literally says `-- FIFO line order: keep your place if you are
 *     already in line`, and does `if v_prev_role = 'line' and v_prev_pos is not
 *     null then v_pos := v_prev_pos; else v_pos := nextval('line_position_seq')`.
 *     THE SERVER WAS BUILT TO KEEP HIS PLACE.  He only loses it because the
 *     recovery calls `leave_room` FIRST, deleting the row, so there is no
 *     previous role left to preserve.  The client reads an absence that means
 *     STALE (>60s, filtered by active_members) as if it meant GONE (>180s,
 *     actually swept) and destroys a perfectly good row on the strength of it.
 *     Client-side, and small.
 *   DEFECT 2 (the chair).  A SEAT IS RENDERED OFF A LIVENESS WINDOW.  There is
 *     exactly one roster source — `loadRoomState` calls `active_members` — and
 *     it hides him at 60s.  So between 60s and 180s his row is intact, his
 *     seat_index is intact, and her screen still shows OPEN CHAIR.  Fixing
 *     defect 1 does NOTHING for this: he never reaches the client to be
 *     rendered.  This is a render-source question, not an away-state redesign.
 *
 * AND THE EXCEPTION ALREADY EXISTS.  `activeRows` opens with
 * `if (m.role === "kept") return true;  // a kept man is on stage; staleness
 * doesn't unseat him`.  The idea that a seat on stage is not a liveness signal
 * is already in the code — it was applied to `kept` and not to `chair`.
 *
 * An earlier version of this header said the bench half needed the database.
 * It does not.  That sentence was written from a client comment; see below.
 *
 * ON THE 45-SECOND NUMBER, WHICH WAS NEVER REAL.  Until tonight everything here
 * leaned on `45s sweep window / 8s = 5 beats of margin` — a client comment.  The
 * harness copied it into SWEEP_MS, the double's own header admits its rules were
 * "derived from reading index.html, not from a spec", and a report built on it
 * claimed "the sweep is 1.5 spotlights" as a measurement.  The database says 60
 * and 180.  **45 appears nowhere in it.**  A guess in a comment became a
 * constant in the test rig and then a number in a finding — METHOD rule 8,
 * catching a reader rather than the codebase, which is the rule earning its
 * place rather than a mark against anyone.
 *
 * SWEEP_MS in the double is still 45_000 and is deliberately LEFT ALONE here:
 * changing the double's constants is a fidelity change that belongs in its own
 * commit with its own reasoning, not smuggled in behind a gate.  It does not
 * affect this gate, because these assertions are independent of the threshold —
 * whatever the number is, crossing it must not silently empty a chair or cost a
 * man his turn.
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
  name: "lapse-truth",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@lapse.test" });
      ["u_a", "u_b", "u_c"].forEach((id) => D.addUser({ id, name: id }));

      const boot = async (n, u) => {
        const c = await h.newClient(n); c.login(u); await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        return c;
      };
      const host = await boot("host", hostU);
      const b = await boot("b", "u_b");

      const room = D.addRoom({ id: "r_lapse", host_id: hostU, name: "Lapse", phase: "spotlight", round: 1 });
      D.addMember(room, "u_a", "chair", { seat_index: 0 });   // on camera
      D.addMember(room, "u_b", "line");                        // waiting his turn
      D.addMember(room, "u_c", "line");                        // and the man behind him
      const posB = D.memberRow(room, "u_b").line_position;
      const posC = D.memberRow(room, "u_c").line_position;
      t.ok(posB != null && posC != null && posB < posC,
        `fixture: he is ahead of the man behind him before the lapse (b=${posB}, c=${posC})`);

      for (const c of [host, b]) {
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
      }
      await waitFor(() => host.page.evaluate(() => !!document.querySelector('#rt_chairs [data-heartuid="u_a"]')),
        10000, "the seated man's tile on HER screen before anything happens");

      /* ================= the lapse ================= */
      /* Both phones go dark.  No client code runs while a screen is locked —
         iOS suspends JS outright — so this is modelled the only honest way:
         the beats simply stop, and the server's own sweep does the rest. */
      const stale = new Date(D.now() - 50_000).toISOString();
      D.memberRow(room, "u_a").last_seen = stale;
      D.memberRow(room, "u_b").last_seen = stale;
      D.rpc("host", "sweep_stale_members", { room_id: room });

      t.ok(D.memberRow(room, "u_a").role === "gone" && D.memberRow(room, "u_b").role === "gone",
        "fixture: the sweep buried both of them — this is the state a locked phone reaches, not a state anyone chose");

      /* ---------- CHAIR: is his absence LEGIBLE to her? ---------- */
      await host.page.evaluate(() => window.__lc.loadRoomState && window.__lc.loadRoomState());
      await host.page.waitForTimeout(1200);
      const her = await host.page.evaluate(() => {
        const tile = document.querySelector('#rt_chairs [data-heartuid="u_a"]');
        return {
          tileExists: !!tile,
          tileAway: !!(tile && tile.classList.contains("is-away")),
          tileText: tile ? (tile.textContent || "").trim().slice(0, 120) : "",
          chairsText: (document.getElementById("rt_chairs").textContent || "").replace(/\s+/g, " ").trim().slice(0, 400),
        };
      });
      /* ONE ARTIFACT, deliberately.  The first draft of this check accepted any
         of away|stepped|paused|reconnect — a synonym list, which is a gate that
         passes on whichever word somebody happens to type and fails to say what
         the app should DO.  That is the vacuous shape wearing different clothes.
         The artifact is: the seated man's chair tile carries `is-away`, and the
         card says AWAY.  Nothing renders that today; naming it is the point. */
      t.ok(her.tileAway,
        `CHAIR: her chair tile for him carries the is-away state — one named artifact, not a list of words that might mean it (tile present=${her.tileExists}, is-away=${her.tileAway})`);
      t.ok(/\bAWAY\b/.test(her.chairsText),
        `CHAIR: the card says AWAY in her own row of chairs, so the absence is readable at a glance. Her chairs read: ${JSON.stringify(her.chairsText)}`);
      t.ok(her.tileExists && !/OPEN CHAIR/.test(her.tileText),
        `CHAIR: his seat is NOT advertised to the crowd while he sits there — an OPEN CHAIR card in his place is the room soliciting a replacement for a man who never left (tile present=${her.tileExists}, tile reads ${JSON.stringify(her.tileText)})`);

      /* ---------- BENCH: does the glance cost him his turn? ---------- */
      /* He unlocks.  visibilitychange → visible is the app's own recovery
         door, and dispatching it on a visible page runs exactly the branch a
         returning phone runs. */
      await b.page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
      await waitFor(async () => {
        const row = D.memberRow(room, "u_b");
        return row && row.role !== "gone";
      }, 10000, "his return to be processed at all");
      await b.page.waitForTimeout(800);

      const back = D.memberRow(room, "u_b");
      t.ok(!!back, "BENCH: he still has a row after the recovery");
      t.ok(back && back.role === "line",
        `BENCH: he comes back ON THE BENCH, where he was — not demoted to the crowd (role=${back && back.role})`);
      t.ok(back && back.line_position === posB,
        `BENCH: he keeps his place — a glance at a text does not move him (was ${posB}, now ${back && back.line_position})`);
      t.ok(back && back.line_position != null && back.line_position < posC,
        `BENCH: he is STILL AHEAD of the man who was behind him (his ${back && back.line_position} vs the other man's ${posC}) — this is the one a room notices, because it is somebody losing a turn he had already waited for`);

      const errs = [host, b].flatMap((c) => c.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors through the lapse and the return — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
