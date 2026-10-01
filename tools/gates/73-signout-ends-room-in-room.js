/* GATE 73 — signout-ends-room-in-room: a host who signs out from INSIDE her
 * room leaves no live room behind — or is told, out loud, that she did.
 *
 * PROVENANCE, labelled.  Forged 2026-09-30 against Nick's ghost room.  The
 * in-room sign-out path was
 *     try{ await leaveRoom(); }catch(e){}
 * and nothing else: no read-back, no retry, no toast.  Gate 56 made the
 * LOBBY path loud on 2026-08-14; the in-room path was the same disease one
 * branch over and nobody looked.  Two ways it left a ghost:
 *   (a) anything in leaveRoom ABOVE the host's end_show throws (the timer
 *       stops and sb.removeChannel were bare) — the throw is swallowed and
 *       the ending never runs;
 *   (b) end_show is refused AND the status='ended' fallback write is
 *       refused — leaveRoom shrugs, the handler signs her out.
 *
 * WHAT THE HARNESS FAKED (CONTRIBUTING): a realtime teardown that cannot
 * throw (the shim's removeChannel always resolved), and no way to ask "did
 * the room end BEFORE the sign-out" — rpcLog and authLog were separate
 * lists with no shared order.  Both closed in this branch:
 * window.__shimFaults.removeChannel in the shim, D.opLog in the double
 * (plus `times` on rpc faults, so "the first call fails" needs no race).
 *
 * What this gate holds:
 *   1. leaveRoom's teardown THROWS → the ending still runs, the row is
 *      `ended` BEFORE auth.signOut is asked for, and the throw is named;
 *   2. the first end_show is refused and the fallback write is refused →
 *      the sign-out handler's own re-read finds the room still live, the
 *      retry lands, and the row is `ended` BEFORE auth.signOut;
 *   3. every ending is refused → the toast SAYS SO, and sign-out still
 *      proceeds (a user can always leave — gate 56's product note).
 */
"use strict";
const { Harness } = require("../lib/harness");
const waitFor = async (fn, ms, what) => { const t0 = Date.now();
  for (;;) { const v = await fn(); if (v) return v;
    if (Date.now() - t0 > ms) throw new Error("timed out waiting for " + what);
    await new Promise((r) => setTimeout(r, 200)); } };

module.exports = {
  name: "signout-ends-room-in-room",
  async run(t, ctx) {
    const h = await Harness.launch();
    try {
      const D = h.double;
      const hostU = D.addUser({ id: "u_host", name: "Hostess", email: "host@so2.test" });
      const host = await h.newClient("host");

      /* host signed in and standing INSIDE her own live room */
      const intoRoom = async (roomId) => {
        host.login(hostU); await host.goto();
        await host.page.waitForSelector("#lobby", { state: "visible", timeout: 15000 });
        const room = D.addRoom({ id: roomId, host_id: hostU, name: roomId, phase: "preshow", round: 0 });
        await host.page.evaluate((r) => window.__lc.openRoom(r), { ...D.rooms.get(room) });
        await host.page.waitForSelector("#room.show", { timeout: 10000 });
        t.ok(await host.page.evaluate((id) => window.__lc.AMHOST === true && window.__lc.CURRENT_ROOM && window.__lc.CURRENT_ROOM.id === id, room),
          `fixture (${roomId}): she is the host, inside the room`);
        /* toast latch — observation only.  The sign-out reload wipes the
           page a few ms after the toast paints, so every toast text is
           written to sessionStorage (same tab, survives the reload). */
        await host.page.evaluate(() => {
          sessionStorage.removeItem("__g73_toasts");
          const el = document.getElementById("toast");
          const rec = () => {
            const txt = (el.textContent || "").trim();
            if (!txt || !el.classList.contains("show")) return;
            const a = JSON.parse(sessionStorage.getItem("__g73_toasts") || "[]");
            if (a[a.length - 1] !== txt) { a.push(txt); sessionStorage.setItem("__g73_toasts", JSON.stringify(a)); }
          };
          new MutationObserver(rec).observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class"] });
        });
        return room;
      };
      const signedOut = async (what) => {
        await waitFor(() => Promise.resolve(!D.sessions.has("host")), 20000, what + ": the sign-out to complete");
        await waitFor(() => host.page.evaluate(() => {
          const a = document.getElementById("auth");
          return !!window.__lc && !!a && !a.classList.contains("hide") && !window.__lc.CURRENT_ROOM;
        }).catch(() => false), 10000, what + ": the sign-in screen after the reload");
      };
      const toasts = () => host.page.evaluate(() => JSON.parse(sessionStorage.getItem("__g73_toasts") || "[]"));
      const hostOps = (from) => D.opLog.slice(from).filter((e) => e.clientId === "host");
      /* ORDER, from the one shared log: the op that ENDED the room (an ok
         end_show, or an ok status='ended' write) vs. the first auth.signOut */
      const order = (from, room) => {
        const ops = hostOps(from);
        const endedAt = ops.findIndex((e) => e.ok === true && (
          (e.op === "rpc" && e.name === "end_show" && e.args.room_id === room) ||
          (e.op === "table" && e.table === "rooms" && e.action === "update" && e.values && e.values.status === "ended")));
        const signOutAt = ops.findIndex((e) => e.op === "auth.signOut");
        return { endedAt, signOutAt,
                 endShows: ops.filter((e) => e.op === "rpc" && e.name === "end_show" && e.args.room_id === room).length };
      };

      /* ---- scene 1: leaveRoom's teardown throws above the ending ---- */
      const rA = await intoRoom("r_so_A");
      await host.page.evaluate(() => { window.__shimFaults = { removeChannel: "removeChannel: socket already closed" }; });
      let o0 = D.opLog.length, l0 = host.logs.length;
      await host.page.evaluate(() => document.getElementById("signout").click());
      await signedOut("scene 1");
      let o = order(o0, rA);
      t.ok(D.rooms.get(rA).status === "ended",
        `(a) A TEARDOWN THROW NO LONGER SKIPS THE ENDING — the room is ended (status=${D.rooms.get(rA).status})`);
      t.ok(o.endedAt >= 0 && o.signOutAt >= 0 && o.endedAt < o.signOutAt,
        `(a) …and it ended BEFORE the sign-out was asked for (opLog: ended@${o.endedAt}, signOut@${o.signOutAt})`);
      t.ok(host.logs.slice(l0).some((l) => /leaveRoom: removeChannel threw:/.test(l.text)),
        "(a) the throw is named in the console, not swallowed");

      /* ---- scene 2: first end_show refused, fallback write refused ---- */
      const rB = await intoRoom("r_so_B");
      D.setFault("end_show", "host", { error: "boom: end_show unavailable", times: 1 });
      D.setFault("table:rooms.update", "host", { error: "permission denied for table rooms" });
      o0 = D.opLog.length; l0 = host.logs.length;
      await host.page.evaluate(() => document.getElementById("signout").click());
      await signedOut("scene 2");
      o = order(o0, rB);
      t.ok(o.endShows >= 2,
        `(b) the handler RE-READS and RETRIES after leaveRoom's ending was refused (end_show calls: ${o.endShows})`);
      t.ok(D.rooms.get(rB).status === "ended",
        `(b) the retry landed — no ghost room (status=${D.rooms.get(rB).status})`);
      t.ok(o.endedAt >= 0 && o.signOutAt >= 0 && o.endedAt < o.signOutAt,
        `(b) ended BEFORE auth.signOut (opLog: ended@${o.endedAt}, signOut@${o.signOutAt})`);
      t.ok(host.logs.slice(l0).some((l) => /host end_show on leave:.*boom/.test(l.text)),
        "(b) the refused ending is named in the console");
      t.ok((await toasts()).length === 0, "(b) no failure toast when the retry succeeded");
      D.setFault("table:rooms.update", "host", null);

      /* ---- scene 3: every ending refused — loud, and she can still leave ---- */
      const rC = await intoRoom("r_so_C");
      D.setFault("end_show", "host", { error: "boom: end_show unavailable" });
      D.setFault("table:rooms.update", "host", { error: "permission denied for table rooms" });
      o0 = D.opLog.length; l0 = host.logs.length;
      await host.page.evaluate(() => document.getElementById("signout").click());
      await signedOut("scene 3");
      o = order(o0, rC);
      t.ok(D.rooms.get(rC).status === "live", "fixture sanity: the server refused every ending — the room still says live");
      t.ok(o.endShows === 4,
        `(c) leaveRoom's attempt + the sweep's three retries, no more, no fewer (end_show calls: ${o.endShows})`);
      const seen = await toasts();
      t.ok(seen.some((x) => /Couldn't close your live room/.test(x) && /still LIVE/.test(x)),
        `(c) THE IN-ROOM PATH IS NEVER SILENT — the toast says the room is still live (toasts: ${JSON.stringify(seen)})`);
      t.ok(host.logs.slice(l0).filter((l) => /signout: end_show attempt \d failed/.test(l.text)).length === 3,
        "(c) each failed retry is named in the console");
      t.ok(o.signOutAt >= 0 && !D.sessions.has("host"),
        "(c) sign-out STILL PROCEEDS — a user can always leave (gate 56 product note)");
      D.setFault("end_show", "host", null);
      D.setFault("table:rooms.update", "host", null);

      /* ---- one implementation, not two copies ---- */
      t.ok((ctx.html.match(/async function endMyLiveRooms\(/g) || []).length === 1 &&
           (ctx.html.match(/"signout: end_show attempt "/g) || []).length === 1 &&
           /\n  if\(ME\) await endMyLiveRooms\(\);\n  authBeginSignOut\(\);/.test(ctx.html),
        "the 3-retry sweep exists ONCE (endMyLiveRooms) and the sign-out handler runs it on BOTH paths, unconditionally, before signing out");
    } finally { await h.close(); }
  },
};
