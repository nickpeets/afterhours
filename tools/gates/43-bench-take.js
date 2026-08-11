/* GATE 43 — bench-take: the open chair is a door ONTO the bench, never a door
 * out of it.  Ships with fix/bench-take.
 *
 * THE BUG.  In an engine room `autoSeatFromLine()` returns early:
 *
 *     if(EG_ON) return;  // ... joiners self-seat via claim_open_chair
 *
 * and `claim_open_chair` exists nowhere but in that comment.  So the only
 * affordance a benched man has is the OPEN CHAIR cell, which funnels into
 * `$("rt_joinline").click()` — and that handler's FIRST matching branch for a
 * man whose role is already "line" is leave_room + join_room.  Tapping the
 * chair did not seat him and did not no-op: it dropped him off the bench and
 * back into the crowd, silently, mid-show.
 *
 * CANON (owner ruling, wave 9) is unchanged and this gate locks it: the bench
 * is the destination and SHE picks from it.  Nobody self-seats.  The fix is
 * therefore not a new seating path — it is that the tap must cost him nothing.
 *
 * NOT A DESKTOP BUG.  It was reported from a desktop browser, but there is no
 * viewport, pointer or media-query branch anywhere on this path; the handler
 * is `onclick` on a static element.  A phone reproduces it identically.  The
 * gate asserts behaviour, not layout, and the branch is named for the
 * behaviour rather than the reporter's device.
 *
 * RUNTIME, all through the real UI / real __lc references:
 *   - mid-show, chair open, man on the bench: his tap on OPEN CHAIR leaves him
 *     ON the bench, fires no leave_room, seats nobody, and tells him she picks.
 *   - the crowd -> bench funnel (gate 12's contract) still works from the very
 *     same cell: a man NOT on the bench who taps it still lands on it.
 */
"use strict";
const { Harness } = require("../lib/harness");

function jsOf(html) {
  const out = [];
  const re = /<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g;
  let m;
  while ((m = re.exec(html))) out.push(m[1]);
  return out.join("\n/* --- */\n");
}

const waitFor = async (fn, ms, what) => {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 250));
  }
};

module.exports = {
  name: "bench-take",
  async run(t, ctx) {
    /* ---------- STATIC: canon lock — no self-seating ---------- */
    const js = jsOf(ctx.html);
    const claims = [...js.matchAll(/rpc\(\s*["']claim_open_chair["']/g)].length;
    t.ok(claims === 0,
      `no self-seating: zero claim_open_chair call sites (found ${claims})`);

    /* ---------- RUNTIME ---------- */
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@take.test" });
      const s0 = D.addUser({ id: "u_s0", name: "Seated Zero" });
      const s1 = D.addUser({ id: "u_s1", name: "Seated One" });
      const ben = D.addUser({ id: "u_ben", name: "Benched Man" });
      const cro = D.addUser({ id: "u_cro", name: "Crowd Man" });

      // faces already on file: the capture gate is gate 12's subject, not ours,
      // and a silent restore keeps this gate's assertions about the TAP alone
      const FACE = { photo: "data:image/jpeg;base64,ONFILE" };
      D.profiles.get("u_ben").face_json = FACE;
      D.profiles.get("u_cro").face_json = FACE;

      // mid-show: the engine is live, two men are seated, seat 2 is open.
      // Deliberately NOT preshow — the curtain-up (the only automatic seating
      // path in the file) is fenced to preshow with nobody seated, so this
      // fixture is exactly the state in which she is the only way into a chair.
      const room = D.addRoom({ id: "r_take", host_id: hostU, name: "Take Night", phase: "spotlight", round: 1 });
      D.rooms.get(room).phase_deadline = D.iso(D.now() + 120000);
      D.addMember(room, "u_s0", "chair", { seat_index: 0 });
      D.addMember(room, "u_s1", "chair", { seat_index: 1 });
      D.addMember(room, "u_ben", "line");
      D.addMember(room, "u_cro", "crowd");

      const boot = async (name, uid) => {
        const c = await h.newClient(name);
        c.login(uid);
        await c.goto();
        await c.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        await c.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await c.page.waitForSelector("#room.show", { timeout: 10000 });
        return c;
      };

      const seatedN = () =>
        D.members.filter((m) => m.room_id === room && (m.role === "chair" || m.role === "kept")).length;
      const roleOf = (uid) => (D.memberRow(room, uid) || {}).role || "(gone)";
      const rpcsFrom = (clientId, name) =>
        D.rpcLog.filter((r) => r.clientId === clientId && r.name === name).length;

      /* ---- the benched man taps the open chair ---- */
      const b = await boot("benched", ben);
      await waitFor(
        () => b.page.evaluate(() => document.getElementById("rt_seat2").classList.contains("is-empty")),
        8000, "seat 2 renders as an open chair for the benched man");
      t.ok(roleOf("u_ben") === "line", "fixture sanity: he is on the bench before the tap");
      t.ok(seatedN() === 2, "fixture sanity: two men seated, one chair open");

      // join_room is also the ordinary door into a room, so the re-admit check
      // is a DELTA across the tap, never a total
      const joinsBefore = rpcsFrom("benched", "join_room");
      await b.page.click("#rt_seat2 [data-takechair]");
      // give every write the tap could have started time to land
      await b.page.waitForTimeout(2500);

      const roleAfter = roleOf("u_ben");
      t.ok(roleAfter === "line",
        `a benched man who taps OPEN CHAIR STAYS on the bench (role after tap: ${roleAfter})`);
      t.ok(rpcsFrom("benched", "leave_room") === 0,
        `his tap fires no leave_room (fired ${rpcsFrom("benched", "leave_room")})`);
      t.ok(rpcsFrom("benched", "join_room") === joinsBefore,
        `his tap does not re-admit him as crowd (join_room delta ${rpcsFrom("benched", "join_room") - joinsBefore})`);
      t.ok(seatedN() === 2 && rpcsFrom("benched", "seat_member") === 0,
        "canon holds: the tap seats nobody — no self-seating");

      const toldHer = await b.page.evaluate(() => {
        const el = document.getElementById("toast");
        return { shown: el.classList.contains("show"), text: el.textContent || "" };
      });
      t.ok(toldHer.shown && /she picks/i.test(toldHer.text),
        `he is TOLD she picks rather than left guessing (toast: ${JSON.stringify(toldHer.text)})`);

      /* ---- the crowd -> bench funnel still works from the same cell ---- */
      const c = await boot("crowd", cro);
      await waitFor(
        () => c.page.evaluate(() => document.getElementById("rt_seat2").classList.contains("is-empty")),
        8000, "seat 2 renders as an open chair for the crowd man");
      await c.page.click("#rt_seat2 [data-takechair]");
      await waitFor(() => roleOf("u_cro") === "line", 15000, "crowd man reaches the bench");
      t.ok(true, "gate 12's contract survives: a man NOT on the bench still joins it from the open chair");
      t.ok(seatedN() === 2, "and he is not seated either — the chair is still open");

      const errs = [b, c].flatMap((cl) => cl.errors).filter((e) => !/favicon/.test(e));
      t.ok(errs.length === 0, "zero console errors in both windows — " + errs.slice(0, 2).join(" | "));
    } finally { await h.close(); }
  },
};
