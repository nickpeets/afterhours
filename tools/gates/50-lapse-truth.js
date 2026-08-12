/* GATE 50 — lapse-truth: what a locked phone costs.  RED ON PURPOSE.
 *
 * OBSERVED LIVE, 2026-08-12, by the owner: a guest whose phone locked did not
 * merely go stale — he came back OUT of the room.  This gate is written to make
 * that concrete, and it is expected to FAIL on today's build.  It is not a
 * regression lock and it is not a proof of a fix; it is the symptom, pinned, so
 * that "a lapse costs your place" stops being a reading of two functions and
 * becomes a run.
 *
 * THE PATH, off index.html.  The server sweeps a silent row to role='gone'
 * after ~45s.  On visibilitychange back to visible the client beats first —
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
 * WHY IT STAYS RED FOR NOW.  The bench half cannot be fixed from the client:
 * join_line sends only {room_id} and the position is minted server-side, afresh,
 * at the back (measured 2026-08-12: bench 250 → leave → null → re-bench 251).
 * Reading or changing that function needs the database.  This gate is the thing
 * that turns green the day that door opens, and until then it is the honest
 * record that we know what is broken and have not fixed it.
 *
 * ON THE 45-SECOND NUMBER, since this gate leans on it.  SWEEP_MS in the double
 * is 45_000, and the double's own header says its rules were "derived from
 * reading index.html, not from a spec".  The only evidence anywhere for 45s is a
 * client COMMENT — "45s sweep window / 8s = 5 beats of margin".  Nobody has read
 * the server function; PostgREST does not serve function bodies at all
 * (/rest/v1/pg_proc → 404), so it is unreachable from any session.  The harness
 * has inherited an unverified number from a comment, which is METHOD rule 8 one
 * layer out.  Treat 45s as a CLAIM.  What this gate actually asserts is
 * independent of the exact threshold: whatever the number is, crossing it must
 * not silently empty a chair or cost a man his turn.
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
